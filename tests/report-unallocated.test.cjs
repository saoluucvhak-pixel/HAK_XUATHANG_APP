/* Báo cáo kỳ "Ngày cân từng phiếu": số liệu không xác minh được ngày cân phải ở mục "chưa phân bổ", không tự dồn vào ngày bắt đầu hồ sơ. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
// bản sao hàm thoát HTML của HAK.UI (ui.js cần DOM nên không nạp trong Node)
HAK.UI = HAK.UI || {
  esc: (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
};
global.ExcelJS = require('../app/libs/exceljs.min.js');
require('../app/js/excel.js');
require('../app/js/generator.js');
const W = require('../app/js/weigh-model.js'),
  R = require('../app/js/report.js');

const meta = (id, from, to, kg, extra) =>
  Object.assign(
    {
      id,
      type: 'xuatkhau',
      title: 'HS ' + id,
      ship: 'TÀU ' + id,
      giao: 'HAK',
      nhan: 'ĐN',
      cid: 'hak',
      contract: 'c' + id,
      from,
      to,
      kg,
      trips: 0,
      retKg: 0,
      retTrips: 0,
      updatedAt: 1,
    },
    extra
  );
const row = (n, net, date) => ({ ticket: 'T' + n, dateStr: date, plate: '43C-' + n, time1: '08:00', net, uid: 'f#' + n, idx: n });
const tick = (m, rows, ret) => W.ticketsOf(rows, (r) => !!ret && ret.has(r.uid), m);
const ton = (kg) => kg / 1000;
const months = (m, type = 'xuatkhau') => Object.fromEntries(m.months.map(([k, v]) => [k, v[type] || 0]));
const years = (m, type = 'xuatkhau') => Object.fromEntries(m.years.map(([k, v]) => [k, v[type] || 0]));

// Ca nghiệm thu: hồ sơ 30 tấn cân 31/12/2025 → 02/01/2026 bị lỗi đọc chi tiết; hồ sơ B đọc được (12 tấn, 01/2026)
const A = () => meta('A', '31/12/2025', '02/01/2026', 30000, { trips: 3 });
const B = () => meta('B', '05/01/2026', '06/01/2026', 12000, { trips: 2 });
const rowsB = () => [row(1, 5000, '05/01/2026'), row(2, 7000, '06/01/2026')];
const mapB = () => new Map([['B', tick(B(), rowsB())]]);

test('ngày cân: hồ sơ lỗi đọc chi tiết hiện 30 tấn chưa phân bổ, không vào tháng 12/2025', () => {
  const errors = new Map([['A', { code: 'load-error', message: 'IndexedDB lỗi' }]]);
  const m = R.compute([A(), B()], { basis: 'weigh', tickets: mapB(), ticketErrors: errors });
  assert.equal(m.basis, 'weigh');
  assert.equal(m.unallocated.n, 1);
  assert.equal(ton(m.unallocated.kg), 30);
  assert.equal(m.unallocated.items[0].id, 'A');
  assert.equal(m.unallocated.items[0].code, 'load-error');
  assert.match(m.unallocated.items[0].reason, /IndexedDB lỗi/);
  assert.deepEqual(months(m), { '2026-01': 12000 });
  assert.deepEqual(years(m), { 2026: 12000 });
  assert.equal(m.byType.xuatkhau.kg, 12000, 'tổng đã xác minh = hồ sơ đọc được');
  assert.equal(m.byType.xuatkhau.kg + m.unallocated.kg, 42000, 'đã xác minh + chưa phân bổ = toàn bộ');
});
test('ngày cân: hồ sơ chưa đọc (không có lý do cụ thể) cũng chưa phân bổ', () => {
  const m = R.compute([A(), B()], { basis: 'weigh', tickets: mapB() });
  assert.equal(m.unallocated.items[0].code, 'unread');
  assert.deepEqual(months(m), { '2026-01': 12000 });
});
test('ngày bắt đầu hồ sơ (báo cáo lịch sử) giữ nguyên: không có mục chưa phân bổ', () => {
  const m = R.compute([A(), B()], { basis: 'start', tickets: mapB() });
  assert.equal(m.basis, 'start');
  assert.deepEqual(months(m), { '2025-12': 30000, '2026-01': 12000 });
  assert.equal(m.unallocated.n, 0);
});
test('chọn ngày cân nhưng không có danh sách phiếu: tính theo ngày bắt đầu và báo rõ căn cứ thực tế', () => {
  const m = R.compute([A(), B()], { basis: 'weigh' });
  assert.equal(m.basis, 'start');
  assert.equal(m.basisFallback, true);
  assert.match(R.unallocatedText(m), /BẮT ĐẦU/);
  assert.equal(R.compute([A()], { basis: 'start' }).basisFallback, false);
});
test('phiếu đọc được nhưng thiếu / sai ngày cân: chưa phân bổ, phần có ngày vẫn vào đúng tháng', () => {
  const C = meta('C', '10/02/2026', '12/02/2026', 9000, { trips: 3 });
  const rows = [row(1, 3000, '10/02/2026'), row(2, 4000, ''), row(3, 2000, '12/02/2026')];
  const m = R.compute([C], { basis: 'weigh', tickets: new Map([['C', tick(C, rows)]]) });
  assert.deepEqual(months(m), { '2026-02': 5000 });
  assert.equal(m.unallocated.n, 1);
  assert.equal(m.unallocated.trips, 1);
  assert.equal(m.unallocated.kg, 4000);
  assert.equal(m.unallocated.items[0].code, 'no-date');
  assert.equal(m.unallocated.items[0].whole, false);
  assert.equal(m.byType.xuatkhau.kg + m.unallocated.kg, 9000);
});
test('xe trả về: thực giao chưa phân bổ trừ xe trả về; phần đã xác minh trừ đúng', () => {
  const D = meta('D', '10/03/2026', '12/03/2026', 10000, { type: 'uythac', trips: 3, retKg: 4000, retTrips: 1 });
  const rows = [row(1, 3000, '10/03/2026'), row(2, 4000, ''), row(3, 3000, '12/03/2026')];
  const ret = new Set(['f#2']); // xe trả về nằm ở phiếu thiếu ngày
  const m = R.compute([D], { basis: 'weigh', tickets: new Map([['D', tick(D, rows, ret)]]) });
  assert.equal(m.unallocated.kg, 4000);
  assert.equal(m.unallocated.delKg, 0, 'phiếu thiếu ngày là xe trả về → thực giao 0');
  assert.deepEqual(months(m, 'uythac'), { '2026-03': 6000 });
  const ret2 = new Set(['f#1']); // xe trả về nằm ở phiếu có ngày
  const m2 = R.compute([D], { basis: 'weigh', tickets: new Map([['D', tick(D, rows, ret2)]]) });
  assert.equal(m2.unallocated.delKg, 4000);
  assert.deepEqual(months(m2, 'uythac'), { '2026-03': 3000 });
});
test('hồ sơ qua năm đọc được: phân bổ đúng từng phiếu theo ngày cân, không có chưa phân bổ', () => {
  const E = meta('E', '31/12/2025', '02/01/2026', 14000, { trips: 3 });
  const rows = [row(1, 5000, '31/12/2025'), row(2, 6000, '01/01/2026'), row(3, 3000, '02/01/2026')];
  const m = R.compute([E], { basis: 'weigh', tickets: new Map([['E', tick(E, rows)]]) });
  assert.deepEqual(months(m), { '2025-12': 5000, '2026-01': 9000 });
  assert.deepEqual(years(m), { 2025: 5000, 2026: 9000 });
  assert.equal(m.unallocated.n, 0);
  assert.equal(R.unallocatedNote(m), '', 'không cảnh báo khi đã xác minh đủ');
  assert.match(R.unallocatedText(m), /đã xác minh ngày cân của toàn bộ phiếu/);
});
test('khoảng ngày: hồ sơ lỗi đọc không lọt vào kỳ nào; số liệu đã xác minh vẫn cộng đúng', () => {
  const errors = new Map([['A', { code: 'load-error', message: 'x' }]]);
  const inJan = R.compute([A(), B()], { basis: 'weigh', tickets: mapB(), ticketErrors: errors, from: '2026-01-01', to: '2026-01-31' });
  const inDec = R.compute([A(), B()], { basis: 'weigh', tickets: mapB(), ticketErrors: errors, from: '2025-12-01', to: '2025-12-31' });
  assert.equal(inJan.byType.xuatkhau.kg, 12000);
  assert.equal(inDec.byType.xuatkhau.kg, 0, 'tháng 12/2025 không được tự có 30 tấn');
  assert.equal(inDec.unallocated.kg, 30000);
});
test('ghi chú màn hình nêu hồ sơ và nguyên nhân (đã thoát HTML)', () => {
  const errors = new Map([['A', { code: 'load-error', message: '<b>lỗi</b>' }]]);
  const m = R.compute([A(), B()], { basis: 'weigh', tickets: mapB(), ticketErrors: errors });
  const html = R.unallocatedNote(m);
  assert.match(html, /Chưa phân bổ: 1 hồ sơ/);
  assert.match(html, /HS A/);
  assert.match(html, /30,00 tấn/);
  assert.doesNotMatch(html, /<b>lỗi<\/b>/);
  assert.match(html, /&lt;b&gt;lỗi&lt;\/b&gt;/);
});
test('prepareTickets ghi lại hồ sơ đọc lỗi cùng nguyên nhân, vẫn đọc hồ sơ còn lại', async () => {
  const good = { params: { filter: {} }, rows: [row(1, 5000, '05/01/2026'), row(2, 7000, '06/01/2026')] };
  HAK.Archive = {
    async load(id) {
      if (id === 'A') throw new Error('hỏng dữ liệu nén');
      if (id === 'N') return null;
      return good;
    },
  };
  try {
    const metas = [A(), B(), meta('N', '01/01/2026', '02/01/2026', 1000)];
    const out = await R.prepareTickets(metas, new Map(), true);
    assert.equal(out.has('B'), true);
    assert.equal(out.has('A'), false);
    assert.equal(out.errors.get('A').code, 'load-error');
    assert.match(out.errors.get('A').message, /hỏng dữ liệu nén/);
    assert.equal(out.errors.get('N').code, 'no-rows');
    const m = R.compute(metas, { basis: 'weigh', tickets: out, ticketErrors: out.errors });
    assert.equal(m.unallocated.n, 2);
    assert.equal(m.byType.xuatkhau.kg, 12000);
  } finally {
    delete HAK.Archive;
  }
});
test('Excel: chú thích nêu phạm vi đã xác minh và có sheet "Chưa phân bổ"', async () => {
  const errors = new Map([['A', { code: 'load-error', message: 'IndexedDB lỗi' }]]);
  const m = R.compute([A(), B()], { basis: 'weigh', tickets: mapB(), ticketErrors: errors });
  m.rangeText = 'kỳ theo NGÀY CÂN';
  const wb = await R.toExcel(m);
  const out = new global.ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  assert.match(out.getWorksheet('Tổng hợp').getCell('A2').value, /CHỈ gồm phần đã xác minh/);
  const sh = out.getWorksheet('Chưa phân bổ');
  assert.ok(sh, 'phải có sheet Chưa phân bổ');
  assert.equal(sh.getCell('A5').value, 'HS A');
  assert.equal(sh.getCell('F5').value, 30);
  assert.match(String(sh.getCell('H5').value), /IndexedDB lỗi/);
  assert.equal(out.getWorksheet('Theo tháng').getCell('B5').value, 12);
  // báo cáo không có phần chưa phân bổ thì không tạo sheet
  const m2 = R.compute([B()], { basis: 'weigh', tickets: mapB() });
  m2.rangeText = 'x';
  const out2 = new global.ExcelJS.Workbook();
  await out2.xlsx.load(await (await R.toExcel(m2)).xlsx.writeBuffer());
  assert.equal(out2.getWorksheet('Chưa phân bổ'), undefined);
});

test('Excel: khi mọi hồ sơ đều chưa phân bổ vẫn xuất được, sheet "Chưa phân bổ" đủ dòng và các sheet tháng / năm không có số liệu', async () => {
  const errors = new Map([['A', { code: 'load-error', message: 'IndexedDB lỗi' }]]);
  const m = R.compute([A()], { basis: 'weigh', tickets: new Map(), ticketErrors: errors });
  assert.equal(m.used.length, 0);
  assert.equal(m.unallocated.n, 1);
  m.rangeText = 'x';
  const out = new global.ExcelJS.Workbook();
  await out.xlsx.load(await (await R.toExcel(m)).xlsx.writeBuffer());
  const sh = out.getWorksheet('Chưa phân bổ');
  assert.ok(sh);
  assert.equal(sh.getCell('A5').value, 'HS A');
  assert.equal(sh.getCell('F5').value, 30);
  assert.equal(out.getWorksheet('Theo tháng').rowCount <= 5, true, 'không có tháng nào được dựng từ hồ sơ chưa xác minh');
});

test('prepareTickets đọc song song theo lô: thứ tự kết quả giữ nguyên dù hồ sơ xong lệch nhau, song song tối đa 8, dùng lại bộ nhớ đệm', async () => {
  let live = 0,
    peak = 0;
  const loads = [];
  HAK.Archive = {
    async load(id) {
      loads.push(id);
      live++;
      peak = Math.max(peak, live);
      await new Promise((ok) => setTimeout(ok, id === 'M0' ? 30 : 1)); // hồ sơ đầu xong SAU các hồ sơ sau
      live--;
      return { params: { filter: {} }, rows: [row(1, 1000, '05/01/2026')] };
    },
  };
  try {
    const metas = Array.from({ length: 20 }, (_, i) => meta('M' + i, '05/01/2026', '05/01/2026', 1000));
    const cache = new Map();
    const out = await R.prepareTickets(metas, cache, true);
    assert.deepEqual(
      Array.from(out.keys()),
      metas.map((m) => m.id),
      'thứ tự khóa như danh sách đầu vào'
    );
    assert.ok(peak > 1 && peak <= 8, 'có song song nhưng không quá 8 (đo được ' + peak + ')');
    const n = loads.length;
    const again = await R.prepareTickets(metas, cache, true);
    assert.equal(loads.length, n, 'lần 2 dùng bộ nhớ đệm, không đọc lại');
    assert.equal(again.size, 20);
  } finally {
    delete HAK.Archive;
  }
});
