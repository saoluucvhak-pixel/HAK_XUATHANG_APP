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

test('số âm trong ngoặc kiểu kế toán đọc thành số âm', () => {
  assert.equal(parseNum('(1.200)'), -1200);
  assert.equal(parseNum('( 1.200 )'), -1200);
  assert.equal(parseNum('(1.200,50)'), -1200.5);
  assert.equal(parseNum('(0,5)'), -0.5);
  assert.equal(parseNum('(1.200 đ)'), -1200);
  assert.equal(parseNum('(-5)'), -5);
  assert.equal(parseNum('()'), null);
  assert.equal(parseNum('(abc)'), null);
  assert.equal(parseNum('1.200'), 1200);
});

test('L-19: đọc giờ AM/PM, hệ ngày 1904, và 24:00:00 không làm ts1 lệch dateStr', () => {
  const am12 = parseDT('05/01/2026 12:00 AM');
  assert.equal(am12.hh, 0);
  const pm1 = parseDT('05/01/2026 1:00 PM');
  assert.equal(pm1.hh, 13);
  const pm12 = parseDT('05/01/2026 12:30 PM');
  assert.equal(pm12.hh, 12);

  const XLSX = require('../app/libs/xlsx.full.min.js');
  global.XLSX = XLSX;
  const wb1904 = XLSX.utils.book_new();
  wb1904.Workbook = { WBProps: { date1904: true } };
  XLSX.utils.book_append_sheet(
    wb1904,
    XLSX.utils.aoa_to_sheet([
      ['Số phiếu', 'Biển số xe', 'Ngày giờ cân', 'Khối lượng hàng (kg)'],
      ['101', '43C-111.11', 44562, 20000], // 1904 system: 44562 -> 2026-01-02 (vs 1900: 2022-01-01)
      ['102', '43C-222.22', '05/01/2026 24:00:00', 21000],
    ]),
    'S'
  );
  const ds = HAK.Excel.parseSheet(wb1904, 'S');
  assert.equal(new Date(ds.rows[0].ts1).getUTCFullYear(), 2026, 'hệ ngày 1904 phải cộng 1462 ngày');
  const r24 = ds.rows[1];
  const dFromTs = new Date(r24.ts1);
  const expectedDate =
    String(dFromTs.getUTCDate()).padStart(2, '0') +
    '/' +
    String(dFromTs.getUTCMonth() + 1).padStart(2, '0') +
    '/' +
    dFromTs.getUTCFullYear();
  assert.equal(r24.dateStr, expectedDate, 'ts1 và dateStr không được mâu thuẫn nhau ở 24:00:00');
  assert.ok(
    r24.warn.some((w) => /24:00/i.test(w)),
    'phải cảnh báo giờ 24:00:00'
  );
});
