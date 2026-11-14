/* Khôi phục sao lưu: tự chụp bản hiện tại trước khi ghi đè (hoàn tác được); không chụp được thì không đổi gì; bản chụp không lọt vào sao lưu toàn bộ. */
const { test } = require('node:test'), assert = require('node:assert/strict');
function boot(failSnapshot) {
  const store = new Map(); global.window = global; global.HAK = {};
  HAK.Store = { get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d), set: (k, v) => { if (failSnapshot && k === 'hak.prerestore.v1') return false; store.set(k, JSON.stringify(v)); return true; }, remove: (k) => { store.delete(k); }, keys: () => Array.from(store.keys()) };
  HAK.Archive = { importItems: async () => ({ added: 0, updated: 0, skipped: 0 }), collectItems: async () => [] }; HAK.DB = { put: async () => {}, getAll: async () => [] }; HAK.UI = { toast() {} };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  delete require.cache[require.resolve('../app/js/backup.js')]; require('../app/js/backup.js'); return { store };
}
const fileOf = (obj) => { const b = Buffer.from(JSON.stringify(obj)); return { slice: () => ({ arrayBuffer: async () => b.subarray(0, 2).buffer.slice(b.byteOffset, b.byteOffset + 2) }), text: async () => b.toString('utf8'), name: 'sao-luu.json' }; };
const backupOf = (keys) => ({ app: 'hak-bienban-backup', v: 1, keys, archive: [] });
test('khôi phục chụp bản hiện tại; hoàn tác trả lại đúng, gỡ khóa mới do khôi phục tạo ra', async () => {
  const { store } = boot(false); HAK.Store.set('hak.config.v1', { a: 1 }); HAK.Store.set('hak.catalog.v1', { v: 3, contracts: ['máy này'] });
  const r = await HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 2 }, 'hak.catalog.v1': { v: 2 }, 'hak.moi.v1': { x: 1 } })), { keepAuth: false });
  assert.equal(r.snapshot, true); assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 2 }); assert.ok(HAK.Store.get('hak.moi.v1')); assert.ok(HAK.Backup.preRestoreInfo());
  const u = HAK.Backup.undoRestore();
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 1 }); assert.deepEqual(HAK.Store.get('hak.catalog.v1'), { v: 3, contracts: ['máy này'] }); assert.equal(HAK.Store.get('hak.moi.v1', null), null, 'khóa mới bị gỡ');
  assert.equal(HAK.Backup.preRestoreInfo(), null); assert.ok(u.removed >= 1); assert.throws(() => HAK.Backup.undoRestore(), /Chưa có bản chụp/);
});
test('không chụp được bản hiện tại → từ chối khôi phục, dữ liệu máy không đổi', async () => {
  boot(true); HAK.Store.set('hak.config.v1', { a: 1 });
  await assert.rejects(HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 9 } })), { keepAuth: false }), /Không chụp được bản hiện tại/);
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 1 });
});
test('bản chụp không lọt vào sao lưu toàn bộ và không bị ghi đè bởi file sao lưu', async () => {
  boot(false); HAK.Store.set('hak.config.v1', { a: 1 }); await HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 2 }, 'hak.prerestore.v1': { at: 1, keys: { x: 1 } } })), { keepAuth: false });
  const c = await HAK.Backup.collect(); assert.equal('hak.prerestore.v1' in c.keys, false); assert.deepEqual(HAK.Store.get('hak.prerestore.v1').keys['hak.config.v1'], { a: 1 }, 'chụp là bản của máy, không phải của file');
});
