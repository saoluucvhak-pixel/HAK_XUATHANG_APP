/* Quy tắc 28: số lượng hợp đồng viết dạng ngoặc "(1.200)" KHÔNG được đọc thành số âm; phải có cảnh báo đối chiếu (trước đây ô vắng mặt lặng lẽ hoặc bỏ ngoặc không báo). */
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const P = require('../app/js/contract-parser.js');
const text = (qtyLine) => 'HOP DONG MUA BAN DAM GO\nHang hoa: Dam go keo\n' + qtyLine + '\nGia: 150 USD / BDMT';
test('số lượng bình thường: đọc đúng, không có cảnh báo', () => {
  const r = P.extract(text('Số lượng: 1.200 BDMT'));
  assert.deepEqual(
    r.lots.map((l) => l.qty),
    [1200]
  );
  assert.deepEqual(r.warnings, []);
});
test('"(1.200) BDMT": không đọc ngoặc là số âm, không tự điền, có cảnh báo nêu ô đó', () => {
  const r = P.extract(text('Số lượng: (1.200) BDMT'));
  assert.ok(!r.lots.some((l) => l.qty < 0));
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /ngoặc/);
  assert.match(r.warnings[0], /\(1\.200\)/);
});
test('"(1.200 BDMT)": số vẫn là +1200 (như trước) nhưng có cảnh báo, không im lặng bỏ ngoặc', () => {
  const r = P.extract(text('Số lượng: (1.200 BDMT)'));
  assert.ok(r.lots.every((l) => l.qty > 0));
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /ngoặc/);
});
test('ngoặc ở dòng không phải số lượng (ghi chú) không gây cảnh báo', () => {
  const r = P.extract(text('Số lượng: 1.200 BDMT\nGhi chú (xem phụ lục 2)'));
  assert.deepEqual(r.warnings, []);
});
