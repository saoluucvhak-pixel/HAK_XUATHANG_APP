/* Đợt 1b (B1–B5, B7–B11, N-02): kiểm tra lớp lược đồ + ép kiểu khi nhập file, danh sách trắng khóa sao lưu, lọc ký tự XML, trần kích thước ZIP. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');

function bootBackup() {
  const store = new Map();
  global.window = global;
  global.HAK = {};
  global.JSZip = require('../app/libs/jszip.min.js');
  HAK.Util = require('../app/js/util.js');
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      store.set(k, JSON.stringify(v));
      return true;
    },
    remove: (k) => store.delete(k),
    keys: () => Array.from(store.keys()),
  };
  HAK.Archive = { importItems: async () => ({ added: 0, updated: 0, skipped: 0 }), collectItems: async () => [] };
  HAK.DB = { put: async () => {}, getAll: async () => [] };
  HAK.UI = {
    toast() {},
    esc: (s) =>
      String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  };
  global.location = { hash: '' };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');
  return { store };
}

test('B1: cleanArchiveMeta ép kiểu trường số và loại bỏ id/type/modes chứa HTML', () => {
  const U = require('../app/js/util.js');
  assert.equal(typeof U.cleanArchiveMeta, 'function', 'phải có HAK.Util.cleanArchiveMeta');
  assert.equal(
    U.cleanArchiveMeta({ id: '<img src=x onerror=alert(1)>', type: 'xuatkhau', updatedAt: Date.now(), trips: '3', kg: '1000' }),
    null,
    'id chứa HTML phải bị loại'
  );
  const ok = U.cleanArchiveMeta({
    id: 'hs-01',
    type: 'xuatkhau',
    updatedAt: 1700000000000,
    trips: '<img src=x>',
    kg: '5000',
    modes: ['word', '<script>'],
  });
  assert.ok(ok);
  assert.equal(ok.trips, 0);
  assert.equal(ok.kg, 5000);
  assert.deepEqual(ok.modes, ['word']);
});

test('B2: pxk-model pad6 và cleanIssuedRec ép số pxkFrom/pxkTo', () => {
  const U = require('../app/js/util.js');
  const P = require('../app/js/pxk-model.js');
  assert.equal(P.pad6('<img src=x onerror=window.__xss=1>'), 'PXK000000', 'pad6 không được trả về chuỗi HTML');
  assert.equal(typeof U.cleanIssuedRec, 'function', 'phải có HAK.Util.cleanIssuedRec');
  const rec = U.cleanIssuedRec({ id: 'i-1', kind: 'pxk', pxkFrom: '<img src=x>', pxkTo: '42', at: 1700000000000 });
  assert.equal(rec.pxkFrom, 0);
  assert.equal(rec.pxkTo, 42);
});

test('B3: cleanBatchMeta ép số veh.count và trường số', () => {
  const U = require('../app/js/util.js');
  assert.equal(typeof U.cleanBatchMeta, 'function', 'phải có HAK.Util.cleanBatchMeta');
  const b = U.cleanBatchMeta({ id: 'b-1', rev: '2', veh: { count: '<img src=x>', fileName: 'a.xlsx' } });
  assert.equal(b.rev, 2);
  assert.equal(b.veh.count, 0);
});

test('B4: cleanAuthUser / id tài khoản không chấp nhận HTML', () => {
  const U = require('../app/js/util.js');
  assert.equal(typeof U.cleanAuthStore, 'function', 'phải có HAK.Util.cleanAuthStore');
  assert.throws(() => U.cleanAuthStore({ users: [] }), /tài khoản/i);
  assert.throws(
    () => U.cleanAuthStore({ users: [{ id: '<img src=x>', username: 'admin', role: 'admin', hash: 'h', salt: 's' }] }),
    /Mã tài khoản|không hợp lệ/i
  );
});

test('B5: escapeXmlText trong bkls.js loại bỏ ký tự điều khiển XML 1.0 không hợp lệ', () => {
  global.window = global;
  global.HAK = { Util: require('../app/js/util.js') };
  require('../app/js/bkls.js');
  const out = HAK.Bkls.escapeXmlText('Gỗ\x01\x02\x0B\x1F keo\t\n');
  assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(out), 'không được còn ký tự điều khiển XML 1.0');
  assert.ok(out.includes('Gỗ keo'));
});

test('B7 + B8: backup từ chối khóa ngoài danh sách trắng và hak.auth.v1 / hak.config.v1 hỏng', async () => {
  bootBackup();
  HAK.Store.set('hak.config.v1', { companies: [{ id: 'hak', name: 'HAK' }], warehouses: [] });

  // Khóa lạ ngoài danh sách trắng không được ghi vào Store
  const withUnknown = {
    app: 'hak-bienban-backup',
    v: 1,
    keys: {
      'hak.config.v1': { companies: [{ id: 'hak', name: 'HAK' }], warehouses: [] },
      'hak.evil.inject': { pwn: true },
    },
    archive: [],
  };
  const fileObj = (obj) => {
    const b = Buffer.from(JSON.stringify(obj));
    return {
      name: 'b.json',
      size: b.length,
      slice: () => ({ arrayBuffer: async () => b.subarray(0, 2).buffer.slice(b.byteOffset, b.byteOffset + 2) }),
      text: async () => b.toString('utf8'),
    };
  };
  await HAK.Backup.restoreFile(fileObj(withUnknown), { keepAuth: true, mode: 'replace' });
  assert.equal(HAK.Store.get('hak.evil.inject', null), null, 'khóa ngoài danh sách trắng không được ghi vào Store');

  // hak.config.v1 hỏng phải bị từ chối TRƯỚC khi ghi
  const badConfig = {
    app: 'hak-bienban-backup',
    v: 1,
    keys: { 'hak.config.v1': { companies: [null, 5], warehouses: [{}] } },
    archive: [],
  };
  await assert.rejects(() => HAK.Backup.restoreFile(fileObj(badConfig), { keepAuth: true, mode: 'replace' }), /cấu hình|hợp lệ/i);
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { companies: [{ id: 'hak', name: 'HAK' }], warehouses: [] });

  // hak.auth.v1 hỏng phải bị từ chối TRƯỚC khi ghi
  const badAuth = {
    app: 'hak-bienban-backup',
    v: 1,
    keys: { 'hak.auth.v1': { users: [] } },
    archive: [],
  };
  await assert.rejects(() => HAK.Backup.restoreFile(fileObj(badAuth), { keepAuth: false, mode: 'replace' }), /tài khoản|hợp lệ/i);
});

test('N-02: validateConfigData từ chối {companies:[null,5],warehouses:[{}]}', () => {
  const U = require('../app/js/util.js');
  assert.equal(typeof U.validateConfigData, 'function', 'phải có HAK.Util.validateConfigData');
  assert.throws(() => U.validateConfigData({ companies: [null, 5], warehouses: [{}] }), /công ty|hợp lệ/i);
  assert.throws(() => U.validateConfigData({ companies: [], warehouses: [] }), /công ty/i);
});

test('B9-B11: checkZipLimits từ chối ZIP vượt trần uncompressedSize trước khi giải nén', async () => {
  const U = require('../app/js/util.js');
  assert.equal(typeof U.checkZipLimits, 'function', 'phải có HAK.Util.checkZipLimits');
  const fakeZip = {
    files: {
      'huge.xml': { dir: false, _data: { uncompressedSize: 50 * 1024 * 1024 } },
    },
  };
  assert.throws(() => U.checkZipLimits(fakeZip, { maxTotal: 10 * 1024 * 1024, maxFile: 8 * 1024 * 1024 }), /quá lớn|vượt giới hạn/i);
});
