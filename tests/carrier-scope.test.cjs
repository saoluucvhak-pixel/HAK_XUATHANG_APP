/* Chi tiết theo đơn vị vận chuyển phải dùng ĐÚNG tập phiếu của bảng tổng: kỳ theo ngày cân, phiếu trùng ở hai nguồn, xe trả về. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
const W = require('../app/js/weigh-model.js'),
  R = require('../app/js/report.js');
const row = (n, net, date, extra) =>
  Object.assign(
    { ticket: String(n), dateStr: date, plate: '43C-' + n, time1: '08:00', net, uid: 'f#' + n, idx: n, carrier: 'VT-A' },
    extra
  );
const meta = (id, from, to, extra) =>
  Object.assign(
    {
      id,
      type: 'xuatkhau',
      title: 'HS ' + id,
      ship: 'TÀU',
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
const kgOf = (rows) => rows.reduce((a, x) => a + x.kg, 0);
const noLoad = async () => {
  throw new Error('không được đọc lại hồ sơ khi đã có danh sách phiếu');
};
const detail = (m, tk, key) =>
  R.tripRowsOf(
    m.ships.filter((r) => r.ship === key),
    tk,
    noLoad,
    () => false
  );

test('ca P1: P1 10 tấn 31/12/2025, P2 20 tấn 01/01/2026; lọc 01/2026 theo ngày cân → tổng và chi tiết ĐVVC đều 20 tấn', async () => {
  const { metas, tickets } = setup([
    { meta: meta('A', '31/12/2025', '01/01/2026'), rows: [row(1, 10000, '31/12/2025'), row(2, 20000, '01/01/2026')] },
  ]);
  const m = R.compute(metas, { tickets, basis: 'weigh', from: '2026-01-01', to: '2026-01-31' });
  assert.equal(m.byType.xuatkhau.kg, 20000);
  const rows = await detail(m, tickets, 'TÀU');
  assert.equal(rows.length, 1);
  assert.equal(kgOf(rows), 20000, 'chi tiết vận chuyển khớp bảng tổng (trước khi sửa: 30000)');
  assert.deepEqual(
    R.aggCarrierDaily(rows).byDate.map((d) => d.date),
    ['01/01/2026']
  );
  // đổi kỳ → tập mới
  const m2 = R.compute(metas, { tickets, basis: 'weigh', from: '2025-12-01', to: '2025-12-31' });
  assert.equal(kgOf(await detail(m2, tickets, 'TÀU')), 10000);
});

test('theo ngày bắt đầu hồ sơ: vẫn tính nguyên hồ sơ (cách đọc lịch sử) ở cả tổng và chi tiết', async () => {
  const { metas, tickets } = setup([
    { meta: meta('A', '31/12/2025', '01/01/2026'), rows: [row(1, 10000, '31/12/2025'), row(2, 20000, '01/01/2026')] },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.byType.xuatkhau.kg, 30000);
  assert.equal(kgOf(await detail(m, tickets, 'TÀU')), 30000);
});

test('phiếu trùng ở hai hồ sơ cùng loại: chi tiết chỉ tính một lần, bằng bảng tổng', async () => {
  const A = [row(1, 10000, '05/02/2026'), row(2, 20000, '05/02/2026')],
    B = [row(2, 20000, '05/02/2026'), row(3, 5000, '05/02/2026')];
  const { metas, tickets } = setup([
    { meta: meta('A', '05/02/2026', '05/02/2026'), rows: A },
    { meta: meta('B', '05/02/2026', '05/02/2026', { updatedAt: 2 }), rows: B },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.byType.xuatkhau.kg, 35000);
  const rows = await detail(m, tickets, 'TÀU');
  assert.equal(kgOf(rows), 35000);
  assert.equal(rows.length, 3);
});

test('phiếu ở kho gửi và hồ sơ xuất khẩu: tính ở hồ sơ đích, kho gửi bỏ phiếu trùng', async () => {
  const X = [row(1, 10000, '05/02/2026'), row(2, 20000, '05/02/2026')],
    K = [row(2, 20000, '05/02/2026'), row(9, 7000, '05/02/2026')];
  const { metas, tickets } = setup([
    { meta: meta('X', '05/02/2026', '05/02/2026'), rows: X },
    { meta: meta('K', '05/02/2026', '05/02/2026', { type: 'xuatkhogui' }), rows: K },
  ]);
  const m = R.compute(metas, { tickets });
  const rows = await R.tripRowsOf(m.used, tickets, noLoad, () => false);
  assert.equal(rows.length, 3, 'phiếu 2 chỉ một lần');
  assert.equal(rows.find((r) => r.k.includes('|2|')).t, 'xuatkhau');
});

test('xe trả về: chi tiết ĐVVC đếm xe trả về giống bảng tổng; hồ sơ kho gửi (không có trả về) thì không', async () => {
  const { metas, tickets } = setup([
    { meta: meta('A', '05/02/2026', '05/02/2026'), rows: [row(1, 10000, '05/02/2026'), row(2, 20000, '05/02/2026')], ret: ['f#2'] },
  ]);
  const m = R.compute(metas, { tickets });
  const agg = R.aggCarrierDaily(await detail(m, tickets, 'TÀU')).byCarrier[0];
  assert.equal(agg.retTrips, m.byType.xuatkhau.retTrips);
  assert.equal(agg.retKg, m.byType.xuatkhau.retKg);
  assert.equal(agg.kg - agg.retKg, m.byType.xuatkhau.delKg);
});

test('hồ sơ đã bỏ chọn không có mặt; hồ sơ lỗi đọc (kỳ ngày cân) nằm ở chưa phân bổ, không ở chi tiết', async () => {
  const good = setup([{ meta: meta('A', '05/02/2026', '05/02/2026'), rows: [row(1, 10000, '05/02/2026')] }]);
  const bad = meta('BAD', '06/03/2026', '06/03/2026', { ship: 'TÀU', kg: 30000, trips: 2 });
  const metas = good.metas.concat([bad]);
  const m = R.compute(metas, { tickets: good.tickets, basis: 'weigh', manual: {} });
  assert.equal(kgOf(await detail(m, good.tickets, 'TÀU')), 10000);
  assert.equal(m.unallocated.nUnread, 1);
  const m2 = R.compute(metas, { tickets: good.tickets, basis: 'weigh', manual: { A: false } });
  assert.equal((await detail(m2, good.tickets, 'TÀU')).length, 0);
});

test('hồ sơ chưa có danh sách phiếu (kỳ ngày bắt đầu): đọc nguyên dòng hồ sơ như số tổng', async () => {
  const bad = meta('N', '05/02/2026', '05/02/2026', { kg: 30000, trips: 2 });
  const m = R.compute([bad], { tickets: new Map() });
  const rows = await R.tripRowsOf(
    m.used,
    new Map(),
    async () => ({ rows: [row(1, 10000, '05/02/2026'), row(2, 20000, '05/02/2026')], ret: new Set() }),
    () => false
  );
  assert.equal(kgOf(rows), m.byType.xuatkhau.kg);
});
