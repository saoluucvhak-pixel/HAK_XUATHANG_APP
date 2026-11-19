/* HAK.UI.friendly: thông báo lỗi thô của trình duyệt / JavaScript không hiện ra cho người dùng; thông báo tiếng Việt của app giữ nguyên. */
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
global.document = { querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} }, addEventListener() {} };
require('../app/js/ui.js');
const { friendly } = global.HAK.UI;
const GENERIC = friendly('Cannot read properties of undefined (reading "x")');
test('thông báo thô của trình duyệt / JavaScript bị thay bằng câu chung tiếng Việt', () => {
  for (const raw of [
    "Cannot read properties of undefined (reading 'rows')",
    'Failed to fetch',
    'The quota has been exceeded.',
    'Unexpected token < in JSON at position 0',
    'TypeError: x is not a function',
    'net::ERR_CONNECTION_REFUSED',
    '[object Object]',
    'Giá trị undefined không hợp lệ', // lỗi nằm GIỮA câu: không cắt được mà vẫn có nghĩa → câu chung
    'Lỗi at parse (file:///C:/app/js/archive.js:120:15)', // sau khi cắt đuôi không còn tiếng Việt có nghĩa
  ])
    assert.equal(friendly(raw), GENERIC, raw);
  assert.match(GENERIC, /^Đã xảy ra lỗi ngoài dự kiến/);
  assert.ok(!/undefined|TypeError|file:/.test(GENERIC));
});
test('thông báo tiếng Việt của app giữ nguyên (kể cả có từ kỹ thuật ngắn, số, mã phiếu)', () => {
  for (const ok of [
    'Không kết nối được cơ sở dữ liệu SQLite (HAKDocs). Hãy mở app bằng lối tắt HAK.',
    'Không kết nối được Google (máy đang offline, mạng chặn script.google.com). Chi tiết: Failed to fetch',
    'Đã nhập 1 tờ khai.',
    'Phiếu 0101 / 101: 4 phiếu · 82,00 tấn',
    'Chưa đọc được TỔNG SỐ TIỀN THUẾ XUẤT KHẨU.',
    'OK',
    '',
  ])
    assert.equal(friendly(ok), ok, ok);
  assert.equal(friendly(null), '');
});
test('A4: câu tiếng Việt có đuôi kỹ thuật → giữ phần tiếng Việt, chỉ cắt đuôi (không thay cả câu bằng câu chung)', () => {
  const cases = {
    'Không đọc được tệp sao lưu (ERR_FILE_NOT_FOUND)': 'Không đọc được tệp sao lưu',
    'Không kết nối được máy chủ: net::ERR_CONNECTION_REFUSED': 'Không kết nối được máy chủ',
    'Lỗi tại trích xuất at parse (file:///C:/app/js/archive.js:120:15)': 'Lỗi tại trích xuất',
    'Không lưu được hồ sơ at save (https://x/app.js:10:5)\n    at async run (https://x/app.js:20:1)': 'Không lưu được hồ sơ',
    'Đã lưu tại archive.js:300:12': 'Đã lưu',
    'Khôi phục dừng: [ERR_ABORTED] vì tệp bị ngắt': 'Khôi phục dừng vì tệp bị ngắt',
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(friendly(raw), want, raw);
});
test('A4: thông báo sạch không bị cắt; đuôi tiếng Anh không có mã kỹ thuật vẫn giữ (không đổi)', () => {
  const ok = 'Không kết nối được Google (máy đang offline). Chi tiết: Failed to fetch';
  assert.equal(friendly(ok), ok);
});
