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
