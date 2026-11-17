/* Hoàn thuế (v2.20): khoản NSNN hoàn lại trừ vào số đã nộp → nộp thừa được hoàn đủ thì tất toán; không bù trừ giữa các tờ khai. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const C = require('../app/js/customs-model.js');
const pay = (amount, kind = 'tax', extra = {}) => C.newPay(Object.assign({ amount, kind }, extra));
const decl = (taxVnd, pays, no = '123456789012') => C.newDecl({ no, taxVnd, payments: pays });

test('loại khoản "Hoàn thuế" được nhận và giữ nguyên khi chuẩn hóa', () => {
  assert.equal(C.PAY_KIND.refund, 'Hoàn thuế');
  assert.equal(pay(100, 'refund').kind, 'refund');
  assert.equal(pay(100, 'fee').kind, 'fee');
  assert.equal(pay(100, 'xyz').kind, 'tax');
});
test('nộp thừa chưa hoàn: báo nộp thừa, chờ hoàn thuế', () => {
  const t = C.totals(decl(1000000, [pay(1200000)]));
  assert.equal(t.over, 200000);
  assert.equal(t.owed, 0);
  assert.equal(t.refunded, 0);
  assert.match(C.taxText(C.settlement([decl(1000000, [pay(1200000)])])), /Nộp thừa 200\.000 đ .*hoàn thuế/);
});
test('hoàn đủ phần nộp thừa: tất toán (không còn nợ / nộp thừa), đã nộp ròng = thuế phải nộp', () => {
  const d = decl(1000000, [pay(1200000), pay(200000, 'refund')]),
    t = C.totals(d);
  assert.equal(t.paidGross, 1200000);
  assert.equal(t.refunded, 200000);
  assert.equal(t.paidTax, 1000000);
  assert.equal(t.over, 0);
  assert.equal(t.owed, 0);
  const s = C.settlement([d]);
  assert.equal(s.nSettled, 1);
  assert.equal(s.nOver, 0);
  assert.match(C.taxText(s), /Đã nộp đủ thuế \(đã hoàn 200\.000 đ\)/);
});
test('hoàn một phần: vẫn còn nộp thừa phần chưa hoàn', () => {
  const t = C.totals(decl(1000000, [pay(1200000), pay(50000, 'refund')]));
  assert.equal(t.over, 150000);
});
test('hoàn nhiều hơn đã nộp được đánh dấu để kiểm tra', () => {
  const t = C.totals(decl(1000000, [pay(1000000), pay(5, 'refund')]));
  assert.equal(t.refundExceeds, false);
  assert.equal(C.totals(decl(1000000, [pay(100, 'refund')])).refundExceeds, true);
});
test('khoản hoàn đã xóa không được tính', () => {
  const t = C.totals(decl(1000000, [pay(1200000), pay(200000, 'refund', { deletedAt: '2026-01-01' })]));
  assert.equal(t.over, 200000);
});
test('hoàn thuế không bị coi là trùng với khoản nộp cùng số tiền', () => {
  const a = pay(200000, 'tax', { receiptNo: 'R1' }),
    b = pay(200000, 'refund', { receiptNo: 'R1' });
  assert.equal(C.findSamePayment([a], b), null);
});
test('không bù trừ giữa các tờ khai: tờ khai nộp thừa vẫn chờ hoàn dù tờ khai khác còn nợ', () => {
  const s = C.settlement([decl(1000, [pay(1200)], '111111111111'), decl(1000, [pay(600)], '222222222222')]);
  assert.equal(s.over, 200);
  assert.equal(s.owed, 400);
});
