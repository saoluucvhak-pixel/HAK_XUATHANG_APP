/* 1 ngày chạy 2 tàu: tách phiếu cân trong cùng ngày bằng GIỜ cân và SỐ PHIẾU; hai hồ sơ cùng ngày khác tàu không trùng / không mất phiếu; ghi vào hồ sơ + chi tiết hợp đồng. */
const { test } = require('node:test'), assert = require('node:assert/strict');
global.window = global; global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
require('../app/js/excel.js'); require('../app/js/generator.js'); const G = HAK.Generator; const W = require('../app/js/weigh-model.js'), R = require('../app/js/report.js'), M = require('../app/js/contract-model.js');
const ts = (h, m) => Date.UTC(2026, 10, 12, h, m);                                   // 12/11/2026
const row = (n, h, m, net) => ({ idx: n, uid: 'f#' + n, ticket: 'PC-' + String(n).padStart(6, '0'), plate: '43C-' + n, ts1: ts(h, m), dateStr: '12/11/2026', time1: '12/11/2026 ' + h + ':' + m, net, note: '' });
// ngày 12/11: tàu A cân buổi sáng (phiếu 101–103), tàu B buổi chiều (104–106)
const ROWS = [row(101, 6, 10, 10000), row(102, 8, 30, 11000), row(103, 11, 45, 12000), row(104, 13, 5, 20000), row(105, 15, 40, 21000), row(106, 22, 30, 22000)];
const kg = (rows) => rows.reduce((a, r) => a + r.net, 0);
const f = (extra) => G.filterRows(ROWS, Object.assign({ from: '2026-11-12', to: '2026-11-12' }, extra));
test('trước khi tách: cả ngày 12/11 chỉ lấy được 1 khối (6 phiếu của cả hai tàu)', () => assert.equal(f({}).length, 6));
test('tách theo GIỜ cân: tàu A 00:00–12:30, tàu B 12:31–23:59; hai phần không giao nhau và cộng lại đủ cả ngày', () => {
  const a = f({ timeTo: '12:30' }), b = f({ timeFrom: '12:31' });
  assert.deepEqual(a.map((r) => r.idx), [101, 102, 103]); assert.deepEqual(b.map((r) => r.idx), [104, 105, 106]); assert.equal(kg(a) + kg(b), kg(f({})));
  assert.deepEqual(f({ timeFrom: '08:30', timeTo: '13:05' }).map((r) => r.idx), [102, 103, 104], 'mốc đầu / cuối tính cả (bao gồm)');
});
test('ca qua nửa đêm (giờ từ > giờ đến): 22:00 → 06:30 lấy phiếu 22:30 và 06:10', () => assert.deepEqual(f({ timeFrom: '22:00', timeTo: '06:30' }).map((r) => r.idx), [101, 106]));
test('tách theo SỐ PHIẾU (dãy số cuối): tàu A 101–103, tàu B 104–106; phiếu không có số bị loại khi đã đặt dãy', () => {
  assert.deepEqual(f({ ticketFrom: '101', ticketTo: 'PC-000103' }).map((r) => r.idx), [101, 102, 103]); assert.deepEqual(f({ ticketFrom: '104' }).map((r) => r.idx), [104, 105, 106]);
  assert.equal(G.filterRows([{ idx: 1, ticket: '', ts1: ts(8, 0), net: 1 }], { ticketFrom: '1' }).length, 0);
});
test('giờ sai định dạng bị bỏ qua (không làm mất phiếu); mô tả phạm vi để ghi vào hồ sơ / Excel', () => {
  assert.equal(f({ timeFrom: '25:99', timeTo: 'abc' }).length, 6); assert.equal(G.filterSplitText({}), '');
  assert.equal(G.filterSplitText({ timeFrom: '06:00', timeTo: '12:30' }), 'giờ cân 06:00 → 12:30'); assert.equal(G.filterSplitText({ ticketFrom: '101', ticketTo: '103' }), 'số phiếu 101 → 103'); assert.equal(G.filterSplitText({ timeFrom: '13:00', ticketTo: '9' }), 'giờ cân 13:00 → 23:59 · số phiếu … → 9');
});
test('hai hồ sơ cùng ngày, khác tàu: báo cáo cộng đủ 6 phiếu, không trùng, không xung đột', () => {
  const mk = (id, ship, rows, extra) => Object.assign({ id, type: 'xuatkhau', title: id, ship, giao: 'HAK', nhan: 'ĐN', cid: 'hak', contract: 'ct-' + id, from: '12/11/2026', to: '12/11/2026', trips: rows.length, kg: kg(rows), retKg: 0, retTrips: 0, updatedAt: 1 }, extra);
  const A = f({ timeTo: '12:30' }), B = f({ timeFrom: '12:31' }), tk = new Map();
  const mA = mk('A', 'TÀU A', A), mB = mk('B', 'TÀU B', B, { updatedAt: 2 });
  tk.set('A', W.ticketsOf(A, () => false, mA)); tk.set('B', W.ticketsOf(B, () => false, mB));
  const m = R.compute([mA, mB], { tickets: tk }); assert.equal(m.byType.xuatkhau.trips, 6); assert.equal(m.byType.xuatkhau.kg, kg(ROWS)); assert.deepEqual(m.conflicts, []); assert.equal(m.dupTickets.trips, 0);
});
test('chi tiết hợp đồng (tàu) lưu giờ / số phiếu riêng và giữ khi tạo lại', () => {
  const c = M.parent({ id: 'hd1', type: 'xuatkhau', no: 'HD1', details: [{ id: 'd1', ship: 'TÀU A', fromDate: '2026-11-12', toDate: '2026-11-12', fromTime: '00:00', toTime: '12:30', ticketFrom: '101', ticketTo: '103', filterTrips: true }] });
  const d = c.details[0]; assert.deepEqual([d.fromTime, d.toTime, d.ticketFrom, d.ticketTo, d.filterTrips], ['00:00', '12:30', '101', '103', true]);
  assert.equal(M.child('hd1', JSON.parse(JSON.stringify(d))).toTime, '12:30');
});

test('CHỌN TỪNG PHIẾU (2 tàu cân xen kẽ): hồ sơ chỉ gồm các phiếu đã chọn; phần còn lại thuộc tàu kia; giờ / số phiếu vẫn kết hợp được', () => {
  const K = G.omitKey, mix = [101, 103, 105], shipA = ROWS.filter((r) => mix.includes(r.idx)).map(K);
  const a = f({ pick: shipA }), bPick = ROWS.filter((r) => !mix.includes(r.idx)).map(K), b = f({ pick: bPick });
  assert.deepEqual(a.map((r) => r.idx), [101, 103, 105]); assert.deepEqual(b.map((r) => r.idx), [102, 104, 106]); assert.equal(kg(a) + kg(b), kg(f({})), 'hai tàu cộng lại đủ cả ngày, không trùng, không sót');
  assert.deepEqual(f({ pick: shipA, timeTo: '12:00' }).map((r) => r.idx), [101, 103], 'chọn riêng kết hợp với giờ cân');
  assert.equal(f({ pick: [] }).length, 6, 'danh sách chọn rỗng = không chọn riêng'); assert.equal(G.filterSplitText({ pick: shipA }), 'chỉ 3 phiếu được chọn riêng');
  const mk = (id, rows) => ({ id, type: 'xuatkhau', title: id, ship: 'T' + id, giao: 'HAK', nhan: 'ĐN', cid: 'hak', contract: 'ct-' + id, from: '12/11/2026', to: '12/11/2026', trips: rows.length, kg: kg(rows), retKg: 0, retTrips: 0, updatedAt: id === 'B' ? 2 : 1 });
  const mA = mk('A', a), mB = mk('B', b), tk = new Map([['A', W.ticketsOf(a, () => false, mA)], ['B', W.ticketsOf(b, () => false, mB)]]);
  const m = R.compute([mA, mB], { tickets: tk }); assert.equal(m.byType.xuatkhau.trips, 6); assert.deepEqual(m.conflicts, []); assert.equal(m.dupTickets.trips, 0);
});
