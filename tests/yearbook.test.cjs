const test = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs');
const M = require('../app/js/yearbook.js');
const record = (id, year = 2026) => ({
  id,
  type: 'xuatkhau',
  year,
  revision: 1,
  params: { ship: 'QA', giaoId: 'co' },
  rows: [{ net: 1234.567 }],
  updatedAt: 1,
  createdAt: 1,
});
test('year inference reads old date strings without changing original', () => {
  const old = { from: '31/12/2025' },
    before = JSON.stringify(old);
  assert.equal(M.yearOf(old), 2025);
  assert.equal(M.yearOf({ from: '2026-01-02' }), 2026);
  assert.equal(M.yearOf({ from: '' }), null);
  assert.equal(JSON.stringify(old), before);
});
test('restore is repeatable, keeps newer revisions and other years; conflicts fail before writes', () => {
  const s = { v: 1, revision: 3, records: [record('old', 2025), { ...record('new'), revision: 3 }] };
  const j = M.merge(s, [record('a'), record('new')]);
  assert.equal(j.records.length, 3);
  assert.equal(j.records.find((x) => x.id === 'new').revision, 3);
  assert.deepEqual(M.merge(j, [record('a')]), j);
  assert.throws(() => M.merge(s, [{ ...record('new'), revision: 3, title: 'conflict' }]), /cùng phiên bản/);
  assert.equal(s.records.length, 2);
  assert.throws(() => M.merge(s, [record('dup'), record('dup')]), /Trùng/);
});
test('reject invalid types, years, rows, and identifiers', () => {
  for (const change of [{ year: NaN }, { year: 100 }, { type: 'unknown' }, { id: '<script>' }, { rows: [{ net: '123' }] }, { rows: [] }])
    assert.throws(() => M.validate({ ...record('qa'), ...change }));
});
function harness() {
  let state;
  let fail = false;
  const db = {
    transaction(store, mode) {
      let pending;
      const tx = {
        abort() {
          queueMicrotask(() => tx.onabort());
        },
        objectStore() {
          return {
            get() {
              const q = {};
              queueMicrotask(() => {
                q.result = state ? { val: structuredClone(state) } : undefined;
                q.onsuccess();
              });
              return q;
            },
            put(value) {
              pending = structuredClone(value.val);
              queueMicrotask(() => {
                if (fail) {
                  tx.onabort();
                  return;
                }
                state = pending;
                tx.oncomplete();
              });
            },
          };
        },
      };
      return tx;
    },
  };
  let exported;
  let snapNow = { params: { ship: 'QA' }, rows: [{ net: 100 }] };
  const opened = [],
    readOnlyCalls = [],
    auditLog = [];
  const window = {
    location: {},
    localStorage: { getItem: () => null, setItem() {} },
    HAK: {
      Store: { get: () => ({ v: 3, contracts: [], customers: [], products: [] }) },
      Catalog: { contract: () => null },
      Config: { data: { companies: [], warehouses: [] }, custom: {} },
      Pages: {
        snapshot: () => structuredClone(snapNow),
        DOCS: { xuatkhau: { title: 'QA' } },
        openSnapshot(r) {
          opened.push(structuredClone(r));
        },
        readOnly(type, on) {
          readOnlyCalls.push([type, on]);
        },
      },
      Audit: { log: (e) => auditLog.push(e) },
      Auth: { who: () => 'Nguyễn Văn A' },
      UI: { toast() {} },
      Word: {
        Files: {
          saveBlob: async (blob) => {
            exported = JSON.parse(await blob.text());
            return 'saved';
          },
        },
      },
    },
  };
  const ctx = {
    window,
    document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    console,
    Blob,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Set,
    Map,
    Number,
    Error,
  };
  vm.createContext(ctx);
  window.indexedDB = {
    open: () => {
      const rq = {};
      queueMicrotask(() => {
        rq.result = db;
        rq.onsuccess();
      });
      return rq;
    },
  };
  vm.runInContext(fs.readFileSync(require.resolve('../app/js/db.js'), 'utf8'), ctx); // db.js THẬT trên IndexedDB giả
  window.HAK.DB.getAll = async () => [];
  vm.runInContext(fs.readFileSync(require.resolve('../app/js/yearbook.js'), 'utf8'), ctx);
  return {
    Y: window.HAK.Yearbook,
    H: window.HAK,
    opened,
    readOnlyCalls,
    auditLog,
    snap: (v) => (snapNow = v),
    fail: () => (fail = true),
    get state() {
      return state;
    },
    get exported() {
      return exported;
    },
  };
}
test('save draft, reopen, edit keeps ID/history; year backup round-trips rows and isolates years', async () => {
  const h = harness(),
    Y = h.Y;
  Y.setYear(2025);
  const a = await Y.save('xuatkhau');
  assert.equal(a.year, 2025);
  await Y.open(a.id);
  const b = await Y.save('xuatkhau');
  assert.equal(b.id, a.id);
  assert.equal(b.revision, 2);
  assert.equal(b.versions.length, 1);
  Y.clear('xuatkhau');
  Y.setYear(2026);
  await Y.save('xuatkhau');
  await Y.backup();
  assert.equal(h.exported.year, 2026);
  assert.equal(h.exported.records.length, 1);
  assert.equal(h.exported.records[0].rows[0].net, 100);
  const other = harness();
  await other.Y.restore({ text: async () => JSON.stringify(h.exported) });
  assert.equal((await other.Y.read()).records.length, 1);
  await other.Y.restore({ text: async () => JSON.stringify(h.exported) });
  assert.equal((await other.Y.read()).records.length, 1);
});
test('stale window and transaction failure do not overwrite persisted snapshots', async () => {
  const h = harness(),
    r = await h.Y.save('xuatkhau');
  await h.Y.open(r.id);
  const s = await h.Y.read();
  await h.Y.commit(s.revision, (x) => x);
  await assert.rejects(h.Y.save('xuatkhau'), /cửa sổ khác|Kho hồ sơ/);
  const before = JSON.stringify(h.state);
  h.Y.clear('xuatkhau');
  h.fail();
  await assert.rejects(h.Y.save('xuatkhau'));
  assert.equal(JSON.stringify(h.state), before);
});
test('invalid restore leaves data unchanged and failed generator context restores live configuration', async () => {
  const h = harness();
  await h.Y.save('xuatkhau');
  const before = JSON.stringify(h.state);
  await assert.rejects(
    h.Y.restore({ text: async () => JSON.stringify({ app: 'hak-yearbook', v: 1, year: 2025, records: [record('bad', 2026)] }) })
  );
  assert.equal(JSON.stringify(h.state), before);
  const config = h.H.Config.data;
  assert.throws(() =>
    h.Y.underContext({ context: { config: { companies: ['old'] } } }, () => {
      throw Error('build failed');
    })
  );
  assert.equal(h.H.Config.data, config);
});

test('archive and restore preserve rows and do not remove other years', async () => {
  const h = harness();
  const r = await h.Y.save('xuatkhau');
  await h.Y.archiveRecord(r.id);
  assert.ok((await h.Y.read()).records[0].deletedAt);
  await assert.rejects(h.Y.open(r.id));
  await h.Y.archiveRecord(r.id);
  await h.Y.open(r.id);
  assert.equal((await h.Y.read()).records[0].rows[0].net, 100);
});
test('legacy transfer copies once and leaves original archive untouched', async () => {
  const h = harness();
  h.Y.setYear(2025);
  const old = { id: 'old-a', type: 'xuatkhau', from: '01/01/2025', title: 'OLD', updatedAt: 100 };
  h.H.Archive = { list: async () => [old], load: async () => ({ type: 'xuatkhau', params: { ship: 'OLD' }, rows: [{ net: 200 }] }) };
  const before = JSON.stringify(old);
  assert.equal(await h.Y.copyLegacy(), 1);
  assert.equal(await h.Y.copyLegacy(), 0);
  assert.equal((await h.Y.read()).records.length, 1);
  assert.equal(JSON.stringify(old), before);
});

const same = { params: { ship: 'QA' }, rows: [{ net: 100 }] },
  edited = { params: { ship: 'QA' }, rows: [{ net: 100 }, { net: 250 }] };
test('sửa hồ sơ ĐÃ XUẤT cần lý do; bản cũ giữ lại kèm trạng thái, lý do, người sửa; nhật ký ghi lý do', async () => {
  const h = harness(),
    Y = h.Y;
  Y.setYear(2026);
  const a = await Y.save('xuatkhau', true); // lập và xuất
  assert.equal(a.status, 'exported');
  h.snap(edited);
  await assert.rejects(Y.save('xuatkhau', false), (e) => e.code === 'reason-required');
  assert.equal((await Y.read()).records[0].revision, 1, 'chưa ghi gì khi thiếu lý do');
  const b = await Y.save('xuatkhau', false, { reason: '  Thêm xe bị sót  ' });
  assert.equal(b.revision, 2);
  assert.equal(b.versions.length, 1);
  assert.deepEqual([b.versions[0].revision, b.versions[0].status, b.versions[0].rows.length], [1, 'exported', 1]);
  assert.deepEqual(
    [
      b.versions[0].supersededBy.reason,
      b.versions[0].supersededBy.by,
      b.versions[0].supersededBy.revision,
      b.versions[0].supersededBy.changed,
    ],
    ['Thêm xe bị sót', 'Nguyễn Văn A', 2, true]
  );
  const log = h.auditLog.find((e) => e.action === 'sửa hồ sơ đã xuất');
  assert.ok(log && log.reason === 'Thêm xe bị sót' && log.before === '1' && log.after === '2' && log.entity === 'yearbook');
  assert.ok(h.auditLog.some((e) => e.action === 'tạo hồ sơ'));
});
test('hồ sơ đã xuất lưu lại KHÔNG đổi nội dung: không cần lý do; hồ sơ chưa xuất sửa tự do', async () => {
  const h = harness(),
    Y = h.Y;
  Y.setYear(2026);
  await Y.save('xuatkhau', true);
  const again = await Y.save('xuatkhau', true);
  assert.equal(again.revision, 2);
  assert.equal(again.versions[0].supersededBy.changed, false);
  const h2 = harness();
  h2.Y.setYear(2026);
  await h2.Y.save('xuatkhau', false);
  h2.snap(edited);
  assert.equal((await h2.Y.save('xuatkhau', false)).revision, 2, 'bản nháp sửa không cần lý do');
});
test('saveAsk: hỏi lý do khi cần; hủy / để trống thì không lưu gì', async () => {
  const h = harness(),
    Y = h.Y;
  Y.setYear(2026);
  await Y.save('xuatkhau', true);
  h.snap(edited);
  Y.askReason = async () => '   ';
  await assert.rejects(Y.saveAsk('xuatkhau', false), (e) => e.code === 'reason-cancelled');
  assert.equal((await Y.read()).records[0].revision, 1);
  Y.askReason = async (msg) => {
    assert.match(msg, /đã xuất/);
    return 'Khách đổi số xe';
  };
  const r = await Y.saveAsk('xuatkhau', false);
  assert.equal(r.versions[0].supersededBy.reason, 'Khách đổi số xe');
});
test('openVersion: mở đúng bản cũ ở chế độ chỉ xem (không ghi kho); bản không có thì báo lỗi', async () => {
  const h = harness(),
    Y = h.Y;
  Y.setYear(2026);
  const a = await Y.save('xuatkhau', true);
  h.snap(edited);
  await Y.save('xuatkhau', false, { reason: 'bổ sung' });
  assert.equal(await Y.openVersion(a.id, 1), true);
  const view = h.opened[h.opened.length - 1];
  assert.deepEqual([view.revision, view.rows.length, view.status], [1, 1, 'exported'], 'đúng bản 1 đã xuất, 1 phiếu');
  assert.deepEqual(h.readOnlyCalls[h.readOnlyCalls.length - 1], ['xuatkhau', true]);
  assert.equal(Y.active('xuatkhau').readonly, true);
  await assert.rejects(Y.save('xuatkhau', false, { reason: 'x' }), /phiên bản cũ \(chỉ xem\)/, 'bản cũ không ghi đè kho');
  assert.equal((await Y.read()).records[0].revision, 2);
  await Y.openVersion(a.id, 2);
  assert.equal(h.opened[h.opened.length - 1].rows.length, 2, 'bản hiện hành cũng mở được');
  await assert.rejects(Y.openVersion(a.id, 9), /Không có bản 9/);
});
