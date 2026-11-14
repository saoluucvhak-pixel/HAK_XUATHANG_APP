/* Nút "Kiểm tra bản mới": so sánh phiên bản, đọc release GitHub, kết luận; lỗi mạng / quá hạn báo rõ (không tự gọi ra ngoài). */
const { test } = require('node:test'), assert = require('node:assert/strict');
global.window = global; global.HAK = { VERSION: '2.17.0' };
const U = require('../app/js/update-check.js');
const rel = (tag, extra) => Object.assign({ tag_name: tag, html_url: 'https://x/r', draft: false, prerelease: false, body: 'SHA-256: `' + 'a'.repeat(64) + '`', assets: [{ name: 'HAK_QuanLyXuatHang_Setup_v' + tag.slice(1) + '.exe', browser_download_url: 'https://x/setup.exe' }] }, extra);
test('so sánh phiên bản', () => { assert.equal(U.compare('2.16.2', 'v2.17.0'), -1); assert.equal(U.compare('2.17.0', '2.17.0'), 0); assert.equal(U.compare('2.17.1', '2.17.0'), 1); assert.equal(U.compare('2.9.0', '2.10.0'), -1, 'so số, không so chuỗi'); assert.equal(U.compare('abc', '2.0.0'), null); });
test('đọc release: lấy bộ cài + SHA-256; bỏ bản nháp / tiền phát hành / thẻ lạ', () => {
  const r = U.parseRelease(rel('v2.18.0')); assert.deepEqual([r.version, r.setupUrl, r.sha256], ['2.18.0', 'https://x/setup.exe', 'a'.repeat(64)]);
  assert.equal(U.parseRelease(rel('v2.18.0', { draft: true })), null); assert.equal(U.parseRelease(rel('v2.18.0', { prerelease: true })), null); assert.equal(U.parseRelease(rel('nightly')), null); assert.equal(U.parseRelease(null), null);
});
test('kết luận: có bản mới / đang mới nhất / chạy bản mới hơn / không rõ', () => {
  assert.equal(U.verdict('2.17.0', U.parseRelease(rel('v2.18.0'))).state, 'new'); assert.equal(U.verdict('2.17.0', U.parseRelease(rel('v2.17.0'))).state, 'current');
  assert.equal(U.verdict('2.18.0', U.parseRelease(rel('v2.17.0'))).state, 'ahead'); assert.equal(U.verdict('2.17.0', null).state, 'unknown');
});
test('check: dùng fetch được truyền vào; lỗi HTTP / lỗi mạng báo rõ', async () => {
  const ok = await U.check(async () => ({ ok: true, json: async () => rel('v2.18.0') }), '2.17.0'); assert.equal(ok.state, 'new');
  await assert.rejects(U.check(async () => ({ ok: false, status: 403 }), '2.17.0'), /GitHub trả mã 403/);
  await assert.rejects(U.check(async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }, '2.17.0'), /Quá thời gian chờ/);
});
