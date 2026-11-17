/* Báo cáo thực hiện hợp đồng: mọi dòng đủ số cột theo định nghĩa cột; nhóm / phần PDF dẫn xuất đúng; thuế còn nợ đúng cột. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const CM = require('../app/js/customs-model.js'),
  M = require('../app/js/contract-model.js');
global.HAK.CustomsModel = CM;
global.HAK.ContractModel = M;
global.HAK.NumFmt = require('../app/js/numfmt.js');
const CF = require('../app/js/contract-file.js'),
  O = require('../app/js/contract-overview.js');

function fixture() {
  const c = M.parent({ type: 'xuatkhau', no: 'HD1', date: '2026-08-06', contractQty: 6000, priceUsd: 176, details: [] });
  c.details.push(
    M.child(c.id, { ship: 'M/V A', certNo: 'C1', bdmt: 4000, mt: 8000, exchangeRate: 26000 }),
    M.child(c.id, { ship: 'M/V B', bdmt: 1000 })
  );
  const decl = CM.newDecl({
    no: '308629701721',
    contractId: c.id,
    detailId: c.details[0].id,
    status: 'cleared',
    qtyBdmt: 4000,
    taxVnd: 100,
    payments: [{ amount: 40 }],
  });
  const loose = CM.newDecl({ no: '308629701999', contractId: c.id, status: 'opened', taxVnd: 10 });
  HAK.Catalog = { core: { get: () => ({ contracts: [c], customers: [], customs: [decl, loose] }) } };
  const m = CF.build(c.id, []);
  return { g: { f: { buyer: 'IWC' }, khos: ['Kho A'], from: '18/08/2026', to: '20/08/2026' }, m };
}

test('mọi dòng (hợp đồng, chi tiết, tờ khai chưa gắn) có đủ số cột; khóa cột duy nhất', () => {
  const rows = O.rowsOf(fixture());
  assert.ok(rows.length >= 4);
  assert.equal(rows[0].cls, 'main');
  rows.forEach((r, i) => assert.equal(r.c.length, O.COLS.length, 'dòng ' + i));
  assert.equal(new Set(O.COLS.map((c) => c.k)).size, O.COLS.length);
  assert.ok(Object.keys(O.IX).length === O.COLS.length);
});

test('thuế còn nợ nằm đúng cột CÒN NỢ; Σ cột số chỉ ở cột có sum', () => {
  const rows = O.rowsOf(fixture()),
    main = rows[0].c;
  assert.equal(main[O.IX.payable], '110');
  assert.equal(main[O.IX.paid], '40');
  assert.equal(main[O.IX.owing], '70'); // 100 + 10 (tờ khai chưa gắn) − 40
  assert.equal(rows.find((r) => /chưa gắn chi tiết/.test(r.c[0])).c[O.IX.tkct], '⚠ Chưa gắn chi tiết');
  O.COLS.forEach((c) => {
    if (c.sum) assert.ok(c.n, c.k + ': cột cộng tổng phải là cột số');
  });
});

test('PDF chia 2 phần: phần 1 = nhóm ①–④, phần 2 = cột đầu + nhóm ⑤–⑦; không cột nào bị bỏ sót', () => {
  assert.equal(O.PART1[0], 0);
  assert.equal(O.PART2[0], 0);
  const all = new Set([].concat(O.PART1, O.PART2));
  assert.equal(all.size, O.COLS.length);
  assert.ok(O.PART1.every((i) => O.COLS[i].b <= 3));
  assert.ok(O.PART2.slice(1).every((i) => O.COLS[i].b >= 4));
  assert.ok(O.PART2.indexOf(O.IX.owing) > 0 && O.PART2.indexOf(O.IX.kho) > 0 && O.PART1.indexOf(O.IX.cert) > 0);
});

function fx2(opts = {}) {
  // hợp đồng USD, 1 chi tiết; 2 tờ khai: một còn nợ 20, một nộp thừa 20
  const c = M.parent({ type: 'xuatkhau', no: 'HD2', date: '2026-08-06', contractQty: 6000, priceUsd: 176, currency: 'USD', details: [] });
  const d1 = M.child(c.id, Object.assign({ ship: 'M/V A', certNo: 'C1', mt: 8000, bdmt: 4000, exchangeRate: 26000 }, opts.detail || {}));
  c.details.push(d1);
  const t1 = CM.newDecl({
    no: '308629701001',
    contractId: c.id,
    detailId: d1.id,
    status: 'cleared',
    taxVnd: 100,
    payments: [{ amount: 80, receiptNo: 'A1' }],
  });
  const t2 = CM.newDecl({
    no: '308629701002',
    contractId: c.id,
    status: 'cleared',
    taxVnd: 100,
    payments: [
      { amount: 120, receiptNo: 'A2' },
      { amount: 7, kind: 'fee', receiptNo: 'A3' },
    ],
  });
  HAK.Catalog = { core: { get: () => ({ contracts: [c], customers: [], customs: opts.noDecl ? [] : [t1, t2] }) } };
  const lot = opts.noDecl
    ? null
    : { c: { id: d1.id }, trips: 2, kg: 9000, retKg: 1000, delKg: 8000, recs: [], from: '18/08/2026', to: '20/08/2026' };
  const m = CF.build(c.id, [{ key: c.id, c, lots: lot ? [lot] : [] }]);
  return { g: { f: { buyer: 'IWC' }, khos: ['Kho A'], from: '18/08/2026', to: '20/08/2026' }, m };
}
test('thuế: còn nợ 20 và nộp thừa 20 hiển thị riêng dù ròng = 0; lệ phí tách riêng; tờ khai chưa gắn chi tiết vẫn tính', () => {
  const { m } = fx2();
  assert.equal(m.tax.owed, 20);
  assert.equal(m.tax.over, 20);
  assert.equal(m.tax.net, 0);
  assert.equal(m.tax.fee, 7);
  assert.equal(m.tax.text, 'Còn nợ 20 đ (1 tờ khai) · Nộp thừa 20 đ (1 tờ khai)');
  const rows = O.rowsOf(fx2()),
    main = rows[0].c;
  assert.equal(main[O.IX.owing], '20');
  assert.equal(main[O.IX.over], '20');
  assert.equal(main[O.IX.payable], '200');
  assert.equal(main[O.IX.paid], '200');
  assert.ok(m.tax.remaining > 0, 'bộ lọc "Còn nợ thuế" (f.owing = tax.remaining > 0) vẫn tìm thấy hợp đồng dù số dư ròng = 0');
  assert.deepEqual(rows.length === 0, false);
  assert.equal(m.axes.tax.code, 'owing');
  assert.equal(m.axes.customs.label, 'Đã thông quan đủ');
  assert.equal(m.axes.progress.code, 'running', 'thông quan đủ không có nghĩa hoàn thành: mới 4000/6000 BDMT');
});
test('giao diện, Excel và PDF dùng chung một bộ số: bảng thuế trong hồ sơ hợp đồng khớp tổng', () => {
  const { m } = fx2(),
    spec = CF.specOf(m),
    tax = spec.tables.find((t) => /Thuế xuất khẩu/.test(t.caption));
  const total = tax.rows.find((r) => r.cls === 'total').c,
    owedIdx = tax.cols.findIndex((c) => c.h === 'CÒN NỢ'),
    overIdx = tax.cols.findIndex((c) => c.h === 'NỘP THỪA');
  assert.equal(total[owedIdx], '20');
  assert.equal(total[overIdx], '20');
  assert.match(spec.sub, /Thuế: Còn nợ thuế — Còn nợ 20 đ \(1 tờ khai\) · Nộp thừa 20 đ \(1 tờ khai\)/);
  assert.ok(
    tax.rows.some((r) => /Số dư ròng/.test(r.c[0]) && r.c[owedIdx] === '0'),
    'số dư ròng có tên chỉ tiêu rõ ràng'
  );
});
test('thiếu số liệu đối chiếu: không im lặng báo khớp khi chứng thư / tờ khai thiếu dữ liệu', () => {
  const miss = fx2({ detail: { certNo: '', exchangeRate: null, bdmt: null, mt: 8000 } });
  const kinds = miss.m.checks.filter((k) => k.ok === null).map((k) => k.what);
  assert.ok(
    kinds.some((w) => /Số chứng thư/.test(w)),
    'tờ khai có số chứng thư mà chứng thư trống'
  );
  assert.ok(
    kinds.some((w) => /Đơn giá · tiền tệ · tỷ giá/.test(w)),
    'USD không có tỷ giá'
  );
  const row = miss.m.rows[0];
  assert.match(row.tkct.t, /^Thiếu số liệu đối chiếu/);
  assert.equal(row.tkct.s, 'info');
  assert.match(O.rowsOf(miss)[0].c[O.IX.tkct], /^Thiếu số liệu đối chiếu \(1\/1 chi tiết\)/);
  const ok = fx2();
  assert.deepEqual(
    ok.m.checks.filter((k) => k.ok === false).map((k) => k.what.slice(0, 12)),
    ['KL tươi: MT ', 'Tờ khai chưa'],
    'chỉ lệch thật (MT 8.000 t tươi ↔ thực giao 8 t) và tờ khai chưa gắn chi tiết'
  );
});
test('ba chỉ tiêu khối lượng tách bạch: BDMT hợp đồng hiện hành · BDMT chứng thư · MT thực giao', () => {
  const { m } = fx2(),
    what = m.checks.map((k) => k.what);
  assert.ok(what.some((w) => /Σ BDMT theo chứng thư ↔ BDMT hợp đồng hiện hành sau phụ lục/.test(w)));
  assert.ok(what.some((w) => /MT theo chứng thư ↔ MT thực giao qua cân, đã trừ xe trả về/.test(w)));
  const gap = m.checks.find((k) => /MT thực giao/.test(k.what));
  assert.equal(gap.a, '8.000');
  assert.equal(gap.b, '8');
  assert.equal(gap.diff, '7.992'); // MT 8000 t tươi vs thực giao 8,000 t (8000 kg − 0)
});

test('Google Sheet: cột mới thêm Ở CUỐI (cột cũ giữ vị trí), mọi dòng đủ cột; nợ 20 / thừa 20 và KL gốc trống nhất quán với màn hình', () => {
  const GS = require('../app/js/gsync-contracts.js');
  const { m } = fx2(),
    c = HAK.Catalog.core.get().contracts[0];
  c.addenda = [{ id: 'pl1', no: 'PL1', date: '2026-09-01', qty: 500, seq: 1 }];
  c.qtyOrig = null;
  c.contractQty = 500;
  const sheets = GS.buildSheets([{ c, buyer: 'IWC', m: CF.build(c.id, [{ key: c.id, c, lots: [] }]) }], { M, CM });
  sheets.forEach((s) => s.rows.forEach((r) => assert.equal(r.length, s.cols.length, s.name + ' đủ cột')));
  const hd = sheets.find((s) => s.name === 'NL_HOPDONG'),
    H = hd.cols.map((x) => x.h),
    row = hd.rows[0];
  assert.equal(H[21], 'Trạng thái hợp đồng');
  assert.equal(H[22], 'Cập nhật lúc');
  assert.equal(H[0], 'Mã HĐ (app)'); // vị trí cột cũ không đổi
  assert.equal(row[H.indexOf('KL gốc (BDMT)')], '', 'KL gốc để trống, không lấy 500 của phụ lục');
  assert.equal(row[H.indexOf('KL hiện hành (BDMT)')], 500);
  assert.equal(row[H.indexOf('Còn nợ thuế (đ)')], 20);
  assert.equal(row[H.indexOf('Nộp thừa (đ)')], 20);
  assert.equal(row[H.indexOf('Số dư ròng thuế (đ)')], 0);
  assert.equal(row[H.indexOf('Thông quan')], 'Đã thông quan đủ');
  assert.match(row[H.indexOf('Tình trạng thuế')], /Còn nợ 20 đ.*Nộp thừa 20 đ/);
  const pl = sheets.find((s) => s.name === 'NL_PHULUC');
  assert.equal(pl.rows[0][5], '', 'không có KL gốc thì không có cột tăng / giảm');
  const spec = CF.specOf(CF.build(c.id, [{ key: c.id, c, lots: [] }]));
  assert.match(spec.tables[0].rows ? JSON.stringify(spec.tables[0]) : '', /để trống|chưa nhập/);
});

test('khung xem Hồ sơ hợp đồng (HTML) dựng được cả khi KL gốc để trống + phụ lục (không lỗi biến chưa khai báo)', () => {
  HAK.UI = { esc: (s) => String(s == null ? '' : s) };
  const { m } = fx2(),
    c = HAK.Catalog.core.get().contracts[0];
  c.addenda = [{ id: 'pl1', no: 'PL1', date: '2026-09-01', qty: 500, seq: 1 }];
  c.qtyOrig = null;
  c.contractQty = 500;
  const mm = CF.build(c.id, [{ key: c.id, c, lots: [] }]),
    out = CF.html(mm, CF.specOf(mm));
  assert.match(out, /gốc để trống/);
  assert.match(out, /Tiến độ/);
  assert.ok(m);
});
