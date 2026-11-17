const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
test('opening a saved year restores form fields and certificate rows without an Excel import', () => {
  const nodes = new Map();
  const node = (value = '', tagName = 'INPUT') => ({
    value,
    tagName,
    options: [],
    textContent: '',
    classList: { toggle() {} },
    append(o) {
      this.options.push(o);
    },
  });
  nodes.set('#f-xuatkhau-bklsNgayLapXe', node());
  nodes.set('#f-xuatkhau-ship', node());
  nodes.set('#f-xuatkhau-docDate', node());
  nodes.set('#f-xuatkhau-contractId', node('', 'SELECT'));
  nodes.set('#year-note-xuatkhau', node());
  const window = {
    XLSX: require('../app/libs/xlsx.full.min.js'),
    HAK: {
      UI: { $: (s) => nodes.get(s), $$: () => [], esc: String, todayISO: () => '', toast() {}, Loading: {}, debounce: (f) => f },
      App: { slots: {} },
      Store: { get: (k, f) => f },
      Config: { data: { companies: [], warehouses: [] }, custom: {} },
    },
  };
  const ctx = { window, document: { createElement: () => node('', 'OPTION') }, console, Set, Map, Date, JSON, Math };
  vm.createContext(ctx);
  for (const file of ['excel.js', 'generator.js', 'pages-modals.js', 'pages-contract.js', 'pages-filter.js', 'pages-bkls.js', 'pages.js']) {
    let source = fs.readFileSync(require.resolve('../app/js/' + file), 'utf8');
    if (file === 'pages.js') source = source.replace('  HAK.Pages = {', '  renderFilter=()=>{};updateSummary=()=>{};HAK.Pages = {');
    vm.runInContext(source, ctx);
  }
  const H = window.HAK;
  H.Pages.openSnapshot({
    type: 'xuatkhau',
    year: 2025,
    revision: 2,
    params: {
      ship: 'OLD VESSEL',
      docDate: '2025-12-30',
      bklsNgayLapXe: true,
      contractNo: 'OLD/25',
      filter: { from: '', to: '' },
      returned: [],
    },
    rows: [{ idx: 1, net: 1500, note: '', plate: 'QA', ts1: Date.UTC(2025, 11, 30) }],
  });
  assert.equal(nodes.get('#f-xuatkhau-bklsNgayLapXe').checked, true);
  assert.equal(nodes.get('#f-xuatkhau-ship').value, 'OLD VESSEL');
  assert.equal(nodes.get('#f-xuatkhau-docDate').value, '2025-12-30');
  nodes.get('#f-xuatkhau-ship').value = 'EDITED';
  const snap = H.Pages.snapshot('xuatkhau');
  assert.equal(snap.params.ship, 'EDITED');
  assert.equal(snap.params.contractNo, 'OLD/25');
  assert.equal(snap.rows[0].net, 1500);
  assert.match(nodes.get('#year-note-xuatkhau').textContent, /2025/);
});
