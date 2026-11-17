/* Thuế: sai số số thực không được tạo ra "còn nợ / nộp thừa" vài e-17 đồng. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const C = require('../app/js/customs-model.js');
const decl = (taxVnd, amounts) => C.newDecl({ no: '123456789012', taxVnd, payments: amounts.map((a) => C.newPay({ amount: a })) });

test('nộp đủ bằng nhiều khoản lẻ: không còn nợ, không nộp thừa', () => {
  const t = C.totals(decl(0.3, [0.1, 0.2]));
  assert.equal(t.owed, 0);
  assert.equal(t.over, 0);
  assert.equal(t.remaining, 0);
  const s = C.settlement([decl(0.3, [0.1, 0.2])]);
  assert.equal(s.nOver, 0);
  assert.equal(s.nOwing, 0);
  assert.equal(s.nSettled, 1);
});
test('VND nguyên: còn nợ / nộp thừa không đổi', () => {
  assert.equal(C.totals(decl(1000000, [600000])).owed, 400000);
  assert.equal(C.totals(decl(1000000, [1200000])).over, 200000);
  assert.equal(C.totals(decl(1000000, [333333.33, 333333.33, 333333.34])).owed, 0);
});
