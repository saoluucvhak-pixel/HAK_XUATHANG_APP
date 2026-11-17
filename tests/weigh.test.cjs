/* Đối soát phiếu cân giữa các hồ sơ: trùng ở cấp phiếu, xung đột, phạm vi công ty, hồ sơ cũ thiếu mã, tổng thực giao. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
const W = require('../app/js/weigh-model.js'),
  R = require('../app/js/report.js');
const row = (ticket, net, extra = {}) =>
  Object.assign(
    { ticket, dateStr: '02/10/2026', plate: '43C-' + ticket, time1: '08:00', net, uid: 'f#' + ticket, idx: +ticket || 0 },
    extra
  );
const meta = (id, extra = {}) =>
  Object.assign(
    {
      id,
      type: 'xuatkhau',
      title: 'Hồ sơ ' + id,
      ship: 'ĐẠI DƯƠNG',
      giao: 'HAK',
      nhan: 'ĐN',
      cid: 'hak',
      contract: 'c1',
      from: '01/10/2026',
      to: '03/10/2026',
      kg: 0,
      trips: 0,
      retKg: 0,
      retTrips: 0,
      updatedAt: 1,
    },
    extra
  );
const withTotals = (m, rows, ret) => Object.assign(m, { trips: rows.length, kg: rows.reduce((a, r) => a + r.net, 0) });
function setup(list) {
  // list: [{meta, rows, ret?:[uid]}]
  const tk = new Map(),
    metas = list.map(({ meta: m, rows, ret = [] }) => {
      const rs = new Set(ret);
      withTotals(m, rows);
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

test('ca nghiệm thu: A{P1,P2} + B{P2,P3}, P2 khớp → đủ 3 phiếu, không trùng', () => {
  const { metas, tickets } = setup([
    { meta: meta('A', { updatedAt: 1 }), rows: [row('1', 10000), row('2', 11000)] },
    { meta: meta('B', { updatedAt: 2 }), rows: [row('2', 11000), row('3', 12000)] },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.used.length, 2, 'cả hai hồ sơ được giữ (không loại nguyên hồ sơ cũ)');
  assert.equal(m.byType.xuatkhau.trips, 3);
  assert.equal(m.byType.xuatkhau.kg, 33000);
  assert.equal(m.byType.xuatkhau.delKg, 33000);
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.dupTickets.trips, 1);
  assert.equal(m.dupTickets.kg, 11000);
  assert.equal(m.pendingKg, 0);
  // trước khi sửa: hồ sơ cũ bị loại cả bản → chỉ 2 phiếu (mất P1); nếu cộng cả hai → 4 phiếu (trùng P2)
  const legacy = R.compute(metas, {});
  assert.equal(legacy.byType.xuatkhau.trips, 2);
});
test('P2 khác khối lượng → xung đột, liệt kê hồ sơ nguồn, tổng chờ đối soát', () => {
  const { metas, tickets } = setup([
    { meta: meta('A', { updatedAt: 1 }), rows: [row('1', 10000), row('2', 11000)] },
    { meta: meta('B', { updatedAt: 2 }), rows: [row('2', 11500), row('3', 12000)] },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.conflicts.length, 1);
  const c = m.conflicts[0];
  assert.deepEqual(c.fields, ['khối lượng']);
  assert.deepEqual([c.counted.rec.id].concat(c.others.map((o) => o.rec.id)).sort(), ['A', 'B']);
  assert.equal(c.counted.rec.id, 'B');
  assert.equal(m.pendingKg, 11500);
  assert.equal(m.byType.xuatkhau.trips, 3);
  assert.equal(m.byType.xuatkhau.kg, 10000 + 11500 + 12000);
});
test('P2 khác cờ xe trả về → xung đột; thực giao tạm tính theo hồ sơ mới nhất', () => {
  const { metas, tickets } = setup([
    { meta: meta('A', { type: 'uythac' }), rows: [row('1', 10000), row('2', 11000)], ret: ['f#2'] },
    { meta: meta('B', { type: 'uythac', updatedAt: 2 }), rows: [row('2', 11000), row('3', 12000)] },
  ]);
  const m = R.compute(metas, { tickets });
  assert.deepEqual(
    m.conflicts.map((c) => c.fields),
    [['xe trả về']]
  );
  assert.equal(m.byType.uythac.retKg, 0);
  assert.equal(m.byType.uythac.delKg, 33000);
});
test('P2 gắn khác hợp đồng / khác tàu → xung đột liên kết', () => {
  const { metas, tickets } = setup([
    { meta: meta('A', { contract: 'c1' }), rows: [row('1', 10000), row('2', 11000)] },
    { meta: meta('B', { contract: 'c2', updatedAt: 2 }), rows: [row('2', 11000)] },
  ]);
  assert.deepEqual(
    R.compute(metas, { tickets }).conflicts.map((c) => c.fields),
    [['liên kết hợp đồng / tàu']]
  );
});
test('phạm vi công ty: cùng số phiếu ở hai công ty không bị coi là trùng', () => {
  const { metas, tickets } = setup([
    { meta: meta('A', { cid: 'hak' }), rows: [row('1', 10000)] },
    { meta: meta('B', { cid: 'dh', updatedAt: 2 }), rows: [row('1', 10000)] },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.byType.xuatkhau.trips, 2);
  assert.equal(m.dupTickets.trips, 0);
});
test('hồ sơ cũ thiếu mã / phiếu thiếu số: nhận diện bằng giờ cân + biển số; không nhận diện được thì luôn tính', () => {
  const a = [row('', 8000, { time1: '07:00', plate: '43C-111' }), row('', 9000, { time1: '', plate: '' })];
  const b = [row('', 8000, { time1: '07:00', plate: '43C-111' }), row('', 9000, { time1: '', plate: '' })];
  const { metas, tickets } = setup([
    { meta: meta('A'), rows: a },
    { meta: meta('B', { updatedAt: 2 }), rows: b },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.byType.xuatkhau.trips, 3, 'xe nhận diện được tính 1 lần, 2 dòng không nhận diện giữ nguyên');
  assert.equal(m.dupTickets.trips, 1);
});
test('khối lượng lẻ và số phiếu dùng chung nhiều xe trong cùng 1 hồ sơ không bị gộp', () => {
  const shared = [row('9', 12345.678, { plate: 'A' }), row('9', 12345.678, { plate: 'A' })];
  const { metas, tickets } = setup([
    { meta: meta('A'), rows: shared },
    { meta: meta('B', { updatedAt: 2 }), rows: [row('9', 12345.678, { plate: 'A' })] },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.byType.xuatkhau.trips, 2);
  assert.equal(Math.round(m.byType.xuatkhau.kg * 1000), 24691356);
});
test('hai hồ sơ cùng tàu nhưng khác công ty hoặc khác chi tiết hợp đồng giữ cả hai (không có danh sách phiếu → chống trùng nguyên hồ sơ vẫn xét công ty + hợp đồng)', () => {
  const base = {
    type: 'xuatkhau',
    ship: 'ĐẠI DƯƠNG',
    giao: 'HAK',
    nhan: 'ĐN',
    from: '01/10/2026',
    to: '02/10/2026',
    kg: 5000,
    trips: 1,
    retKg: 0,
    retTrips: 0,
  };
  assert.equal(
    R.compute(
      [
        { id: 'a', ...base, cid: 'hak', updatedAt: 1 },
        { id: 'b', ...base, cid: 'dh', updatedAt: 2 },
      ],
      {}
    ).used.length,
    2,
    'khác công ty'
  );
  assert.equal(
    R.compute(
      [
        { id: 'a', ...base, contract: 'ct1', updatedAt: 1 },
        { id: 'b', ...base, contract: 'ct2', updatedAt: 2 },
      ],
      {}
    ).used.length,
    2,
    'khác chi tiết hợp đồng'
  );
  assert.equal(
    R.compute(
      [
        { id: 'a', ...base, contract: 'ct1', updatedAt: 1 },
        { id: 'b', ...base, contract: 'ct1', updatedAt: 2 },
      ],
      {}
    ).used.length,
    1,
    'cùng nhóm → giữ bản mới nhất như cũ'
  );
});
test('Xuất kho gửi → Xuất khẩu: mỗi nghiệp vụ tính đủ, tổng thực giao loại trùng giữa các loại', () => {
  const rows = [row('1', 10000), row('2', 11000)];
  const { metas, tickets } = setup([
    { meta: meta('G', { type: 'xuatkhogui', ship: '', contract: '' }), rows },
    { meta: meta('X', { type: 'xuatkhau', updatedAt: 2 }), rows },
  ]);
  const m = R.compute(metas, { tickets });
  assert.equal(m.byType.xuatkhogui.kg, 21000);
  assert.equal(m.byType.xuatkhau.kg, 21000);
  assert.equal(m.overall.kg, 21000);
  assert.equal(m.overall.sharedTrips, 2);
  assert.equal(m.overall.sharedKg, 21000);
});
test('xhTrips bỏ đúng phiếu trùng → dòng chi tiết khớp tổng của lô; số BKLS không lệch', async () => {
  const A = [row('1', 10000), row('2', 11000)],
    B = [row('2', 11000), row('3', 12000)];
  const { metas, tickets } = setup([
    { meta: meta('A'), rows: A },
    { meta: meta('B', { updatedAt: 2 }), rows: B },
  ]);
  global.HAK.Generator = { filterRows: (r) => r, retKey: (r) => r.uid };
  global.HAK.Archive = { load: async (id) => ({ params: {}, rows: id === 'A' ? A : B }) };
  const m = R.compute(metas, { tickets }),
    lot = R.xhLots(m.used, {}).lots.find((L) => L.recs.length);
  const trips = await R.xhTrips([lot]);
  assert.equal(trips.length, 3);
  assert.equal(
    trips.reduce((a, t) => a + t.row.net, 0),
    lot.kg
  );
  assert.equal(lot.trips, 3);
});
test('prepareTickets chỉ đọc hồ sơ trong cụm giao nhau, dùng lại bộ nhớ đệm', async () => {
  const A = [row('1', 1000)],
    loads = [];
  global.HAK.Generator = { filterRows: (r) => r, retKey: (r) => r.uid };
  global.HAK.Archive = {
    load: async (id) => {
      loads.push(id);
      return { params: {}, rows: A };
    },
  };
  const metas = [meta('A'), meta('B', { updatedAt: 2 }), meta('C', { from: '20/11/2026', to: '21/11/2026' })],
    cache = new Map();
  const t = await R.prepareTickets(metas, cache);
  assert.deepEqual(Array.from(t.keys()).sort(), ['A', 'B']);
  assert.deepEqual(loads.sort(), ['A', 'B']);
  await R.prepareTickets(metas, cache);
  assert.equal(loads.length, 2);
});
