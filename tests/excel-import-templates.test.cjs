const { test } = require('node:test');
const assert = require('node:assert/strict');
global.XLSX = require('../app/libs/xlsx.full.min.js');
require('../app/js/excel.js');
require('../app/js/excel-import-templates.js');
const X = HAK.Excel;
const templates = HAK.ExcelImportTemplates;
const book = (rows) => ({ Sheets: { Can: XLSX.utils.aoa_to_sheet(rows) } });

test('mẫu mặc định ghép theo tên tiêu đề khi các cột đổi vị trí, giữ đơn vị đã chọn', () => {
  const sample = book([
    ['Mã riêng', 'Ngày nguồn', 'Xe nguồn', 'Hàng giao'],
    ['0001', '26/11/2026', '43C-12345', 19],
  ]);
  const ds = X.parseSheet(sample, 'Can', { headerRow: 1, inspectOnly: true });
  const profile = templates.profileFrom('Nhà máy', ds, { ticket: 0, date: 1, plate: 2, net: 3 }, 't');
  const file = book([
    ['Xe nguồn', 'Hàng giao', 'Mã riêng', 'Ngày nguồn'],
    ['43C-12345', 20, '0002', '26/11/2026'],
  ]);
  const config = templates.resolve(file, 'Can', profile);
  const actual = X.parseSheet(file, 'Can', config);
  assert.equal(actual.ok, true);
  assert.equal(actual.rows[0].ticket, '0002');
  assert.equal(actual.stats.kg, 20000);
  assert.equal(templates.resolve(book([['Xe nguồn', 'Hàng giao', 'Mã riêng']]), 'Can', profile), null);
  assert.equal(templates.resolve(book([['Xe nguồn', 'Hàng giao', 'Hàng giao', 'Mã riêng', 'Ngày nguồn']]), 'Can', profile), null);
});

test('mẫu chỉ ghép cột có tiêu đề riêng và đủ trường bắt buộc', () => {
  const ds = X.parseSheet(book([['Xe', 'Ngày', 'Hàng', 'Hàng']]), 'Can', { headerRow: 1, inspectOnly: true });
  assert.throws(() => templates.profileFrom('Mẫu', ds, { plate: 0, date: 1, net: 2 }, 'kg'), /tiêu đề riêng/);
  assert.throws(() => templates.profileFrom('Mẫu', ds, { plate: 0, date: 1 }, 'kg'), /khối lượng/);
});
