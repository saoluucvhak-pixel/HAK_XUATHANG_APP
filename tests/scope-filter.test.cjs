'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
// Kiểm tra tĩnh các nhãn phân biệt phạm vi và hàm giải thích 0 phiếu / điều kiện hết hiệu lực / chuyển phạm vi.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8');
test('nhãn phân biệt Lọc xem trước / Phạm vi lập chứng từ / Kỳ báo cáo', () => {
  assert.match(read('index.html'), /Lọc xem trước<\/b>[^]*Dùng phạm vi đang xem/);
  assert.match(read('js/pages.js'), /Phạm vi lập chứng từ/);
  assert.match(read('index.html') + read('js/report.js'), /Kỳ báo cáo/);
});
test('pages.js xuất useScope, explainZero, expiredConditions', () => {
  const s = read('js/pages.js');
  ['_explainZero: explainZero', '_expired: expiredConditions', 'useScope,'].forEach((k) => assert.ok(s.includes(k), k));
  assert.match(read('js/main.js'), /btnUseScope/);
});
test('hướng dẫn trong app có mục Quy trình lập hồ sơ với đúng tên nút', () => {
  const h = read('js/help.js');
  assert.match(h, /help-flow/);
  ['Dùng phạm vi đang xem', 'Chọn tất cả', 'Thử lưu lại', 'Lưu / Bỏ thay đổi / Quay lại'].forEach((k) => assert.ok(h.includes(k), k));
  assert.match(read('HUONG_DAN.md'), /Quy trình lập hồ sơ từ đầu đến cuối/);
});
test('hướng dẫn nêu Nhập bổ sung / Khôi phục, Code.gs bản 3, Tiếp tục đóng năm', () => {
  const d = read('HUONG_DAN.md');
  ['Nhập bổ sung', 'Khôi phục (ghi đè)', 'Hoàn tác khôi phục', 'Tiếp tục đóng năm', 'đã ghi N lô', 'dán lại Code.gs mới'].forEach((k) => assert.ok(d.includes(k), k));
  assert.match(read('js/backup.js'), /data-choice="merge"/);
});
