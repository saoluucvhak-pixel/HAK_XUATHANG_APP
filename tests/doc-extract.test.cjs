const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/contract-parser.js');
const X = require('../app/js/doc-extract.js');
const D = require('../app/js/document-import.js');
const P = HAK.ContractParser;
// ---- Chứng thư: dữ liệu mô phỏng theo các kiểu lỗi OCR thật (mất dấu, dính chữ, nháy lạc, số bị tách) ----
const CERT_CLEAN = `CHỨNG THƯ GIÁM ĐỊNH VỀ KHỐI LƯỢNG
Số : 26E04TEST00001-07
Ngày : 30/3/2026
Người xuất khẩu : CÔNG TY TNHH MẪU XUẤT KHẨU
CỤM CÔNG NGHIỆP MẪU, XÃ MẪU,
THÀNH PHỐ ĐÀ NẴNG, VIỆT NAM
Người mua hàng : SAMPLE WOODCHIP CORPORATION PTE LTD
10 SAMPLE PLACE, NO.01-01 TEST PLAZA 1
SINGAPORE 000000
Tên hàng : DĂM GỖ KEO LAI PEFC CONTROLLED SOURCES
Khối lượng : 12.345,67 TẤN TƯƠI / 6.789,01 TẤN KHÔ
Tên tàu : M/V TESTSHIP V.12345AB
Cảng xếp hàng : ĐÀ NẴNG, VIỆT NAM
ĐỘ ẨM: 45,0123%
Thời gian giám định : Từ ngày 25/3/2026 đến ngày 30/3/2026.`;
const CERT_NOISY = `CHUNG THU GIAM DINH VE KHOI LUONG
S6:26E04TEST00001-07
Ngay:30/3/2026
Ngupoi xuat khau   : CONG TY TNHH MAU XUAT KHAU
CUM CONG NGHIEP MAU,XA MAU,
THANH PHO DA NANG, VIET NAM
Nguoi mua hang   : SAMPLEWOODCHIP CORPORATION PTELTD
10SAMPLEPLACE,NO.01-01TESTPLAZA1
SINGAPORE000000
Ten hang   : DAM GO KEO
Khoi luong   : 12.345, 67 TAN TU'OI / 6.789,01 TAN KHO
Ten tau   :MVTESTSHIPV.12345AB
-DOAM:45,0123%
Thoi giangiam dinh:Tip ngay25/3/2026den ngay30/3/2026.`;
for (const [name, text] of [
  ['clean Vietnamese', CERT_CLEAN],
  ['noisy OCR (no accents, glued words, stray quotes)', CERT_NOISY],
]) {
  test('certificate ' + name + ': vessel, goods, inspection period, weights are all read', () => {
    const r = Object.fromEntries(D.parse(text, 'certificate').map((x) => [x.key, x.value]));
    assert.equal(r.ship, 'M/V TESTSHIP V.12345AB');
    assert.match(r.product, /^Dăm gỗ keo/);
    assert.equal(r.fromDate, '2026-03-25');
    assert.equal(r.toDate, '2026-03-30');
    assert.equal(r.mt, 12345.67);
    assert.equal(r.bdmt, 6789.01);
    assert.equal(r.moisture, 45.0123);
    assert.equal(r.certNo, '26E04TEST00001-07');
    assert.equal(r.certDate, '2026-03-30');
  });
  test('certificate ' + name + ': both parties and the buyer address are read', () => {
    const p = D.certificateParties([{ page: 1, text }]);
    assert.match(p.deliverId.name, /MAU XUAT KHAU|MẪU XUẤT KHẨU/);
    assert.match(p.receiverId.name, /SAMPLE\s*WOODCHIP/);
    assert.match(p.receiverId.address, /10 SAMPLE PLACE/);
    assert.match(p.receiverId.address, /TEST PLAZA 1/);
    assert.match(p.receiverId.address, /SINGAPORE ?000000$/);
  });
}
test('goods name keeps PEFC / Controlled Sources and restores Vietnamese accents from ASCII OCR', () => {
  assert.equal(X.product('Ten hang : DAM GO KEO LAI PEFC CONTROLLED SOURCES').value, 'Dăm gỗ keo lai PEFC Controlled Sources');
  assert.equal(X.product('Tên hàng : DĂM GỖ KEO').value, 'Dăm gỗ keo');
  assert.equal(X.product('Khoi luong : 12 TAN'), null);
});
test('vessel supports M/V, MV, glued OCR text, and refuses unrelated lines', () => {
  for (const [text, expected] of [
    ['Ten tau : M/V ABC STAR V.2610', 'M/V ABC STAR V.2610'],
    ['Tên tàu: MV ABC STAR V.2610', 'M/V ABC STAR V.2610'],
    ['Ten tau:MVABCSTARV.2610', 'M/V ABCSTAR V.2610'],
  ])
    assert.equal(X.vessel(text).value, expected, text);
  assert.equal(X.vessel('Cang xep hang : DA NANG'), null);
});
test('inspection period: Vietnamese, English, glued and invalid / reversed dates', () => {
  assert.deepEqual(
    [
      X.inspectionPeriod('Thoi gian giam dinh : Tu ngay 5/1/2026 den ngay 9/1/2026.').from,
      X.inspectionPeriod('Thoi gian giam dinh : Tu ngay 5/1/2026 den ngay 9/1/2026.').to,
    ],
    ['2026-01-05', '2026-01-09']
  );
  assert.equal(X.inspectionPeriod('Survey period: from 05/01/2026 to 09/01/2026').to, '2026-01-09');
  assert.equal(X.inspectionPeriod('Tip ngay25/5/2026den ngay30/5/2026').from, '2026-05-25');
  assert.equal(X.inspectionPeriod('Tu ngay 31/02/2026 den ngay 05/03/2026'), null);
  assert.equal(X.inspectionPeriod('Tu ngay 09/03/2026 den ngay 01/03/2026'), null, 'reversed range is rejected');
  assert.equal(X.inspectionPeriod('Ngay yeu cau giam dinh : 25/5/2026'), null, 'a single date is not a period');
});
// ---- Hợp đồng: đơn giá ----
const price = (t) =>
  D.parse(t, 'contract')
    .filter((x) => ['priceUsd', 'currency'].includes(x.key))
    .reduce((a, x) => ((a[x.key] = x.value), a), {});
test('contract price: digits split by OCR, label and amount on separate rows, unit price lines', () => {
  assert.deepEqual(price('Price of Product          USD18 5.50 per bone dry metric ton ("BDMT"), Incoterm 2020 Free'), {
    priceUsd: 185.5,
    currency: 'USD',
  });
  assert.deepEqual(price('Price of Product\nUSD174.00 per bone dry metric ton ("BDMT")'), { priceUsd: 174, currency: 'USD' });
  assert.deepEqual(price('UNIT PRICE .t)iift:USD 173.00/BDMT FOB DA NANG Port, Vietnam'), { priceUsd: 173, currency: 'USD' });
  assert.deepEqual(price('Gia dam go la 173,00 USD/BDMT- FOB, chit xep\nPhi uy thac xuit khau la: 1.40 USD/BDMT'), {
    priceUsd: 173,
    currency: 'USD',
  });
});
test('contract price ignores penalties, demurrage, inspection fees and per-GMT rates', () => {
  const t =
    'USD35/Bdmt shall apply if the shipment is not fully loaded as per\nDemurrage / Despatch : USD10,000 / USD5,000\ninspection at the rate of USD 0.14/GMT with applicable VAT';
  assert.deepEqual(price(t), {});
  assert.equal(price(t + '\nPrice of Product USD176.00 per bone dry metric ton').priceUsd, 176);
});
// ---- Hợp đồng: khối lượng BDMT ----
const qty = (t) => P.extract([{ page: 1, text: t }]).lots.map((l) => l.qty);
test('contract quantity: two lots with OCR errors (letter o for zero, trailing dot, glued BDMT)', () => {
  assert.deepEqual(
    qty(
      'Quantity   : 1) 6,00o BDMT the supply PEFC Controlled Sources (2 holds full\nloading)\n2) 12,000.BDMT the supply NON PEFC\n+/-10% at Buyer option'
    ),
    [6000, 12000]
  );
  assert.deepEqual(
    qty('Quantity                  1) 9,000 BDMT the supply NON PEFC\n2) 9,000 BDMT the supply PEFC Controlled Sources'),
    [9000, 9000]
  );
});
test('contract quantity: single-line, Vietnamese and PO formats; label on the previous row', () => {
  assert.deepEqual(qty("Quantity                  6,000 BDMT (supply PEFC CS) +/-10% at Buyer's option"), [6000]);
  assert.deepEqual(qty('4.1 So luong la: 6.500 BDMT (+/- 20%).'), [6500]);
  assert.deepEqual(qty('QUANTITY .t)iift: 20,000.00BDMT+/-10%'), [20000]);
  assert.deepEqual(qty('Quantity\n: 7,500 BDMT +/-10%'), [7500]);
});
test('contract quantity is not taken from inspection thresholds, formulas or tolerances', () => {
  assert.deepEqual(
    qty(
      'inventory of Product reaches 4,000bdmt,\n9,000bdmt & 13,000bdmt if the shipment is to be loaded on a 3.6 million\nBDMT = A x ( 100 - B) / 100'
    ),
    []
  );
});
test("contract parties carry their address (Address / Buyer's Address / Địa chỉ blocks)", () => {
  const t =
    "Seller:   SAMPLE EXPORT COMPANY LIMITED\nSeller's Address:   LOT 1, TEST VILLAGE\nTEST COMMUNE, DA NANG CITY\nVIETNAM\nTEL: +84 1 2345 (TAX CODE: 0401447476)\nBuyer:   SAMPLE WOODCHIP CORPORATION PTE LTD\nBuyer's Address:   10 SAMPLE PLACE\n#01-01 TEST PLAZA 1\nSINGAPORE 000000\nThe parties have on this day entered";
  const r = P.extract([{ page: 1, text: t }]);
  assert.match(r.parties.buyer.address, /^10 SAMPLE PLACE, #01-01 TEST PLAZA 1, SINGAPORE 000000$/);
  assert.match(r.parties.exporter.address, /LOT 1, TEST VILLAGE/);
});
