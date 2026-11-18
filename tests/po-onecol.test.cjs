/* M3 — PO tiếng Anh 1 cột (văn bản giả lập): bên bán/mua không bị đảo (nhãn cùng dòng hoặc xuống dòng), ngày "03 February 2026", số PO có khoảng trắng quanh dấu gạch. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/doc-extract.js');
const CP = require('../app/js/contract-parser.js'),
  D = require('../app/js/document-import.js');
const PO = `PURCHASE ORDER
Date: 03 February 2026
PO No.: 12 - 2026
Seller: BETA EXPORT COMPANY LIMITED
Tax code: 0400000001
Buyer: ALPHA TRADING CO., LTD.
Address: 1-2-3 Example-ku Tokyo, JAPAN
Quantity: 10,000 BDMT
Price: US$ 150.0 /BDMT FOB Da Nang
`;
for (const [name, text] of [
  ['nhãn cùng dòng', PO],
  ['nhãn xuống dòng', PO.replace('Seller: ', 'Seller:\n').replace('Buyer: ', 'Buyer:\n')],
])
  test('PO 1 cột (' + name + '): bên bán/mua, số, ngày, khối lượng', () => {
    const e = CP.extract([{ page: 1, text }]);
    assert.equal(e.parties.exporter.name, 'BETA EXPORT COMPANY LIMITED');
    assert.equal(e.parties.buyer.name, 'ALPHA TRADING CO., LTD.');
    assert.equal(e.lots[0].qty, 10000);
    const c = D.parse(text, 'contract'),
      val = (k) => (c.find((x) => x.key === k) || {}).value;
    assert.equal(val('no'), '12-2026');
    assert.equal(val('date'), '2026-02-03');
    assert.equal(val('priceUsd'), 150);
  });
