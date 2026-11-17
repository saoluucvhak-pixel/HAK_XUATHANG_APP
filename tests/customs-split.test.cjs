/* Tách customs.js thành các mô-đun con: API HAK.Customs giữ nguyên, thứ tự nạp script đúng, mô-đun con chỉ gọi nhau qua các đối tượng đã khai báo. */
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const APP = path.join(__dirname, '../app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script[^>]*\ssrc="(js\/[^"]+)"/g)].map((m) => m[1]);
const idx = (f) => order.indexOf('js/' + f);
// API công khai của HAK.Customs trước khi tách (v2.21.2) — không được mất tên nào
const API = [
  'activeDecls',
  'bindExec',
  'contractBadge',
  'contractPdfSpec',
  'contractReportModel',
  'customsPdfSpec',
  'detailCells',
  'draw',
  'drawContractReport',
  'drawReport',
  'ensureDetail',
  'execPicker',
  'exportContractReport',
  'exportReport',
  'findByNo',
  'importFiles',
  'initReport',
  'link',
  'openModal',
  'pdfReport',
  'printReport',
  'render',
  'suggestLink',
];
function load() {
  global.window = global;
  global.HAK = { UI: { esc: (s) => String(s), toast() {} }, VERSION: 'x' };
  global.document = {
    title: '',
    body: { classList: { add() {}, remove() {} } },
    head: {},
    createElement: () => ({}),
    querySelector: () => null,
    getElementById: () => null,
    addEventListener() {},
  };
  const files = [
    'customs-common',
    'customs-report',
    'customs-contract-report',
    'customs-export',
    'customs-print',
    'customs',
    'customs-receipt',
    'customs-import',
  ];
  files.forEach((f) => {
    delete require.cache[require.resolve('../app/js/' + f + '.js')];
    require('../app/js/' + f + '.js');
  });
  return global.HAK;
}
test('HAK.Customs giữ đủ API công khai sau khi tách (printReport, contractReportModel, importFiles…)', () => {
  const H = load();
  assert.deepEqual(Object.keys(H.Customs).sort(), API.slice().sort());
  API.forEach((k) => assert.equal(typeof H.Customs[k], 'function', 'HAK.Customs.' + k));
});
test('mô-đun con công bố đúng các hàm mà nơi khác dùng', () => {
  const H = load();
  assert.deepEqual(Object.keys(H.CustomsReport).sort(), ['csRepView', 'drawReport', 'reportList']);
  assert.deepEqual(Object.keys(H.CustomsExport).sort(), ['exportContractReport', 'exportReport']);
  assert.deepEqual(Object.keys(H.CustomsPrint).sort(), ['contractPdfSpec', 'customsPdfSpec', 'pdfReport', 'printReport']);
  assert.deepEqual(Object.keys(H.CustomsImport).sort(), ['importFiles', 'importSupp', 'ocrDecl', 'ocrReceipt']);
  assert.deepEqual(Object.keys(H.CustomsReceipt), ['openReceiptReview']);
  ['commit', 'openDecl', 'openSupp', 'upsertInto', 'suggestLink', 'draw', 'openModal', 'st'].forEach((k) =>
    assert.ok(k in H.CustomsCore, 'CustomsCore.' + k)
  );
});
test('thứ tự nạp trong index.html: common → báo cáo → xuất → in → customs.js → duyệt giấy → nhập; mô hình và bộ đọc nạp trước tất cả', () => {
  const seq = [
    'customs-model',
    'customs-parser',
    'customs-common',
    'customs-report',
    'customs-contract-report',
    'customs-export',
    'customs-print',
    'customs',
    'customs-receipt',
    'customs-import',
  ];
  seq.forEach((f) => assert.ok(idx(f + '.js') >= 0, 'thiếu ' + f));
  for (let i = 1; i < seq.length; i++) assert.ok(idx(seq[i - 1] + '.js') < idx(seq[i] + '.js'), seq[i - 1] + ' phải nạp trước ' + seq[i]);
  // nơi gọi HAK.Customs.* ở mức nạp phải nằm sau customs.js
  ['contract-status.js', 'contract-file.js', 'contract-overview.js'].forEach((f) =>
    assert.ok(idx(f) > idx('customs.js'), f + ' nạp sau customs.js')
  );
});
test('mô-đun con không còn nằm lại trong customs.js: các hàm đã tách chỉ là lối vào mỏng', () => {
  const s = fs.readFileSync(path.join(APP, 'js/customs.js'), 'utf8');
  [
    'function printReport',
    'function contractReportModel',
    'async function exportReport',
    'function openReceiptReview',
    'async function importFiles',
  ].forEach((t) => assert.ok(!s.includes(t), 'customs.js không được chứa lại ' + t));
  assert.ok(s.split('\n').length < 1700, 'customs.js đã nhỏ lại (<1.700 dòng)');
});
