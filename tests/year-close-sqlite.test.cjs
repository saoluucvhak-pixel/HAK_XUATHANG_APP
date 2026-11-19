/* Đóng năm / tiếp tục đóng năm trên SQLite THẬT (Yearbook, Archive, YearClose, DBSqlite thật; máy chủ HAKDB tham chiếu):
 * bị ngắt ở từng bước (dọn Lưu trữ, chốt sổ năm) rồi chạy lại → không nhân đôi, không mất, số liệu khớp file ZIP; đóng lại sau khi bị ngắt không để năm "đang dở" mãi. */
if (require('./helpers/needs-sqlite.cjs')()) return;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const TOKEN = 'e'.repeat(32);
global.window = global;
global.HAK_DOCS_TOKEN = TOKEN;
if (!global.crypto || !global.crypto.subtle) Object.defineProperty(global, 'crypto', { value: nodeCrypto.webcrypto, configurable: true });
const ls = new Map();
global.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  get length() {
    return ls.size;
  },
  key: (i) => Array.from(ls.keys())[i],
};
if (typeof navigator === 'undefined') Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
const ts = (y) => Date.UTC(y, 0, 15);
global.HAK = {
  Config: { company: () => ({ short: 'HAK' }), data: { companies: [], warehouses: [] }, custom: {} },
  Auth: { isAdmin: () => true, scopeIds: () => null, who: () => 'qa' },
  App: { slots: {} },
  Generator: {
    filterRows: (r) => r,
    retKey: (r) => r.idx,
    summarize: (r) => ({
      trips: r.length,
      kg: r.reduce((a, x) => a + x.net, 0),
      vehicles: r.length,
      from: '15/01/' + new Date(r[0].ts1).getUTCFullYear(),
      to: '15/01/' + new Date(r[0].ts1).getUTCFullYear(),
    }),
  },
  UI: { toast() {}, esc: String },
  Backup: { readJson: async (file) => JSON.parse(await file.text()) },
};
let savedBlob = null;
HAK.Word = {
  Files: {
    saveBlob: async (blob, name) => {
      savedBlob = blob;
      return 'C:/' + name;
    },
  },
};
// HAKDocs /verify-download: trả SHA-256 và kích thước của chính bản vừa "lưu".
const realFetch = global.fetch;
global.fetch = async (url, opt) => {
  if (String(url).endsWith('/verify-download')) {
    const bytes = Buffer.from(await savedBlob.arrayBuffer());
    return { ok: true, json: async () => ({ sha256: nodeCrypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length }) };
  }
  return realFetch(url, opt);
};
global.JSZip = class {
  file(name, text) {
    this.text = text;
  }
  async generateAsync() {
    return new Blob([this.text]);
  }
};
const { createServer } = require('../tools/hakdb/server.cjs');
require('../app/js/storage.js');
require('../app/js/db.js');
require('../app/js/db-sqlite.js');
require('../app/js/archive.js');
require('../app/js/yearbook.js');
require('../app/js/year-close.js');
const S = HAK.Storage,
  A = HAK.Archive,
  Y = HAK.Yearbook,
  C = HAK.YearClose;

const opened = [];
test.after(() => Promise.all(opened.map((s) => new Promise((ok) => (s.listening ? s.close(ok) : ok())))));
const rec = (id, y) => ({
  id,
  type: 'xuatkhau',
  year: y,
  revision: 1,
  params: { ship: 'QA ' + id },
  rows: [{ idx: 1, net: 100, ts1: ts(y) }],
  updatedAt: 1,
});
async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-ycsq-'));
  const srv = createServer({ dataDir: dir, token: TOKEN });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  opened.push(srv);
  srv.hakdb.setMeta('active_backend', 'sqlite');
  global.HAK_DB_URL = 'http://127.0.0.1:' + srv.address().port;
  ls.clear();
  S._reset();
  await S.start();
  assert.equal(S.mode, 'sqlite');
  savedBlob = null;
  // Sổ năm: 2 hồ sơ năm 2025 + 1 hồ sơ 2026; Lưu trữ: 1 hồ sơ cân năm 2025 + 1 hồ sơ năm 2026.
  const st = await Y.read();
  await Y.commit(st.revision, (s) => {
    s.records.push(rec('c1', 2025), rec('c2', 2025), rec('k1', 2026));
    return s;
  });
  const arc = (y) => [
    'xuatkhau',
    { ship: 'TÀU ' + y, giaoId: 'hak', filter: {} },
    { files: [{ name: 'BB.docx' }], summary: { Tổng: 'x' } },
    { rows: [{ idx: 1, net: 1000, ts1: ts(y) }] },
    'word',
  ];
  assert.ok(await A.save(...arc(2025)));
  assert.ok(await A.save(...arc(2026)));
  return srv;
}
const snap = async () => {
  const s = await Y.read();
  return {
    ids: s.records.map((r) => r.id).sort(),
    closed: (s.closed || []).map((c) => ({ year: c.year, pending: !!c.pending, sha: c.sha256 })),
    archive: (await A.list()).length,
  };
};
// Gây lỗi đúng MỘT lần ở một hàm (như HAKDocs / máy bị ngắt giữa chừng).
function failOnce(obj, name, message) {
  const orig = obj[name];
  let armed = true;
  obj[name] = async function (...a) {
    if (armed) {
      armed = false;
      throw Error(message);
    }
    return orig.apply(this, a);
  };
  return () => (obj[name] = orig);
}

test('ngắt khi chốt sổ năm (sau khi đã dọn Lưu trữ): tiếp tục đóng → đủ, không nhân đôi, chạy lại không đổi gì', async () => {
  await boot();
  const restore = failOnce(HAK.DBSqlite, 'finalizeYear', 'HAKDocs bị ngắt');
  await assert.rejects(
    C.closeYear(2025, () => true),
    /HAKDocs bị ngắt/
  );
  restore();
  let s = await snap();
  assert.deepEqual(s.ids, ['c1', 'c2', 'k1'], 'chưa chốt: hồ sơ năm còn nguyên (không mất)');
  assert.equal(s.closed.length, 1);
  assert.equal(s.closed[0].pending, true, 'có biên nhận đang dở');
  assert.equal(s.archive, 1, 'Lưu trữ năm 2025 đã được dọn, hồ sơ 2026 còn');
  const res = await C.resumeClose(2025, savedBlob);
  assert.equal(res.resumed, true);
  assert.equal(res.records, 2);
  s = await snap();
  assert.deepEqual(s.ids, ['k1']);
  assert.equal(s.closed.length, 1, 'không nhân đôi biên nhận');
  assert.equal(s.closed[0].pending, false);
  assert.equal(JSON.stringify(await C.resumeClose(2025, savedBlob)), '{"nothing":true}');
  assert.deepEqual(await snap(), s, 'chạy lại không đổi gì');
});

test('ngắt khi dọn Lưu trữ (trước khi chốt): tiếp tục đóng dọn nốt Lưu trữ và sổ năm', async () => {
  await boot();
  const restore = failOnce(A, 'closeVerified', 'mất kết nối');
  await assert.rejects(
    C.closeYear(2025, () => true),
    /mất kết nối/
  );
  restore();
  let s = await snap();
  assert.deepEqual(s.ids, ['c1', 'c2', 'k1']);
  assert.equal(s.archive, 2, 'chưa dọn gì: cả hai hồ sơ Lưu trữ còn');
  assert.equal(s.closed[0].pending, true);
  const res = await C.resumeClose(2025, savedBlob);
  assert.equal(res.resumed, true);
  assert.equal(res.archive, 1);
  s = await snap();
  assert.deepEqual(s.ids, ['k1']);
  assert.equal(s.archive, 1);
  assert.equal(s.closed.length, 1);
  assert.equal(s.closed[0].pending, false);
});

test('đóng lại cùng năm sau khi bị ngắt (không dùng "Tiếp tục"): năm không bị "đang dở" mãi', async () => {
  await boot();
  const restore = failOnce(HAK.DBSqlite, 'finalizeYear', 'HAKDocs bị ngắt');
  await assert.rejects(
    C.closeYear(2025, () => true),
    /HAKDocs bị ngắt/
  );
  restore();
  // Người dùng không thấy mục "Tiếp tục đóng năm" mà bấm "Đóng năm" lần nữa (file ZIP mới, SHA-256 khác).
  await new Promise((ok) => setTimeout(ok, 5));
  const again = await C.closeYear(2025, () => true);
  assert.ok(again.path, 'đóng lại thành công');
  const s = await snap();
  assert.deepEqual(s.ids, ['k1']);
  const pending = (await C.pendingYears()).map((x) => x.year);
  assert.deepEqual(pending, [], 'không còn năm nào đang dở sau khi đã đóng xong năm 2025');
  const receipts = (await Y.read()).closed.filter((c) => c.year === 2025);
  assert.equal(receipts.length, 2, 'giữ cả hai biên nhận làm bằng chứng');
  assert.ok(receipts.every((c) => !c.pending));
  assert.equal(receipts.filter((c) => c.supersededBy).length, 1, 'biên nhận cũ ghi rõ bị lần đóng nào thay thế');
});
