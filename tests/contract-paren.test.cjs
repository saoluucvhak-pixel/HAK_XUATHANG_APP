/* A2 — hợp đồng / PO OCR: số dạng ngoặc ở ô khối lượng / đơn giá (quy tắc 28): bộ đọc KHÔNG đọc thành số (cũng không thành số âm) và NGƯỜI DÙNG ĐƯỢC BÁO. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/doc-extract.js');
const CP = require('../app/js/contract-parser.js'),
  D = require('../app/js/document-import.js');
const po = (q, pr) =>
  `PURCHASE ORDER\nDate: 03 February 2026\nPO No.: 12-2026\nSeller: BETA EXPORT COMPANY LIMITED\nBuyer: ALPHA TRADING CO., LTD.\nQuantity: ${q} BDMT\nPrice: US$ ${pr} /BDMT FOB Da Nang\n`;
test('bộ đọc không biến "(1.200)" / "(150)" thành số: không có khối lượng / đơn giá (không âm, không dương)', () => {
  const r = D.parse(po('(1.200)', '(150)'), 'contract');
  assert.equal(
    r.find((x) => x.key === 'qty'),
    undefined
  );
  assert.equal(
    r.find((x) => x.key === 'priceUsd'),
    undefined
  );
  assert.deepEqual(CP.extract([{ page: 1, text: po('(1.200)', '(150)') }]).lots, []);
  assert.equal(D.parse(po('1,200', '150.0'), 'contract').find((x) => x.key === 'qty').value, 1200, 'bản không ngoặc vẫn đọc đúng');
});
test('số dạng ngoặc sát nhãn / đơn vị khối lượng hoặc giá được báo (kể cả tiếng Việt)', () => {
  assert.deepEqual(D.parenNumberNotes(po('(1.200)', '150.0')), ['(1.200)']);
  assert.deepEqual(D.parenNumberNotes(po('1,200', '(150)')), ['(150)']);
  assert.deepEqual(D.parenNumberNotes('Số lượng: (1.200) tấn\nĐơn giá: (150) USD/BDMT'), ['(1.200)', '(150)']);
  assert.deepEqual(D.parenNumberNotes('Thành tiền: ( 1.250.000 ) VND'), ['(1.250.000)']);
});
test('ngoặc thông thường KHÔNG báo nhầm: (6 Holds), (+/-10%), (2026), (V-12), số hiệu', () => {
  const t = 'Quantity: 12,000 BDMT ( +/-10%)\nVessel MV Test Star V-12 ( 6 Holds)\nAgreement No. 2026XY dated (2026)\nĐiều (3) khoản (a)';
  assert.deepEqual(D.parenNumberNotes(t), []);
  assert.deepEqual(D.parenNumberNotes(po('1,200', '150.0')), []);
  assert.deepEqual(D.parenNumberNotes(''), []);
});
