/* 5 mẫu báo cáo (report-tpl.js): kỳ + so sánh kỳ trước, phân tích nhóm / Top N / Khác, tiến độ hợp đồng, thuế, ngoại lệ; màn hình = Excel = PDF cùng số liệu. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
global.ExcelJS = require('../app/libs/exceljs.min.js');
HAK.UI = HAK.UI || { esc: (s) => String(s == null ? '' : s) };
require('../app/js/excel.js');
require('../app/js/generator.js');
HAK.NumFmt = require('../app/js/numfmt.js');
const W = require('../app/js/weigh-model.js'),
  R = require('../app/js/report.js'),
  CM = require('../app/js/customs-model.js'),
  M = require('../app/js/contract-model.js'),
  CF = require('../app/js/contract-file.js'),
  T = require('../app/js/report-tpl.js');
HAK.CustomsModel = CM;
HAK.ContractModel = M;

/* ---------- dữ liệu thử ---------- */
const meta = (id, from, to, extra) =>
  Object.assign(
    {
      id,
      type: 'xuatkhau',
      title: 'HS ' + id,
      ship: 'TÀU ' + id,
      giao: 'HAK',
      nhan: 'ĐN',
      cid: 'hak',
      kho: 'w1>w2',
      contract: 'c' + id,
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
const row = (n, net, date, extra) =>
  Object.assign({ ticket: 'T' + n, dateStr: date, plate: '43C-' + n, time1: '08:00', net, uid: 'f#' + n, idx: n, carrier: 'VT-A' }, extra);
/** list = [{meta, rows, ret:[uid]}] → { metas, tickets } (tổng hợp meta từ rows như Lưu trữ) */
function setup(list) {
  const tickets = new Map();
  const metas = list.map(({ meta: m, rows, ret = [] }) => {
    const rs = new Set(ret);
    m.trips = rows.length;
    m.kg = rows.reduce((a, r) => a + r.net, 0);
    m.retTrips = rows.filter((r) => rs.has(r.uid)).length;
    m.retKg = rows.filter((r) => rs.has(r.uid)).reduce((a, r) => a + r.net, 0);
    tickets.set(
      m.id,
      W.ticketsOf(rows, (r) => rs.has(r.uid), m)
    );
    return m;
  });
  return { metas, tickets };
}
const names = {
  company: (id) => ({ hak: 'HAK', dh: 'Đại Hiệp' })[id] || id,
  kho: (id) => ({ w1: 'Kho Quế Sơn', w2: 'Kho Đà Nẵng' })[id] || id,
  type: (t) => R.typeName(t).replace(/^\S+\s/, ''),
};
const ctxOf = (s, extra) =>
  Object.assign({ metas: s.metas, tickets: s.tickets, names, now: new Date(2026, 10, 17, 9, 5), companyText: 'HAK' }, extra);
const row0 = (doc, id, i = 0) => doc.sections.find((x) => x.id === id).rows[i].c;
const sec = (doc, id) => doc.sections.find((x) => x.id === id);

// Hồ sơ qua 31/12 và 01/01 (đọc được) + hồ sơ lỗi đọc 30 tấn
const E = () => meta('E', '31/12/2025', '02/01/2026');
const rowsE = () => [row(1, 5000, '31/12/2025'), row(2, 6000, '01/01/2026'), row(3, 3000, '02/01/2026', { uid: 'f#3' })];
const A = () => meta('A', '30/12/2025', '02/01/2026', { kg: 30000, trips: 3 });
function crossYear() {
  const s = setup([{ meta: E(), rows: rowsE() }]);
  s.metas.push(A()); // A không có phiếu (lỗi đọc)
  return s;
}
const errA = () => new Map([['A', { code: 'load-error', message: 'IndexedDB lỗi' }]]);

test('hồ sơ qua 31/12 và 01/01, ngày cân từng phiếu: chia đúng kỳ; hồ sơ lỗi đọc ở phần chưa phân bổ', () => {
  const s = crossYear(),
    doc = T.periodReport(ctxOf(s, { ticketErrors: errA() }), { granularity: 'month', groupBy: 'company', basis: 'weigh' });
  const per = sec(doc, 'periods').rows.map((r) => [r.c.per, r.c.delKg]);
  assert.deepEqual(per, [
    ['12/2025', 5000],
    ['01/2026', 9000],
  ]);
  assert.equal(sec(doc, 'groups').totals.delKg, 14000, 'tổng đã xác minh không chứa hồ sơ lỗi đọc');
  assert.equal(sec(doc, 'groups').totals.unKg, 30000, 'hồ sơ lỗi đọc 30 tấn nằm ở cột chưa phân bổ');
  const un = sec(doc, 'unallocated');
  assert.ok(un, 'có phần chưa phân bổ');
  assert.equal(un.rows[0].c.title, 'HS A');
  assert.match(un.rows[0].c.why, /IndexedDB lỗi/);
  assert.match(doc.warnings.join(' '), /Chưa phân bổ: 1 hồ sơ/);
  assert.match(doc.header.basis, /NGÀY CÂN/);
  // theo năm / quý / ngày
  assert.deepEqual(
    sec(T.periodReport(ctxOf(s), { granularity: 'year', groupBy: 'company' }), 'periods').rows.map((r) => [r.c.per, r.c.delKg]),
    [
      ['Năm 2025', 5000],
      ['Năm 2026', 9000],
    ]
  );
  assert.deepEqual(
    sec(T.periodReport(ctxOf(s), { granularity: 'quarter', groupBy: 'company' }), 'periods').rows.map((r) => r.c.per),
    ['Quý 4/2025', 'Quý 1/2026']
  );
  assert.deepEqual(
    sec(T.periodReport(ctxOf(s), { granularity: 'day', groupBy: 'company' }), 'periods').rows.map((r) => r.c.per),
    ['31/12/2025', '01/01/2026', '02/01/2026']
  );
  assert.equal(sec(T.periodReport(ctxOf(s), { granularity: 'custom', groupBy: 'company' }), 'periods').rows.length, 1);
});
test('kỳ theo ngày bắt đầu hồ sơ giữ nguyên cách đọc cũ (cả hồ sơ vào kỳ bắt đầu)', () => {
  const s = setup([{ meta: E(), rows: rowsE() }]);
  const doc = T.periodReport(ctxOf(s), { granularity: 'month', groupBy: 'company', basis: 'start' });
  assert.deepEqual(
    sec(doc, 'periods').rows.map((r) => [r.c.per, r.c.delKg]),
    [['12/2025', 14000]]
  );
  assert.match(doc.header.basis, /BẮT ĐẦU/);
});
test('nhóm theo công ty / hình thức / kho xuất và tổng khớp nhau', () => {
  const s = setup([
    { meta: meta('A', '03/02/2026', '03/02/2026', { cid: 'hak', kho: 'w1>w2' }), rows: [row(1, 1000, '03/02/2026')] },
    { meta: meta('B', '03/02/2026', '03/02/2026', { cid: 'dh', kho: 'w2>w1', type: 'uythac' }), rows: [row(2, 2000, '03/02/2026')] },
  ]);
  for (const by of ['company', 'type', 'kho']) {
    const d = T.periodReport(ctxOf(s), { groupBy: by });
    assert.equal(sec(d, 'groups').rows.length, 2, by);
    assert.equal(sec(d, 'groups').totals.delKg, 3000, by);
    assert.equal(sec(d, 'groups').totals.trips, 2, by);
  }
  assert.deepEqual(
    sec(T.periodReport(ctxOf(s), { groupBy: 'kho' }), 'groups')
      .rows.map((r) => r.c.grp)
      .sort(),
    ['Kho Quế Sơn', 'Kho Đà Nẵng'].sort()
  );
});
test('so sánh kỳ trước cùng độ dài: tăng có %, giảm, kỳ gốc bằng 0, thiếu dữ liệu, chưa chọn kỳ', () => {
  const P = (id, d, net) => ({ meta: meta(id, d, d), rows: [row(Number(id.replace(/\D/g, '') || 1), net, d)] });
  assert.deepEqual(T.prevRange('2026-02-08', '2026-02-10'), { from: '2026-02-05', to: '2026-02-07', days: 3 });
  assert.equal(T.prevRange('2026-02-08', ''), null);
  assert.equal(T.prevRange('2026-02-10', '2026-02-08'), null);
  const cmp = (s, from, to) => T.periodReport(ctxOf(s), { groupBy: 'company', from, to, basis: 'weigh' });
  // tăng: kỳ trước 10.000, kỳ này 15.000 → +5.000 (+50%)
  let d = cmp(setup([P('p1', '01/02/2026', 10000), P('c2', '02/02/2026', 15000)]), '2026-02-02', '2026-02-02');
  assert.equal(d.compare.range.from, '2026-02-01');
  assert.equal(d.compare.total, 'ok');
  assert.deepEqual(
    [row0(d, 'groups').prevKg, row0(d, 'groups').diffKg, row0(d, 'groups').diffPct, row0(d, 'groups').cmp],
    [10000, 5000, 0.5, 'Tăng']
  );
  assert.equal(sec(d, 'groups').totals.diffPct, 0.5);
  // giảm: kỳ này trống, kỳ trước 20.000 → −20.000 (−100%), nhóm của kỳ trước vẫn hiện với 0
  d = cmp(setup([P('p1', '01/02/2026', 10000), P('p3', '03/02/2026', 10000)]), '2026-02-04', '2026-02-06');
  assert.equal(d.compare.range.from, '2026-02-01');
  assert.equal(d.compare.prevTotalKg, 20000);
  assert.deepEqual(
    [row0(d, 'groups').delKg, row0(d, 'groups').diffKg, row0(d, 'groups').diffPct, row0(d, 'groups').cmp],
    [0, -20000, -1, 'Giảm']
  );
  // kỳ gốc bằng 0: kỳ trước có hồ sơ nhưng 0 kg → báo trạng thái, không tính %
  d = cmp(setup([P('z4', '01/02/2026', 0), P('c5', '02/02/2026', 8000)]), '2026-02-02', '2026-02-02');
  assert.equal(d.compare.total, 'zero');
  assert.match(row0(d, 'groups').cmp, /bằng 0/);
  assert.equal(row0(d, 'groups').diffPct, '', 'không tính % khi kỳ gốc bằng 0');
  assert.equal(row0(d, 'groups').diffKg, 8000);
  // thiếu dữ liệu: kỳ trước không có hồ sơ nào
  d = cmp(setup([P('c6', '10/02/2026', 9000)]), '2026-02-10', '2026-02-10');
  assert.equal(d.compare.total, 'nodata');
  assert.match(row0(d, 'groups').cmp, /chưa có dữ liệu/);
  assert.equal(row0(d, 'groups').diffPct, '');
  // chưa chọn kỳ: không so sánh, không có cột so sánh
  d = T.periodReport(ctxOf(setup([P('c7', '10/02/2026', 9000)])), { groupBy: 'company' });
  assert.equal(d.compare.total, 'na');
  assert.equal(
    sec(d, 'groups').columns.some((c) => c.k === 'cmp'),
    false
  );
  // tắt so sánh
  d = T.periodReport(ctxOf(setup([P('c8', '10/02/2026', 9000)])), {
    groupBy: 'company',
    from: '2026-02-10',
    to: '2026-02-10',
    compare: false,
  });
  assert.equal(d.compare.total, 'na');
});

/* ---------- Mẫu 2: phân tích theo tàu / kho / ĐVVC ---------- */
// Hai tàu cân xen kẽ cùng ngày: tàu A = phiếu lẻ, tàu B = phiếu chẵn
function twoShips() {
  const mk = (id, plates) => ({
    meta: meta(id, '03/02/2026', '04/02/2026', { ship: 'TÀU ' + id, title: 'Hồ sơ tàu ' + id }),
    rows: plates,
  });
  const A = [
    row(1, 20000, '03/02/2026', { carrier: 'VT-A' }),
    row(3, 21000, '03/02/2026', { carrier: 'VT-A' }),
    row(5, 19000, '04/02/2026', { carrier: 'VT-B' }),
    row(7, 22000, '04/02/2026', { carrier: 'VT-B' }),
  ];
  const B = [
    row(2, 25000, '03/02/2026', { carrier: 'VT-A' }),
    row(4, 26000, '03/02/2026', { carrier: 'VT-B' }),
    row(6, 24000, '04/02/2026', { carrier: 'VT-B' }),
    row(8, 27000, '04/02/2026', { carrier: 'VT-C' }),
  ];
  return setup([Object.assign(mk('A', A), { ret: ['f#3'] }), mk('B', B)]);
}
const flatTickets = (doc) =>
  sec(doc, 'tickets')
    ? sec(doc, 'tickets')
        .rows.map((r) => r.c.ticket)
        .sort()
    : [];
test('hai tàu cùng ngày, lọc một tàu: bảng tổng, biểu đồ, phiếu chi tiết, Excel và PDF dùng cùng số phiếu và khối lượng', async () => {
  const s = twoShips(),
    doc = T.breakdownReport(ctxOf(s), { groupBy: 'ship', q: 'tau a' }),
    g = sec(doc, 'groups');
  assert.equal(g.rows.length, 1);
  assert.equal(g.rows[0].c.grp, 'TÀU A');
  assert.equal(g.totals.trips, 4);
  assert.equal(g.totals.kg, 82000);
  assert.equal(g.totals.retKg, 21000);
  assert.equal(g.totals.delKg, 61000);
  // biểu đồ = bảng
  assert.deepEqual(g.chart.points, [{ label: 'TÀU A', value: 61000 }]);
  assert.match(T.chartSvg(g.chart), /TÀU A: 61,00 tấn/);
  // phiếu chi tiết = đúng 4 phiếu của tàu A, tổng khớp
  assert.deepEqual(flatTickets(doc), ['T1', 'T3', 'T5', 'T7']);
  assert.equal(sec(doc, 'tickets').totals.kg, 82000);
  assert.deepEqual(g.rows[0].drill.tickets.map((t) => t.ticket).sort(), ['T1', 'T3', 'T5', 'T7']);
  // Excel: cùng tập phiếu
  const out = new global.ExcelJS.Workbook();
  await out.xlsx.load(await T.toExcel(doc, global.ExcelJS).xlsx.writeBuffer());
  const ws = out.getWorksheet('Chi tiết'),
    found = [];
  ws.eachRow((r) => {
    const t = String(r.getCell(3).value || '');
    if (/^T\d$/.test(t)) found.push(t);
  });
  assert.deepEqual(found.sort(), ['T1', 'T3', 'T5', 'T7']);
  // PDF / in: cùng số dòng và cùng tổng
  const spec = T.toPrintSpec(doc),
    tb = spec.tables.find((t) => /Phiếu cân/.test(t.caption));
  assert.equal(tb.rows.length, 4 + 1, '4 phiếu + dòng tổng');
  assert.equal(tb.rows[4].c[6], '82.000');
  // không lọc: hai tàu, tổng 184.000
  const all = T.breakdownReport(ctxOf(s), { groupBy: 'ship' });
  assert.equal(sec(all, 'groups').totals.kg, 184000);
  assert.equal(sec(all, 'groups').rows.length, 2);
});
test('xe trả về: tỷ lệ theo xe và theo kg, tỷ trọng; mẫu số hiển thị rõ ở từng dòng', () => {
  const doc = T.breakdownReport(ctxOf(twoShips()), { groupBy: 'ship', sort: 'delKg', dir: 'desc' }),
    g = sec(doc, 'groups'),
    a = g.rows.find((r) => r.c.grp === 'TÀU A').c,
    b = g.rows.find((r) => r.c.grp === 'TÀU B').c;
  assert.equal(a.retRate, 1 / 4);
  assert.equal(a.retRateKg, 21000 / 82000);
  assert.equal(b.retRate, 0);
  assert.equal(a.trips, 4);
  assert.equal(b.delKg, 102000);
  assert.equal(g.totals.delKg, 61000 + 102000);
  assert.equal(a.share, 61000 / 163000);
  assert.equal(a.denShare, 163000, 'mẫu số tỷ trọng = tổng thực giao của bảng');
  assert.equal(g.totals.share, 1);
  assert.match(g.note, /163\.000 kg/);
  assert.equal(g.rows[0].c.grp, 'TÀU B', 'sắp xếp theo thực giao giảm dần');
  const asc = T.breakdownReport(ctxOf(twoShips()), { groupBy: 'ship', sort: 'retRate', dir: 'asc' });
  assert.equal(sec(asc, 'groups').rows[0].c.grp, 'TÀU B');
});
test('Top N và nhóm "Khác": tổng vẫn đủ, mở được hồ sơ và phiếu của nhóm Khác', () => {
  const s = twoShips(),
    doc = T.breakdownReport(ctxOf(s), { groupBy: 'carrier', sort: 'delKg', dir: 'desc', topN: 1 }),
    g = sec(doc, 'groups'),
    full = T.breakdownReport(ctxOf(s), { groupBy: 'carrier', sort: 'delKg', dir: 'desc' });
  assert.equal(g.rows.length, 2, 'Top 1 + Khác');
  const other = g.rows[1];
  assert.match(other.c.grp, /^Khác \(\d+ nhóm\)$/);
  assert.equal(other.cls, 'other');
  assert.equal(g.totals.delKg, sec(full, 'groups').totals.delKg, 'tổng giữ đủ');
  assert.equal(g.totals.trips, 8);
  assert.equal(g.rows[0].c.delKg + other.c.delKg, g.totals.delKg);
  assert.equal(other.drill.tickets.length + g.rows[0].drill.tickets.length, 8);
  assert.ok(other.drill.members.length >= 1);
  assert.ok(other.drill.recs.length >= 1);
  assert.equal(sec(doc, 'tickets').rows.length, 8, 'phiếu chi tiết gồm cả nhóm Khác');
});
test('nhóm theo kho xuất và theo đơn vị vận chuyển; hồ sơ chưa đọc phiếu không lọt vào nhóm ĐVVC', () => {
  const s = twoShips();
  s.metas.push(meta('U', '03/02/2026', '03/02/2026', { kg: 9000, trips: 1, ship: 'TÀU U' })); // không có phiếu
  const byKho = T.breakdownReport(ctxOf(s), { groupBy: 'kho' });
  assert.equal(sec(byKho, 'groups').rows[0].c.grp, 'Kho Quế Sơn');
  const car = T.breakdownReport(ctxOf(s, { ticketErrors: new Map([['U', { code: 'load-error', message: 'x' }]]) }), { groupBy: 'carrier' });
  assert.deepEqual(
    sec(car, 'groups')
      .rows.map((r) => r.c.grp)
      .sort(),
    ['VT-A', 'VT-B', 'VT-C']
  );
  assert.equal(sec(car, 'groups').totals.kg, 184000, 'hồ sơ U (chưa đọc phiếu) không được tính vào ĐVVC nào');
  assert.equal(sec(car, 'unallocated').rows[0].c.title, 'HS U'.replace('HS U', 'HS U'));
});

/* ---------- Mẫu 3, 4, 5: hợp đồng, thuế, ngoại lệ (dùng ContractFile.build thật) ---------- */
function contractItem(o) {
  o = o || {};
  const c = M.parent({
    type: o.type || 'xuatkhau',
    no: o.no || 'HD1',
    date: '2026-08-06',
    contractQty: o.qty === undefined ? 6000 : o.qty,
    priceUsd: 176,
    currency: 'USD',
    details: [],
    exporterId: 'k-hak',
  });
  if (o.addenda) {
    c.qtyOrig = o.qty === undefined ? 6000 : o.qty;
    c.addenda = o.addenda;
    M.applyAddenda(c);
  }
  (o.details || [{ ship: 'M/V A', certNo: 'C1', bdmt: 4000, mt: 8000 }]).forEach((d) =>
    c.details.push(M.child(c.id, Object.assign({ exchangeRate: 26000 }, d)))
  );
  if (o.closedAt) M.closeContract(c, o.closedAt);
  const decls = (o.decls || []).map((d, i) =>
    CM.newDecl(
      Object.assign(
        {
          no: '30862970' + (1000 + i),
          contractId: c.id,
          detailId: d.attach === false ? undefined : c.details[0].id,
          status: 'cleared',
          openDate: '2026-08-10',
        },
        d
      )
    )
  );
  HAK.Catalog = {
    core: { get: () => ({ contracts: [c], customers: [{ id: 'k-hak', companyId: 'hak', name: 'HAK' }], customs: decls }) },
    companyIdsOf: () => ['hak'],
  };
  const m = CF.build(c.id, []);
  return { g: { key: c.id, f: { buyer: 'IWC' }, tot: { delKg: o.delKg || 0, trips: o.trips || 0 }, lots: o.lots || [] }, m };
}
const ctxC = (items, extra) =>
  Object.assign(
    { metas: [], contracts: items, names, now: new Date(2026, 10, 17, 9, 5), companyText: 'HAK', originalQty: M.originalQty, CM },
    extra
  );

test('tiến độ hợp đồng: BDMT gốc / hiện hành sau phụ lục / chứng thư / còn lại / MT thực giao hiện riêng; trạng thái đóng và thông quan riêng', () => {
  const it = contractItem({
    qty: 5000,
    addenda: [{ no: 'PL1', date: '2026-09-01', qty: 6000 }],
    details: [{ ship: 'M/V A', certNo: 'C1', bdmt: 4000, mt: 8000 }],
    delKg: 7500000,
    trips: 3,
    decls: [{ qtyBdmt: 4000, taxVnd: 100, payments: [{ amount: 100 }] }],
    closedAt: '2026-10-01',
  });
  const doc = T.contractsReport(ctxC([it]), {}),
    c = row0(doc, 'contracts');
  assert.equal(c.qtyOrig, 5000);
  assert.equal(c.qtyNow, 6000);
  assert.equal(c.certBdmt, 4000);
  assert.equal(c.remain, 2000);
  assert.equal(c.pct, 4000 / 6000);
  assert.equal(c.mtCert, 8000);
  assert.equal(c.mtDel, 7500);
  assert.equal(c.gapMt, 500);
  assert.equal(c.closing, 'Đã đóng 01/10/2026');
  assert.match(c.clear, /1\/1 đã thông quan/);
  assert.notEqual(c.closing, c.clear, 'đóng hợp đồng và thông quan là hai cột riêng');
  const cols = sec(doc, 'contracts').columns;
  assert.equal(cols.find((x) => x.k === 'qtyOrig').u, 'BDMT');
  assert.equal(cols.find((x) => x.k === 'mtDel').u, 'MT');
});
test('lọc hợp đồng: thiếu chứng thư, vượt khối lượng, lệch đối chiếu, chưa gắn tờ khai', () => {
  const ok = contractItem({
      no: 'OK',
      qty: 6000,
      details: [{ ship: 'A', certNo: 'C1', bdmt: 4000, mt: 1 }],
      decls: [{ qtyBdmt: 4000, taxVnd: 10 }],
    }),
    noCert = contractItem({ no: 'NOCERT', details: [{ ship: 'A', bdmt: 1000 }], decls: [{ qtyBdmt: 1000, taxVnd: 10 }] }),
    over = contractItem({
      no: 'OVER',
      qty: 3000,
      details: [{ ship: 'A', certNo: 'C2', bdmt: 4000 }],
      decls: [{ qtyBdmt: 4000, taxVnd: 10 }],
    }),
    mism = contractItem({ no: 'MISM', details: [{ ship: 'A', certNo: 'C3', bdmt: 4000 }], decls: [{ qtyBdmt: 3000, taxVnd: 10 }] }),
    nodecl = contractItem({ no: 'NODECL', details: [{ ship: 'A', certNo: 'C4', bdmt: 4000 }], decls: [] });
  const items = [ok, noCert, over, mism, nodecl];
  const nos = (flags) =>
    sec(T.contractsReport(ctxC(items), { flags }), 'contracts')
      .rows.map((r) => r.c.no)
      .sort();
  assert.deepEqual(nos([]), ['MISM', 'NOCERT', 'NODECL', 'OK', 'OVER']);
  assert.deepEqual(nos(['missingCert']), ['NOCERT']);
  assert.deepEqual(nos(['over']), ['OVER']);
  assert.deepEqual(nos(['mismatch']), ['MISM']);
  assert.deepEqual(nos(['noDecl']), ['NODECL']);
  assert.deepEqual(nos(['over', 'noDecl']), ['NODECL', 'OVER'], 'chọn nhiều điều kiện: hợp đồng thỏa một trong các điều kiện');
  const d = T.contractsReport(ctxC(items), {});
  assert.equal(d.counts.missingCert, 1);
  assert.equal(d.counts.noDecl, 1);
  assert.match(T.contractsReport(ctxC(items), { flags: ['over'] }).header.filters, /Vượt khối lượng/);
  assert.equal(
    sec(T.contractsReport(ctxC(items), { flags: ['over'] }), 'contracts').rows[0].drill.contractId.length > 0,
    true,
    'mở được hồ sơ hợp đồng từ dòng'
  );
  assert.equal(sec(T.contractsReport(ctxC(items), { q: 'nocert' }), 'contracts').rows.length, 1);
});
test('thuế: một tờ khai nợ 20 và một tờ khai nộp thừa 20 hiện đủ hai khoản dù số dư ròng bằng 0', () => {
  const it = contractItem({
    decls: [
      { taxVnd: 100, payments: [{ amount: 80, receiptNo: 'R1' }] },
      { taxVnd: 100, payments: [{ amount: 120, receiptNo: 'R2' }], supplements: [] },
    ],
  });
  const doc = T.taxReport(ctxC([it]), {}),
    t = sec(doc, 'tax').totals;
  assert.equal(t.owed, 20);
  assert.equal(t.over, 20);
  assert.equal(t.payable, 200);
  assert.equal(doc.net.value, 0);
  assert.match(doc.net.name, /Số dư ròng.*không bù trừ/);
  assert.match(doc.warnings.join(' '), /Nộp thừa 20 VND/);
  const decl = sec(doc, 'tax').rows.filter((r) => r.c.lvl === 'Tờ khai');
  assert.equal(decl.length, 2);
  assert.deepEqual(decl.map((r) => [r.c.owed, r.c.over]).sort(), [
    [0, 20],
    [20, 0],
  ]);
  assert.equal(sec(doc, 'tax').rows[0].c.lvl, 'Công ty');
  assert.equal(sec(doc, 'tax').rows[0].c.name, 'HAK');
  assert.equal(sec(doc, 'tax').rows[1].c.lvl, 'Hợp đồng');
});
test('thuế: đã hoàn, lệ phí, chưa xác định nghĩa vụ, tra cứu giấy nộp tiền và khai bổ sung làm căn cứ', () => {
  const it = contractItem({
    decls: [
      {
        taxVnd: 100,
        payments: [
          { amount: 150, receiptNo: 'R1' },
          { amount: 50, kind: 'refund', receiptNo: 'H1' },
          { amount: 7, kind: 'fee' },
        ],
        supplements: [{ round: 2, taxVnd: 140, no: '308629709999', date: '2026-09-01' }],
      },
      { taxVnd: null, payments: [{ amount: 5 }] },
    ],
  });
  const doc = T.taxReport(ctxC([it]), {}),
    d1 = sec(doc, 'tax').rows.filter((r) => r.c.lvl === 'Tờ khai')[0];
  assert.equal(d1.c.payable, 140, 'phải nộp theo khai bổ sung lần 2');
  assert.equal(d1.c.paid, 150);
  assert.equal(d1.c.refunded, 50);
  assert.equal(d1.c.fee, 7);
  assert.equal(d1.c.owed, 40, '140 − (150 − 50)');
  assert.match(d1.c.basis, /Khai bổ sung lần 2/);
  assert.equal(d1.drill.receipts.length, 3);
  assert.deepEqual(d1.drill.receipts.map((x) => x.kind).sort(), ['Hoàn thuế', 'Lệ phí / khác', 'Thuế xuất khẩu']);
  assert.equal(d1.drill.supps[0].taxVnd, 140);
  assert.match(d1.drill.basis, /khai bổ sung lần 2/);
  assert.equal(sec(doc, 'tax').totals.undet, 1);
  assert.equal(sec(doc, 'tax').totals.refunded, 50);
  assert.match(doc.warnings.join(' '), /1 tờ khai chưa xác định nghĩa vụ/);
  const und = sec(doc, 'tax').rows.filter((r) => r.c.lvl === 'Tờ khai')[1];
  assert.equal(und.c.owed, '');
  assert.equal(und.c.undet, 1);
});
test('ngoại lệ: phiếu trùng xung đột, hồ sơ lỗi đọc, phiếu thiếu ngày, chưa gắn hồ sơ / hợp đồng, chênh lệch chứng thư – thực giao; nêu nguồn, lý do, cách mở', () => {
  const A1 = meta('A1', '01/02/2026', '02/02/2026'),
    A2 = meta('A2', '01/02/2026', '02/02/2026', { updatedAt: 2, title: 'HS A2' });
  const s = setup([
    { meta: A1, rows: [row(1, 5000, '01/02/2026'), row(2, 3000, '')] },
    { meta: A2, rows: [row(1, 5200, '01/02/2026')] }, // cùng phiếu T1 khác khối lượng → xung đột
  ]);
  s.metas.push(meta('BAD', '01/02/2026', '02/02/2026', { kg: 7000, trips: 2, type: 'uythac' })); // khác hình thức → không lẫn cụm đối soát phiếu của A1 / A2
  const lot = { c: { mt: 100, certNo: 'C1' }, ship: 'M/V A', trips: 2, delKg: 90000 };
  const item = contractItem({
    no: 'HDX',
    details: [{ ship: 'M/V A', certNo: 'C1', bdmt: 1, mt: 100 }],
    lots: [lot],
    trips: 2,
    delKg: 90000,
  });
  const ctx = ctxOf(s, {
    ticketErrors: new Map([['BAD', { code: 'load-error', message: 'hỏng' }]]),
    contracts: [item],
    unassigned: [{ type: 'xuatkhau', batch: 'can.xlsx', ticket: 'T9', plate: '43C-9', date: '05/02/2026', net: 12000 }],
    unlinked: [{ id: 'U1', title: 'HS chưa gắn', type: 'xuatkhau', ship: 'TÀU U', kg: 4000 }],
  });
  const doc = T.exceptionsReport(ctx, { basis: 'weigh' });
  const byKind = Object.fromEntries(doc.items.map((x) => [x.kind, x]));
  assert.ok(byKind['Phiếu trùng có xung đột'], 'xung đột');
  assert.match(byKind['Phiếu trùng có xung đột'].why, /khối lượng/);
  assert.match(byKind['Phiếu trùng có xung đột'].status, /Tạm tính/);
  assert.ok(byKind['Hồ sơ lỗi đọc'] && byKind['Hồ sơ lỗi đọc'].why.includes('hỏng'));
  assert.equal(byKind['Hồ sơ lỗi đọc'].status, 'Chưa phân bổ');
  assert.deepEqual(byKind['Hồ sơ lỗi đọc'].open, { kind: 'record', id: 'BAD' });
  assert.ok(byKind['Phiếu thiếu / sai ngày cân']);
  assert.equal(byKind['Phiếu chưa gắn hồ sơ'].open.kind, 'batch');
  assert.match(byKind['Phiếu chưa gắn hồ sơ'].source, /can\.xlsx/);
  assert.equal(byKind['Hồ sơ chưa gắn hợp đồng'].open.id, 'U1');
  assert.equal(byKind['Chênh lệch chứng thư – thực giao'].open.kind, 'contract');
  assert.match(byKind['Chênh lệch chứng thư – thực giao'].why, /100,00.*90,00/);
  doc.items.forEach((x) => assert.ok(x.source && x.why && x.status, 'mỗi dòng có nguồn, lý do, tình trạng'));
  const sum = sec(doc, 'summary').rows.map((r) => r.c.status);
  assert.deepEqual(sum, ['Đã xác minh', 'Tạm tính — chờ đối soát', 'Chưa phân bổ', 'Đã loại khỏi số liệu']);
  assert.equal(sec(doc, 'items').rows.length, doc.items.length);
  // không có ngoại lệ
  const clean = T.exceptionsReport(
    ctxOf(setup([{ meta: meta('OK', '01/02/2026', '01/02/2026'), rows: [row(1, 1000, '01/02/2026')] }])),
    {}
  );
  assert.equal(clean.items.length, 0);
  assert.match(clean.notes.join(' '), /Không có ngoại lệ/);
});

/* ---------- Phạm vi công ty, Excel, PDF, định dạng ---------- */
test('tài khoản giới hạn công ty: tổng, biểu đồ, chi tiết, Excel và PDF đều chỉ gồm công ty được cấp', async () => {
  const s = setup([
    { meta: meta('H', '03/02/2026', '03/02/2026', { cid: 'hak', ship: 'TÀU H' }), rows: [row(1, 10000, '03/02/2026')] },
    { meta: meta('D', '03/02/2026', '03/02/2026', { cid: 'dh', ship: 'TÀU D' }), rows: [row(2, 99000, '03/02/2026')] },
  ]);
  const scoped = T.scopeMetas(s.metas, ['hak'], (m) => m.cid);
  assert.deepEqual(
    scoped.map((m) => m.id),
    ['H']
  );
  assert.equal(T.scopeMetas(s.metas, null, (m) => m.cid).length, 2);
  const ctx = ctxOf({ metas: scoped, tickets: s.tickets });
  for (const doc of [T.periodReport(ctx, { groupBy: 'company' }), T.breakdownReport(ctx, { groupBy: 'ship' })]) {
    const g = sec(doc, 'groups');
    assert.equal(g.totals.kg, 10000, doc.id + ': tổng');
    assert.equal(g.rows.length, 1);
    assert.equal(
      g.chart.points.reduce((a, p) => a + p.value, 0),
      10000,
      doc.id + ': biểu đồ'
    );
    const out = new global.ExcelJS.Workbook();
    await out.xlsx.load(await T.toExcel(doc, global.ExcelJS).xlsx.writeBuffer());
    let text = '';
    out.eachSheet((ws) =>
      ws.eachRow((r) => r.eachCell((c) => (text += ' ' + String(c.value && c.value.result !== undefined ? c.value.result : c.value))))
    );
    assert.ok(!/99000|TÀU D|Đại Hiệp/.test(text), doc.id + ': Excel không có số liệu của công ty ngoài phạm vi');
    assert.ok(!JSON.stringify(T.toPrintSpec(doc)).includes('TÀU D'), doc.id + ': PDF không có công ty ngoài phạm vi');
  }
});
test('Excel: ô số và ô ngày đúng kiểu, số phiếu và số tờ khai giữ dạng văn bản (số 0 đầu), có tổng SUM, tiêu đề đủ thông tin', async () => {
  const s = setup([
    { meta: meta('Z', '03/02/2026', '03/02/2026'), rows: [row(1, 12345, '03/02/2026', { ticket: '000123', plate: '043C-0001' })] },
  ]);
  const doc = T.breakdownReport(ctxOf(s), { groupBy: 'ship' });
  const out = new global.ExcelJS.Workbook();
  await out.xlsx.load(await T.toExcel(doc, global.ExcelJS).xlsx.writeBuffer());
  assert.deepEqual(
    out.worksheets.map((w) => w.name),
    ['Tổng hợp', 'Chi tiết']
  );
  const head = [1, 2, 3, 4, 5, 6].map((i) => String(out.getWorksheet('Tổng hợp').getCell(i, 1).value));
  assert.match(head[0], /PHÂN TÍCH THEO TÀU/);
  assert.match(head[1], /^Công ty: HAK/);
  assert.match(head[2], /Kỳ: toàn bộ thời gian · Căn cứ tính kỳ: theo NGÀY CÂN/);
  assert.match(head[3], /^Bộ lọc đang áp dụng:/);
  assert.match(head[4], /^Đơn vị: kg = kilôgam qua cân; MT = tấn tươi; BDMT/);
  assert.match(head[5], /^Thời điểm lập: 17\/11\/2026 09:05/);
  const ws = out.getWorksheet('Chi tiết');
  let tcell = null,
    dcell = null,
    kcell = null,
    total = null;
  ws.eachRow((r) => {
    if (String(r.getCell(3).value) === '000123') {
      tcell = r.getCell(3);
      dcell = r.getCell(4);
      kcell = r.getCell(7);
    }
    if (String(r.getCell(1).value) === 'TỔNG CỘNG') total = r.getCell(7);
  });
  assert.equal(tcell.value, '000123', 'số phiếu giữ số 0 đầu');
  assert.equal(tcell.numFmt, '@');
  assert.ok(dcell.value instanceof Date && dcell.numFmt === 'dd/mm/yyyy', 'ngày là ô ngày thật');
  assert.equal(dcell.value.getUTCDate(), 3);
  assert.equal(typeof kcell.value, 'number');
  assert.equal(kcell.numFmt, '#,##0');
  assert.match(total.value.formula, /^SUM\(G\d+:G\d+\)$/);
  assert.equal(total.value.result, 12345);
  // số tờ khai (mẫu thuế) là văn bản
  const it = contractItem({ decls: [{ no: '012345678901', taxVnd: 10 }] });
  const tdoc = T.taxReport(ctxC([it]), {}),
    o2 = new global.ExcelJS.Workbook();
  await o2.xlsx.load(await T.toExcel(tdoc, global.ExcelJS).xlsx.writeBuffer());
  let dno = null;
  o2.getWorksheet('Tổng hợp').eachRow((r) => {
    if (String(r.getCell(2).value) === '012345678901') dno = r.getCell(2);
  });
  assert.equal(dno.value, '012345678901');
  assert.equal(dno.numFmt, '@');
});
test('PDF / in: hướng giấy và cỡ chữ theo số cột, đủ dòng và tổng như màn hình, tiêu đề đủ thông tin', () => {
  const s = twoShips();
  const wide = T.toPrintSpec(T.breakdownReport(ctxOf(s), { groupBy: 'ship' })),
    narrow = T.toPrintSpec(T.exceptionsReport(ctxOf(s), {}));
  assert.equal(wide.orientation, 'landscape');
  assert.ok(wide.fontPt <= 7.5);
  assert.ok(narrow.fontPt >= wide.fontPt);
  assert.match(wide.sub, /Công ty: HAK/);
  assert.match(wide.sub, /Căn cứ: theo NGÀY CÂN/);
  assert.match(wide.sub, /Đơn vị: kg/);
  assert.match(wide.sub, /Lập lúc: 17\/11\/2026 09:05/);
  const g = wide.tables[0];
  assert.equal(g.rows.length, 2 + 1, '2 tàu + dòng tổng');
  assert.equal(g.rows[2].c[0], 'TỔNG CỘNG (đã xác minh)');
  assert.ok(g.svg.startsWith('<svg'), 'biểu đồ đặt cạnh bảng tổng hợp');
  assert.ok(g.cols.every((c, i) => typeof c.h === 'string' && c.h.length > 0));
  assert.match(g.cols[3].h, /Qua cân \(kg\)/);
  assert.equal(g.cols[3].n, true);
  assert.equal(g.cols[0].n, false);
});
test('định dạng số / ngày kiểu Việt, làm tròn half-up; biểu đồ rỗng không sinh SVG', () => {
  assert.equal(T.fmtNum(1.005, 2), '1,01');
  assert.equal(T.fmtNum(1234567.891, 2), '1.234.567,89');
  assert.equal(T.fmtNum(-0.004, 2), '0,00');
  assert.equal(T.fmtNum('', 2), '');
  assert.equal(T.fmtDate('2026-03-05'), '05/03/2026');
  assert.equal(T.fmtDate(Date.UTC(2026, 11, 31)), '31/12/2026');
  assert.equal(T.fmtCell({ t: 'pct' }, 0.256), '25,6%');
  assert.equal(T.fmtCell({ t: 'vnd' }, 1500), '1.500');
  assert.equal(T.fmtCell({ t: 'id' }, '000123'), '000123');
  assert.equal(T.chartSvg({ points: [] }), '');
  assert.equal(T.chartSvg(null), '');
  assert.match(T.chartSvg({ type: 'bar', title: 'A<b>', unit: 'tấn', scale: 1000, points: [{ label: 'x', value: 5000 }] }), /A&lt;b&gt;/);
});

/* ---------- Bảng chéo kho xuất × hình thức (mẫu 2) ---------- */
test('bảng chéo kho × hình thức: ô = thực giao, tổng hàng / cột khớp bảng theo kho, có trả về và chưa phân bổ nằm ngoài', async () => {
  const s = setup([
    {
      meta: meta('A', '03/02/2026', '03/02/2026', { kho: 'w1>w2' }),
      rows: [row(1, 10000, '03/02/2026'), row(3, 5000, '03/02/2026')],
      ret: ['f#3'],
    },
    { meta: meta('B', '03/02/2026', '03/02/2026', { kho: 'w2>w1', type: 'uythac', ship: 'TÀU B' }), rows: [row(2, 7000, '03/02/2026')] },
    { meta: meta('C', '04/02/2026', '04/02/2026', { kho: 'w1>w2', type: 'uythac', ship: 'TÀU C' }), rows: [row(4, 3000, '04/02/2026')] },
  ]);
  s.metas.push(meta('U', '05/02/2026', '05/02/2026', { kho: 'w1>w2', ship: 'TÀU U', kg: 9000, trips: 1 })); // không đọc được phiếu
  const ctx = ctxOf(s, { ticketErrors: new Map([['U', { code: 'load-error', message: 'x' }]]) });
  const doc = T.breakdownReport(ctx, { groupBy: 'ship' }),
    x = sec(doc, 'khoType'),
    byKho = sec(T.breakdownReport(ctx, { groupBy: 'kho' }), 'groups');
  assert.ok(x, 'có bảng chéo');
  const row1 = x.rows.find((r) => r.c.kho === 'Kho Quế Sơn').c,
    row2 = x.rows.find((r) => r.c.kho === 'Kho Đà Nẵng').c;
  assert.equal(row1.t_xuatkhau, 10000, 'Quế Sơn × Xuất khẩu: 15.000 − trả về 5.000');
  assert.equal(row1.t_uythac, 3000);
  assert.equal(row2.t_uythac, 7000);
  assert.equal(row2.t_xuatkhau, 0);
  assert.equal(row1.retKg, 5000);
  assert.equal(x.totals.delKg, 20000, 'tổng thực giao toàn bảng');
  assert.equal(x.totals.delKg, sec(doc, 'groups').totals.delKg, 'khớp tổng bảng theo tàu');
  assert.equal(x.totals.delKg, byKho.totals.delKg, 'khớp tổng bảng theo kho');
  // hàng + cột
  x.rows.forEach((r) =>
    assert.equal(
      r.c.delKg,
      Object.keys(r.c)
        .filter((k) => k.indexOf('t_') === 0)
        .reduce((a, k) => a + r.c[k], 0)
    )
  );
  assert.equal(x.totals.t_xuatkhau + x.totals.t_uythac, x.totals.delKg);
  assert.match(x.note, /không có số liệu nhập kho/);
  assert.match(x.note, /Chưa phân bổ/);
  assert.equal(x.rows[0].drill.tickets.length > 0, true, 'mở được phiếu nguồn từ dòng kho');
  // xuất Excel và bản in cùng bảng
  const cols = x.columns.map((c) => c.h);
  assert.ok(cols.includes('Xuất khẩu') || cols.some((h) => /xuất khẩu/i.test(h)));
  const spec = T.toPrintSpec(doc);
  assert.ok(spec.tables.some((t) => t.caption && /Kho xuất × hình thức/.test(t.caption)));
});
