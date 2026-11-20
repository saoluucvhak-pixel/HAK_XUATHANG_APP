const { test } = require('node:test'),
  assert = require('node:assert/strict');

global.window = global;
global.HAK = {};
require('../app/js/util.js');
require('../app/js/config.js');
require('../app/js/excel.js');
require('../app/js/generator.js');

test('L-20: dải ngày cân vượt qua 2 tháng (28/11 - 02/12) sinh cảnh báo dải ngày trải qua nhiều tháng', () => {
  const ts = (y, m, d) => Date.UTC(y, m - 1, d, 8, 0);
  const rows = [
    { idx: 1, ticket: '101', plate: '43C-111.11', dateStr: '28/11/2026', time1: '08:00', ts1: ts(2026, 11, 28), net: 20000 },
    { idx: 2, ticket: '102', plate: '43C-222.22', dateStr: '02/12/2026', time1: '08:00', ts1: ts(2026, 12, 2), net: 21000 },
  ];
  const ds = {
    ok: true,
    rows,
    meta: { fileName: 'test.xlsx' },
    stats: HAK.Excel.computeStats(rows),
  };
  const params = {
    giaoId: 'hak',
    nhanId: 'dn',
    khoGiaoId: 'k1',
    khoNhanId: 'k2',
    filter: {},
  };
  // Thử build guikho
  const res = HAK.Generator.build('guikho', ds, params);
  assert.ok(
    res.warnings.some((w) => /trải qua nhiều tháng|vượt quá 1 tháng|nhiều tháng/i.test(w)),
    'phải có cảnh báo khi dải ngày vượt quá 1 tháng'
  );
});
