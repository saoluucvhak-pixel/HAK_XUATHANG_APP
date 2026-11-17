/* Dòng trùng hoàn toàn trong cùng một file Excel: phát hiện để chặn nạp (cùng số phiếu + biển số + giờ cân). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/excel.js');
require('../app/js/generator.js');
const G = HAK.Generator;
const row = (idx, ticket, plate, ts, net = 20000) => ({ idx, ticket, plate, ts1: ts, time1: '', net });

test('hai dòng cùng số phiếu, biển số, giờ cân là trùng', () => {
  const d = G.duplicateRows([row(2, 'T1', '43C-1', 1000), row(3, 'T1', '43C-1', 1000), row(4, 'T2', '43C-2', 2000)]);
  assert.equal(d.length, 1);
  assert.deepEqual(
    d[0].rows.map((r) => r.idx),
    [2, 3]
  );
});
test('khác biển số, khác giờ cân hoặc khác số phiếu thì không trùng', () => {
  assert.equal(G.duplicateRows([row(2, 'T1', '43C-1', 1000), row(3, 'T1', '43C-2', 1000)]).length, 0);
  assert.equal(G.duplicateRows([row(2, 'T1', '43C-1', 1000), row(3, 'T1', '43C-1', 2000)]).length, 0);
  assert.equal(G.duplicateRows([row(2, 'T1', '43C-1', 1000), row(3, 'T9', '43C-1', 1000)]).length, 0);
});
test('không có số phiếu: trùng khi cùng biển số, giờ cân và khối lượng; khác khối lượng thì không', () => {
  assert.equal(G.duplicateRows([row(2, '', '43C-1', 1000, 20000), row(3, '', '43C-1', 1000, 20000)]).length, 1);
  assert.equal(G.duplicateRows([row(2, '', '43C-1', 1000, 20000), row(3, '', '43C-1', 1000, 21000)]).length, 0);
});
test('dòng không nhận diện được (không số phiếu, không thời điểm cân) không bị coi là trùng', () => {
  assert.equal(G.duplicateRows([row(2, '', '43C-1', null), row(3, '', '43C-1', null)]).length, 0);
});
test('ba dòng giống hệt tạo một nhóm có 3 dòng', () => {
  const d = G.duplicateRows([row(2, 'T1', 'A', 1), row(3, 'T1', 'A', 1), row(4, 'T1', 'A', 1)]);
  assert.equal(d.length, 1);
  assert.equal(d[0].rows.length, 3);
});
