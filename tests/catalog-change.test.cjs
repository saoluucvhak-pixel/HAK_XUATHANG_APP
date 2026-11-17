/* Danh mục đổi trong lúc lập hồ sơ: phát hiện các ô sẽ cập nhật (giá trị cũ / mới), giữ ô nhập tay; hồ sơ đã lưu dùng bản chụp không đổi theo Danh mục. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function boot(store) {
  const nodes = new Map(), node = (value = '', tagName = 'INPUT') => ({ value, tagName, options: [], textContent: '', checked: false, innerHTML: '', dataset: {}, classList: { toggle() {} }, append(o) { this.options.push(o); }, querySelector: () => null });
  ['ship', 'contractNo', 'contractQty'].forEach((k) => nodes.set('#f-uythac-' + k, node())); nodes.set('#f-uythac-contractId', node('d1', 'SELECT')); nodes.set('#ctMsg-uythac', node()); nodes.set('#year-note-uythac', node());
  const cat = { detail: { id: 'd1', detailId: 'd1', parentId: 'p1', no: 'HD-1', ship: 'TÀU CŨ', qty: 500, certNo: 'C1', mt: 100, bdmt: 50, moisture: 50 } };
  const window = { XLSX: require('../app/libs/xlsx.full.min.js'), HAK: { UI: { $: (s) => nodes.get(s), $$: () => [], esc: String, todayISO: () => '', toast() {}, Loading: {}, debounce: (f) => f }, App: { slots: {} }, Store: { get: (k, f) => (k in store ? store[k] : f), set: (k, v) => { store[k] = v; } }, Config: { data: { companies: [], warehouses: [] }, custom: {} },
    Catalog: { TYPES: { uythac: { label: 'Ủy thác' } }, contract: () => cat.detail, label: (c) => c.no, customer: () => null, contracts: () => [cat.detail], util: { vnDate: (s) => s }, relatedTo: () => true } } };
  const ctx = { window, document: { createElement: () => node('', 'OPTION') }, console, Set, Map, Date, JSON, Math };
  vm.createContext(ctx);
  for (const file of ['excel.js', 'generator.js', 'pages-modals.js', 'pages-contract.js', 'pages-filter.js', 'pages-bkls.js', 'pages.js']) { let src = fs.readFileSync(require.resolve('../app/js/' + file), 'utf8'); if (file === 'pages.js') src = src.replace('  HAK.Pages = {', '  renderFilter=()=>{};updateSummary=()=>{};HAK.Pages = {'); vm.runInContext(src, ctx); }
  return { H: window.HAK, nodes, cat };
}
test('đổi tàu / số lượng trong Danh mục khi form đang mở: báo từng ô với giá trị cũ → mới; ô nhập tay được giữ', () => {
  const store = { 'hak.ctfill.uythac': { ship: 'TÀU CŨ', contractNo: 'HD-1', contractQty: '500' } }, { H, nodes, cat } = boot(store);
  nodes.get('#f-uythac-ship').value = 'TÀU CŨ'; nodes.get('#f-uythac-contractNo').value = 'HD-1'; nodes.get('#f-uythac-contractQty').value = '500';
  assert.deepEqual(Array.from(H.Pages._catalogDiff('uythac')), [], 'chưa đổi gì → không báo');
  cat.detail = Object.assign({}, cat.detail, { ship: 'TÀU MỚI', qty: 700 });
  let d = Array.from(H.Pages._catalogDiff('uythac')).map((x) => ({ id: x.id, old: x.old, nv: x.nv, edited: x.edited }));
  assert.deepEqual(d.sort((a, b) => a.id.localeCompare(b.id)), [{ id: 'contractQty', old: '500', nv: '700', edited: false }, { id: 'ship', old: 'TÀU CŨ', nv: 'TÀU MỚI', edited: false }]);
  nodes.get('#f-uythac-ship').value = 'TÀU GÕ TAY';                                   // người dùng tự sửa ô tàu
  d = Array.from(H.Pages._catalogDiff('uythac')); const ship = d.find((x) => x.id === 'ship'); assert.equal(ship.edited, true); assert.equal(ship.cur, 'TÀU GÕ TAY'); assert.equal(ship.nv, 'TÀU MỚI');
});
test('hồ sơ đã lưu (bản chụp) không bị thông báo / đổi theo Danh mục', () => {
  const { H, cat } = boot({ 'hak.ctfill.uythac': { ship: 'TÀU CŨ' } });
  H.Pages.openSnapshot({ type: 'uythac', year: 2026, revision: 1, params: { ship: 'TÀU CŨ', contractDetailId: 'd1', certSnap: { v: 1, overrides: [] }, filter: { from: '', to: '' }, returned: [] }, rows: [] });
  cat.detail = Object.assign({}, cat.detail, { ship: 'TÀU MỚI' });
  assert.deepEqual(Array.from(H.Pages._catalogDiff('uythac')), []); assert.equal(H.Pages._collect('uythac').ship, 'TÀU CŨ', 'mở / in lại dùng giá trị đã lưu');
});
