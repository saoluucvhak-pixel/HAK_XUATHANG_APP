/* Quy tắc 29: phiếu KL ≤ 0 (kể cả âm) KHÔNG cộng vào tổng; liệt kê riêng (số phiếu + kg bị loại); các tổng khớp nhau; xe trả về vẫn đúng. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const XLSX = require('../app/libs/xlsx.full.min.js');
global.XLSX = XLSX;
require('../app/js/excel.js');
require('../app/js/generator.js');
const BM = require('../app/js/batch-merge.js');
const HEAD = ['Số phiếu', 'Biển số xe', 'Ngày cân', 'Khối lượng hàng (kg)'];
const book = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD].concat(rows)), 'S');
  return wb;
};
const RIGHT = [
  ['101', '43C-111.11', '05/01/2026', 20000],
  ['102', '43C-222.22', '05/01/2026', 0],
  ['103', '43C-333.33', '05/01/2026', -500],
  ['104', '43C-444.44', '05/01/2026', 21000],
];
test('đọc file: phiếu KL ≤ 0 (0 và âm) bị loại khỏi dòng dữ liệu và tổng; liệt kê riêng kèm số phiếu + kg', () => {
  const ds = HAK.Excel.parseSheet(book(RIGHT), 'S');
  assert.deepEqual(
    ds.rows.map((r) => r.ticket),
    ['101', '104']
  );
  assert.equal(ds.stats.trips, 2);
  assert.equal(ds.stats.kg, 41000);
  assert.deepEqual(
    ds.excluded.map((x) => [x.ticket, x.net]),
    [
      ['102', 0],
      ['103', -500],
    ]
  );
  assert.equal(ds.excludedKg, -500);
  const w = ds.warnings.join('\n');
  assert.match(w, /2 phiếu có KL hàng ≤ 0/);
  assert.match(w, /102/);
  assert.match(w, /103/);
});
test('mọi tổng cùng một số: computeStats ≡ summarize ≡ tổng dòng; bộ lọc/chọn phiếu không đưa phiếu đã loại trở lại', () => {
  const ds = HAK.Excel.parseSheet(book(RIGHT), 'S');
  const sum = HAK.Generator.summarize(HAK.Generator.filterRows(ds.rows, {}));
  assert.equal(sum.trips, 2);
  assert.equal(sum.kg, 41000);
  assert.equal(
    sum.kg,
    ds.rows.reduce((a, r) => a + r.net, 0)
  );
  assert.equal(
    sum.byPlate.reduce((a, p) => a + p.kg, 0),
    sum.kg,
    'tổng theo xe khớp tổng chung'
  );
});
test('xe trả về vẫn tính đúng khi có phiếu bị loại', () => {
  const ds = HAK.Excel.parseSheet(book(RIGHT), 'S');
  const ret = new Set([HAK.Generator.retKey(ds.rows[1])]);
  const keep = ds.rows.filter((r) => !ret.has(HAK.Generator.retKey(r)));
  assert.equal(
    keep.reduce((a, r) => a + r.net, 0),
    20000
  );
});
test('toàn bộ phiếu KL ≤ 0 → báo lỗi nêu số phiếu bị loại (không nuốt)', () => {
  const ds = HAK.Excel.parseSheet(book([['201', '43C-111.11', '05/01/2026', 0]]), 'S');
  assert.equal(ds.rows.length, 0);
  assert.match(ds.errors.join(' '), /1 phiếu có KL ≤ 0/);
});
test('gộp nhiều đợt: danh sách phiếu đã loại của từng đợt được gom lại kèm tên file', () => {
  const a = HAK.Excel.parseSheet(book(RIGHT), 'S'),
    b = HAK.Excel.parseSheet(
      book([
        ['301', '43C-555.55', '06/01/2026', 19000],
        ['302', '43C-666.66', '06/01/2026', 0],
      ]),
      'S'
    );
  const sl = {
    batches: [
      { fileName: 'a.xlsx', ds: a },
      { fileName: 'b.xlsx', ds: b },
    ],
    sel: 0,
  };
  BM.merge(sl);
  assert.equal(sl.ds.stats.kg, 41000 + 19000);
  assert.deepEqual(
    sl.ds.excluded.map((x) => x.file + ':' + x.ticket),
    ['a.xlsx:102', 'a.xlsx:103', 'b.xlsx:302']
  );
});

test('L-05: gộp đợt trùng nội dung: phiếu KL ≤ 0 không bị nhân đôi (dedup bằng omitKey)', () => {
  const a = HAK.Excel.parseSheet(book(RIGHT), 'S'),
    b = HAK.Excel.parseSheet(book(RIGHT), 'S');
  const sl = {
    batches: [
      { fileName: 'a.xlsx', ds: a },
      { fileName: 'b.xlsx', ds: b },
    ],
    sel: 0,
  };
  BM.merge(sl);
  assert.equal(sl.ds.excluded.length, 2, 'không nhân đôi lên 4');
  assert.equal(sl.ds.excludedKg, -500, 'không nhân đôi kg');
});

test('L-05: lưu hồ sơ: hồ sơ lọc theo ngày chỉ giữ phiếu KL ≤ 0 trong khoảng ngày lọc', () => {
  const multiDay = [
    ['101', '43C-111.11', '05/01/2026', 20000],
    ['102', '43C-222.22', '05/01/2026', 0],
    ['201', '43C-333.33', '10/01/2026', 22000],
    ['202', '43C-444.44', '10/01/2026', -300],
  ];
  const ds = HAK.Excel.parseSheet(book(multiDay), 'S');
  assert.equal(ds.excluded.length, 2);
  const filterDay5 = { from: '2026-01-05', to: '2026-01-05' };
  const filterDay10 = { from: '2026-01-10', to: '2026-01-10' };
  const ex5 = HAK.Generator.filterRows(ds.excluded, filterDay5);
  const ex10 = HAK.Generator.filterRows(ds.excluded, filterDay10);
  assert.deepEqual(
    ex5.map((x) => x.ticket),
    ['102']
  );
  assert.deepEqual(
    ex10.map((x) => x.ticket),
    ['202']
  );
});
