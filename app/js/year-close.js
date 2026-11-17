(function (root) {
  'use strict';
  const H = (root.HAK = root.HAK || {}),
    KEY = 'hak.yearbook.v1',
    clone = (x) => JSON.parse(JSON.stringify(x));
  function exclusive(rows, year) {
    return !!rows.length && rows.every((r) => Number.isFinite(r.ts1) && new Date(r.ts1).getUTCFullYear() === year);
  }
  function b64(buffer) {
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 16384));
    return btoa(text);
  }
  async function digest(blob) {
    const bytes = await blob.arrayBuffer();
    return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes)), (v) => v.toString(16).padStart(2, '0')).join('');
  }
  async function pack(bundle) {
    if (typeof root.JSZip !== 'function') throw Error('Thiếu thư viện nén ZIP.');
    const zip = new root.JSZip();
    zip.file('HoSoNam.json', JSON.stringify(bundle));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }
  async function verify(path, blob) {
    const response = await fetch('http://127.0.0.1:31879/verify-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HAK-Client': 'documents-v1', 'X-HAK-Token': window.HAK_DOCS_TOKEN || '' },
      body: JSON.stringify({ path }),
    });
    const proof = await response.json();
    if (!response.ok) throw Error(proof.error || 'Không đọc lại được file vừa lưu.');
    const sha256 = await digest(blob);
    if (proof.sha256 !== sha256 || proof.size !== blob.size) throw Error('File trên đĩa không khớp bản sao lưu; chưa dọn dữ liệu.');
    return { path, sha256, size: blob.size };
  }
  async function build(year, opts) {
    const state = await H.Yearbook.read();
    const records = state.records.filter((r) => r.year === year);
    const metas = (await H.Archive.list()).filter((m) => H.Yearbook.yearOf(m) === year);
    const archive = await H.Archive.collectItems(metas.map((m) => m.id));
    if (archive.length !== metas.length) throw Error('Có hồ sơ cũ thiếu dữ liệu; chưa đóng năm.');
    const saved = await H.DB.getAll('batches'),
      batches = [];
    let skipped = 0;
    for (const meta of saved) {
      const slot = H.App.slots[meta.type];
      const loaded = slot && slot.batches.find((b) => b.fileName === meta.fileName);
      if (!loaded || !loaded.ds || !loaded.ds.ok || loaded.conv || loaded.from || !exclusive(loaded.ds.rows, year)) {
        skipped++;
        continue;
      }
      const bytes = await H.DB.get('batchdata', meta.id);
      if (!bytes) throw Error('Thiếu file cân gốc: ' + meta.fileName);
      batches.push({ meta, b64: b64(bytes) });
    }
    const bundle = {
      app: 'hak-yearbook',
      v: 2,
      closed: true,
      year,
      records,
      archive,
      batches,
      config: clone(H.Config.data),
      exportedAt: new Date().toISOString(),
    };
    if (!records.length && !archive.length && !batches.length && !(opts && opts.allowEmpty))
      throw Error('Năm này không có dữ liệu đủ điều kiện đóng.');
    return { state, bundle, skipped };
  }
  async function finalize(expected, bundle, proof) {
    const db = await H.DB.open();
    if (!db) throw Error('Không mở được kho dữ liệu.');
    return new Promise((ok, no) => {
      const tx = db.transaction(['kv', 'batches', 'batchdata'], 'readwrite');
      const kv = tx.objectStore('kv'),
        request = kv.get(KEY);
      let error;
      const abort = (e) => {
        error = e;
        tx.abort();
      };
      request.onsuccess = () => {
        const state = request.result && request.result.val;
        if (!state || state.revision !== expected) {
          abort(Error('Dữ liệu đã thay đổi khi đang đóng năm. File đã lưu, chưa dọn kho đang làm việc.'));
          return;
        }
        let left = bundle.batches.length * 2;
        const finish = () => {
          const ids = new Set(bundle.records.map((r) => r.id));
          state.records = state.records.filter((r) => !ids.has(r.id));
          state.closed = (state.closed || []).filter((c) => c.sha256 !== proof.sha256);
          state.closed.push({
            ...proof,
            year: bundle.year,
            closedAt: Date.now(),
            count: bundle.records.length,
            archiveCount: bundle.archive.length,
            batchCount: bundle.batches.length,
            pending: false,
          });
          state.revision++;
          kv.put({ key: KEY, val: state, ls: false, ts: Date.now() });
          for (const item of bundle.batches) {
            tx.objectStore('batches').delete(item.meta.id);
            tx.objectStore('batchdata').delete(item.meta.id);
          }
        };
        const done = () => {
          if (error) return;
          if (--left === 0) finish();
        };
        if (!left) finish();
        for (const item of bundle.batches) {
          const m = tx.objectStore('batches').get(item.meta.id),
            d = tx.objectStore('batchdata').get(item.meta.id);
          m.onsuccess = () => {
            if (error) return;
            if (JSON.stringify(m.result) !== JSON.stringify(item.meta)) abort(Error('File cân đã thay đổi; chưa dọn.'));
            else done();
          };
          d.onsuccess = () => {
            if (error) return;
            if (!d.result || b64(d.result) !== item.b64) abort(Error('Nội dung file cân đã thay đổi; chưa dọn.'));
            else done();
          };
        }
      };
      tx.oncomplete = () => ok();
      tx.onabort = tx.onerror = () => no(error || tx.error || Error('Chưa hoàn tất đóng năm. File đã lưu vẫn dùng để mở lại.'));
    });
  }
  async function closeYear(year, ask = root.confirm) {
    if (H.Auth && (!H.Auth.isAdmin() || H.Auth.scopeIds('archive') !== null)) throw Error('Đóng năm cần Quản trị xem tất cả công ty.');
    const { state, bundle, skipped } = await build(year);
    const blob = await pack(bundle);
    const path = await H.Word.Files.saveBlob(blob, 'HAK_NamDaDong_' + year + '.zip');
    if (!path) return { canceled: true };
    const proof = await verify(path, blob);
    if (
      !ask(
        'File năm ' +
          year +
          ' đã lưu và đọc lại đúng. Đóng năm sẽ gỡ ' +
          bundle.records.length +
          ' hồ sơ trong sổ năm, ' +
          bundle.archive.length +
          ' hồ sơ Lưu trữ cũ và ' +
          bundle.batches.length +
          ' đợt cân riêng năm này khỏi kho đang làm việc. Đợt lẫn năm/không rõ năm và danh mục dùng chung được giữ lại. Thay đổi biểu mẫu chưa lưu không nằm trong file. Tiếp tục?'
      )
    )
      return { canceled: true, saved: path };
    // Record the verified recovery file before either database is pruned. Each database checks its own snapshot.
    const prepared = await H.Yearbook.commit(state.revision, (s) => {
      s.closed = (s.closed || []).concat([
        {
          ...proof,
          year,
          pending: true,
          closedAt: Date.now(),
          count: bundle.records.length,
          archiveCount: bundle.archive.length,
          batchCount: bundle.batches.length,
        },
      ]);
      return s;
    });
    if (bundle.archive.length) await H.Archive.closeVerified(bundle.archive);
    await finalize(prepared.revision, bundle, proof);
    H.Yearbook.release(year, bundle.batches);
    return { path, skipped, records: bundle.records.length, batches: bundle.batches.length };
  }
  async function readFile(file, expected) {
    if (expected && (await digest(file)) !== expected.sha256) throw Error('File không khớp năm đã đóng được chọn. Hãy chọn đúng bản ZIP.');
    const j = await H.Backup.readJson(file);
    if (
      !j ||
      j.app !== 'hak-yearbook' ||
      ![1, 2].includes(j.v) ||
      !Number.isInteger(j.year) ||
      !Array.isArray(j.records) ||
      j.records.some((r) => r.year !== j.year)
    )
      throw Error('File năm không hợp lệ.');
    H.Yearbook.validateBundle(j.records);
    const records = clone(j.records);
    const linked = new Set(records.map((r) => r.legacyId).filter(Boolean));
    for (const item of j.archive || []) {
      if (!item.meta || typeof item.data !== 'string') throw Error('Hồ sơ lưu trữ trong file bị lỗi.');
      const data = await H.Archive.decode(item.data);
      if (linked.has(item.meta.id)) continue;
      const r = {
        id: 'closed-' + item.meta.id,
        type: data.type,
        year: j.year,
        revision: 1,
        createdAt: item.meta.createdAt,
        updatedAt: item.meta.updatedAt,
        title: item.meta.title,
        params: data.params,
        rows: data.rows,
        context: { config: j.config, custom: data.custom || {} },
        status: 'legacy',
      };
      H.Yearbook.validateBundle([r]);
      records.push(r);
    }
    for (const b of j.batches || [])
      if (!b.meta || typeof b.b64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.b64)) throw Error('File cân trong năm bị lỗi.');
    return { year: j.year, records, batches: j.batches || [], path: (expected && expected.path) || file.name };
  }

  /* ---- Tiếp tục đóng năm bị gián đoạn (đã có file ZIP đã xác minh + trạng thái "pending", chưa dọn xong kho) ---- */
  const stable = (v) =>
    JSON.stringify(v, (k, x) =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? Object.keys(x)
            .sort()
            .reduce((o, key) => ((o[key] = x[key]), o), {})
        : x
    );
  /** Năm đang dở: [{year,sha256,path,count,archiveCount,batchCount,closedAt}] */
  async function pendingYears() {
    const state = await H.Yearbook.read();
    return (state.closed || []).filter((c) => c.pending).map((c) => ({ ...c }));
  }
  /**
   * Đối chiếu file ZIP đã xác minh với dữ liệu đang làm việc rồi dọn tiếp. KHÔNG dọn nếu có hồ sơ / đợt cân ĐÃ SỬA sau khi đóng dở (file ZIP không chứa bản mới).
   * Trả { resumed:true, records, archive, batches, leftover:{records,batches} } | { needsReview:true, diffs:{changedRecords,changedBatches,changedArchive} } | { nothing:true }.
   */
  async function resumeClose(year, file, expectedSha) {
    if (H.Auth && (!H.Auth.isAdmin() || H.Auth.scopeIds('archive') !== null))
      throw Error('Tiếp tục đóng năm cần Quản trị xem tất cả công ty.');
    const state = await H.Yearbook.read(),
      pendings = (state.closed || []).filter((c) => c.pending && c.year === year);
    // Chỉ xét lần đóng dở ĐÚNG NĂM và (nếu có) đúng SHA-256 đã chọn; lần đã hoàn tất hoặc không còn chờ → không dọn thêm.
    const named = expectedSha ? pendings.find((c) => c.sha256 === expectedSha) : null;
    if (!pendings.length || (expectedSha && !named)) return { nothing: true };
    if (!file) {
      const hint = named || pendings[0];
      throw Error('Chọn lại đúng file ZIP năm ' + year + ' đã lưu (' + (hint.path || 'HAK_NamDaDong_' + year + '.zip') + ') để đối chiếu.');
    }
    const sha = await digest(file); // tính SHA-256 một lần
    const pend = named || pendings.find((c) => c.sha256 === sha);
    if (!pend || sha !== pend.sha256)
      throw Error(
        'File không khớp bản ZIP đã xác minh khi đóng năm ' +
          year +
          '; chưa dọn gì. Hãy chọn đúng file ' +
          ((named || pendings[0]).path || '') +
          '.'
      );
    const bundle = await H.Backup.readJson(file);
    if (!bundle || bundle.app !== 'hak-yearbook' || bundle.year !== year || !Array.isArray(bundle.records))
      throw Error('File năm không hợp lệ.');
    const live = await build(year, { allowEmpty: true }),
      liveBundle = live.bundle;
    const byId = (xs, f) => new Map(xs.map((x) => [f(x), x]));
    const liveRec = byId(liveBundle.records, (r) => r.id),
      zipRec = byId(bundle.records, (r) => r.id),
      changedRecords = [],
      leftoverRecords = [];
    for (const [id, z] of zipRec) {
      const l = liveRec.get(id);
      if (l && stable(l) !== stable(z))
        changedRecords.push({ id, title: l.title || (l.params && l.params.ship) || id, zipRevision: z.revision, liveRevision: l.revision });
    }
    for (const [id, l] of liveRec) if (!zipRec.has(id)) leftoverRecords.push({ id, title: l.title || id });
    const liveArc = byId(liveBundle.archive, (x) => x.meta.id),
      zipArc = byId(bundle.archive || [], (x) => x.meta.id),
      changedArchive = [];
    for (const [id, z] of zipArc) {
      const l = liveArc.get(id);
      if (l && (stable(l.meta) !== stable(z.meta) || l.data !== z.data)) changedArchive.push({ id, title: l.meta.title || id });
    }
    const liveBat = byId(liveBundle.batches, (x) => x.meta.id),
      zipBat = byId(bundle.batches || [], (x) => x.meta.id),
      changedBatches = [],
      leftoverBatches = [];
    for (const [id, z] of zipBat) {
      const l = liveBat.get(id);
      if (l && (stable(l.meta) !== stable(z.meta) || l.b64 !== z.b64)) changedBatches.push({ id, name: l.meta.fileName });
    }
    for (const [id, l] of liveBat) if (!zipBat.has(id)) leftoverBatches.push({ id, name: l.meta.fileName });
    if (changedRecords.length || changedArchive.length || changedBatches.length)
      return {
        needsReview: true,
        diffs: { changedRecords, changedArchive, changedBatches },
        leftover: { records: leftoverRecords, batches: leftoverBatches },
      };
    const prune = {
      app: bundle.app,
      year,
      records: bundle.records.filter((r) => liveRec.has(r.id)),
      archive: liveBundle.archive.filter((x) => zipArc.has(x.meta.id)),
      batches: liveBundle.batches.filter((x) => zipBat.has(x.meta.id)),
    };
    if (prune.archive.length) await H.Archive.closeVerified(prune.archive);
    await finalize(state.revision, prune, { path: pend.path, sha256: pend.sha256, size: pend.size });
    H.Yearbook.release(year, prune.batches);
    return {
      resumed: true,
      records: prune.records.length,
      archive: prune.archive.length,
      batches: prune.batches.length,
      expected: { records: pend.count, archive: pend.archiveCount, batches: pend.batchCount },
      leftover: { records: leftoverRecords, batches: leftoverBatches },
    };
  }
  H.YearClose = { closeYear, readFile, digest, verify, build, finalize, exclusive, pendingYears, resumeClose };
  if (typeof module !== 'undefined') module.exports = { exclusive };
})(typeof window !== 'undefined' ? window : globalThis);
