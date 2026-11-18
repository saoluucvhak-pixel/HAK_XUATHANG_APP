/* M1 — đối chiếu chéo các bộ đọc số (Excel/NumFmt/Hợp đồng/Tài liệu/Tờ khai/Chứng thư).
 * Đầu vào KHÔNG mơ hồ phải cho cùng một giá trị ở mọi bộ đọc; đầu vào mơ hồ ("1,200") được ghi rõ ở mục chờ xác nhận. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const W = '../app/js/';
require(W + 'excel.js');
require(W + 'numfmt.js');
const CP = require(W + 'contract-parser.js'),
  DI = require(W + 'document-import.js'),
  CU = require(W + 'customs-parser.js'),
  CE = require(W + 'cert-model.js');
const readers = {
  excel: HAK.Excel.util.parseNum,
  numfmt: (v) => HAK.NumFmt.parse(v, 'num'),
  contract: CP.amount,
  documents: DI.number,
  customs: CU.vn,
  cert: CE.num,
};
const SAME = {
  '1.234,56': 1234.56,
  '1,234.56': 1234.56,
  '1.234.567': 1234567,
  '1,234,567': 1234567,
  '1.000.000,5': 1000000.5,
  '27.584.832.000': 27584832000,
  551696640: 551696640,
  '49,9818': 49.9818,
  '12,5': 12.5,
  12.5: 12.5,
  '0,123': 0.123,
  '0.500': 0.5,
  '1.200': 1200,
  0: 0,
};
for (const [input, want] of Object.entries(SAME))
  test(`mọi bộ đọc số cùng đọc "${input}" = ${want}`, () => {
    for (const [name, fn] of Object.entries(readers)) assert.equal(fn(input), want, `${name}("${input}")`);
  });
test('số âm trong ngoặc: bộ đọc nào hiểu ngoặc thì phải cho âm; không bộ nào được trả số dương', () => {
  for (const name of ['excel', 'numfmt', 'customs']) assert.equal(readers[name]('(1.200)'), -1200, name);
  const c = readers.cert('(1.200)');
  assert.ok(c === null || c === -1200, 'cert: null hoặc âm, không được dương');
});
