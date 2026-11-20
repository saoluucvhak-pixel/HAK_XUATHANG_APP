/* L-02 / U-01: kiểm tra toàn vẹn bản sao lưu (.zip CRC32 + manifest SHA-256) và tương thích ngược bản cũ không manifest. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');

function boot() {
  const store = new Map();
  global.window = global;
  if (!global.crypto || !global.crypto.subtle) global.crypto = require('node:crypto').webcrypto; // Node 18 chưa có crypto toàn cục
  global.HAK = {};
  global.JSZip = require('../app/libs/jszip.min.js');
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
  HAK.UI = { toast() {} };
  global.location = { hash: '' };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');
  return { store };
}

function bufFile(buf, name) {
  return {
    name: name || 'backup.zip',
    size: buf.length,
    slice: (a, b) => ({
      arrayBuffer: async () => {
        const sub = buf.subarray(a, b);
        return sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.length);
      },
    }),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    text: async () => buf.toString('utf8'),
  };
}

test('L-02: .zip lật bit trong luồng nén bị từ chối bằng tiếng Việt, không ghi dữ liệu', async () => {
  boot();
  HAK.Store.set('hak.config.v1', { marker: 'original' });

  const zip = new global.JSZip();
  const payload = JSON.stringify({
    app: 'hak-bienban-backup',
    v: 1,
    keys: { 'hak.config.v1': { marker: 'corrupted' } },
    archive: [],
    batches: [],
    issued: [],
  });
  zip.file('HAK_SaoLuuToanBo.json', payload);
  const raw = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });

  // Lật 1 bit ở vùng dữ liệu nén (giữa file, trước central directory)
  const flipped = Buffer.from(raw);
  const pos = Math.floor(flipped.length / 2);
  flipped[pos] ^= 0x01;

  await assert.rejects(
    () => HAK.Backup.restoreFile(bufFile(flipped, 'corrupt.zip'), { keepAuth: false, mode: 'replace' }),
    (err) => {
      assert.match(err.message, /hỏng|CRC32|không đọc được/i, 'lỗi phải là tiếng Việt, nhận được: ' + err.message);
      assert.doesNotMatch(err.message, /Bug\s*:|uncompressed data size mismatch/i);
      return true;
    }
  );
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { marker: 'original' });
});

test('L-02 / U-01: buildFull tạo manifest SHA-256; sửa nội dung sau đóng gói bị từ chối', async () => {
  boot();
  HAK.Store.set('hak.config.v1', { marker: 'original' });

  const built = await HAK.Backup.buildFull();
  const obj = JSON.parse(built.parts.join(''));
  assert.ok(obj.manifest && obj.manifest.sha256, 'buildFull phải tạo manifest.sha256');
  assert.equal(obj.manifest.counts.keys, 1);

  // Giả lập sửa dữ liệu trong JSON mà không cập nhật manifest
  obj.keys['hak.config.v1'].marker = 'tampered';
  const tamperedBuf = Buffer.from(JSON.stringify(obj), 'utf8');
  await assert.rejects(
    () => HAK.Backup.restoreFile(bufFile(tamperedBuf, 'tampered.json'), { keepAuth: false, mode: 'replace' }),
    (err) => /hỏng|toàn vẹn|kiểm tra/i.test(err.message)
  );
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { marker: 'original' });
});

test('L-02: bản sao lưu cũ không có manifest vẫn khôi phục được (coi là chưa kiểm)', async () => {
  boot();
  HAK.Store.set('hak.config.v1', { marker: 'old' });
  const legacy = Buffer.from(
    JSON.stringify({
      app: 'hak-bienban-backup',
      v: 1,
      keys: { 'hak.config.v1': { marker: 'restored-legacy' } },
      archive: [],
    }),
    'utf8'
  );
  const info = await HAK.Backup.inspect(bufFile(legacy, 'legacy.json'));
  assert.equal(info.manifest, 'unverified');
  await HAK.Backup.restoreFile(bufFile(legacy, 'legacy.json'), { keepAuth: false, mode: 'replace' });
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { marker: 'restored-legacy' });
});
