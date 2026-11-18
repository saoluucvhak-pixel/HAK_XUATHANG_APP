/* An toàn hộp thoại (quét mã nguồn): nút Hủy / Đóng (data-bs-dismiss="modal") không phải nút phá hủy;
 * nút MẶC ĐỊNH của một <form> (nút bị kích hoạt khi nhấn Enter trong ô nhập) không phải nút phá hủy; chỉ 2 xử lý phím Enter tự viết, đều không phá hủy dữ liệu. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '../app/js');
const sources = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ f: 'app/js/' + f, s: fs.readFileSync(path.join(dir, f), 'utf8') }))
  .concat([{ f: 'app/index.html', s: fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8') }]);
const DESTRUCTIVE_CLASS = /btn-(outline-)?danger/;
const DESTRUCTIVE_LABEL = /(Xóa|Gỡ|Đóng năm|Quay lui|Thay thế|Ghi đè|Dọn)/i;

test('nút Hủy / Đóng của hộp thoại không phải nút phá hủy', () => {
  let n = 0;
  const bad = [];
  for (const { f, s } of sources)
    for (const m of s.matchAll(/<button[^>]*data-bs-dismiss=["\\]*modal[^>]*>([^<]*)</g)) {
      n++;
      if (DESTRUCTIVE_CLASS.test(m[0]) || DESTRUCTIVE_LABEL.test(m[1])) bad.push(f + ': ' + m[0].slice(0, 120));
    }
  assert.ok(n >= 20, 'quét được các nút đóng hộp thoại (' + n + ')');
  assert.deepEqual(bad, []);
});
test('nút mặc định của <form> (Enter trong ô nhập) không phải nút phá hủy', () => {
  let n = 0;
  const bad = [];
  for (const { f, s } of sources)
    for (const m of s.matchAll(/<form[^>]*>([\s\S]{0,6000}?)<\/form>/g)) {
      n++;
      const first = [...m[1].matchAll(/<button([^>]*)>([^<]*)</g)].find((b) => !/type=["\\]*button/.test(b[1]));
      if (first && (DESTRUCTIVE_CLASS.test(first[1]) || DESTRUCTIVE_LABEL.test(first[2]))) bad.push(f + ': ' + first[0].slice(0, 120));
    }
  assert.ok(n >= 4, 'quét được các form (' + n + ')');
  assert.deepEqual(bad, []);
});
test('xử lý phím Enter tự viết: chỉ bảng điều khiển và Tìm kiếm chung (không có đường Enter phá hủy khác)', () => {
  const hits = [];
  for (const { f, s } of sources) if (/e\.key === 'Enter'|keyCode === 13/.test(s)) hits.push(f);
  assert.deepEqual(hits.sort(), ['app/js/dashboard.js', 'app/js/search.js']);
});
