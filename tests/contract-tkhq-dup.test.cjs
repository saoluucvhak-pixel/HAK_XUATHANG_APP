/* Trùng số TKHQ: chặn giữa các hợp đồng (bỏ khoảng trắng thừa); trong CÙNG hợp đồng nhiều dòng hàng được dùng chung một TKHQ. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const M = require('../app/js/contract-model.js');
const mk = (details, id = 'c1', no = 'HD-1') => M.parent({ id, type: 'xuatkhau', no, details });

test('nhiều dòng hàng dùng chung một TKHQ trong cùng hợp đồng là hợp lệ', () => {
  const c = mk([
    { id: 'd1', tkhq: '123456789012', product: 'A' },
    { id: 'd2', tkhq: '123456789012', product: 'B' },
  ]);
  assert.equal(M.validate(c, { contracts: [] }), '');
});
test('trùng TKHQ giữa hai hợp đồng bị chặn, kể cả khi có khoảng trắng thừa', () => {
  const a = mk([{ id: 'd1', tkhq: '999999999999' }], 'c1', 'HD-1');
  for (const tk of ['999999999999', ' 999999999999 ']) {
    const b = mk([{ id: 'd9', tkhq: tk }], 'c2', 'HD-2');
    assert.match(M.validate(b, { contracts: [a] }), /đã có ở dòng chi tiết khác/, JSON.stringify(tk));
  }
});
test('chi tiết đã ngừng dùng của hợp đồng khác không gây trùng', () => {
  const a = mk([{ id: 'd1', tkhq: '999999999999', deletedAt: '2026-01-01' }], 'c1', 'HD-1');
  const b = mk([{ id: 'd9', tkhq: '999999999999' }], 'c2', 'HD-2');
  assert.equal(M.validate(b, { contracts: [a] }), '');
});
