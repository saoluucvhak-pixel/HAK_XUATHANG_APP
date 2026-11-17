/* Gộp nhiều đợt Excel của một loại (HAK.BatchMerge.merge): chỉ loại phiếu trùng GIỮA các file; dòng lặp trong cùng một file được giữ nguyên.
 * Gọi trực tiếp logic gộp — không đọc mã nguồn, nên không phụ thuộc xuống dòng LF / CRLF của bản checkout. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/excel.js');
require('../app/js/generator.js');
const BM = require('../app/js/batch-merge.js');

const row = (idx, ticket, plate, ts, net) => ({
  idx,
  ticket,
  plate,
  ts1: ts,
  time1: '',
  dateStr: '1/11/2026',
  net,
  gross: net + 10000,
  tare: 10000,
  warn: [],
});
const ds = (rows, extra) =>
  Object.assign({ ok: true, rows, warnings: [], stats: HAK.Excel.computeStats(rows), errors: [], meta: {} }, extra);
const batch = (name, rows, extra) => ({ fileName: name, ds: ds(rows, extra) });
function merge(batches, prefer) {
  const sl = { batches, sel: 0 };
  BM.merge(sl, prefer ? new Set(prefer) : undefined);
  return sl.ds;
}
const A = () => [row(2, 'T1', '43C-1', 1000, 20000), row(3, 'T1', '43C-1', 1000, 20000), row(4, 'T2', '43C-2', 2000, 30000)];
const B = () => [row(2, 'T9', '43C-9', 9000, 40000)];

test('đợt không giao nhau: dòng lặp trong cùng một file không bị loại khi thêm đợt khác', () => {
  const only = merge([batch('a.xlsx', A())]),
    both = merge([batch('a.xlsx', A()), batch('b.xlsx', B())]);
  assert.equal(only.stats.trips, 3);
  assert.equal(both.stats.trips, 4);
  assert.equal(both.stats.kg, only.stats.kg + 40000);
  assert.equal(both.dup, 0);
  assert.equal(both.warnings.length, 0);
});
test('phiếu trùng thật giữa hai file (cùng khối lượng): chỉ tính một lần, giữ đợt nạp trước', () => {
  const d = merge([
    batch('a.xlsx', [row(2, 'T1', '43C-1', 1000, 20000)]),
    batch('b.xlsx', [row(5, 'T1', '43C-1', 1000, 20000), row(6, 'T3', '43C-3', 3000, 5000)]),
  ]);
  assert.equal(d.stats.trips, 2);
  assert.equal(d.dup, 1);
  assert.equal(d.conflicts.length, 0);
  assert.match(d.warnings[0], /Đã bỏ 1 phiếu trùng giữa các đợt/);
  assert.equal(d.rows.find((r) => r.ticket === 'T1').uid, 'a.xlsx#2', 'giữ dòng của đợt nạp trước');
});
test('phiếu trùng giữa hai file nhưng KHÁC khối lượng: báo xung đột, mặc định dùng đợt trước; chọn đợt sau thì dùng số đợt sau', () => {
  const mk = () => [batch('a.xlsx', [row(2, 'T1', '43C-1', 1000, 20000)]), batch('b.xlsx', [row(5, 'T1', '43C-1', 1000, 21000)])];
  const d1 = merge(mk());
  assert.equal(d1.conflicts.length, 1);
  assert.equal(d1.stats.kg, 20000);
  assert.match(d1.warnings[0], /KHÁC khối lượng/);
  const key = HAK.Generator.omitKey(row(2, 'T1', '43C-1', 1000, 20000));
  const d2 = merge(mk(), [key]);
  assert.equal(d2.stats.kg, 21000);
  assert.equal(d2.conflicts[0].useNew, true);
  assert.deepEqual(
    d2.conflicts[0].items.map((x) => [x.file, x.net]),
    [
      ['a.xlsx', 20000],
      ['b.xlsx', 21000],
    ]
  );
});
test('một file có dòng lặp và file kia trùng với chúng: giữ nguyên toàn bộ dòng của đợt được chọn', () => {
  const d = merge([
    batch('a.xlsx', [row(2, 'T1', '43C-1', 1000, 20000), row(3, 'T1', '43C-1', 1000, 20000)]),
    batch('b.xlsx', [row(7, 'T1', '43C-1', 1000, 20000)]),
  ]);
  assert.equal(d.stats.trips, 2, 'đợt trước giữ cả 2 dòng; dòng của đợt sau bị bỏ');
  assert.equal(d.dup, 1);
});
test('một đợt hợp lệ: dùng thẳng ds của đợt đó; không có đợt nào: ds = null; đợt không hợp lệ không bị gộp', () => {
  const one = batch('a.xlsx', A());
  const sl = { batches: [one], sel: 0 };
  BM.merge(sl);
  assert.equal(sl.ds, one.ds);
  assert.equal(one.ds.rows[0].uid, 'a.xlsx#2');
  const empty = { batches: [], sel: 0 };
  BM.merge(empty);
  assert.equal(empty.ds, null);
  const bad = batch('x.xlsx', [], { ok: false, errors: ['lỗi'] });
  const mixed = { batches: [bad, one], sel: 0 };
  BM.merge(mixed);
  assert.equal(mixed.ds, one.ds, 'chỉ còn một đợt hợp lệ');
  const allBad = { batches: [bad], sel: 0 };
  BM.merge(allBad);
  assert.equal(allBad.ds, bad.ds);
});
test('dòng gộp được sắp theo giờ cân; dòng không có giờ cân xuống cuối; cảnh báo từng file mang tên file', () => {
  const d = merge([
    batch('a.xlsx', [row(2, 'T1', 'A', 5000, 1000), row(3, 'T2', 'B', null, 1000)], { warnings: ['cảnh báo a'] }),
    batch('b.xlsx', [row(2, 'T3', 'C', 2000, 1000)], { warnings: ['cảnh báo b'] }),
  ]);
  assert.deepEqual(
    d.rows.map((r) => r.ticket),
    ['T3', 'T1', 'T2']
  );
  assert.ok(d.warnings.includes('[a.xlsx] cảnh báo a') && d.warnings.includes('[b.xlsx] cảnh báo b'));
});
