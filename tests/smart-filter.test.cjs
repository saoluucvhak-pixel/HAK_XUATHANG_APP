const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.HAKCore = { sf: require('../app/libs/hak-smart-filter/core.js') };
require('../app/libs/hak-smart-filter/browser.js');
require('../app/js/hak-filters.js');
require('../app/js/excel.js');
require('../app/js/generator.js');
const F = global.HAK.Filters,
  G = global.HAK.Generator;
const rows = [
  {
    idx: 1,
    uid: 'A.xlsx#1',
    ticket: 'P1',
    plate: '43C-123.45',
    driver: 'Nguyễn An',
    carrier: 'Đà Nẵng',
    note: 'A',
    net: 12500,
    dateStr: '01/10/2026',
    ts1: Date.UTC(2026, 9, 1, 23, 59, 59),
    warn: [],
  },
  {
    idx: 2,
    uid: 'A.xlsx#2',
    ticket: 'P2',
    plate: '43C-222.22',
    driver: 'Trần Bình',
    carrier: 'Hội An',
    note: 'B',
    net: 15000,
    dateStr: '02/10/2026',
    ts1: Date.UTC(2026, 9, 2),
    warn: ['Kiểm tra'],
  },
  {
    idx: 3,
    uid: 'B.xlsx#3',
    ticket: 'P3',
    plate: '43C-333.33',
    driver: 'Lê Chi',
    carrier: 'Đà Nẵng',
    note: 'A',
    net: 10000,
    dateStr: '03/10/2026',
    ts1: Date.UTC(2026, 9, 3),
    warn: [],
  },
];
test('shared document filter searches Vietnamese and preserves source and weights', () => {
  const before = JSON.stringify(rows);
  const selected = G.filterRows(rows, { smart: { q: 'nguyen an' } });
  assert.deepEqual(
    selected.map((r) => r.ticket),
    ['P1']
  );
  assert.equal(G.summarize(selected).kg, 12500);
  assert.equal(JSON.stringify(rows), before);
});
test('multi plate union intersects carrier and warning conditions', () => {
  const selected = F.trips(rows, { sel: { plate: ['43C-123.45', '43C-222.22'], carrier: ['Hội An'] }, flag: { warnings: true } });
  assert.deepEqual(
    selected.map((r) => r.ticket),
    ['P2']
  );
  assert.equal(
    selected.reduce((n, r) => n + r.net, 0),
    15000
  );
});
test('legacy conversion file, exclusion and group fences remain effective with smart search', () => {
  const f = { files: ['A.xlsx'], exclude: ['A.xlsx#2'], groups: ['A'], smart: { sel: { carrier: ['Đà Nẵng', 'Hội An'] } } };
  assert.deepEqual(
    G.filterRows(rows, f).map((r) => r.ticket),
    ['P1']
  );
  assert.deepEqual(G.filterRows(rows, { ...f, smart: { q: 'le chi' } }), []);
});
test('empty smart state retains the exact legacy selection, including empty group set', () => {
  for (const f of [{}, { groups: new Set() }, { from: '2026-10-02' }, { exclude: ['A.xlsx#1'] }])
    assert.deepEqual(G.filterRows(rows, { ...f, smart: F.core.empty() }), G.filterRows(rows, f));
});
test('smart dates include end-of-day and reject impossible/reversed dates', () => {
  assert.deepEqual(
    G.filterRows(rows, { smart: { tu: '2026-10-01', den: '2026-10-01' } }).map((r) => r.ticket),
    ['P1']
  );
  for (const s of [{ tu: '2026-02-31' }, { tu: '2026-10-03', den: '2026-10-01' }])
    assert.throws(() => G.filterRows(rows, { smart: s }), RangeError);
});
test('serialized archive filter regenerates the same ticket set and total', () => {
  const p = { filter: { from: '2026-10-01', to: '2026-10-03', smart: { sel: { carrier: ['Đà Nẵng'] } } } };
  const restored = JSON.parse(JSON.stringify(p));
  assert.deepEqual(G.filterRows(rows, p.filter), G.filterRows(rows, restored.filter));
  assert.equal(G.summarize(G.filterRows(rows, restored.filter)).kg, 22500);
});
test('presets remain isolated by screen and never mutate saved state', () => {
  const m = {};
  const store = F.core.presets({ getItem: (k) => m[k] || null, setItem: (k, v) => (m[k] = v) });
  store.save('document-xuatkhau', 'Đà Nẵng', { sel: { carrier: ['Đà Nẵng'] } });
  assert.deepEqual(store.list('archive'), []);
  assert.equal(store.list('document-xuatkhau').length, 1);
  const saved = store.get('document-xuatkhau', 'Đà Nẵng');
  const cfg = F.tripConfig();
  const state = F.core.applyPreset(cfg, saved).state;
  assert.deepEqual(
    F.trips(rows, state).map((r) => r.ticket),
    ['P1', 'P3']
  );
});
test('report supports several types while retaining deduplication and export model', () => {
  const R = require('../app/js/report.js');
  const metas = ['xuatkhau', 'uythac', 'xuatban'].map((type, i) => ({
    id: String(i),
    type,
    ship: type,
    title: type,
    from: '01/10/2026',
    to: '01/10/2026',
    trips: 1,
    kg: 1000,
    updatedAt: i,
  }));
  assert.deepEqual(
    R.compute(metas, { types: ['xuatkhau', 'xuatban'] }).used.map((r) => r.type),
    ['xuatkhau', 'xuatban']
  );
});

test('unknown archived smart conditions fail closed instead of exporting extra rows', () => {
  assert.throws(() => F.trips(rows, { sel: { future: ['yes'] } }), /không được hỗ trợ/);
});
test('M2.1: bộ lọc đã lưu tham chiếu mục không còn tồn tại → báo "hết hiệu lực" (stale), không im lặng; giá trị còn lại giữ nguyên', () => {
  const cfg = {
    screenId: 's',
    fields: [{ key: 'contract', label: 'Hợp đồng', type: 'multi', options: () => [{ value: 'hd-1', label: 'HD-1' }], match: () => true }],
  };
  const r = F.core.applyPreset(cfg, { state: { sel: { contract: ['hd-1', 'hd-da-xoa'] } } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.stale, [{ key: 'contract', label: 'Hợp đồng', count: 1, total: 2 }]);
  assert.deepEqual(r.state.sel.contract, ['hd-1', 'hd-da-xoa'], 'giữ điều kiện (không tự rộng ra thành "tất cả")');
  assert.deepEqual(r.dropped, [], 'không rò mã nội bộ vào thông báo');
  const ok = F.core.applyPreset(cfg, { state: { sel: { contract: ['hd-1'] } } });
  assert.deepEqual(ok.stale, []);
});
