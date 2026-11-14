/* Báo cáo thực hiện hợp đồng: mọi dòng đủ số cột theo định nghĩa cột; nhóm / phần PDF dẫn xuất đúng; thuế còn nợ đúng cột. */
const { test } = require('node:test'), assert = require('node:assert/strict');
global.window = global; global.HAK = {};
const CM = require('../app/js/customs-model.js'), M = require('../app/js/contract-model.js');
global.HAK.CustomsModel = CM; global.HAK.ContractModel = M; global.HAK.NumFmt = require('../app/js/numfmt.js');
const CF = require('../app/js/contract-file.js'), O = require('../app/js/contract-overview.js');

function fixture() {
  const c = M.parent({ type: 'xuatkhau', no: 'HD1', date: '2026-08-06', contractQty: 6000, priceUsd: 176, details: [] });
  c.details.push(M.child(c.id, { ship: 'M/V A', certNo: 'C1', bdmt: 4000, mt: 8000, exchangeRate: 26000 }), M.child(c.id, { ship: 'M/V B', bdmt: 1000 }));
  const decl = CM.newDecl({ no: '308629701721', contractId: c.id, detailId: c.details[0].id, status: 'cleared', qtyBdmt: 4000, taxVnd: 100, payments: [{ amount: 40 }] });
  const loose = CM.newDecl({ no: '308629701999', contractId: c.id, status: 'opened', taxVnd: 10 });
  HAK.Catalog = { core: { get: () => ({ contracts: [c], customers: [], customs: [decl, loose] }) } };
  const m = CF.build(c.id, []);
  return { g: { f: { buyer: 'IWC' }, khos: ['Kho A'], from: '18/08/2026', to: '20/08/2026' }, m };
}

test('mọi dòng (hợp đồng, chi tiết, tờ khai chưa gắn) có đủ số cột; khóa cột duy nhất', () => {
  const rows = O.rowsOf(fixture());
  assert.ok(rows.length >= 4); assert.equal(rows[0].cls, 'main'); rows.forEach((r, i) => assert.equal(r.c.length, O.COLS.length, 'dòng ' + i));
  assert.equal(new Set(O.COLS.map((c) => c.k)).size, O.COLS.length);
  assert.ok(Object.keys(O.IX).length === O.COLS.length);
});

test('thuế còn nợ nằm đúng cột CÒN NỢ; Σ cột số chỉ ở cột có sum', () => {
  const rows = O.rowsOf(fixture()), main = rows[0].c;
  assert.equal(main[O.IX.payable], '110'); assert.equal(main[O.IX.paid], '40'); assert.equal(main[O.IX.owing], '70');       // 100 + 10 (tờ khai chưa gắn) − 40
  assert.equal(rows.find((r) => /chưa gắn chi tiết/.test(r.c[0])).c[O.IX.tkct], '⚠ Chưa gắn chi tiết');
  O.COLS.forEach((c) => { if (c.sum) assert.ok(c.n, c.k + ': cột cộng tổng phải là cột số'); });
});

test('PDF chia 2 phần: phần 1 = nhóm ①–④, phần 2 = cột đầu + nhóm ⑤–⑦; không cột nào bị bỏ sót', () => {
  assert.equal(O.PART1[0], 0); assert.equal(O.PART2[0], 0);
  const all = new Set([].concat(O.PART1, O.PART2)); assert.equal(all.size, O.COLS.length);
  assert.ok(O.PART1.every((i) => O.COLS[i].b <= 3)); assert.ok(O.PART2.slice(1).every((i) => O.COLS[i].b >= 4));
  assert.ok(O.PART2.indexOf(O.IX.owing) > 0 && O.PART2.indexOf(O.IX.kho) > 0 && O.PART1.indexOf(O.IX.cert) > 0);
});
