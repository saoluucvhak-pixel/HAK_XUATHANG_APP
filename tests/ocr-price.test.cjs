const test = require('node:test'),
  assert = require('node:assert/strict');
const D = require('../app/js/document-import.js');
const parse = (t) => Object.fromEntries(D.parse(t, 'contract').map((x) => [x.key, x.value]));
test('Windows OCR distorted wood name retains goods price and currency, excluding agency fee', () => {
  const r = parse('Tài khoản VND: 123456789\nGiå däm gd lå 176,00 USD/BDMT- FOB\nPhi uy thac xuat khau la: 1.40 USD/BDMT');
  assert.equal(r.priceUsd, 176);
  assert.equal(r.currency, 'USD');
});
test('price supports English and Vietnamese money formats', () => {
  for (const [text, value, currency] of [
    ['USD 174.00 per bone dry metric ton', 174, 'USD'],
    ['Đơn giá: 1.234.567 VND/BDMT', 1234567, 'VND'],
    ['Unit price: US$ 1,234.50 per BDMT', 1234.5, 'USD'],
    ['Giá dăm gỗ là 176,00 USD/BDMT', 176, 'USD'],
  ]) {
    const r = parse(text);
    assert.equal(r.priceUsd, value, text);
    assert.equal(r.currency, currency, text);
  }
});
test('accounts, fees, and conflicting goods prices cannot supply contract price', () => {
  for (const text of ['Tài khoản USD: 123456789', 'Phi uy thac: 1.40 USD/BDMT', 'Unit price: 170 USD/BDMT\nUnit price: 180 USD/BDMT'])
    assert.equal(parse(text).priceUsd, undefined);
});

test('unsupported money is not silently converted to USD', () =>
  assert.equal(parse('Unit price: EUR 170.00 per BDMT').priceUsd, undefined));
