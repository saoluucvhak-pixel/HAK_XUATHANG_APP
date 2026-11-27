/* M3 — dữ liệu xấu không được nuốt âm thầm: dòng có biển số / số phiếu mà thiếu khối lượng phải được báo kèm số dòng Excel. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const XLSX = require('../app/libs/xlsx.full.min.js');
global.XLSX = XLSX;
require('../app/js/excel.js');
function sheet(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S');
  return wb;
}
const HEAD = ['Số phiếu', 'Biển số xe', 'Ngày cân', 'Khối lượng hàng (kg)'];
test('dòng có biển số + số phiếu nhưng khối lượng là chữ → có cảnh báo nêu số dòng Excel (không chỉ "tiêu đề/chữ ký")', () => {
  const ds = HAK.Excel.parseSheet(
    sheet([
      HEAD,
      ['101', '43C-111.11', '05/01/2026', 20000],
      ['102', '43C-222.22', '05/01/2026', 'hai muoi tan'],
      ['103', '43C-333.33', '05/01/2026', 21000],
    ]),
    'S'
  );
  assert.equal(ds.rows.length, 2);
  const w = ds.warnings.join('\n');
  assert.match(w, /thiếu khối lượng|không đọc được khối lượng/i);
  assert.match(w, /\b3\b/, 'nêu dòng Excel số 3');
});
test('dòng tổng/chữ ký không bị báo nhầm là thiếu khối lượng', () => {
  const ds = HAK.Excel.parseSheet(
    sheet([HEAD, ['101', '43C-111.11', '05/01/2026', 20000], ['Cộng', '', '', 20000], ['', '', '', '']]),
    'S'
  );
  assert.equal(ds.rows.length, 1);
  assert.doesNotMatch(ds.warnings.join('\n'), /thiếu khối lượng|không đọc được khối lượng/i);
});
test('L-09: dòng Tổng cộng ở cột B bị bỏ; dòng chỉ có khối lượng (không nhãn) có cảnh báo mạnh', () => {
  const ds = HAK.Excel.parseSheet(
    sheet([HEAD, ['101', '43C-111.11', '05/01/2026', 20000], ['', 'Tổng cộng', '', 20000], ['', '', '', 20000]]),
    'S'
  );
  assert.equal(ds.rows.length, 2, 'dòng Tổng cộng ở cột B phải bị bỏ');
  assert.match(ds.warnings.join('\n'), /chỉ có khối lượng|tổng/i, 'dòng chỉ có KL phải có cảnh báo mạnh');
});
test('N-13: khối lượng bất thường (> 200.000 kg) có cảnh báo', () => {
  const ds = HAK.Excel.parseSheet(sheet([HEAD, ['101', '43C-111.11', '05/01/2026', 500000]]), 'S');
  assert.equal(ds.rows.length, 1);
  assert.ok(ds.rows[0].warn.some((w) => /bất thường|200/i.test(w)));
});

test('Ngày ký dạng chữ và ô Excel định dạng ngày trong cột khối lượng không thành phiếu cân', () => {
  const wb = sheet([
    ['Tổng số: 20 xe; Tổng KL: 379.830 kg'],
    HEAD,
    ...Array.from({ length: 20 }, (_, i) => [String(i + 1), '43C-' + String(11000 + i), '25/11/2026', i ? 19000 : 18830]),
    ['', '', '', 'Ngày 26 tháng 11 năm 2026'],
    ['', '', '', 46352],
  ]);
  wb.Sheets.S.D24.w = '26/11/2026';
  const ds = HAK.Excel.parseSheet(wb, 'S');
  assert.equal(ds.stats.trips, 20);
  assert.equal(ds.stats.kg, 379830);
  assert.equal(ds.reconciled, true);
  assert.match(ds.warnings.join('\n'), /Ngày.*trong cột khối lượng.*23, 24/i);
});
