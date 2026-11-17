/* Đọc Purchase Order tiếng Anh bố cục nhiều cột (văn bản giả lập, không dùng dữ liệu thật): bên bán/mua, số PO, ngày, hàng hóa, khối lượng, tàu. */
const { test } = require('node:test'), assert = require('node:assert/strict');
global.window = global; global.HAK = {}; require('../app/js/doc-extract.js');
const CP = require('../app/js/contract-parser.js'), D = require('../app/js/document-import.js');
const PO = `
                   ALPHA TRADING CO., LTD.
                            1-2-3 Example-ku Tokyo, JAPAN

                                PURCHASE ORDER

Messrs:   BETA EXPORT COMP ANY LIMITED                                PO No.:      7    -2026XY
          Lot 1, Example Village, Example Commune, Da Nang City                    05 March 2026

   No.                 Description of Product                              Quantity

  7th
   of            Acacia Woodchips, Vietnam origin                    12,000 BDMT ( +/-10%)
  2026

ETA                    25 March 2026
Vessel                 MV Test Star V-12 ( 6 Holds)
Price                  US$ 150.0 /BDMT, FOB Da Nang port, Vietnam

Remarks: Pursuant to Master Agreement No. 2026XY/BETA-ALPHA dated 20th December 2025.

Seller                                                       Buyer
Beta Export Co., Ltd.                                        Alpha Trading Co., Ltd.
`;
test('PO 2 cột: Seller/Buyer theo thứ tự nhãn; Messrs là bên bán', () => {
  const r = CP.extract([{ page: 1, text: PO }]);
  assert.equal(r.parties.exporter.name, 'Beta Export Co., Ltd.'); assert.equal(r.parties.buyer.name, 'Alpha Trading Co., Ltd.');
  const noFooter = PO.replace(/Seller[^]*$/, ''), r2 = CP.extract([{ page: 1, text: noFooter }]);
  assert.equal(r2.parties.exporter.name, 'BETA EXPORT COMPANY LIMITED', 'Messrs = bên bán, sửa lỗi OCR "COMP ANY"'); assert.equal(r2.parties.buyer.name, 'ALPHA TRADING CO., LTD.');
});
test('PO: hàng hóa, khối lượng, tàu có gạch "V-12", số PO có khoảng trắng quanh gạch, ngày kiểu "05 March 2026" (không lấy ETA / hợp đồng khung)', () => {
  const r = CP.extract([{ page: 1, text: PO }]);
  assert.equal(r.product, 'Acacia Woodchips'); assert.equal(r.lots.length, 1); assert.equal(r.lots[0].qty, 12000); assert.equal(r.lots[0].ship, 'MV TEST STAR V-12');
  assert.equal(D.contractNumberFromPages([{ page: 1, text: PO }]).value, '7-2026XY');
  const c = D.parse(PO, 'contract'), val = (k) => (c.find((x) => x.key === k) || {}).value;
  assert.equal(val('date'), '2026-03-05'); assert.equal(val('priceUsd'), 150); assert.equal(val('ship'), 'MV Test Star V-12');
});
test('hồi quy: nhãn "Date:" và ETA vẫn được ưu tiên đúng; không có ngày ngoài ETA / hợp đồng khung thì không đoán', () => {
  const c = D.parse('Date: 27-July 2026\nETA 25 March 2026\n', 'contract');
  assert.equal(c.find((x) => x.key === 'date').value, '2026-07-27');
  assert.equal(D.parse('ETA 25 March 2026\nAgreement dated 20th December 2025\n', 'contract').some((x) => x.key === 'date'), false);
});
