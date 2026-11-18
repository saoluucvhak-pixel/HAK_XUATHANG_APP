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
