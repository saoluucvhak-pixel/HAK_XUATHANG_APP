/* v2.25.14: file sao lưu .json bị cắt cụt phải báo "hỏng / cắt cụt", không báo nhầm "không phải file sao lưu". */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
function boot() {
  const store = new Map();
  global.window = global;
  if (!global.crypto || !global.crypto.subtle) global.crypto = require('node:crypto').webcrypto;
  global.HAK = {};
  global.JSZip = require('../app/libs/jszip.min.js');
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => (store.set(k, JSON.stringify(v)), true),
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
}
const fileOf = (text) => {
  const buf = Buffer.from(text, 'utf8');
  return {
    name: 'x.json',
    size: buf.length,
    slice: (a, b) => ({
      arrayBuffer: async () => {
        const sub = buf.subarray(a, b);
        return sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.length);
      },
    }),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    text: async () => text,
  };
};
test('file sao lưu .json bị cắt cụt → thông báo "hỏng hoặc bị cắt cụt"', async () => {
  boot();
  const full = JSON.stringify({ app: 'hak-bienban-backup', v: 1, keys: { 'hak.config.v1': { a: 1 } }, archive: [] });
  await assert.rejects(HAK.Backup.inspect(fileOf(full.slice(0, full.length - 15))), /hỏng hoặc bị cắt cụt/);
});
test('file không phải sao lưu của app → vẫn báo "không phải file sao lưu"', async () => {
  boot();
  await assert.rejects(HAK.Backup.inspect(fileOf('{"abc": 1}')), /không phải file sao lưu/);
  await assert.rejects(HAK.Backup.inspect(fileOf('xin chào')), /không phải file sao lưu/);
});
