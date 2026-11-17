/* Bộ lọc: lưu / áp dụng / xóa theo từng màn hình, đặt lại, đổi công ty (nguồn khác) và xuất lại cùng bộ lọc đã lưu cho cùng tập phiếu; hai cách tính kỳ báo cáo. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
global.HAK = global.HAK || {};
require('../app/js/hak-filters.js');
require('../app/js/excel.js');
require('../app/js/generator.js');
const G = HAK.Generator,
  SF = HAKCore.sf;
const mem = () => {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => {
      m[k] = String(v);
    },
    removeItem: (k) => {
      delete m[k];
    },
  };
};
const ts = (d, h) => Date.UTC(2026, 10, d, h, 0);
const row = (n, d, h, plate, carrier, net) => ({
  idx: n,
  uid: 'f#' + n,
  ticket: 'PC-' + n,
  plate,
  carrier,
  ts1: ts(d, h),
  dateStr: d + '/11/2026',
  net,
  note: '',
});
const ROWS = [
  row(1, 12, 6, '43C-1', 'A', 100),
  row(2, 12, 9, '43C-2', 'B', 200),
  row(3, 12, 14, '43C-1', 'A', 300),
  row(4, 13, 7, '43C-3', 'B', 400),
];
const state = (extra) => Object.assign(SF.empty(), extra || {});

test('bộ lọc đã lưu tách theo màn hình: lưu / áp dụng / xóa; màn hình khác không thấy', () => {
  const ps = SF.presets(mem());
  assert.equal(ps.save('document-xuatkhau', 'Xe 1', state({ sel: { plate: ['43C-1'] } })).ok, true);
  assert.deepEqual(ps.list('document-xuatkhau'), ['Xe 1']);
  assert.deepEqual(ps.list('file-preview'), []);
  assert.deepEqual(ps.list('document-uythac'), []);
  const got = ps.get('document-xuatkhau', 'Xe 1');
  assert.deepEqual(got.state.sel.plate, ['43C-1']);
  ps.remove('document-xuatkhau', 'Xe 1');
  assert.deepEqual(ps.list('document-xuatkhau'), []);
  assert.equal(ps.get('document-xuatkhau', 'Xe 1'), null);
});
test('Áp dụng bộ lọc đã lưu rồi Đặt lại: lọc đúng tập phiếu, đặt lại trả đủ phiếu', () => {
  const ps = SF.presets(mem());
  ps.save('s', 'Biển 43C-1', state({ sel: { plate: ['43C-1'] } }));
  const smart = ps.get('s', 'Biển 43C-1').state;
  assert.deepEqual(
    G.filterRows(ROWS, { smart }).map((r) => r.idx),
    [1, 3]
  );
  assert.equal(G.filterRows(ROWS, { smart: SF.empty() }).length, 4, 'Đặt lại = không điều kiện');
});
test('đổi công ty / đợt (nguồn phiếu khác): điều kiện cũ không còn khớp → 0 phiếu, không âm thầm dùng phiếu khác', () => {
  const smart = state({ sel: { plate: ['43C-1'] } }),
    other = [row(9, 12, 8, '51D-9', 'Z', 500)];
  assert.equal(G.filterRows(other, { smart }).length, 0);
  assert.equal(G.filterRows(ROWS, { smart }).length, 2);
});
test('xuất lại với bộ lọc đã lưu: xem trước và các bảng xuất (chi tiết / theo biển số) cùng một tập phiếu và cùng tổng kg', () => {
  const filter = { from: '2026-11-12', to: '2026-11-12', smart: state({ sel: { carrier: ['A'] } }), omit: [] };
  const screen = G.filterRows(ROWS, filter),
    again = G.filterRows(ROWS, JSON.parse(JSON.stringify(filter)));
  assert.deepEqual(
    screen.map((r) => r.idx),
    again.map((r) => r.idx)
  );
  const kg = screen.reduce((a, r) => a + r.net, 0);
  assert.equal(screen.length, 2);
  assert.equal(kg, 400);
  const st = HAK.Excel.computeStats(screen);
  assert.equal(st.kg, kg);
  assert.equal(st.trips, screen.length);
  assert.equal(G.plateRows(screen).length, st.plates);
});
test('phiếu bỏ + giờ cân + phiếu chọn riêng cho cùng kết quả ở mọi lần lọc (màn hình = hồ sơ đã lưu = xuất)', () => {
  const omit = [G.omitKey(ROWS[1])],
    filter = { from: '2026-11-12', to: '2026-11-12', timeFrom: '06:00', timeTo: '15:00', omit };
  const a = G.filterRows(ROWS, filter).map((r) => r.idx),
    saved = JSON.parse(JSON.stringify(filter)),
    b = G.filterRows(ROWS, saved).map((r) => r.idx);
  assert.deepEqual(a, [1, 3]);
  assert.deepEqual(a, b);
});

test('kho bộ lọc hỏng: không ghi đè, sao lưu có mốc thời gian, lần hỏng thứ hai không đè bản sao lưu đầu', () => {
  const store = {};
  const st = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
  SF.presets(st).save('s', 'x', state());
  const key = Object.keys(store)[0];
  store[key] = 'first-corrupt';
  let p = SF.presets(st);
  assert.equal(p.isCorrupt(), true);
  assert.equal(p.save('s', 'y', state({ sel: { plate: ['A'] } })).corrupt, true);
  assert.equal(p.readCorrupt(), 'first-corrupt');
  const a = p.discardCorrupt();
  assert.equal(a.ok, true);
  assert.equal(store[a.backupKey], 'first-corrupt');
  store[key] = 'second-corrupt';
  p = SF.presets(st);
  const b = p.discardCorrupt();
  assert.notEqual(a.backupKey, b.backupKey);
  assert.equal(store[a.backupKey], 'first-corrupt');
  assert.equal(store[b.backupKey], 'second-corrupt');
  assert.equal(SF.presets(st).isCorrupt(), false);
});
