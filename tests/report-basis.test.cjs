/* Kỳ báo cáo: theo ngày BẮT ĐẦU hồ sơ (mặc định, cách đọc cũ) hay theo NGÀY CÂN từng phiếu (phân bổ qua tháng / năm; ranh giới 31/12 và 01/01). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
const W = require('../app/js/weigh-model.js'),
  R = require('../app/js/report.js');
const row = (n, net, date, extra) =>
  Object.assign({ ticket: String(n), dateStr: date, plate: '43C-' + n, time1: '08:00', net, uid: 'f#' + n, idx: n }, extra);
const meta = (id, from, to, extra) =>
  Object.assign(
    {
      id,
      type: 'xuatkhau',
      title: 'HS ' + id,
      ship: 'TÀU',
      giao: 'HAK',
      nhan: 'ĐN',
      cid: 'hak',
      contract: 'c1',
      from,
      to,
      kg: 0,
      trips: 0,
      retKg: 0,
      retTrips: 0,
      updatedAt: 1,
    },
    extra
  );
function setup(list) {
  const tk = new Map(),
    metas = list.map(({ meta: m, rows, ret = [] }) => {
      const rs = new Set(ret);
      m.trips = rows.length;
      m.kg = rows.reduce((a, r) => a + r.net, 0);
      m.retTrips = rows.filter((r) => rs.has(r.uid)).length;
      m.retKg = rows.filter((r) => rs.has(r.uid)).reduce((a, r) => a + r.net, 0);
      tk.set(
        m.id,
        W.ticketsOf(rows, (r) => rs.has(r.uid), m)
      );
      return m;
    });
  return { metas, tickets: tk };
}
const ROWS = () => [row(1, 10000, '30/12/2026'), row(2, 20000, '31/12/2026'), row(3, 5000, '01/01/2027'), row(4, 3000, '02/01/2027')];
const mk = () => setup([{ meta: meta('A', '30/12/2026', '02/01/2027'), rows: ROWS() }]);

test('theo ngày BẮT ĐẦU hồ sơ (mặc định): cả hồ sơ thuộc 12/2026 và năm 2026 — cách đọc của báo cáo lịch sử không đổi', () => {
  const { metas, tickets } = mk(),
    m = R.compute(metas, { tickets });
  assert.equal(m.basis, 'start');
  assert.deepEqual(
    m.months.map(([k, v]) => [k, v.xuatkhau]),
    [['2026-12', 38000]]
  );
  assert.deepEqual(
    m.years.map(([k, v]) => [k, v.xuatkhau]),
    [['2026', 38000]]
  );
  assert.equal(
    R.compute(metas, { tickets, from: '2027-01-01', to: '2027-01-31' }).used.length,
    0,
    'lọc 01/2027 theo ngày bắt đầu: hồ sơ bắt đầu 30/12 không vào'
  );
  assert.equal(R.compute(metas, {}).basis, 'start', 'không có danh sách phiếu → luôn theo ngày bắt đầu');
});
test('theo NGÀY CÂN: phân bổ từng phiếu — 31/12/2026 về tháng 12 / năm 2026, 01/01/2027 về tháng 01 / năm 2027', () => {
  const { metas, tickets } = mk(),
    m = R.compute(metas, { tickets, basis: 'weigh' });
  assert.equal(m.basis, 'weigh');
  assert.deepEqual(
    m.months.map(([k, v]) => [k, v.xuatkhau]),
    [
      ['2026-12', 30000],
      ['2027-01', 8000],
    ]
  );
  assert.deepEqual(
    m.years.map(([k, v]) => [k, v.xuatkhau]),
    [
      ['2026', 30000],
      ['2027', 8000],
    ]
  );
  assert.equal(m.byType.xuatkhau.trips, 4);
  assert.equal(m.byType.xuatkhau.kg, 38000);
});
test('ranh giới năm: lọc đúng 31/12/2026 chỉ lấy phiếu 31/12; lọc 01/01/2027 chỉ lấy phiếu 01/01; lọc cả tháng 01/2027 lấy 01/01 + 02/01', () => {
  const { metas, tickets } = mk(),
    c = (from, to) => R.compute(metas, { tickets, basis: 'weigh', from, to });
  assert.equal(c('2026-12-31', '2026-12-31').byType.xuatkhau.kg, 20000);
  assert.equal(c('2026-12-31', '2026-12-31').byType.xuatkhau.trips, 1);
  assert.equal(c('2027-01-01', '2027-01-01').byType.xuatkhau.kg, 5000);
  const jan = c('2027-01-01', '2027-01-31');
  assert.equal(jan.byType.xuatkhau.kg, 8000);
  assert.equal(jan.used.length, 1, 'hồ sơ vẫn được tính (có phiếu trong kỳ) dù bắt đầu từ 30/12');
  assert.equal(c('2025-01-01', '2025-12-31').used.length, 0);
});
test('xe trả về và hồ sơ chồng nhau (P2 trùng ở ranh giới 31/12) vẫn đúng khi tính theo ngày cân', () => {
  const A = [row(1, 10000, '30/12/2026'), row(2, 20000, '31/12/2026')],
    B = [row(2, 20000, '31/12/2026'), row(3, 5000, '01/01/2027', { uid: 'f#3' })];
  const { metas, tickets } = setup([
    { meta: meta('A', '30/12/2026', '31/12/2026', { type: 'uythac' }), rows: A },
    { meta: meta('B', '31/12/2026', '01/01/2027', { type: 'uythac', updatedAt: 2 }), rows: B, ret: ['f#3'] },
  ]);
  const m = R.compute(metas, { tickets, basis: 'weigh' });
  assert.equal(m.byType.uythac.trips, 3);
  assert.equal(m.byType.uythac.kg, 35000, 'P2 trùng chỉ tính một lần');
  assert.equal(m.byType.uythac.retKg, 5000);
  assert.equal(m.byType.uythac.delKg, 30000);
  assert.deepEqual(
    m.months.map(([k, v]) => [k, v.uythac]),
    [
      ['2026-12', 30000],
      ['2027-01', 0],
    ],
    'phiếu trả về 01/01 không tính vào thực giao'
  );
});
test('chi tiết chuyến xe (xhTrips) khớp tổng khi tính theo ngày cân: bỏ đúng các phiếu ngoài kỳ', async () => {
  const { metas, tickets } = mk();
  global.HAK.Generator = { filterRows: (r) => r, retKey: (r) => r.uid };
  global.HAK.Archive = { load: async () => ({ params: {}, rows: ROWS() }) };
  const m = R.compute(metas, { tickets, basis: 'weigh', from: '2026-12-31', to: '2027-01-01' }),
    lot = R.xhLots(m.used, {}).lots.find((L) => L.recs.length);
  const trips = await R.xhTrips([lot]);
  assert.deepEqual(
    trips.map((t) => t.row.ticket),
    ['2', '3']
  );
  assert.equal(
    trips.reduce((a, t) => a + t.row.net, 0),
    lot.kg
  );
  assert.equal(lot.kg, 25000);
});
test('phiếu thiếu ngày cân dùng ngày bắt đầu hồ sơ; hồ sơ không đọc được phiếu lùi về ngày bắt đầu', () => {
  const rows = [row(1, 1000, ''), row(2, 2000, '05/01/2027')];
  const { metas, tickets } = setup([
    { meta: meta('A', '30/12/2026', '05/01/2027'), rows },
    { meta: meta('B', '10/01/2027', '11/01/2027', { kg: 7000, trips: 1 }), rows: [] },
  ]);
  tickets.delete('B');
  const m = R.compute(metas, { tickets, basis: 'weigh' });
  assert.deepEqual(
    m.months.map(([k, v]) => [k, v.xuatkhau]),
    [
      ['2026-12', 1000],
      ['2027-01', 2000],
    ],
    'hồ sơ B không có phiếu nên không nằm trong months (chỉ trong used khi không lọc ngày)'
  );
});
