/* Đọc số / ngày giờ dạng chữ: các trường hợp biên đã từng đọc sai (sai 1.000 lần, ngày không tồn tại bị tràn sang ngày khác). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/excel.js');
const { parseNum, parseDT, partsToTs } = HAK.Excel.util;

test('số bắt đầu bằng dấu chấm là số thập phân, không phải dấu nghìn', () => {
  assert.equal(parseNum('.500'), 0.5);
  assert.equal(parseNum('-.250'), -0.25);
  assert.equal(parseNum('.5'), 0.5);
  assert.equal(parseNum('0.500'), 0.5);
});
test('dấu nghìn vẫn đọc đúng (không đổi hành vi cũ)', () => {
  assert.equal(parseNum('1.500'), 1500);
  assert.equal(parseNum('10.500'), 10500);
  assert.equal(parseNum('6.500'), 6500);
  assert.equal(parseNum('13.010,81'), 13010.81);
  assert.equal(parseNum('1,234.5'), 1234.5);
  assert.equal(parseNum('-1.234'), -1234);
});
test('ký hiệu khoa học dạng chữ được đọc đúng', () => {
  assert.equal(parseNum('1.5E3'), 1500);
  assert.equal(parseNum('2e2'), 200);
  assert.equal(parseNum('1.5e-1'), 0.15);
});
test('ngày không tồn tại bị từ chối (không tràn sang ngày khác)', () => {
  for (const v of [
    '32/01/2026 08:00',
    '29/02/2026 08:00',
    '31/04/2026',
    '13/13/2026',
    '0/0/2026',
    '2026-02-30',
    '1/1/2026 25:00',
    '1/1/2026 10:61',
  ])
    assert.equal(parseDT(v), null, v);
});
test('ngày hợp lệ (kể cả 29/02 năm nhuận và 24:00) vẫn đọc được', () => {
  assert.equal(parseDT('29/02/2028 08:00').d, 29);
  assert.equal(parseDT('31/12/2026 23:59').mm, 59);
  const mid = parseDT('1/1/2026 24:00');
  assert.ok(mid);
  assert.equal(partsToTs(mid), Date.UTC(2026, 0, 2));
  assert.equal(parseDT('2026-02-03 08:15:30').ss, 30);
  assert.equal(parseDT('03.02.2026').m, 2);
});
