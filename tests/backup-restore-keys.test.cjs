// Các khóa cài đặt được khôi phục trên máy mới từ file sao lưu toàn bộ.
const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('Mẫu nhập Excel và tùy chọn báo cáo đi vòng sao lưu → máy trống', async () => {
  const mk = () => {
    const m = new Map();
    return {
      get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d),
      set: (k, v) => {
        m.set(k, JSON.stringify(v));
        return true;
      },
      remove: (k) => m.delete(k),
      keys: () => [...m.keys()],
    };
  };
  global.window = global;
  global.crypto = global.crypto || require('node:crypto').webcrypto;
  global.HAK = {};
  global.JSZip = require(require('node:path').join(__dirname, '..', 'app/libs/jszip.min.js'));
  global.location = { hash: '' };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  HAK.Archive = { importItems: async () => ({ added: 0, updated: 0, skipped: 0 }), collectItems: async () => [] };
  HAK.DB = { put: async () => {}, getAll: async () => [] };
  HAK.UI = { toast() {} };
  HAK.Store = mk();
  require(require('node:path').join(__dirname, '..', 'app/js/backup.js'));
  HAK.Store.set('hak.config.v1', { companies: [{ id: 'c1', name: 'A' }] });
  HAK.Store.set('hak.report.manual', { r1: false, r2: false });
  const key = 'hak.excel.templates.v1';
  const { validateBackupKey } = require('../app/js/util.js');
  const templates = {
    defaultId: 'tpl_can',
    templates: [
      {
        id: 'tpl_can',
        name: 'Mẫu cân',
        sheet: 'Cân',
        headerRow: 3,
        headerNames: { plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng' },
        columns: { plate: 0, date: 1, net: 2 },
        fallbackUnit: 'tan',
      },
    ],
  };
  assert.throws(() => validateBackupKey(key, { ...templates, defaultId: 'missing' }), /mẫu nhập Excel/);
  assert.throws(
    () => validateBackupKey(key, { ...templates, templates: [{ ...templates.templates[0], columns: { net: -1 } }] }),
    /mẫu nhập Excel/
  );
  HAK.Store.set(key, templates);
  HAK.Store.set('hak.vehicles.v1', { meta: {}, list: [{ k: '43C1' }] });
  const f = await HAK.Backup.buildFull();
  const buf = Buffer.from(f.parts.join(''));
  const file = {
    size: buf.length,
    slice: (a, b) => ({
      arrayBuffer: async () => {
        const s = buf.subarray(a, b);
        return s.buffer.slice(s.byteOffset, s.byteOffset + s.length);
      },
    }),
    arrayBuffer: async () => buf.buffer,
    text: async () => buf.toString(),
  };
  const info = await HAK.Backup.inspect(file);
  console.log('plan.keys =', info.plan.keys, '; trong file:', Object.keys(info.j.keys).join(','));
  HAK.Store = mk(); // máy trống
  const out = await HAK.Backup.restoreFile(file, { mode: 'replace', keepAuth: false });
  console.log('đã khôi phục keys =', out.keys, '; máy mới có:', HAK.Store.keys().join(','));
  assert.deepEqual(HAK.Store.get('hak.report.manual', null), { r1: false, r2: false });
  assert.deepEqual(HAK.Store.get(key, null), templates);
});
