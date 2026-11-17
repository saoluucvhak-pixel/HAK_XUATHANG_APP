const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../app/js/contract-model.js'),
  D = require('../app/js/document-import.js');
test('certificate valuation uses actual dry quantity and the contract price, ignoring a legacy line price', () => {
  const c = { currency: 'USD', priceUsd: 175, contractQty: 99999 },
    d = { bdmt: 123.45, mt: 234.56, priceUsd: 15000, exchangeRate: 26000 };
  assert.deepEqual(M.valuation(c, d), { valueUsd: 21603.75, valueVnd: 561697500 });
  assert.deepEqual(M.valuation(c, { mt: 100, qty: 500, exchangeRate: 26000 }), { valueUsd: null, valueVnd: null });
});
test('USD cents and VND amounts round by decimal arithmetic; missing rate leaves conversion blank', () => {
  assert.deepEqual(M.valuation({ currency: 'USD', priceUsd: 10.075 }, { bdmt: 1, exchangeRate: 25000 }), {
    valueUsd: 10.08,
    valueVnd: 252000,
  });
  assert.deepEqual(M.valuation({ currency: 'USD', priceUsd: 174 }, { bdmt: 100 }), { valueUsd: 17400, valueVnd: null });
  assert.deepEqual(M.valuation({ currency: 'VND', priceUsd: 2500000 }, { bdmt: 10, exchangeRate: 25000 }), {
    valueUsd: 1000,
    valueVnd: 25000000,
  });
  assert.deepEqual(M.valuation({ currency: 'USD', priceUsd: 0 }, { bdmt: 0, exchangeRate: 26000 }), { valueUsd: 0, valueVnd: 0 });
});
test('saving a signed contract does not create execution rows; later execution values persist and recalculate', () => {
  let db = { v: 3, customers: [], contracts: [], products: [] };
  let c = M.upsert(db, {
    id: 'signed',
    no: 'QA/2026/01',
    contractProduct: 'Wood chips',
    contractQty: 18000,
    priceUsd: 174,
    currency: 'USD',
    details: [],
  }).record;
  assert.equal(c.details.length, 0);
  db = M.upsert(db, c).data;
  c = db.contracts[0];
  c.details.push(M.child(c.id, { id: 'performed', bdmt: 100, exchangeRate: 26000, certificateFiles: ['original'] }));
  let saved = M.upsert(db, c, c.revision);
  assert.equal(saved.record.details[0].valueUsd, 17400);
  assert.equal(saved.record.details[0].valueVnd, 452400000);
  const changed = M.copy(saved.record);
  changed.priceUsd = 175;
  saved = M.upsert(saved.data, changed, changed.revision);
  assert.equal(saved.record.details[0].valueUsd, 17500);
  assert.deepEqual(saved.record.details[0].certificateFiles, ['original']);
  assert.equal(M.migrate(saved.data).data.contracts[0].details[0].exchangeRate, 26000);
});
test('zero, negative or non-finite execution rate blocks save without altering prior data', () => {
  const source = { v: 3, customers: [], contracts: [] };
  for (const rate of [0, -1, Infinity])
    assert.throws(() =>
      M.upsert(source, { id: 'x', no: 'QA', priceUsd: 174, details: [{ id: 'd', contractId: 'x', bdmt: 100, exchangeRate: rate }] })
    );
  assert.equal(source.contracts.length, 0);
});
test('goods catalogue prevents duplicate names and preserves historical contract text on rename', () => {
  let data = { v: 3, customers: [], contracts: [{ id: 'c', no: 'QA', contractProduct: 'Dăm gỗ keo', details: [] }] };
  let result = M.upsertGoods(data, { name: 'Dăm gỗ keo' });
  assert.equal(result.data.products.length, 1);
  assert.throws(() => M.upsertGoods(result.data, { name: 'dam go keo' }), /đã có/);
  const renamed = M.upsertGoods(result.data, { id: result.record.id, name: 'Dăm gỗ keo PEFC' });
  assert.equal(renamed.data.contracts[0].contractProduct, 'Dăm gỗ keo');
  assert.equal(data.products, undefined);
});
test('goods catalogue survives migration and merging without losing local names or duplicating entries', () => {
  const old = { v: 3, customers: [], contracts: [{ id: 'a', no: 'QA', product: 'Wood chips', qty: 200 }] },
    first = M.migrate(old);
  assert.equal(first.data.products[0].name, 'Wood chips');
  assert.equal(old.products, undefined);
  assert.equal(M.migrate(first.data).changed, false);
  const incoming = {
    v: 3,
    customers: [],
    contracts: [],
    products: [
      { id: 'imported', name: 'WOOD CHIPS', unit: 'BDMT' },
      { id: 'other', name: 'Timber', unit: 'BDMT' },
    ],
  };
  const merged = M.mergeCatalog(first.data, incoming);
  assert.equal(merged.products.length, 2);
  assert.equal(M.mergeCatalog(merged, incoming).products.length, 2);
});
test('contract number OCR accepts abbreviated labels, separated rows and spaced slashes', () => {
  for (const text of ['Số HĐ: QA/2026/01', 'HĐ số: QA/2026/01', 'Contract No.\nQA/2026/01', 'S6:\nQA / 2026 / 01']) {
    const found = D.parse(text, 'contract').find((x) => x.key === 'no');
    assert.equal(found.value, 'QA/2026/01', text);
    assert.ok(found.evidence);
  }
});
test('contract number OCR retains OA headers and does not take a quantity label as a number', () => {
  assert.equal(D.parse('IWC/QA26-1793', 'contract').find((x) => x.key === 'no').value, 'IWC/QA26-1793');
  assert.equal(D.contractNumber('Số lượng: 18.000 BDMT'), null);
});
