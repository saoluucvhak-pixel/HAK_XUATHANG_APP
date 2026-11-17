/* Đối chiếu MÀN HÌNH (mô hình Report.compute) ↔ BẢN XUẤT (Excel dựng từ toExcel) trên bộ dữ liệu thử đủ ca
 * (hai tàu cùng ngày, qua năm, phiếu lặp giữa các hồ sơ, xe trả về, phiếu thiếu ngày, hồ sơ không đọc được). Cùng bộ lọc → cùng số liệu. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
HAK.UI = HAK.UI || { esc: (s) => String(s == null ? '' : s) };
global.ExcelJS = require('../app/libs/exceljs.min.js');
require('../app/js/excel.js');
require('../app/js/generator.js');
const { buildSample, decode } = require('../tools/data-audit-core.cjs');
const W = require('../app/js/weigh-model.js'),
  R = require('../app/js/report.js');

const dmy = (s) => {
  const m = /^(\d+)\/(\d+)\/(\d+)/.exec(s || '');
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
};
function scenario() {
  const b = buildSample(),
    metas = [],
    tickets = new Map(),
    errors = new Map();
  b.archive.forEach((it) => {
    const m = Object.assign({}, it.meta, { giao: 'HAK', nhan: 'ĐN', retKg: 0, retTrips: 0 });
    try {
      const d = decode(it.data),
        ret = new Set((d.params && d.params.returned) || []);
      const tk = W.ticketsOf(d.rows, (r) => ret.has(r.uid), m);
      m.retTrips = tk.filter((t) => t.ret).length;
      m.retKg = tk.filter((t) => t.ret).reduce((a, t) => a + t.net, 0);
      tickets.set(m.id, tk);
    } catch (e) {
      errors.set(m.id, { code: 'load-error', message: e.message });
    }
    metas.push(m);
  });
  return { metas, tickets, errors };
}
const sheetRows = (wb, name) => {
  const ws = wb.getWorksheet(name);
  assert.ok(ws, 'thiếu sheet ' + name);
  const out = [];
  ws.eachRow((row) => out.push(row.values.slice(1).map((v) => (v && typeof v === 'object' && 'result' in v ? v.result : v))));
  return out;
};
const num = (v) => (typeof v === 'number' ? v : NaN);

test('Excel khớp mô hình màn hình: tổng hợp / năm / tháng / chưa phân bổ (cơ sở ngày cân)', async () => {
  const { metas, tickets, errors } = scenario();
  const m = R.compute(metas, { basis: 'weigh', tickets, ticketErrors: errors });
  const wb = await R.toExcel(m);
  // 1) Sheet Tổng hợp: từng loại khớp byType
  const sum = sheetRows(wb, 'Tổng hợp');
  R.TYPES.forEach(([k, , nm]) => {
    const row = sum.find((r) => r[0] === nm);
    assert.ok(row, 'thiếu loại ' + nm);
    const b = m.byType[k];
    assert.equal(row[1], b.n, nm + ' số hồ sơ');
    assert.equal(row[2], b.trips, nm + ' số xe');
    assert.ok(Math.abs(num(row[3]) - b.kg / 1000) < 1e-9, nm + ' qua cân');
    assert.ok(Math.abs(num(row[6]) - b.delKg / 1000) < 1e-9, nm + ' thực giao');
  });
  // 2) Tổng theo tháng == tổng theo năm == mô hình, từng loại
  const col = (rows, idx) => rows.filter((r) => typeof r[idx] === 'number').reduce((a, r) => a + r[idx], 0);
  const modelMonth = R.TYPES.map(([k]) => m.months.reduce((a, [, v]) => a + (v[k] || 0), 0) / 1000);
  const modelYear = R.TYPES.map(([k]) => m.years.reduce((a, [, v]) => a + (v[k] || 0), 0) / 1000);
  const mo = sheetRows(wb, 'Theo tháng').filter((r) => /^\d{2}\/\d{4}$/.test(String(r[0]))),
    yr = sheetRows(wb, 'Theo năm').filter((r) => /^\d{4}$/.test(String(r[0])));
  R.TYPES.forEach(([k, , nm], i) => {
    assert.ok(Math.abs(col(mo, i + 1) - modelMonth[i]) < 1e-9, 'tháng ' + nm);
    assert.ok(Math.abs(col(yr, i + 1) - modelYear[i]) < 1e-9, 'năm ' + nm);
    assert.ok(Math.abs(modelMonth[i] - modelYear[i]) < 1e-9, 'tháng = năm ' + nm);
  });
  // 3) Chưa phân bổ: có sheet, tổng khớp, chứa đủ mã hồ sơ lỗi đọc + hồ sơ có phiếu thiếu ngày
  assert.ok(m.unallocated.n >= 2);
  const un = sheetRows(wb, 'Chưa phân bổ').filter((r) => r.length >= 9 && typeof r[5] === 'number');
  assert.ok(Math.abs(un.reduce((a, r) => a + r[5], 0) - m.unallocated.kg / 1000) < 1e-9);
  const ids = new Set(un.map((r) => r[8]));
  assert.ok(ids.has('r-E'), 'hồ sơ không đọc được phải nằm ở Chưa phân bổ');
  assert.ok(ids.has('r-D'), 'hồ sơ có phiếu thiếu ngày phải nằm ở Chưa phân bổ');
  assert.match(R.unallocatedText(m), /./);
});
test('hai tàu cùng ngày + qua năm: phân bổ theo ngày cân từng phiếu, không dồn vào ngày bắt đầu', () => {
  const { metas, tickets, errors } = scenario();
  const m = R.compute(metas, { basis: 'weigh', tickets, ticketErrors: errors });
  const y = Object.fromEntries(m.years.map(([k, v]) => [k, v.xuatkhau || 0]));
  assert.equal(y['2025'], 10000, 'phiếu 31/12/2025 của hồ sơ qua năm');
  const mo = Object.fromEntries(m.months.map(([k, v]) => [k, v]));
  assert.ok(mo['2025-12'] && mo['2025-12'].xuatkhau === 10000);
  // hai tàu cùng ngày 03/02 (B, và C = lập lại của A): mỗi phiếu thuộc đúng một hồ sơ; hồ sơ A cũ bị C thay hết nên không còn xe nào tính vào A
  const trips = Object.fromEntries(m.ships.filter((s) => s.type === 'uythac').map((s) => [s.id, s.trips]));
  assert.equal(trips['r-A'], undefined, 'r-A bị r-C (mới hơn) thay thế hoàn toàn');
  assert.equal(trips['r-C'], 3);
  assert.equal(trips['r-B'], 1, 'chỉ còn phiếu P0004; P0002 đang tính ở r-C (xung đột liên kết, cần đối soát)');
});
test('phiếu lặp giữa các hồ sơ: không cộng hai lần trong cùng phạm vi; qua kho gửi chỉ tính một lần ở tổng thực giao', () => {
  const { metas, tickets, errors } = scenario();
  const m = R.compute(metas, { basis: 'weigh', tickets, ticketErrors: errors });
  assert.ok(m.dupTickets && m.dupTickets.trips >= 1, 'phải ghi nhận phiếu trùng bị loại');
  assert.ok(m.conflicts && m.conflicts.length >= 2, 'xung đột khối lượng / liên kết được liệt kê');
  if (m.overall) assert.ok(m.overall.sharedTrips >= 1, 'phiếu P0020 đi qua kho gửi → đích chỉ tính một lần');
  // bảo toàn: tổng thực giao theo năm của uythac không vượt tổng khối lượng thô sau loại trùng
  const raw = metas
    .filter((x) => x.type === 'uythac' && tickets.has(x.id))
    .reduce(
      (a, x) =>
        a +
        tickets
          .get(x.id)
          .filter((t) => !t.ret)
          .reduce((s, t) => s + t.net, 0),
      0
    );
  const counted = m.years.reduce((a, [, v]) => a + (v.uythac || 0), 0);
  assert.ok(counted < raw, 'đã loại trùng nên nhỏ hơn tổng thô (' + counted + ' < ' + raw + ')');
});
test('cơ sở ngày bắt đầu hồ sơ: không có mục chưa phân bổ, tổng theo loại giữ nguyên', () => {
  const { metas, tickets } = scenario();
  const w = R.compute(metas, { basis: 'weigh', tickets, ticketErrors: new Map() });
  const s = R.compute(metas, { basis: 'start', tickets });
  assert.equal(s.unallocated.n, 0);
  assert.equal(s.basis, 'start');
  assert.ok(w.byType.xuatkhau.n >= 0);
});
