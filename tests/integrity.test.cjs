/* Kiểm tra toàn vẹn danh mục: dòng mồ côi, khóa trùng, khóa ngoại sai, nhập trùng, hồ sơ gắn chi tiết không còn; dữ liệu sạch → không báo gì. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const M = require('../app/js/contract-model.js'),
  CM = require('../app/js/customs-model.js');
global.HAK.ContractModel = M;
global.HAK.CustomsModel = CM;
const I = require('../app/js/integrity-model.js');
const clean = () => {
  const c = M.parent({ id: 'hd1', type: 'xuatkhau', no: 'HD1', contractQty: 100, details: [{ id: 'd1', ship: 'T' }] });
  return { contracts: [c], customs: [CM.newDecl({ id: 't1', no: '308629701001', contractId: 'hd1', detailId: 'd1' })] };
};
const codes = (d, m) =>
  I.audit(d, m)
    .map((x) => x.code)
    .sort();
test('dữ liệu sạch không báo gì', () => assert.deepEqual(codes(clean(), [{ id: 'a', contract: 'd1' }]), []));
test('phát hiện tờ khai mồ côi, gắn sai chi tiết, trùng số, hồ sơ gắn chi tiết không còn', () => {
  const d = clean();
  d.customs.push(
    CM.newDecl({ id: 't2', no: '308629701002', contractId: 'khong-co' }),
    CM.newDecl({ id: 't3', no: '308629701003', contractId: 'hd1', detailId: 'xx' }),
    CM.newDecl({ id: 't4', no: '308629701001', contractId: 'hd1' })
  );
  assert.deepEqual(codes(d, [{ id: 'a', title: 'HS', contract: 'detail-mat' }]), [
    'archive-link',
    'decl-detail-fk',
    'decl-orphan',
    'dup-decl-no',
  ]);
});
test('khóa trùng, chi tiết sai khóa ngoại, khoản nộp nhập trùng, KL gốc nghi ghi nhầm', () => {
  const d = clean();
  d.contracts[0].details.push({ id: 'd1', contractId: 'hd1' }, { id: 'd9', contractId: 'khac' });
  d.contracts.push(Object.assign({}, d.contracts[0]));
  d.customs[0].payments = [
    { id: 'p1', amount: 5, receiptNo: 'A1' },
    { id: 'p2', amount: 5, receiptNo: 'A1' },
  ];
  const bad = M.parent({
    id: 'hd2',
    type: 'xuatban',
    no: 'H2',
    contractQty: 500,
    qtyOrig: 500,
    details: [],
    addenda: [{ no: 'PL', date: '2026-09-01', qty: 500 }],
  });
  M.applyAddenda(bad);
  d.contracts.push(bad);
  const c = codes(d);
  ['dup-contract-id', 'dup-detail-id', 'detail-fk', 'dup-payment', 'qty-orig-suspect'].forEach((k) => assert.ok(c.includes(k), k));
});
test('đã xóa mềm thì không tính; kiểm tra không sửa dữ liệu', () => {
  const d = clean();
  d.customs[0].deletedAt = 'x';
  d.customs[0].contractId = 'khong-co';
  const before = JSON.stringify(d);
  assert.deepEqual(codes(d), []);
  assert.equal(JSON.stringify(d), before);
});
