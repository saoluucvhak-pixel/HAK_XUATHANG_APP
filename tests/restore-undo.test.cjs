/* Khôi phục sao lưu: tự chụp bản hiện tại trước khi ghi đè (hoàn tác được); không chụp được thì không đổi gì; bản chụp không lọt vào sao lưu toàn bộ. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
function boot(failSnapshot) {
  const store = new Map();
  global.window = global;
  global.HAK = {};
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      if (failSnapshot && k === 'hak.prerestore.v1') return false;
      store.set(k, JSON.stringify(v));
      return true;
    },
    remove: (k) => {
      store.delete(k);
    },
    keys: () => Array.from(store.keys()),
  };
  HAK.Archive = { importItems: async () => ({ added: 0, updated: 0, skipped: 0 }), collectItems: async () => [] };
  HAK.DB = { put: async () => {}, getAll: async () => [] };
  HAK.UI = { toast() {} };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');
  return { store };
}
const fileOf = (obj) => {
  const b = Buffer.from(JSON.stringify(obj));
  return {
    slice: () => ({ arrayBuffer: async () => b.subarray(0, 2).buffer.slice(b.byteOffset, b.byteOffset + 2) }),
    text: async () => b.toString('utf8'),
    name: 'sao-luu.json',
  };
};
const backupOf = (keys) => ({ app: 'hak-bienban-backup', v: 1, keys, archive: [] });
test('khôi phục chụp bản hiện tại; hoàn tác trả lại đúng, gỡ khóa mới do khôi phục tạo ra', async () => {
  const { store } = boot(false);
  HAK.Store.set('hak.config.v1', { a: 1 });
  HAK.Store.set('hak.catalog.v1', { v: 3, contracts: ['máy này'] });
  const r = await HAK.Backup.restoreFile(
    fileOf(backupOf({ 'hak.config.v1': { a: 2 }, 'hak.catalog.v1': { v: 2 }, 'hak.tpl.moi': { x: 1 } })),
    { keepAuth: false, mode: 'replace' }
  );
  assert.equal(r.snapshot, true);
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 2 });
  assert.ok(HAK.Store.get('hak.tpl.moi'));
  assert.ok(HAK.Backup.preRestoreInfo());
  const u = await HAK.Backup.undoRestore();
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 1 });
  assert.deepEqual(HAK.Store.get('hak.catalog.v1'), { v: 3, contracts: ['máy này'] });
  assert.equal(HAK.Store.get('hak.tpl.moi', null), null, 'khóa mới bị gỡ');
  assert.equal(HAK.Backup.preRestoreInfo(), null);
  assert.ok(u.removed >= 1);
  await assert.rejects(HAK.Backup.undoRestore(), /Chưa có bản chụp/);
});
test('không chụp được bản hiện tại → từ chối khôi phục, dữ liệu máy không đổi', async () => {
  boot(true);
  HAK.Store.set('hak.config.v1', { a: 1 });
  await assert.rejects(
    HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 9 } })), { keepAuth: false, mode: 'replace' }),
    /Không chụp được bản hiện tại/
  );
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 1 });
});
test('bản chụp không lọt vào sao lưu toàn bộ và không bị ghi đè bởi file sao lưu', async () => {
  boot(false);
  HAK.Store.set('hak.config.v1', { a: 1 });
  await HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 2 }, 'hak.prerestore.v1': { at: 1, keys: { x: 1 } } })), {
    keepAuth: false,
    mode: 'replace',
  });
  const c = await HAK.Backup.collect();
  assert.equal('hak.prerestore.v1' in c.keys, false);
  assert.deepEqual(HAK.Store.get('hak.prerestore.v1').keys['hak.config.v1'], { a: 1 }, 'chụp là bản của máy, không phải của file');
});

function sqlite() {
  const { store } = boot(false);
  const durable = new Map();
  HAK.Storage = { mode: 'sqlite', assertOpen() {} };
  let failing = null;
  HAK.DB.kvCas = async (key, check, value) => {
    if (key === failing) throw Error('SQLite write failed');
    const error = check(durable.get(key));
    if (error) throw Error(error);
    durable.set(key, structuredClone(value));
  };
  HAK.DB.kvDel = async (key) => {
    if (key === failing) throw Error('SQLite delete failed');
    durable.delete(key);
  };
  const seed = (key, value) => {
    HAK.Store.set(key, value);
    durable.set(key, structuredClone(value));
  };
  return { store, durable, seed, fail: (key) => (failing = key) };
}

test('SQLite: lỗi ghi bản hoàn tác phải chặn khôi phục trước mọi thay đổi', async () => {
  const s = sqlite();
  s.seed('hak.config.v1', { a: 1 });
  s.fail('hak.prerestore.v1');
  await assert.rejects(HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 9 } })), { mode: 'replace' }), /Không chụp được/);
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 1 });
  assert.deepEqual(s.durable.get('hak.config.v1'), { a: 1 });
});

test('SQLite: lỗi ghi cài đặt không báo thành công, không đổi cache, giữ bản hoàn tác', async () => {
  const s = sqlite();
  s.seed('hak.config.v1', { a: 1 });
  s.fail('hak.config.v1');
  await assert.rejects(HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 9 } })), { mode: 'replace' }), (e) => {
    assert.equal(e.report[0].status, 'failed');
    assert.ok(e.report.slice(1).every((x) => x.status === 'pending'));
    return /SQLite write failed/.test(e.message);
  });
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { a: 1 });
  assert.ok(s.durable.get('hak.prerestore.v1'));
});

test('SQLite: bản khác thay cài đặt trước khôi phục thì không bị ghi đè', async () => {
  const s = sqlite();
  s.seed('hak.config.v1', { a: 1 });
  s.durable.set('hak.config.v1', { a: 2 });
  await assert.rejects(HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 9 } })), { mode: 'replace' }), /đã thay đổi/);
  assert.deepEqual(s.durable.get('hak.config.v1'), { a: 2 });
});

test('SQLite: hoàn tác phải chờ ghi; lỗi vẫn giữ bản chụp để thử lại', async () => {
  const s = sqlite();
  s.seed('hak.config.v1', { a: 1 });
  await HAK.Backup.restoreFile(fileOf(backupOf({ 'hak.config.v1': { a: 9 }, 'hak.tpl.moi': { x: 1 } })), { mode: 'replace' });
  assert.deepEqual(s.durable.get('hak.config.v1'), { a: 9 });
  s.fail('hak.config.v1');
  await assert.rejects(HAK.Backup.undoRestore(), /SQLite write failed/);
  assert.ok(s.durable.get('hak.prerestore.v1'));
  s.fail(null);
  await HAK.Backup.undoRestore();
  assert.deepEqual(s.durable.get('hak.config.v1'), { a: 1 });
  assert.equal(s.durable.has('hak.tpl.moi'), false);
  assert.equal(s.durable.has('hak.prerestore.v1'), false);
});
