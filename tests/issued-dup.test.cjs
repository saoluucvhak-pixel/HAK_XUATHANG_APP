/* Nhật ký chứng từ: phát hiện trùng số BKLS (không phân biệt hoa/thường, khoảng trắng) và chồng dải PXK. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/records.js');
const I = HAK.Issued;
const reset = (list) => {
  I.list = list;
};

test('số BKLS đã dùng cho đợt khác bị báo, bất kể hoa/thường và khoảng trắng', () => {
  reset([{ kind: 'bkls', cid: 'c1', soBkls: '010/2026/BKLS', type: 'xuatkhau', batch: 'A.xlsx' }]);
  for (const so of ['010/2026/BKLS', ' 010/2026/bkls ', '010 / 2026 / BKLS'])
    assert.equal(I.checkBkls({ cid: 'c1', so, type: 'xuatkhau', batch: 'B.xlsx' }).length, 1, JSON.stringify(so));
});
test('không báo khi khác công ty, khác số, cùng đợt (lập lại) hoặc số trống', () => {
  reset([{ kind: 'bkls', cid: 'c1', soBkls: '010/2026/BKLS', type: 'xuatkhau', batch: 'A.xlsx' }]);
  assert.equal(I.checkBkls({ cid: 'c2', so: '010/2026/BKLS', type: 'xuatkhau', batch: 'B.xlsx' }).length, 0);
  assert.equal(I.checkBkls({ cid: 'c1', so: '011/2026/BKLS', type: 'xuatkhau', batch: 'B.xlsx' }).length, 0);
  assert.equal(I.checkBkls({ cid: 'c1', so: '010/2026/BKLS', type: 'xuatkhau', batch: 'A.xlsx' }).length, 0);
  assert.equal(I.checkBkls({ cid: 'c1', so: '', type: 'xuatkhau', batch: 'B.xlsx' }).length, 0);
});
test('dải PXK chồng lên lần trước của cùng công ty bị báo; kế tiếp thì không', () => {
  reset([{ kind: 'pxk', cid: 'c1', pxkFrom: 100, pxkTo: 119, type: 't', batch: 'A' }]);
  assert.equal(I.checkPxk({ cid: 'c1', from: 119, to: 130, type: 't', batch: 'B' }).length, 1);
  assert.equal(I.checkPxk({ cid: 'c1', from: 120, to: 130, type: 't', batch: 'B' }).length, 0);
  assert.equal(I.checkPxk({ cid: 'c2', from: 100, to: 110, type: 't', batch: 'B' }).length, 0);
});
test('số BKLS kế tiếp giữ độ rộng', () => {
  assert.equal(I.nextBklsNo('010/2026/BKLS'), '011/2026/BKLS');
  assert.equal(I.nextBklsNo('099/2026/BKLS'), '100/2026/BKLS');
});
