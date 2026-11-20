/* Nhập bổ sung vs Khôi phục: luồng restoreFile() thật (kể cả inspect, bước ghi từng kho, lỗi giữa chừng). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
function boot(over) {
  const store = new Map();
  global.window = global;
  global.HAK = {};
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      store.set(k, JSON.stringify(v));
      return true;
    },
    keys: () => Array.from(store.keys()),
    remove: (k) => store.delete(k),
  };
  const calls = [];
  HAK.Archive = {
    importItems: async (x) => {
      calls.push('archive');
      return { added: x.length, updated: 0, skipped: 0 };
    },
    collectItems: async () => [],
  };
  const idb = { attachments: new Map(), bklsTemplates: new Map() };
  HAK.DB = {
    put: async (st, v) => {
      calls.push('put:' + st);
      idb[st].set(v.id, v);
    },
    get: async (st, id) => (idb[st] || new Map()).get(id),
    getAll: async () => [],
  };
  HAK.UI = { toast() {}, esc: (x) => String(x) };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  global.HAK.CustomsModel = require('../app/js/customs-model.js');
  global.HAK.ContractModel = require('../app/js/contract-model.js');
  Object.assign(HAK, (over && over(calls)) || {});
  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');
  return { store, calls, idb };
}
const det = (id, extra) => Object.assign({ id, contractId: 'hd1', ship: 'TÀU ' + id, mt: 100, bdmt: 50, revision: 1 }, extra || {});
const cat = (c) => ({
  v: 3,
  customers: [],
  products: [],
  contracts: [Object.assign({ id: 'hd1', type: 'xuatban', no: 'HD1', contractQty: 700, details: [det('d1')], revision: 4 }, c || {})],
  customs: [],
});
const fileOf = (obj) => {
  const b = Buffer.from(JSON.stringify(obj));
  return {
    slice: () => ({ arrayBuffer: async () => b.subarray(0, 2).buffer.slice(b.byteOffset, b.byteOffset + 2) }),
    text: async () => b.toString('utf8'),
  };
};
const backupOf = (keys, extra) => Object.assign({ app: 'hak-bienban-backup', v: 1, keys, archive: [] }, extra || {});
const local = () => HAK.Store.get('hak.catalog.v1').contracts[0];

test('Nhập bổ sung: máy 700 BDMT phiên bản 4 + bản sao 500 BDMT phiên bản 2 → giữ 700 / v4; nhập lặp cùng kết quả', async () => {
  boot();
  HAK.Store.set('hak.catalog.v1', cat());
  const f = fileOf(backupOf({ 'hak.catalog.v1': cat({ contractQty: 500, revision: 2 }) }));
  const r = await HAK.Backup.restoreFile(f, { keepAuth: false, mode: 'merge' });
  assert.equal(local().contractQty, 700);
  assert.equal(local().revision, 4);
  assert.equal(r.keptNewer, 1);
  const snap = JSON.stringify(HAK.Store.get('hak.catalog.v1'));
  await HAK.Backup.restoreFile(f, { keepAuth: false, mode: 'merge' });
  assert.equal(JSON.stringify(HAK.Store.get('hak.catalog.v1')), snap);
});
test('mặc định (không nói rõ mode) là Nhập bổ sung — không bao giờ ghi đè ngầm', async () => {
  boot();
  HAK.Store.set('hak.catalog.v1', cat());
  await HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.catalog.v1': cat({ contractQty: 500, revision: 2 }) })), { keepAuth: false });
  assert.equal(local().contractQty, 700);
});
test('Nhập bổ sung: hợp đồng đã mở lại vẫn mở khi bản sao cũ là bản đã đóng; cài đặt đang có không bị đè, khóa còn thiếu được điền', async () => {
  boot();
  const M = HAK.ContractModel,
    reopened = cat();
  M.reopenContract(reopened.contracts[0], '2026-10-05');
  reopened.contracts[0].closeRev = 2;
  HAK.Store.set('hak.catalog.v1', reopened);
  HAK.Store.set('hak.config.v1', { a: 1 });
  await HAK.Backup.restoreFile(
    fileOf(
      backupOf({ 'hak.catalog.v1': cat({ revision: 2, closedAt: '2026-10-01' }), 'hak.config.v1': { a: 2 }, 'hak.tpl.moi': { x: 1 } })
    ),
    { keepAuth: false, mode: 'merge' }
  );
  assert.equal(local().closedAt, undefined);
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 1 });
  assert.deepEqual(HAK.Store.get('hak.tpl.moi'), { x: 1 });
});
test('Khôi phục (replace) thay danh mục bằng bản sao như thiết kế, và hoàn tác trả lại 700 / v4', async () => {
  boot();
  HAK.Store.set('hak.catalog.v1', cat());
  await HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.catalog.v1': cat({ contractQty: 500, revision: 2 }) })), {
    keepAuth: false,
    mode: 'replace',
  });
  assert.equal(local().contractQty, 500);
  await HAK.Backup.undoRestore();
  assert.equal(local().contractQty, 700);
  assert.equal(local().revision, 4);
});
test('inspect: xem trước phạm vi KHÔNG ghi gì và chỉ ra hợp đồng máy này mới hơn', async () => {
  const { store } = boot();
  HAK.Store.set('hak.catalog.v1', cat());
  const before = JSON.stringify(Array.from(store.entries()));
  const info = await HAK.Backup.inspect(fileOf(backupOf({ 'hak.catalog.v1': cat({ contractQty: 500, revision: 2 }) })));
  assert.equal(info.plan.catalog.willOverwrite, 1);
  assert.equal(info.plan.catalog.keptNewer, 1);
  assert.match(info.plan.catalog.localNewer[0], /HD1.*v4.*v2/);
  assert.equal(JSON.stringify(Array.from(store.entries())), before);
  assert.match(HAK.Backup.planHtml(info.plan), /khác nội dung/);
});
test('bản sao hỏng bị từ chối TRƯỚC khi ghi (không chụp, không đổi gì)', async () => {
  const { store } = boot();
  HAK.Store.set('hak.config.v1', { a: 1 });
  const before = JSON.stringify(Array.from(store.entries()));
  await assert.rejects(
    HAK.Backup.restoreFile(fileOf(backupOf({}, { attachments: [{ id: 'x', base64: '***' }] })), { keepAuth: false, mode: 'merge' }),
    /không hợp lệ/
  );
  assert.equal(JSON.stringify(Array.from(store.entries())), before);
});
test('một bước ghi thất bại: lỗi nêu rõ kho đã nhập, kho chưa chạy, phần hoàn tác được; dữ liệu đã nhập được bảo toàn', async () => {
  const { store } = boot(() => ({
    Batches: {
      importAll: async () => {
        throw new Error('QuotaExceededError');
      },
    },
    Issued: { importAll: async () => 9 },
  }));
  HAK.Store.set('hak.catalog.v1', cat());
  let err;
  try {
    await HAK.Backup.restoreFile(
      fileOf(
        backupOf(
          { 'hak.catalog.v1': cat({ contractQty: 900, revision: 6 }) },
          { archive: [{ meta: { id: 'a' }, data: 'x' }], batches: [{ meta: { id: 'b|1' }, b64: '' }], issued: [{ id: 'i1' }] }
        )
      ),
      { keepAuth: false, mode: 'merge' }
    );
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.report, 'lỗi phải kèm báo cáo từng kho');
  const st = Object.fromEntries(err.report.map((x) => [x.id, x.status]));
  assert.equal(st.keys, 'done');
  assert.equal(st.archive, 'done');
  assert.equal(st.batches, 'failed');
  assert.equal(st.issued, 'pending');
  assert.match(err.message, /DỪNG GIỮA CHỪNG tại "đợt Excel": QuotaExceededError/);
  assert.match(err.message, /Hoàn tác được.*cài đặt & danh mục/);
  assert.match(err.message, /Chưa chạy: nhật ký chứng từ/);
  assert.match(err.message, /KHÔNG hoàn tác tự động.*hồ sơ Lưu trữ/);
  assert.equal(local().contractQty, 900, 'phần đã nhập vẫn còn');
  await HAK.Backup.undoRestore();
  assert.equal(local().contractQty, 700);
  assert.ok(store);
});
test('Batches.importAll keepNewer: đợt trên máy có rev >= bản sao thì giữ; bản sao mới hơn thì thay; nhập lặp không đổi', async () => {
  global.window = global;
  global.HAK = {};
  const metas = new Map([['x|a', { id: 'x|a', rev: 5, tag: 'máy' }]]),
    data = new Map();
  HAK.DB = {
    get: async (st, id) => metas.get(id),
    guarded: async (s, g, id, check, apply) => {
      apply({ objectStore: (n) => ({ put: (v, k) => (n === 'batches' ? metas.set(v.id, v) : data.set(k, v)) }) });
    },
  };
  delete require.cache[require.resolve('../app/js/records.js')];
  require('../app/js/records.js');
  const items = [
    { meta: { id: 'x|a', rev: 2, tag: 'bản sao' }, b64: '' },
    { meta: { id: 'x|b', rev: 1, tag: 'mới' }, b64: '' },
    { meta: { id: 'x|c', rev: 1 }, b64: '' },
  ];
  metas.set('x|c', { id: 'x|c', rev: 0, tag: 'cũ' });
  assert.equal(await HAK.Batches.importAll(items, { keepNewer: true }), 2);
  assert.equal(metas.get('x|a').tag, 'máy');
  assert.equal(metas.get('x|b').tag, 'mới');
  assert.equal(metas.get('x|c').rev, 1);
  assert.equal(await HAK.Batches.importAll(items, { keepNewer: true }), 0);
});
