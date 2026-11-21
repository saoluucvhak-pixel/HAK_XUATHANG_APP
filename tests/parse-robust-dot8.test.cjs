/* Test đỏ (rà soát nhóm nhập liệu/parser) — chạy: node --test rv-parse-red.test.cjs từ /tmp/rv-parse */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const R = require('node:path').join(__dirname, '..', 'app', 'js') + '/';
require(R + 'util.js');
require(R + 'excel.js');
HAK.Config = { data: { general: {} } };
require(R + 'generator.js');
require(R + 'batch-merge.js');
require(R + 'weigh-model.js');
require(R + 'bkls.js');
const CU = require(R + 'customs-parser.js');
test('PA-1 BKLS: 43Đ / 43D / 43đ là MỘT xe', () => {
  const mk = (p) => ({ ngayCanDate: new Date(2026, 7, 16), bienSoRaw: p, tenTaiXe: 'A', klHangKg: 25000, donViVc: 'X' });
  const lot = {
    soBkls: '001/2026/BKLS',
    ngayLap: '2026-08-16',
    heSoBdmt: 0.5,
    listTrips: true,
    benMuaTen: 'B',
    benMuaMst: '1',
    benMuaDiaChi: 'x',
    trips: [mk('43Đ-123.45'), mk('43D-123.45'), mk('43đ 12345')],
  };
  const v = HAK.Bkls.aggregateValues({ g: { tenChu: '', product: '', diemDi: '', diemDen: '' }, snapshot: {} }, lot);
  assert.match(v.hoSo.head, /; 1 xe vận chuyển/);
});
test('PA-2 lọc số phiếu từ–đến với số phiếu dạng 7998/2026/XK', () => {
  const rows = [7997, 7998, 7999, 8000, 8001].map((n, i) => ({ idx: i, ticket: n + '/2026/XK', ts1: Date.UTC(2026, 7, 16, 8, i), net: 1 }));
  assert.deepEqual(
    HAK.Generator.filterRows(rows, { ticketFrom: '7998', ticketTo: '8000' }).map((r) => r.ticket),
    ['7998/2026/XK', '7999/2026/XK', '8000/2026/XK']
  );
});
test('PA-3 giờ có NBSP / dấu phẩy / SA-CH không được rơi về 00:00 hay lệch 12 giờ', () => {
  const p = HAK.Excel.util.parseDT;
  assert.equal(p('16/08/2026 11:43:33').hh, 11);
  assert.equal(p('16/08/2026, 11:43:33').hh, 11);
  assert.equal(p('16/08/2026 11:43:33 CH').hh, 23);
});
test('PA-4 tờ khai/giấy nộp tiền: dấu trừ U+2212 không đổi thành số dương', () => {
  assert.equal(CU.vn('−500'), -500);
});
test('PA-5 gộp đợt: cùng phiếu khác khoảng trắng trong số phiếu = một phiếu (như Weigh.identity)', () => {
  const mk = (t) => ({ idx: 1, ticket: t, plate: '43C-111.11', time1: 'x', ts1: Date.UTC(2026, 7, 16, 8), net: 25000 });
  const ds = (rows) => ({ ok: true, rows, warnings: [], excluded: [] });
  const sl = {
    batches: [
      { fileName: 'a', ds: ds([mk('PC 001')]) },
      { fileName: 'b', ds: ds([mk('PC001')]) },
    ],
    sel: 0,
  };
  HAK.BatchMerge.merge(sl);
  assert.equal(sl.ds.rows.length, 1);
});
