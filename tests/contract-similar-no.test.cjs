/* Số hợp đồng gần giống (chỉ khác hoa/thường, khoảng trắng, dấu gạch): cảnh báo để xác nhận, không chặn. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const M = require('../app/js/contract-model.js');
const mk = (no, id = 'c' + no, type = 'xuatkhau') => M.parent({ id, type, no, details: [] });

test('khác hoa/thường, khoảng trắng, dấu gạch hoặc dấu tiếng Việt được coi là gần giống', () => {
  const cat = { contracts: [mk('HD-01', 'a')] };
  for (const no of ['hd-01', 'HD 01', 'HD/01', 'hd01', ' hd - 01 ', 'HĐ-01'])
    assert.equal(M.similarNo(mk(no, 'b'), cat).length, 1, JSON.stringify(no));
});
test('giống hệt không tính là "gần giống" (đã bị validate chặn); khác số thật thì không', () => {
  const cat = { contracts: [mk('HD-01', 'a')] };
  assert.equal(M.similarNo(mk('HD-01', 'b'), cat).length, 0);
  assert.match(M.validate(mk('HD-01', 'b'), cat), /đã tồn tại/);
  assert.equal(M.similarNo(mk('HD-1', 'b'), cat).length, 0);
  assert.equal(M.similarNo(mk('HD-02', 'b'), cat).length, 0);
});
test('khác hình thức, hợp đồng đã lưu trữ hoặc chính nó thì không báo', () => {
  const cat = { contracts: [mk('HD-01', 'a', 'uythac'), Object.assign(mk('HD 01', 'd'), { deletedAt: '2026-01-01' })] };
  assert.equal(M.similarNo(mk('hd-01', 'b', 'xuatkhau'), cat).length, 0);
  const self = mk('HD-01', 'a');
  assert.equal(M.similarNo(self, { contracts: [self] }).length, 0);
});
test('gần giống không bị validate chặn (người dùng được phép lưu như hợp đồng khác)', () => {
  const cat = { contracts: [mk('HD-01', 'a')] };
  assert.equal(M.validate(mk('hd-01', 'b'), cat), '');
});
