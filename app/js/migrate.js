/**
 * migrate.js — HAK.Migrate: di trú dữ liệu IndexedDB → SQLite (bản Windows) có đối chiếu, kích hoạt có điều kiện và quay lui.
 *
 * Nguồn = ảnh chụp của HAK.Backup.collect() (CÙNG ảnh chụp với "Sao lưu toàn bộ") nên bản ZIP sao lưu và di trú nhìn thấy đúng cùng một dữ liệu.
 *   consistentSnapshot(collect) → chụp hai lần, so dấu vân tay; đổi giữa chừng (cửa sổ khác) thì chụp lại, quá 3 lần thì báo lỗi.
 *   validate(snap)  → bản ghi hỏng / trùng mã (FATAL: không nhập, báo mã bản ghi nguồn)
 *   run(snap, opt)  → làm sạch vùng nhập (trừ resume) → nhập từng nhóm (nhập lặp được, dừng giữa chừng thì chạy lại) → đối chiếu
 *   verify(snap)    → đọc LẠI từ SQLite và so từng bản ghi (nội dung, tệp theo SHA-256, tổng kg / MT / thuế / số dòng, toàn vẹn khóa ngoại) → danh sách sai lệch theo MÃ NGUỒN
 *   activate(snap)  → verify phải đạt → sao lưu trước kích hoạt → máy chủ kiểm lại số bản ghi rồi mới bật cờ nguồn chính
 *   rollback()      → tắt cờ nguồn chính (KHÔNG xóa dữ liệu SQLite); IndexedDB nguồn chưa bao giờ bị sửa / xóa bởi module này
 * SQLite ở trạng thái CHƯA kích hoạt chính là "cơ sở dữ liệu tạm": app vẫn chạy trên IndexedDB cho tới khi kích hoạt.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const S = () => HAK.Storage,
    Q = () => HAK.DBSqlite;
  const YEARBOOK_KEY = 'hak.yearbook.v1',
    CATALOG_KEY = 'hak.catalog.v1';

  const sortKeys = (v) =>
    Array.isArray(v)
      ? v.map(sortKeys)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sortKeys(v[k])])
          )
        : v;
  const stable = (v) => JSON.stringify(sortKeys(v === undefined ? null : v));
  const b64ok = (s) => typeof s === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length % 4 === 0;
  const isCatalog = (d) => d && typeof d === 'object' && Array.isArray(d.contracts);

  /* ---------------- chụp nhất quán ---------------- */
  async function fingerprint(snap) {
    const light = [
      stable(snap.keys || {}),
      stable(snap.yearbook || null),
      (snap.items || [])
        .map((x) => (x.meta && x.meta.id) + ':' + (x.meta && x.meta.updatedAt) + ':' + (typeof x.data === 'string' ? x.data.length : -1))
        .join('|'),
      (snap.batches || []).map((x) => (x.meta && x.meta.id) + ':' + (x.meta && x.meta.rev) + ':' + (x.b64 || '').length).join('|'),
      (snap.issued || []).map((x) => x && x.id + ':' + x.at).join('|'),
      (snap.attachments || []).map((x) => x && x.id).join('|'),
      (snap.bklsTemplates || []).map((x) => x && x.id).join('|'),
    ].join('\n#\n');
    return Q().sha256(light);
  }
  async function consistentSnapshot(collect, tries) {
    tries = tries || 3;
    for (let i = 0; i < tries; i++) {
      const a = await collect(),
        fa = await fingerprint(a),
        fb = await fingerprint(await collect());
      if (fa === fb) return { snap: a, fingerprint: fa, attempts: i + 1 };
    }
    throw Object.assign(new Error('Dữ liệu đang thay đổi (có thể do cửa sổ khác đang ghi). Đóng các cửa sổ khác của app rồi thử lại.'), {
      code: 'unstable',
    });
  }

  /* ---------------- kiểm tra nguồn ---------------- */
  function validate(snap) {
    const problems = [];
    const add = (store, id, problem) => problems.push({ store, id: id == null ? '(không có mã)' : String(id), problem, fatal: true });
    const dup = (store, list, idOf) => {
      const seen = new Set();
      list.forEach((x) => {
        const id = idOf(x);
        if (id && seen.has(id)) add(store, id, 'trùng mã trong nguồn');
        seen.add(id);
      });
    };
    if (!snap || typeof snap !== 'object') return [{ store: 'snapshot', id: '', problem: 'không có dữ liệu nguồn', fatal: true }];
    Object.keys(snap.keys || {}).forEach((k) => k.indexOf('hak.') !== 0 && add('kv', k, 'khóa không thuộc app (không có tiền tố hak.)'));
    const items = snap.items || [];
    items.forEach((it) => {
      if (!it || !it.meta || typeof it.meta.id !== 'string' || !it.meta.id)
        add('archive', it && it.meta && it.meta.id, 'hồ sơ Lưu trữ thiếu mã');
      else if (typeof it.data !== 'string' || !it.data)
        add('archive', it.meta.id, 'hồ sơ Lưu trữ thiếu dữ liệu phiếu cân (không nhập được)');
    });
    dup('archive', items, (x) => x && x.meta && x.meta.id);
    const batches = snap.batches || [];
    batches.forEach((b) => {
      if (!b || !b.meta || typeof b.meta.id !== 'string' || !b.meta.id) add('batches', b && b.meta && b.meta.id, 'đợt Excel thiếu mã');
      else if (!b64ok(b.b64)) add('batches', b.meta.id, 'tệp gốc của đợt Excel hỏng hoặc không phải base64 hợp lệ');
    });
    dup('batches', batches, (x) => x && x.meta && x.meta.id);
    ['issued', 'attachments', 'bklsTemplates'].forEach((st) => {
      const list = snap[st] || [];
      list.forEach((x) => (!x || typeof x.id !== 'string' || !x.id) && add(st, x && x.id, 'bản ghi thiếu mã'));
      dup(st, list, (x) => x && x.id);
    });
    if (snap.yearbook && !Array.isArray(snap.yearbook.records)) add('yearbook', YEARBOOK_KEY, 'Sổ hồ sơ năm không có danh sách hồ sơ');
    return problems;
  }

  /* ---------------- số đối chiếu mong đợi ---------------- */
  function catalogOf(snap) {
    const c = snap.keys && snap.keys[CATALOG_KEY];
    return isCatalog(c) ? c : null;
  }
  function plan(snap) {
    const kvKeys = Object.keys(snap.keys || {}).filter((k) => k !== YEARBOOK_KEY);
    const expected = {
      kv: kvKeys.length + (snap.yearbook ? 1 : 0),
      archive_records: (snap.items || []).length,
      archive_data: (snap.items || []).length,
      batches: (snap.batches || []).length,
      batch_files: (snap.batches || []).length,
      issued: (snap.issued || []).length,
      attachments: (snap.attachments || []).length,
      bkls_templates: (snap.bklsTemplates || []).length,
    };
    const cat = catalogOf(snap),
      CR = HAK.CatalogRows;
    let totals = null;
    CR.TABLES.forEach((t) => (expected[t] = 0));
    if (cat) {
      const built = CR.build(cat);
      CR.TABLES.forEach((t) => (expected[t] = built.tables[t].length));
      totals = CR.totals(built.tables);
    }
    const milli = (kg) => (Number.isFinite(Number(kg)) && kg !== '' && kg != null ? Math.round(Number(kg) * 1000) : 0);
    const archive = {
      kgMilli: (snap.items || []).reduce((a, x) => a + milli(x.meta && x.meta.kg), 0),
      trips: (snap.items || []).reduce(
        (a, x) => a + (Number.isFinite(Number(x.meta && x.meta.trips)) ? Math.trunc(Number(x.meta.trips)) : 0),
        0
      ),
    };
    return { expected, totals, archive };
  }

  /* ---------------- nhập ---------------- */
  const call = (p, b) => S().call(p, b);
  async function run(snap, opt) {
    opt = opt || {};
    const step = (name, i, n) => opt.onStep && opt.onStep({ step: name, i, n });
    const problems = validate(snap);
    if (problems.length) return { ok: false, stage: 'validate', problems };
    const D = Q();
    let where = null;
    HAK.Audit = HAK.Audit || {};
    const prevSuppress = HAK.Audit.suppress;
    HAK.Audit.suppress = true; // nhập hàng loạt không sinh dòng nhật ký 'tạo' cho từng bản ghi
    try {
      await S().openSession(null, 'migrate');
      if (!opt.resume) {
        step('reset', 0, 1);
        await call('/db/reset', {});
      }
      const kvKeys = Object.keys(snap.keys || {}).filter((k) => k !== YEARBOOK_KEY);
      for (let i = 0; i < kvKeys.length; i++) {
        where = { store: 'kv', id: kvKeys[i] };
        step('kv', i + 1, kvKeys.length);
        await D.put('kv', { key: kvKeys[i], val: snap.keys[kvKeys[i]], ts: Date.now() });
      }
      const items = snap.items || [];
      for (let i = 0; i < items.length; i++) {
        where = { store: 'archive', id: items[i].meta.id };
        step('archive', i + 1, items.length);
        await D.archive.put(items[i].meta, items[i].data);
      }
      const batches = snap.batches || [];
      for (let i = 0; i < batches.length; i++) {
        where = { store: 'batches', id: batches[i].meta.id };
        step('batches', i + 1, batches.length);
        await D.put('batches', batches[i].meta);
        await D.put('batchdata', D.fromB64(batches[i].b64), batches[i].meta.id);
      }
      for (const st of ['issued', 'attachments', 'bklsTemplates']) {
        const list = snap[st] || [];
        for (let i = 0; i < list.length; i++) {
          where = { store: st, id: list[i].id };
          step(st, i + 1, list.length);
          await D.put(st, list[i]);
        }
      }
      if (snap.yearbook) {
        where = { store: 'yearbook', id: YEARBOOK_KEY };
        step('yearbook', 1, 1);
        await D.put('kv', { key: YEARBOOK_KEY, val: snap.yearbook, ts: Date.now() });
      }
    } catch (e) {
      return { ok: false, stage: 'import', error: e && e.message ? e.message : String(e), at: where, code: e && e.code };
    } finally {
      HAK.Audit.suppress = prevSuppress;
    }
    step('verify', 0, 1);
    const v = await verify(snap);
    return Object.assign({ stage: 'verify' }, v);
  }

  /* ---------------- đối chiếu ---------------- */
  async function fetchAll(table, cols, order, size) {
    size = size || 200;
    const out = [];
    for (let off = 0; ; off += size) {
      const r = (await call('/db/query', { table, cols, order: [[order, 'asc']], limit: size, offset: off })).rows;
      out.push(...r);
      if (r.length < size) return out;
    }
  }
  async function verify(snap) {
    const D = Q(),
      CR = HAK.CatalogRows;
    const mism = [];
    const bad = (store, id, problem) => mism.push({ store, id: String(id), problem });
    const pl = plan(snap);
    // 1) toàn vẹn máy chủ
    const check = await call('/db/check', {});
    if (!check.ok)
      bad(
        'database',
        '-',
        'integrity_check / foreign_key_check không đạt: ' +
          JSON.stringify({ integrity: check.integrity, fk: check.foreignKeys.slice(0, 3) })
      );
    // 2) kv: tập khóa + nội dung
    const kvRows = await fetchAll('kv', ['key', 'val'], 'key');
    const kvSrc = Object.assign({}, snap.keys || {});
    if (snap.yearbook) kvSrc[YEARBOOK_KEY] = snap.yearbook;
    const kvDb = new Map(kvRows.map((r) => [r.key, r.val]));
    Object.keys(kvSrc).forEach((k) => {
      if (!kvDb.has(k)) bad('kv', k, 'thiếu trong SQLite');
      else if (stable(JSON.parse(kvDb.get(k))) !== stable(kvSrc[k])) bad('kv', k, 'nội dung khác nguồn');
    });
    kvDb.forEach((_, k) => !(k in kvSrc) && bad('kv', k, 'thừa trong SQLite (không có ở nguồn)'));
    // 3) Lưu trữ: meta + dữ liệu phiếu
    const recs = await fetchAll('archive_records', ['id', 'meta', 'kg_milli', 'trips'], 'id');
    const recDb = new Map(recs.map((r) => [r.id, r]));
    const src = new Map((snap.items || []).map((it) => [it.meta.id, it]));
    src.forEach((it, id) => {
      const r = recDb.get(id);
      if (!r) return bad('archive', id, 'thiếu hồ sơ trong SQLite');
      if (stable(JSON.parse(r.meta)) !== stable(it.meta)) bad('archive', id, 'meta khác nguồn');
    });
    recDb.forEach((_, id) => !src.has(id) && bad('archive', id, 'thừa trong SQLite'));
    const data = await fetchAll('archive_data', ['record_id', 'payload'], 'record_id', 50);
    const dataDb = new Map(data.map((r) => [r.record_id, r.payload]));
    src.forEach((it, id) => {
      if (!dataDb.has(id)) bad('archive', id, 'thiếu dữ liệu phiếu cân trong SQLite');
      else if (dataDb.get(id) !== it.data) bad('archive', id, 'dữ liệu phiếu cân khác nguồn (byte)');
    });
    dataDb.forEach((_, id) => !src.has(id) && bad('archive', id, 'dữ liệu phiếu thừa trong SQLite'));
    // 4) đợt Excel: thông số + tệp theo SHA-256
    const bm = await fetchAll('batches', ['id', 'doc'], 'id');
    const bmDb = new Map(bm.map((r) => [r.id, r.doc]));
    const bfDb = new Map(
      (await fetchAll('batch_files', ['batch_id', 'bytes', 'sha256', 'size'], 'batch_id', 20)).map((r) => [r.batch_id, r])
    );
    for (const b of snap.batches || []) {
      const id = b.meta.id;
      if (!bmDb.has(id)) bad('batches', id, 'thiếu đợt trong SQLite');
      else if (stable(JSON.parse(bmDb.get(id))) !== stable(b.meta)) bad('batches', id, 'thông số đợt khác nguồn');
      const f = bfDb.get(id);
      if (!f) bad('batches', id, 'thiếu tệp gốc trong SQLite');
      else {
        const want = await D.sha256(new Uint8Array(D.fromB64(b.b64))),
          got = await D.sha256(new Uint8Array(D.fromB64(f.bytes.$b64)));
        if (want !== got)
          bad('batches', id, 'tệp gốc khác nguồn (SHA-256 nguồn ' + want.slice(0, 12) + '… ≠ SQLite ' + got.slice(0, 12) + '…)');
        else if (f.sha256 !== want) bad('batches', id, 'SHA-256 ghi trong SQLite không khớp tệp');
      }
    }
    const bSrc = new Set((snap.batches || []).map((b) => b.meta.id));
    bmDb.forEach((_, id) => !bSrc.has(id) && bad('batches', id, 'đợt thừa trong SQLite'));
    // 5) nhật ký chứng từ, tệp đính kèm, mẫu BKLS
    for (const [st, store] of [
      ['issued', 'issued'],
      ['attachments', 'attachments'],
      ['bklsTemplates', 'bklsTemplates'],
    ]) {
      const dbRecs = new Map((await D.getAll(store)).map((r) => [r.id, r]));
      (snap[st] || []).forEach((r) => {
        if (!dbRecs.has(r.id)) bad(st, r.id, 'thiếu trong SQLite');
        else if (stable(dbRecs.get(r.id)) !== stable(r)) bad(st, r.id, 'nội dung khác nguồn');
      });
      const ids = new Set((snap[st] || []).map((r) => r.id));
      dbRecs.forEach((_, id) => !ids.has(id) && bad(st, id, 'thừa trong SQLite'));
    }
    // 6) Danh mục: bảng quan hệ dựng lại = tài liệu nguồn; tổng đối chiếu
    const cat = catalogOf(snap);
    const rows = {};
    for (const t of CR.TABLES) rows[t] = await fetchAll(t, undefined, 'id');
    let totalsDb = null;
    if (cat) {
      const re = CR.assemble(rows, { v: cat.v, products: cat.products });
      const rebuilt = stable(re),
        orig = stable(Object.assign({}, cat, { customers: cat.customers || [], customs: cat.customs || [] }));
      if (rebuilt !== orig) {
        // chỉ ra bản ghi đầu tiên lệch để người dùng đối chiếu
        const ids = (l) => new Map((l || []).map((x) => [x.id, stable(x)]));
        const pairs = [
          ['customers', cat.customers, re.customers],
          ['contracts', cat.contracts, re.contracts],
          ['customs', cat.customs, re.customs],
        ];
        pairs.forEach(([lab, a, b]) => {
          const mb = ids(b);
          (a || []).forEach((x) =>
            !mb.has(x.id)
              ? bad('catalog', lab + '|' + x.id, 'thiếu trong bảng quan hệ')
              : mb.get(x.id) !== stable(x)
                ? bad('catalog', lab + '|' + x.id, 'khác nguồn trong bảng quan hệ')
                : null
          );
        });
        if (!mism.some((m) => m.store === 'catalog')) bad('catalog', '-', 'bảng quan hệ dựng lại khác tài liệu Danh mục');
      }
      const tb = {};
      CR.TABLES.forEach((t) => (tb[t] = rows[t]));
      totalsDb = CR.totals(tb);
      Object.keys(pl.totals).forEach((k) => {
        if (stable(pl.totals[k]) !== stable(totalsDb[k]))
          bad('catalog', 'tổng:' + k, 'nguồn ' + stable(pl.totals[k]) + ' ≠ SQLite ' + stable(totalsDb[k]));
      });
    } else CR.TABLES.forEach((t) => rows[t].length && bad('catalog', t, 'có ' + rows[t].length + ' dòng nhưng nguồn không có Danh mục'));
    // 7) tổng Lưu trữ
    const archDb = {
      kgMilli: recs.reduce((a, r) => a + (r.kg_milli || 0), 0),
      trips: recs.reduce((a, r) => a + (r.trips || 0), 0),
    };
    if (archDb.kgMilli !== pl.archive.kgMilli)
      bad('archive', 'tổng kg', 'nguồn ' + pl.archive.kgMilli + ' ≠ SQLite ' + archDb.kgMilli + ' (1/1000 kg)');
    if (archDb.trips !== pl.archive.trips) bad('archive', 'tổng số xe', 'nguồn ' + pl.archive.trips + ' ≠ SQLite ' + archDb.trips);
    const q = (await call('/db/query', { table: 'quarantine', order: [['id', 'asc']] })).rows;
    return {
      ok: mism.length === 0,
      mismatches: mism,
      quarantine: q.map((r) => ({ id: r.id, source: r.source, record: r.record_id, reason: r.reason })),
      expected: pl.expected,
      totals: { source: { catalog: pl.totals, archive: pl.archive }, sqlite: { catalog: totalsDb, archive: archDb } },
      check,
    };
  }

  /** Ghi sự kiện chuyển nguồn vào nhật ký thao tác (chỉ thêm). */
  const auditEvent = (action, reason) =>
    call('/db/tx', {
      ops: [
        {
          op: 'append',
          table: 'audit_log',
          row: {
            at: Date.now(),
            actor: (HAK.Auth && HAK.Auth.who && HAK.Auth.who()) || null,
            action,
            entity: 'storage',
            entity_id: 'backend',
            reason,
          },
        },
      ],
    });

  /* ---------------- kích hoạt / quay lui ---------------- */
  async function activate(snap, opt) {
    opt = opt || {};
    const v = await verify(snap);
    if (!v.ok) return Object.assign({ activated: false, reason: 'Đối chiếu chưa đạt — không kích hoạt.' }, v);
    await S().openSession(null, 'migrate');
    let backup = null;
    try {
      backup = await call('/db/backup', { name: 'pre-activate-' + new Date().toISOString().replace(/[:.]/g, '-') });
      await call('/db/activate', { expected: plan(snap).expected });
    } catch (e) {
      return { activated: false, ok: false, reason: e.message, detail: e.detail || null, backup };
    }
    S().hint.set('sqlite');
    await auditEvent(
      'di trú',
      'Kích hoạt SQLite làm nguồn chính; nguồn IndexedDB giữ nguyên. Bản sao trước kích hoạt: ' + (backup && backup.path)
    ).catch(() => {});
    return { activated: true, ok: true, backup, totals: v.totals, quarantine: v.quarantine };
  }
  async function rollback() {
    await S().openSession(null, 'migrate');
    await auditEvent('quay lui', 'Tắt SQLite làm nguồn chính; app dùng lại IndexedDB. Dữ liệu SQLite được giữ nguyên.').catch(() => {});
    await call('/db/deactivate', {});
    S().hint.set(null);
    return { activated: false };
  }

  HAK.Migrate = { consistentSnapshot, fingerprint, validate, plan, run, verify, activate, rollback, stable };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Migrate;
})(typeof window !== 'undefined' ? window : globalThis);
