/* M1 — khóa nhận diện phiếu: Tổng quan/Tìm kiếm (search.js index) và Báo cáo (weigh-model.js overall) phải cùng kết luận
 * "cùng một lượt cân" trên các ca thực tế: cùng số phiếu khác ngày, cùng phiếu ở hai hình thức, phiếu không số, khác hoa/thường biển số. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/weigh-model.js');
require('../app/js/search.js');
const ts = (d, h) => Date.UTC(2026, 0, d, h, 0);
const row = (o) =>
  Object.assign({ ticket: '', plate: '43C-111.11', dateStr: '05/01/2026', time1: '08:00', ts1: ts(5, 8), net: 20000, note: 'TAU' }, o);
function both(slotRows) {
  HAK.App = { slots: {} };
  const entries = [];
  Object.entries(slotRows).forEach(([type, rows], i) => {
    HAK.App.slots[type] = { ds: { ok: true, rows } };
    entries.push({ rec: { id: 'r' + i, updatedAt: 10 - i }, tickets: HAK.Weigh.ticketsOf(rows, null, { cid: 'c1' }) });
  });
  const idx = HAK.Search.index(),
    ov = HAK.Weigh.overall(entries);
  return { searchTrips: idx.trips.length, searchKg: idx.trips.reduce((a, t) => a + t.kg, 0), overTrips: ov.trips, overKg: ov.kg };
}
const agree = (r) => {
  assert.equal(r.searchTrips, r.overTrips, 'số lượt');
  assert.equal(r.searchKg, r.overKg, 'kg');
};
test('cùng số phiếu khác ngày → hai lượt riêng ở cả hai nơi', () => {
  const r = both({ xuatkhau: [row({ ticket: '101' }), row({ ticket: '101', dateStr: '06/01/2026', ts1: ts(6, 8) })] });
  assert.equal(r.searchTrips, 2);
  agree(r);
});
test('cùng phiếu nạp ở hai hình thức → tính một lần ở cả hai nơi', () => {
  const r = both({ xuatkhau: [row({ ticket: '101' })], uythac: [row({ ticket: '101' })] });
  assert.equal(r.searchTrips, 1);
  agree(r);
});
test('phiếu không số: khác khối lượng là hai lượt, trùng hệt là một lượt', () => {
  const a = both({ xuatkhau: [row({ net: 20000 }), row({ net: 21000 })] });
  assert.equal(a.searchTrips, 2);
  agree(a);
  const b = both({ xuatkhau: [row({})], uythac: [row({})] });
  assert.equal(b.searchTrips, 1);
  agree(b);
});
test('số phiếu 0101 và 101 là hai phiếu khác nhau ở cả hai nơi (giữ số 0 đầu)', () => {
  const r = both({ xuatkhau: [row({ ticket: '0101' }), row({ ticket: '101', plate: '43C-222.22' })] });
  assert.equal(r.searchTrips, 2);
  agree(r);
});
test('biển số khác hoa/thường hoặc khoảng trắng ở hai hình thức: Báo cáo coi là một, Tổng quan cũng phải coi là một', () => {
  const r = both({ xuatkhau: [row({ ticket: '7', plate: '43C-111.11' })], uythac: [row({ ticket: '7', plate: '43c-111.11 ' })] });
  agree(r);
});
test('mục 26: mọi nơi dùng CÙNG một khóa biển số (Excel computeStats, Weigh, Tìm kiếm chung, Danh sách xe)', () => {
  global.HAK.Excel || require('../app/js/excel.js');
  HAK.Store = HAK.Store || { get: () => null, set() {}, remove() {} };
  require('../app/js/vehicles.js');
  const variants = ['43C-111.11', '43c-111.11', ' 43C 11111 ', '43C.111.11', '43c11111', '43Đ-123.45', '43d-12345'];
  const keys = variants.map((v) => HAK.Weigh.plateKey(v));
  assert.equal(new Set(keys.slice(0, 5)).size, 1);
  assert.equal(keys[5], keys[6], 'Đ ≡ D');
  variants.forEach((v) => {
    assert.equal(HAK.Excel.util.plateKey(v), HAK.Weigh.plateKey(v), 'Excel ≡ Weigh: ' + v);
    assert.equal(HAK.Search.key(v), HAK.Weigh.plateKey(v).toLowerCase(), 'Tìm kiếm ≡ Weigh: ' + v);
    assert.equal(HAK.Vehicles.normPlate(v.replace(/[đĐ]/g, 'D')), HAK.Weigh.plateKey(v), 'Danh sách xe: ' + v);
  });
  // computeStats đếm số xe theo khóa chuẩn hóa
  const rows = ['43C-111.11', '43c-111.11', '43C 11111', '51C-222.22'].map((p, i) => ({
    plate: p,
    net: 1000,
    ts1: null,
    ticket: 'T' + i,
    note: '',
  }));
  const st = HAK.Excel.computeStats(rows);
  assert.equal(st.plates, 2);
  assert.equal(st.byPlate.find((x) => HAK.Weigh.plateKey(x.plate) === '43C11111').trips, 3);
});

test('L-06: normPlate trực tiếp giữ chữ Đ -> D không bị rơi chữ', () => {
  assert.equal(HAK.Vehicles.normPlate('43Đ-123.45'), '43D12345');
  assert.equal(HAK.Vehicles.normPlate('43đ-123.45'), '43D12345');
});

test('L-06: Generator.plateRows (Phụ lục theo xe) gom các biến thể biển số thành 1 xe', () => {
  global.HAK.Generator || require('../app/js/generator.js');
  const rows = [
    { plate: '43C-111.11', net: 10000, ts1: 1000 },
    { plate: '43c-111.11', net: 12000, ts1: 2000 },
    { plate: ' 43C 11111 ', net: 15000, ts1: 3000 },
    { plate: '51D-999.99', net: 20000, ts1: 4000 },
  ];
  const pr = HAK.Generator.plateRows(rows);
  assert.equal(pr.length, 2, '2 xe duy nhất, không phải 4 dòng');
  const c111 = pr.find((x) => HAK.Excel.util.plateKey(x.plate) === '43C11111');
  assert.ok(c111);
  assert.equal(c111.trips, '3');
  assert.equal(c111.kg, 37000);
});

test('L-07: duplicateRows nhận diện trùng khi khác hoa/thường hoặc dấu biển số/phiếu', () => {
  global.HAK.Generator || require('../app/js/generator.js');
  const rows = [
    { ticket: 'T1', plate: '43C-111.11', ts1: 1736064000000, time1: '08:00', net: 20000 },
    { ticket: 't1', plate: '43c 11111', ts1: 1736064000000, time1: '08:00', net: 20000 },
  ];
  const dups = HAK.Generator.duplicateRows(rows);
  assert.equal(dups.length, 1, 'nhận diện được 1 nhóm trùng');
  assert.equal(dups[0].rows.length, 2);
});

test('L-07: tương thích ngược: lựa chọn bỏ tay đã lưu bằng khóa cũ vẫn có tác dụng', () => {
  global.HAK.Generator || require('../app/js/generator.js');
  const r = { ticket: 't1', plate: '43c 11111', ts1: 1736064000000, time1: '08:00', net: 20000 };
  const legacyKey = 't1|43c 11111|1736064000000';
  const filter = { omit: [legacyKey] };
  const filtered = HAK.Generator.filterRows([r], filter);
  assert.equal(filtered.length, 0, 'khóa cũ vẫn bỏ được phiếu');
});
