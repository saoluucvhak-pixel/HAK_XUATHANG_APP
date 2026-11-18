/* M2.3 — hộp dán danh sách mã phiếu: "đã loại vì KL ≤ 0" khác "không tìm thấy". */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/pages-modals.js');
const split = HAK.PagesModals.splitMissing;
const excluded = [{ ticket: '102' }, { ticket: '0103' }];
test('số phiếu đã bị loại vì KL ≤ 0 được tách riêng khỏi "không tìm thấy"', () => {
  assert.deepEqual(split(excluded, ['102', '999']), { excluded: ['102'], notFound: ['999'] });
});
test('khớp đuôi số phiếu (như cách chọn phiếu), không phân biệt hoa/thường và khoảng trắng', () => {
  assert.deepEqual(split([{ ticket: 'AB-0103' }], [' 0103 ', 'ab-0103', 'x']), { excluded: [' 0103 ', 'ab-0103'], notFound: ['x'] });
});
test('không có danh sách loại → tất cả là không tìm thấy; token rỗng không khớp nhầm', () => {
  assert.deepEqual(split(undefined, ['1', '2']), { excluded: [], notFound: ['1', '2'] });
  assert.deepEqual(split(excluded, ['']), { excluded: [], notFound: [''] });
});
