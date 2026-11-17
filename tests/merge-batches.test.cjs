/* Gộp nhiều đợt Excel của một loại (mergeSlot): chỉ loại phiếu trùng GIỮA các file; dòng lặp trong cùng một file được giữ nguyên. */
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
global.window = global;
global.HAK = {};
require('../app/js/excel.js');
require('../app/js/generator.js');
function load(prefer) {
  const src = fs.readFileSync(require.resolve('../app/js/main.js'), 'utf8');
  const a = src.indexOf('  const PREFER_KEY'),
    f = src.indexOf('function mergeSlot'),
    b = src.indexOf('    sl.ds = {', f),
    end = src.indexOf('\n  }\n', b) + 4;
  assert.ok(a > 0 && f > a && b > f && end > b, 'không tìm thấy mergeSlot trong main.js — cập nhật điểm cắt của test');
  const ctx = {
    HAK: { Store: { get: () => prefer || [], set() {}, remove() {} } },
    G: HAK.Generator,
    X: HAK.Excel,
    App: { slots: {} },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, end) + '\nthis.mergeSlot = mergeSlot;', ctx);
  return ctx;
}
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
const ds = (rows) => ({ ok: true, rows, warnings: [], stats: HAK.Excel.computeStats(rows), errors: [], meta: {} });
const batch = (name, rows) => ({ fileName: name, ds: ds(rows) });
function merge(batches, prefer) {
  const ctx = load(prefer),
    sl = { batches, sel: 0 };
  ctx.App.slots.t = sl;
  ctx.mergeSlot(sl);
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
  const ds2 = merge([
    batch('a.xlsx', [row(2, 'T1', '43C-1', 1000, 20000)]),
    batch('b.xlsx', [row(5, 'T1', '43C-1', 1000, 20000), row(6, 'T3', '43C-3', 3000, 5000)]),
  ]);
  assert.equal(ds2.stats.trips, 2);
  assert.equal(ds2.dup, 1);
  assert.equal(ds2.conflicts.length, 0);
  assert.match(ds2.warnings[0], /Đã bỏ 1 phiếu trùng giữa các đợt/);
});
test('phiếu trùng giữa hai file nhưng KHÁC khối lượng: báo xung đột, mặc định dùng đợt trước; chọn đợt sau thì dùng số đợt sau', () => {
  const mk = () => [batch('a.xlsx', [row(2, 'T1', '43C-1', 1000, 20000)]), batch('b.xlsx', [row(5, 'T1', '43C-1', 1000, 21000)])];
  const d1 = merge(mk());
  assert.equal(d1.conflicts.length, 1);
  assert.equal(d1.stats.kg, 20000);
  const key = HAK.Generator.omitKey(row(2, 'T1', '43C-1', 1000, 20000));
  const d2 = merge(mk(), [key]);
  assert.equal(d2.stats.kg, 21000);
  assert.equal(d2.conflicts[0].useNew, true);
});
