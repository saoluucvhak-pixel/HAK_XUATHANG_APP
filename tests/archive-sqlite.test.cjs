/* Lưu trữ hồ sơ (archive.js THẬT) trên SQLite: meta + dữ liệu cùng giao dịch, cột kiểu đúng, lưu lặp không nhân đôi, gắn hợp đồng, xóa kéo theo dữ liệu, mất kết nối thì báo lỗi. */
if (require('./helpers/needs-sqlite.cjs')()) return;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TOKEN = 'd'.repeat(32);
global.window = global;
global.HAK_DOCS_TOKEN = TOKEN;
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
global.HAK = {
  Config: { company: () => ({ short: 'HAK' }) },
  Generator: {
    filterRows: (r) => r,
    retKey: (r) => r.idx,
    summarize: (r) => ({ trips: r.length, kg: r.reduce((a, x) => a + x.net, 0), vehicles: r.length, from: '31/12/2025', to: '01/01/2026' }),
  },
  UI: { toast() {} },
};
const { createServer } = require('../tools/hakdb/server.cjs');
require('../app/js/storage.js');
require('../app/js/db.js');
require('../app/js/db-sqlite.js');
require('../app/js/archive.js');
const S = HAK.Storage,
  A = HAK.Archive;

const opened = [];
test.after(() => Promise.all(opened.map((s) => new Promise((ok) => (s.listening ? s.close(ok) : ok())))));
async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-arsq-'));
  const srv = createServer({ dataDir: dir, token: TOKEN });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  opened.push(srv);
  srv.hakdb.setMeta('active_backend', 'sqlite');
  global.HAK_DB_URL = 'http://127.0.0.1:' + srv.address().port;
  ls.clear();
  S._reset();
  await S.start();
  assert.equal(S.mode, 'sqlite');
  return srv;
}
const args = (rows, extra) => [
  'xuatkhau',
  Object.assign({ ship: 'ĐẠI DƯƠNG', giaoId: 'hak', contractId: 'd1', filter: {} }, extra),
  { files: [{ name: 'BB.docx' }], summary: { Tổng: '3,5 tấn' } },
  {
    rows: rows || [
      { idx: 1, net: 1000 },
      { idx: 2, net: 2500.5 },
    ],
  },
  'word',
];

test('lưu hồ sơ: meta + dữ liệu cùng giao dịch; cột kiểu đúng; đọc lại đủ phiếu', async () => {
  const srv = await boot();
  assert.equal(await A.save(...args()), true, A.lastError);
  const rs = srv.hakdb.query({ table: 'archive_records' }).rows;
  assert.equal(rs.length, 1);
  const r = rs[0];
  assert.equal(r.type, 'xuatkhau');
  assert.equal(r.trips, 2);
  assert.equal(r.kg_milli, 3500500, 'kg theo 1/1000: 3500,5 kg');
  assert.equal(r.from_ts, Date.UTC(2025, 11, 31));
  assert.equal(r.to_ts, Date.UTC(2026, 0, 1));
  assert.equal(JSON.parse(r.meta).id, r.id, 'meta đầy đủ nằm trong cột meta');
  assert.equal(srv.hakdb.counts().archive_data, 1);
  const list = await A.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].kg, 3500.5);
  const d = await A.load(r.id);
  assert.deepEqual(d.rows, [
    { idx: 1, net: 1000 },
    { idx: 2, net: 2500.5 },
  ]);
  assert.equal(d.params.ship, 'ĐẠI DƯƠNG');
});
test('lưu lặp cùng nội dung: không nhân đôi bản ghi (mã theo nội dung); nội dung khác: bản ghi mới', async () => {
  const srv = await boot();
  assert.equal(await A.save(...args()), true);
  assert.equal(await A.save(...args()), true);
  assert.equal(srv.hakdb.counts().archive_records, 1);
  assert.equal(await A.save(...args([{ idx: 1, net: 777 }])), true);
  assert.equal(srv.hakdb.counts().archive_records, 2);
  assert.equal(srv.hakdb.counts().archive_data, 2);
});
test('gắn hợp đồng cho hồ sơ: cột detail_id cập nhật, phiên bản bản ghi tăng', async () => {
  const srv = await boot();
  await A.save(...args());
  const id = srv.hakdb.query({ table: 'archive_records' }).rows[0].id;
  const rev0 = srv.hakdb.query({ table: 'archive_records', where: { id } }).rows[0].rev;
  assert.equal(await A.setContract([id, 'khong-co'], 'ct-1'), 1, 'chỉ hồ sơ tồn tại được gắn');
  const r = srv.hakdb.query({ table: 'archive_records', where: { id } }).rows[0];
  assert.equal(r.detail_id, 'ct-1');
  assert.equal(JSON.parse(r.meta).contract, 'ct-1');
  assert.equal(r.rev, rev0 + 1);
});
test('meta và dữ liệu cùng giao dịch: dữ liệu lỗi thì không còn meta mồ côi', async () => {
  const srv = await boot();
  const Q = HAK.DBSqlite.archive;
  await assert.rejects(Q.put({ id: 'm1', title: 'X', type: 'xuatkhau', kg: 10 }, null)); // payload NULL vi phạm NOT NULL
  assert.equal(srv.hakdb.counts().archive_records, 0, 'không có meta mồ côi');
  assert.equal(srv.hakdb.counts().archive_data, 0);
});
test('xóa hồ sơ kéo theo dữ liệu (CASCADE); dọn kho có kiểm tra: bản đã đổi thì không xóa', async () => {
  const srv = await boot();
  await A.save(...args());
  await A.save(...args([{ idx: 1, net: 5 }]));
  const items = await A.collectItems();
  assert.equal(items.length, 2);
  // hồ sơ đầu bị đổi sau khi đã xác minh → closeVerified từ chối và KHÔNG xóa gì
  const first = items[0];
  srv.hakdb.tx([
    {
      op: 'put',
      table: 'archive_records',
      row: { id: first.meta.id, meta: JSON.stringify(Object.assign({}, first.meta, { title: 'ĐÃ SỬA' })) },
    },
  ]);
  await assert.rejects(A.closeVerified(items), /đã thay đổi/);
  assert.equal(srv.hakdb.counts().archive_records, 2);
  // đúng như đã xác minh → xóa hết, dữ liệu đi theo
  await A.closeVerified(await A.collectItems());
  assert.equal(srv.hakdb.counts().archive_records, 0);
  assert.equal(srv.hakdb.counts().archive_data, 0);
});
test('mất kết nối khi lưu: trả false kèm lý do, không treo', async () => {
  const srv = await boot();
  await new Promise((ok) => srv.close(ok));
  const r = await Promise.race([A.save(...args()), new Promise((ok) => setTimeout(() => ok('TREO'), 5000))]);
  assert.equal(r, false);
  assert.match(A.lastError, /không kết nối được|SQLite/);
});

test('cập nhật mục lục từ dữ liệu cũ không tạo lại hồ sơ đã xóa', async () => {
  const srv = await boot();
  assert.equal(await A.save(...args()), true);
  const Q = HAK.DBSqlite.archive;
  const [held] = await A.list();
  await Q.del(held.id);
  await assert.rejects(Q.put(held), { code: 'conflict' });
  assert.equal(srv.hakdb.counts().archive_records, 0);
  assert.equal(srv.hakdb.counts().archive_data, 0);
});

test('cập nhật mục lục kiểm cả phiên bản và sự tồn tại của nội dung', async () => {
  const srv = await boot();
  assert.equal(await A.save(...args()), true);
  const Q = HAK.DBSqlite.archive;
  const [held] = await A.list();
  await A.setContract([held.id], 'new-contract');
  await assert.rejects(Q.put(held), { code: 'conflict' });
  const current = await Q.meta(held.id);
  assert.equal(current.contract, 'new-contract');
  srv.hakdb.tx([{ op: 'del', table: 'archive_data', key: held.id }]);
  await assert.rejects(Q.put(current), { code: 'conflict' });
  assert.equal((await Q.meta(held.id)).contract, 'new-contract');
});

test('báo cáo loại mục lục cũ khi cửa sổ khác xóa hồ sơ trong lúc bổ sung thống kê', async () => {
  const srv = await boot();
  assert.equal(await A.save(...args()), true);
  const Q = HAK.DBSqlite.archive;
  const [original] = await A.list();
  original.sv = 1;
  await Q.put(original);
  const metas = await A.list();
  const call = S.call;
  S.call = async (endpoint, body, options) => {
    if (endpoint === '/db/tx' && body.ops.some((op) => op.op === 'guard' && op.table === 'archive_data')) await Q.del(original.id);
    return call(endpoint, body, options);
  };
  try {
    assert.deepEqual(await A.ensureStats(metas), []);
  } finally {
    S.call = call;
  }
  assert.equal(srv.hakdb.counts().archive_records, 0);
  assert.equal(srv.hakdb.counts().archive_data, 0);
});
