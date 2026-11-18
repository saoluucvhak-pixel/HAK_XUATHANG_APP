const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
HAK.ContractModel = require('../app/js/contract-model.js');
HAK.CustomsModel = require('../app/js/customs-model.js');
const R = require('../app/js/catalog-rows.js');
const { buildSample } = require('../tools/data-audit-core.cjs');
const CM = HAK.CustomsModel,
  M = HAK.ContractModel;

const catalog = () => {
  const c1 = M.parent({
    id: 'hd1',
    type: 'uythac',
    no: '000123/HĐ-ƯT',
    contractQty: 5000,
    exporterId: 'k1',
    buyerId: 'k2',
    details: [
      { id: 'ct-b', ship: 'TÀU B', qty: 1000, bdmt: 4000.123, certNo: '00045' },
      { id: 'ct-a', ship: 'TÀU A', qty: 0, bdmt: null },
    ],
    addenda: [
      { id: 'pl-2', no: 'PL02', date: '2026-02-01', qty: 4500 },
      { id: 'pl-1', no: 'PL01', date: '2026-01-01', qty: 5000, deletedAt: '2026-03-01' },
    ],
  });
  const pay = (id, o) => Object.assign({ id, kind: 'tax', date: '2026-06-12' }, o);
  return {
    v: 3,
    products: [{ id: 'sp1' }],
    customers: [
      { id: 'k2', name: 'IWC', companyId: null },
      { id: 'k1', name: 'HAK', companyId: 'hak' },
    ],
    contracts: [c1],
    customs: [
      CM.newDecl({
        id: 'tk1',
        no: '308629701000',
        contractId: 'hd1',
        detailId: 'ct-a',
        status: 'cleared',
        taxVnd: 1000,
        payments: [pay('p2', { receiptNo: 'DN0206/26', amount: 1000 }), pay('p1', { amount: 0, kind: 'refund' })],
        supplements: [{ id: 'bs1', no: '2', taxVnd: 900 }],
      }),
      CM.newDecl({ id: 'tk2', no: '000308629701', contractId: 'hd1', status: 'opened', taxVnd: null }),
    ],
  };
};
const rowsOf = (b) => b.tables;

test('chiếu rồi dựng lại cho đúng bản gốc: giữ thứ tự mảng, số 0 đầu, null / 0 / chuỗi trống, bản ghi ngừng dùng', () => {
  const data = catalog(),
    b = R.build(data);
  assert.deepEqual(R.assemble(rowsOf(b), { v: data.v, products: data.products }), data);
  assert.deepEqual(
    b.tables.contract_details.map((r) => r.id),
    ['ct-b', 'ct-a'],
    'thứ tự chi tiết như mảng gốc, không theo id'
  );
  assert.deepEqual(
    b.tables.customers.map((r) => r.id),
    ['k2', 'k1']
  );
  const t2 = b.tables.customs_decls.find((r) => r.id === 'tk2');
  assert.strictEqual(t2.no, '000308629701');
  assert.strictEqual(t2.tax_vnd, null);
  assert.strictEqual(b.tables.customs_decls.find((r) => r.id === 'tk1').tax_vnd, 1000);
  assert.strictEqual(b.tables.contract_details.find((r) => r.id === 'ct-a').qty_milli, 0, '0 khác NULL');
  assert.strictEqual(b.tables.contract_details.find((r) => r.id === 'ct-a').bdmt_milli, null);
  assert.strictEqual(b.tables.contract_details.find((r) => r.id === 'ct-b').cert_no, '00045');
  assert.equal(b.tables.contract_addenda.find((r) => r.id === 'pl-1').deleted_at, '2026-03-01');
});
test('khối lượng theo 1/1000: 4000,123 → 4000123; quá 3 chữ số lẻ thì cảnh báo, doc vẫn giữ nguyên giá trị', () => {
  const data = catalog();
  assert.strictEqual(R.build(data).tables.contract_details[0].bdmt_milli, 4000123);
  data.contracts[0].details[0].bdmt = 1.23456;
  data.customs[0].taxVnd = 1000.5;
  const b = R.build(data);
  assert.equal(b.warnings.length, 2);
  assert.ok(b.warnings.some((x) => x.field === 'bdmt' && /3 chữ số lẻ/.test(x.msg)));
  assert.ok(b.warnings.some((x) => x.field === 'taxVnd' && /số nguyên đồng/.test(x.msg)));
  assert.deepEqual(R.assemble(b.tables, { v: 3, products: data.products }), data, 'giá trị gốc không đổi');
});
test('tờ khai mồ côi: cột FK = NULL, ghi vào orphans, giá trị gốc còn trong doc (không che giấu, không chặn lưu)', () => {
  const data = catalog();
  data.customs[1].contractId = 'hd-khong-con';
  data.customs[0].detailId = 'ct-khong-con';
  const b = R.build(data);
  assert.deepEqual(b.orphans.map((o) => [o.id, o.field, o.target]).sort(), [
    ['tk1', 'detailId', 'ct-khong-con'],
    ['tk2', 'contractId', 'hd-khong-con'],
  ]);
  assert.strictEqual(b.tables.customs_decls.find((r) => r.id === 'tk2').contract_id, null);
  assert.deepEqual(R.assemble(b.tables, { v: 3, products: data.products }), data);
});
test('tổng đối chiếu: số dòng, khối lượng, thuế, giấy nộp (không tính khoản ngừng dùng)', () => {
  const data = catalog();
  data.customs[0].payments.push({ id: 'p3', kind: 'tax', amount: 500, deletedAt: 'x' });
  const t = R.totals(R.build(data).tables);
  assert.equal(t.rows.contract_details, 2);
  assert.equal(t.rows.customs_payments, 3);
  assert.equal(t.detailBdmtMilli, 4000123);
  assert.equal(t.declTaxVnd, 1000);
  assert.equal(t.suppTaxVnd, 900);
  assert.equal(t.paymentVnd, 1000, 'khoản ngừng dùng không cộng');
  assert.equal(t.contractQtyMilli, 5000000);
});
test('bộ dữ liệu thử đủ ca (data-audit): chiếu và dựng lại khớp, có mồ côi như đã biết', () => {
  const cat = buildSample().keys['hak.catalog.v1'];
  const data = HAK.ContractModel.migrate(cat).data;
  const b = R.build(data);
  assert.deepEqual(R.assemble(b.tables, { v: data.v, products: data.products }), JSON.parse(JSON.stringify(data)));
  assert.deepEqual(
    b.orphans.map((o) => o.id),
    ['tk3'],
    'tờ khai trỏ hợp đồng không tồn tại'
  );
});
