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

test('nhập mẫu cân hai dòng tiêu đề và giữ số dòng Excel khi bảng bắt đầu dưới A1', () => {
  global.XLSX = require('../app/libs/xlsx.full.min.js');
  const sheet = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(
    sheet,
    [
      ['Số phiếu', 'Ngày giờ cân', 'Biển số xe', 'Khối lượng', null],
      [null, null, null, 'Bì (kg)', 'KL tổng (tấn)'],
      ['0007', '25/11/2026 08:30', '43C-12345', 12000, 32.5],
    ],
    { origin: 'C8' }
  );
  const workbook = { Sheets: { Can: sheet } };
  for (const options of [{}, { headerRow: 8 }]) {
    const ds = HAK.Excel.parseSheet(workbook, 'Can', options);
    assert.equal(ds.ok, true, ds.errors.join('; '));
    assert.equal(ds.headerExcelRow, 8);
    assert.equal(ds.rows.length, 1);
    assert.equal(ds.rows[0].idx, 10);
    assert.equal(ds.rows[0].ticket, '0007');
    assert.equal(ds.rows[0].net, 20500);
  }
});

test('nhập tiêu đề tiếng Anh và dòng đơn vị riêng, giữ nguyên dòng dữ liệu đầu tiên', () => {
  global.XLSX = require('../app/libs/xlsx.full.min.js');
  const columns = ['Ticket No.', 'Weighing Date', 'Vehicle No.', 'Net Weight'];
  const data = ['0008', '25/11/2026', '43C-12345', 20.5, 'Phiếu cân'];
  for (const rows of [
    [columns, [null, null, null, 'tấn'], data],
    [[...columns.slice(0, 3), 'Net Weight [t]'], data],
  ]) {
    const ds = HAK.Excel.parseSheet({ Sheets: { Can: XLSX.utils.aoa_to_sheet(rows) } }, 'Can');
    assert.equal(ds.ok, true, ds.errors.join('; '));
    assert.equal(ds.rows.length, 1);
    assert.equal(ds.rows[0].ticket, '0008');
    assert.equal(ds.rows[0].net, 20500);
  }
});

test('mẫu TC: dòng ngày ký trong cột kg không trở thành phiếu cân', () => {
  global.XLSX = require('../app/libs/xlsx.full.min.js');
  const rows = [
    ['Bảng cân xuất hàng'],
    [],
    ['STT', 'Số phiếu', 'Ngày cân 1', 'Giờ cân 1', 'Biển số 1', 'Cân lần 1', 'Cân lần 2', 'KL hàng (KG)', 'Kho hàng'],
    [1, '0009', '26/11/2026', '08:30', '43C-12345', 12000, 31000, 19000, 'Kho A'],
    [],
    [null, null, null, null, null, null, null, 'Ngày 26 tháng 11 năm 2026'],
  ];
  const ds = HAK.Excel.parseSheet({ Sheets: { Can: XLSX.utils.aoa_to_sheet(rows) } }, 'Can');
  assert.equal(ds.ok, true, ds.errors.join('; '));
  assert.equal(ds.headerExcelRow, 3);
  assert.equal(ds.rows.length, 1);
  assert.equal(ds.rows[0].wh, 'Kho A');
  assert.equal(ds.stats.kg, 19000);
});
