/**
 * db-sqlite.js — HAK.DBSqlite: cài đặt các kho của HAK.DB (kv, batches, batchdata, issued, attachments, bklsTemplates) trên SQLite qua HAKDocs.
 * HAK.DB chuyển sang đây khi HAK.Storage.mode === 'sqlite'. Kho "handles" (tay cầm thư mục File System Access) KHÔNG đưa vào SQLite vì không tuần tự hóa được: luôn ở IndexedDB.
 *
 * Mỗi kho = một ánh xạ { table, toRow, fromRow }. Bản ghi giữ nguyên trong cột `doc` (JSON) nên không mất trường nào; các cột kiểu chỉ là phần chiếu để truy vấn / ràng buộc.
 * Ghi nhiều kho đi trong MỘT giao dịch SQLite (guarded): bản ghi chốt được kiểm bằng phiên bản của máy chủ (khóa lạc quan) + hàm check của chỗ gọi.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const S = () => HAK.Storage;

  /* ---------------- mã hóa nhị phân ---------------- */
  const toB64 = (buf) => {
    const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (typeof Buffer !== 'undefined') return Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString('base64');
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = (b64) => {
    if (typeof Buffer !== 'undefined') {
      const b = Buffer.from(b64, 'base64');
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
    const s = atob(b64),
      u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  };
  async function sha256(bytes) {
    const subtle = root.crypto && root.crypto.subtle;
    const u = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (subtle) return Array.from(new Uint8Array(await subtle.digest('SHA-256', u)), (x) => x.toString(16).padStart(2, '0')).join('');
    return require('node:crypto').createHash('sha256').update(u).digest('hex'); // Node (test)
  }

  /* ---------------- ánh xạ kho → bảng ---------------- */
  const J = JSON.stringify;
  const MAP = {
    kv: {
      table: 'kv',
      pk: 'key',
      toRow: async (rec) => ({ key: rec.key, val: J(rec.val === undefined ? null : rec.val), updated_at: rec.ts || Date.now() }),
      fromRow: (r) => ({ key: r.key, val: JSON.parse(r.val), ls: true, ts: r.updated_at }), // ls:true — SQLite là nguồn chính, localStorage chỉ là bản đệm
    },
    batches: {
      table: 'batches',
      pk: 'id',
      toRow: async (rec) => ({
        id: rec.id,
        type: rec.type || null,
        filename: rec.fileName || null,
        updated_at: rec.updatedAt || Date.now(),
        doc: J(rec),
      }),
      fromRow: (r) => JSON.parse(r.doc),
    },
    batchdata: {
      table: 'batch_files',
      pk: 'batch_id',
      noRev: true, // bảng con không có cột rev: phiên bản của tệp gốc là phiên bản của đợt (batches)
      cols: ['batch_id', 'bytes'],
      toRow: async (bytes, key) => {
        const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        return { batch_id: key, bytes: { $b64: toB64(u) }, sha256: await sha256(u), size: u.byteLength };
      },
      fromRow: (r) => fromB64(r.bytes.$b64),
    },
    issued: {
      table: 'issued',
      pk: 'id',
      toRow: async (rec) => ({
        id: rec.id,
        company_id: rec.cid || rec.company || null,
        kind: rec.kind || rec.type || null,
        no: rec.no == null ? null : String(rec.no),
        period: rec.period || null,
        doc: J(rec),
      }),
      fromRow: (r) => JSON.parse(r.doc),
    },
    attachments: {
      table: 'attachments',
      pk: 'id',
      cols: ['id', 'mime', 'size', 'sha256', 'bytes', 'doc'],
      toRow: async (rec) => {
        const row = { id: rec.id, mime: rec.mime || 'application/pdf', doc: null, bytes: null };
        // Tách PDF base64 thành BLOB CHỈ KHI mã hóa lại cho đúng chuỗi cũ; nếu không giữ nguyên trong doc (không bao giờ đổi nội dung).
        if (typeof rec.base64 === 'string' && toB64(fromB64(rec.base64)) === rec.base64) {
          const buf = fromB64(rec.base64);
          const rest = Object.assign({}, rec);
          delete rest.base64;
          row.bytes = { $b64: rec.base64 };
          row.size = buf.byteLength;
          row.sha256 = await sha256(buf);
          row.doc = J(rest);
        } else {
          row.doc = J(rec);
          row.size = row.doc.length;
          row.sha256 = await sha256(row.doc);
        }
        return row;
      },
      fromRow: (r) => {
        const rec = JSON.parse(r.doc);
        if (r.bytes) rec.base64 = r.bytes.$b64;
        return rec;
      },
    },
    bklsTemplates: {
      table: 'bkls_templates',
      pk: 'id',
      toRow: async (rec) => ({ id: rec.id, version: rec.version || null, effective_from: rec.effectiveFrom || null, doc: J(rec) }),
      fromRow: (r) => JSON.parse(r.doc),
    },
  };
  const ORDER = { batches: 0, batch_files: 1 }; // cha trước con khi ghi; con trước cha khi xóa
  const map = (store) => {
    const m = MAP[store];
    if (!m) throw Object.assign(new Error('Kho không hỗ trợ trong SQLite: ' + store), { code: 'bad-request' });
    return m;
  };
  const asError = (e) => {
    if (e && e.code === 'conflict') e.message = 'Dữ liệu đã được thay đổi ở cửa sổ khác. Tải lại trang rồi thao tác lại.';
    return e;
  };

  /* ---------------- đọc ---------------- */
  // Kho có cột BLOB phải liệt kê cột tường minh (máy chủ mặc định không trả BLOB); kho không có BLOB lấy mọi cột.
  const colsOf = (m, withRev) => (m.cols ? (withRev && !m.noRev ? m.cols.concat(['rev']) : m.cols) : undefined);
  async function getRow(store, key) {
    const m = map(store);
    const r = (await S().call('/db/query', { table: m.table, where: { [m.pk]: key }, cols: colsOf(m, true), limit: 1 })).rows[0];
    return r ? { rec: m.fromRow(r), rev: r.rev } : null;
  }
  async function get(store, key) {
    S().assertOpen();
    const g = await getRow(store, key);
    return g ? g.rec : undefined;
  }
  async function getAll(store) {
    S().assertOpen();
    const m = map(store);
    const q = { table: m.table };
    if (m.cols) q.cols = m.cols;
    return (await S().call('/db/query', q)).rows.map(m.fromRow);
  }

  /* ---------------- phần chiếu quan hệ của Danh mục ---------------- */
  const CATALOG_KEY = 'hak.catalog.v1';
  const cmp = (a, b) =>
    Object.keys(a).every((k) => k === 'rev' || (a[k] === undefined ? null : a[k]) === (b[k] === undefined ? null : b[k]));
  /** Các thao tác đưa bảng quan hệ về ĐÚNG như Danh mục `doc` (chỉ ghi dòng đổi; xóa dòng không còn; mồ côi / mất độ chính xác → quarantine). Cùng giao dịch với bản ghi kv. */
  async function catalogOps(doc) {
    const CR = HAK.CatalogRows;
    if (!CR || !doc || typeof doc !== 'object' || !Array.isArray(doc.contracts)) return [];
    const built = CR.build(doc);
    const ops = [],
      dels = [];
    for (const t of CR.TABLES) {
      const old = new Map((await S().call('/db/query', { table: t })).rows.map((r) => [r.id, r]));
      const seen = new Set();
      for (const row of built.tables[t]) {
        seen.add(row.id);
        const o = old.get(row.id);
        if (!o || !cmp(row, o)) ops.push({ op: 'put', table: t, row });
      }
      for (const id of old.keys()) if (!seen.has(id)) dels.push({ op: 'del', table: t, key: id });
    }
    ops.push(...dels.reverse()); // xóa con trước cha
    ops.push({ op: 'del', table: 'quarantine', where: { source: 'catalog' } });
    built.orphans.forEach((o) =>
      ops.push({
        op: 'put',
        table: 'quarantine',
        row: {
          id: ['catalog', o.table, o.id, o.field].join('|'),
          source: 'catalog',
          record_id: o.id,
          reason: 'mồ côi: ' + o.field + ' trỏ tới ' + o.target + ' không tồn tại (giá trị gốc giữ trong doc)',
          doc: J(o),
        },
      })
    );
    built.warnings.forEach((w) =>
      ops.push({
        op: 'put',
        table: 'quarantine',
        row: {
          id: ['catalog', w.table, w.id, w.field, 'precision'].join('|'),
          source: 'catalog',
          record_id: w.id,
          reason: 'độ chính xác: ' + w.field + ' ' + w.msg,
          doc: J(w),
        },
      })
    );
    return ops;
  }
  /** Xóa toàn bộ phần chiếu (khi xóa / làm trống Danh mục). Con trước cha. */
  function catalogClearOps() {
    const CR = HAK.CatalogRows;
    return CR
      ? CR.TABLES.slice()
          .reverse()
          .map((t) => ({ op: 'clear', table: t, confirm: true }))
      : [];
  }
  /** Mọi ghi vào khóa Danh mục đều đi kèm phần chiếu trong CÙNG giao dịch. */
  async function kvWriteOps(rec, ifRev) {
    const { table, row } = await rowsFor('kv', rec);
    const ops = [Object.assign({ op: 'put', table, row }, ifRev === undefined ? {} : { ifRev })];
    if (rec.key === CATALOG_KEY) ops.push(...(await catalogOps(rec.val)));
    return ops;
  }

  /* ---------------- ghi ---------------- */
  async function rowsFor(store, val, key) {
    const m = map(store);
    return { table: m.table, row: await m.toRow(val, key !== undefined ? key : val[m.pk]) };
  }
  async function put(store, val, key) {
    S().assertOpen();
    try {
      if (store === 'kv') return void (await S().call('/db/tx', { ops: await kvWriteOps(val) }));
      const { table, row } = await rowsFor(store, val, key);
      await S().call('/db/tx', { ops: [{ op: 'put', table, row }] });
    } catch (e) {
      throw asError(e);
    }
  }
  async function del(store, key) {
    S().assertOpen();
    const m = map(store);
    try {
      const ops = [{ op: 'del', table: m.table, key }];
      if (store === 'kv' && key === CATALOG_KEY) ops.push(...catalogClearOps());
      await S().call('/db/tx', { ops });
    } catch (e) {
      throw asError(e);
    }
  }
  async function clear(store) {
    S().assertOpen();
    try {
      const ops = [{ op: 'clear', table: map(store).table, confirm: true }];
      if (store === 'kv') ops.push(...catalogClearOps());
      await S().call('/db/tx', { ops });
    } catch (e) {
      throw asError(e);
    }
  }

  /**
   * Ghi nhiều kho trong MỘT giao dịch có kiểm tra phiên bản bản ghi chốt (cùng chữ ký HAK.DB.guarded của IndexedDB):
   * check(cur) → chuỗi lỗi (xung đột) hoặc null; apply(tx) ghi bằng tx.objectStore(kho).put / delete.
   */
  async function guarded(stores, guardStore, guardKey, check, apply) {
    S().assertOpen();
    const g = await getRow(guardStore, guardKey);
    const err = check(g ? g.rec : undefined);
    if (err) throw Object.assign(new Error(err), { conflict: true });
    const queued = [];
    apply({
      objectStore: (st) => ({
        put: (val, key) => queued.push({ k: 'put', st, val, key }),
        delete: (key) => queued.push({ k: 'del', st, key }),
        clear: () => queued.push({ k: 'clear', st }),
      }),
    });
    const ops = [{ op: 'guard', table: map(guardStore).table, key: guardKey, ifRev: g ? g.rev : null }];
    const wr = [];
    for (const q of queued) {
      const m = map(q.st);
      if (q.k === 'put') {
        const { table, row } = await rowsFor(q.st, q.val, q.key);
        wr.push({ o: ORDER[table] || 0, op: { op: 'put', table, row } });
      } else if (q.k === 'del') wr.push({ o: 10 - (ORDER[m.table] || 0), op: { op: 'del', table: m.table, key: q.key } });
      else wr.push({ o: 10 - (ORDER[m.table] || 0), op: { op: 'clear', table: m.table, confirm: true } });
    }
    wr.sort((a, b) => a.o - b.o); // sort ổn định: giữ thứ tự gọi trong cùng mức
    try {
      await S().call('/db/tx', { ops: ops.concat(wr.map((x) => x.op)) });
    } catch (e) {
      throw asError(e);
    }
  }

  /* ---------------- kv ---------------- */
  const kvAll = () => getAll('kv');
  const kvPut = (key, val) => put('kv', { key, val, ts: Date.now() });
  const kvDel = (key) => del('kv', key);
  const kvClear = () => clear('kv');
  /**
   * So sánh-và-ghi một bản ghi kv: check(giá trị hiện tại | undefined) → chuỗi lỗi hoặc null; nếu null thì ghi `next`.
   * Thay cho giao dịch IndexedDB tự mở ở catalog.js / yearbook.js; ở SQLite dùng phiên bản của máy chủ nên cửa sổ khác ghi chen vào giữa cũng bị phát hiện.
   */
  async function kvCas(key, check, next) {
    S().assertOpen();
    const g = await getRow('kv', key);
    const err = check(g ? g.rec.val : undefined);
    if (err) throw Object.assign(new Error(err), { conflict: true });
    try {
      await S().call('/db/tx', { ops: await kvWriteOps({ key, val: next, ts: Date.now() }, g ? g.rev : null) });
    } catch (e) {
      throw asError(e);
    }
  }

  /* ---------------- Lưu trữ hồ sơ cân (thay IndexedDB "hak-archive") ---------------- */
  const dmyTs = (v) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v || ''));
    if (!m) return null;
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1] ? d.getTime() : null; // ngày không tồn tại → NULL (meta giữ nguyên chuỗi gốc)
  };
  const milli = (kg) => (kg == null || kg === '' || !Number.isFinite(Number(kg)) ? null : Math.round(Number(kg) * 1000));
  const intOrNull = (n) => (Number.isFinite(Number(n)) && n !== '' && n != null ? Math.trunc(Number(n)) : null);
  const recordRow = (m) => ({
    id: m.id,
    company_id: m.cid || null,
    type: m.type || null,
    title: m.title == null ? null : String(m.title),
    ship: m.ship == null ? null : String(m.ship),
    from_ts: dmyTs(m.from),
    to_ts: dmyTs(m.to),
    detail_id: m.contract || null,
    trips: intOrNull(m.trips),
    kg_milli: milli(m.kg),
    ret_trips: intOrNull(m.retTrips),
    ret_kg_milli: milli(m.retKg),
    sv: intOrNull(m.sv),
    updated_at: intOrNull(m.updatedAt),
    meta: J(m),
  });
  const archive = {
    async metas() {
      S().assertOpen();
      return (await S().call('/db/query', { table: 'archive_records', cols: ['meta'] })).rows.map((r) => JSON.parse(r.meta));
    },
    async meta(id) {
      S().assertOpen();
      const r = (await S().call('/db/query', { table: 'archive_records', where: { id }, cols: ['meta'], limit: 1 })).rows[0];
      return r ? JSON.parse(r.meta) : undefined;
    },
    async data(id) {
      S().assertOpen();
      const r = (await S().call('/db/query', { table: 'archive_data', where: { record_id: id }, cols: ['payload'], limit: 1 })).rows[0];
      return r ? r.payload : undefined;
    },
    async count() {
      S().assertOpen();
      return (await S().call('/db/query', { table: 'archive_records', cols: ['id'], count: true, limit: 1 })).total;
    },
    /** Lưu meta (+ dữ liệu nếu có) trong MỘT giao dịch: hoặc cả hai, hoặc không gì (không còn meta mồ côi). */
    async put(meta, data) {
      S().assertOpen();
      const ops = [{ op: 'put', table: 'archive_records', row: recordRow(meta) }];
      if (data !== undefined)
        ops.push({
          op: 'put',
          table: 'archive_data',
          row: { record_id: meta.id, payload: data, sha256: await sha256(String(data)), size: String(data).length },
        });
      try {
        await S().call('/db/tx', { ops });
      } catch (e) {
        throw asError(e);
      }
    },
    async del(id) {
      S().assertOpen();
      await S().call('/db/tx', { ops: [{ op: 'del', table: 'archive_records', key: id }] }); // archive_data đi theo (ON DELETE CASCADE)
    },
    async clear() {
      S().assertOpen();
      await S().call('/db/tx', { ops: [{ op: 'clear', table: 'archive_records', confirm: true }] });
    },
    /** Dọn sau Đóng năm: chỉ xóa khi meta và dữ liệu CÒN ĐÚNG như bản đã xác minh (so trong cùng giao dịch bằng phiên bản). */
    async closeVerified(items) {
      S().assertOpen();
      const ops = [];
      for (const it of items) {
        const g = await S().call('/db/query', { table: 'archive_records', where: { id: it.meta.id }, cols: ['meta', 'rev'], limit: 1 });
        const d = await S().call('/db/query', { table: 'archive_data', where: { record_id: it.meta.id }, cols: ['payload'], limit: 1 });
        if (!g.rows[0] || JSON.stringify(JSON.parse(g.rows[0].meta)) !== JSON.stringify(it.meta))
          throw Error('Hồ sơ cũ đã thay đổi; chưa dọn năm.');
        if (!d.rows[0] || d.rows[0].payload !== it.data) throw Error('Dữ liệu lưu trữ đã thay đổi; chưa dọn năm.');
        ops.push({ op: 'guard', table: 'archive_records', key: it.meta.id, ifRev: g.rows[0].rev });
        ops.push({ op: 'del', table: 'archive_records', key: it.meta.id });
      }
      if (!ops.length) return;
      try {
        await S().call('/db/tx', { ops });
      } catch (e) {
        throw Object.assign(e && e.conflict ? Error('Hồ sơ cũ đã thay đổi; chưa dọn năm.') : e, { conflict: e && e.conflict });
      }
    },
  };

  HAK.DBSqlite = {
    archive,
    get,
    getAll,
    put,
    del,
    clear,
    guarded,
    kvAll,
    kvPut,
    kvDel,
    kvClear,
    kvCas,
    kvGet: async (k) => {
      const g = await getRow('kv', k);
      return g ? g.rec.val : undefined; // GIÁ TRỊ (cùng nghĩa với HAK.DB.kvGet ở IndexedDB)
    },
    MAP,
    toB64,
    fromB64,
  };
  if (typeof module === 'object' && module.exports) module.exports = HAK.DBSqlite;
})(typeof window !== 'undefined' ? window : globalThis);
