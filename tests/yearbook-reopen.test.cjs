/* Mở liên tiếp hai hồ sơ cũ: hồ sơ sau không mang theo dữ liệu hồ sơ trước; lưu lại vẫn giữ liên kết chi tiết hợp đồng. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function boot() {
  const nodes = new Map();
  const node = (value = '', tagName = 'INPUT') => ({ value, tagName, options: [], textContent: '', checked: false, classList: { toggle() {} }, append(o) { this.options.push(o); } });
  ['bklsNgayLapXe', 'ship', 'docDate', 'contractNo', 'contractDate', 'certNo'].forEach((k) => nodes.set('#f-xuatkhau-' + k, node()));
  nodes.set('#f-xuatkhau-contractId', node('', 'SELECT')); nodes.set('#year-note-xuatkhau', node());
  const window = { XLSX: require('../app/libs/xlsx.full.min.js'), HAK: { UI: { $: (s) => nodes.get(s), $$: () => [], esc: String, todayISO: () => '', toast() {}, Loading: {}, debounce: (f) => f }, App: { slots: {} }, Store: { get: (k, f) => f }, Config: { data: { companies: [], warehouses: [] }, custom: {} } } };
  const ctx = { window, document: { createElement: () => node('', 'OPTION') }, console, Set, Map, Date, JSON, Math };
  vm.createContext(ctx);
  for (const file of ['excel.js', 'generator.js', 'pages-modals.js', 'pages-contract.js', 'pages-filter.js', 'pages.js']) { let src = fs.readFileSync(require.resolve('../app/js/' + file), 'utf8'); if (file === 'pages.js') src = src.replace('  HAK.Pages = {', '  renderFilter=()=>{};updateSummary=()=>{};HAK.Pages = {'); vm.runInContext(src, ctx); }
  return { H: window.HAK, nodes };
}
const rec = (params) => ({ type: 'xuatkhau', year: 2025, revision: 1, params: Object.assign({ filter: { from: '', to: '' }, returned: [] }, params), rows: [{ idx: 1, net: 1500, note: '', plate: 'QA', ts1: Date.UTC(2025, 11, 30) }] });
test('hồ sơ sau không mang theo ô của hồ sơ trước (ô không có trong hồ sơ sau được xóa về mặc định)', () => {
  const { H, nodes } = boot();
  H.Pages.openSnapshot(rec({ ship: 'TÀU A', contractNo: 'HD-A', docDate: '2025-12-30', bklsNgayLapXe: false }));
  assert.equal(nodes.get('#f-xuatkhau-ship').value, 'TÀU A'); 
  H.Pages.openSnapshot(rec({ docDate: '2025-12-31' }));
  for (const k of ['ship', 'contractNo']) assert.equal(nodes.get('#f-xuatkhau-' + k).value, '', k + ' phải được xóa');
  assert.equal(nodes.get('#f-xuatkhau-bklsNgayLapXe').checked, true, 'ô tick về mặc định của form (def: true)'); assert.equal(nodes.get('#f-xuatkhau-docDate').value, '2025-12-31');
});
test('lưu lại hồ sơ cũ vẫn giữ liên kết chi tiết hợp đồng đã lưu (ô chọn hợp đồng bị khóa không ghi đè)', () => {
  const { H } = boot();
  H.Pages.openSnapshot(rec({ ship: 'TÀU A', contractId: 'detail-1', contractDetailId: 'detail-1', parentContractId: 'parent-1' }));
  const p = H.Pages._collect('xuatkhau');
  assert.equal(p.contractId, 'detail-1'); assert.equal(p.contractDetailId, 'detail-1'); assert.equal(p.parentContractId, 'parent-1');
  H.Pages.openSnapshot(rec({ ship: 'TÀU B' }));
  assert.equal(H.Pages._collect('xuatkhau').contractId || '', '', 'hồ sơ thứ hai không có liên kết → không mượn liên kết của hồ sơ trước');
});
test('mở liên tiếp hai hồ sơ có trường thiếu KHÁC NHAU: mỗi lần chỉ còn đúng giá trị của hồ sơ đang mở; lưu lại giữ liên kết riêng của từng hồ sơ', () => {
  const { H, nodes } = boot(), v = (k) => nodes.get('#f-xuatkhau-' + k).value, chk = () => nodes.get('#f-xuatkhau-bklsNgayLapXe').checked;
  const r1 = rec({ ship: 'TÀU 1', bklsNgayLapXe: false, contractId: 'detail-1', contractDetailId: 'detail-1' });                       // thiếu docDate
  const r2 = rec({ docDate: '2025-12-01', contractId: 'detail-2', contractDetailId: 'detail-2' });                                      // thiếu ship và bklsNgayLapXe
  H.Pages.openSnapshot(r1); assert.deepEqual([v('ship'), v('docDate'), chk()], ['TÀU 1', '', false]); assert.equal(H.Pages._collect('xuatkhau').contractId, 'detail-1');
  H.Pages.openSnapshot(r2); assert.deepEqual([v('ship'), v('docDate'), chk()], ['', '2025-12-01', true], 'ship + ô tick của hồ sơ 1 phải được xóa / về mặc định'); assert.equal(H.Pages._collect('xuatkhau').contractId, 'detail-2');
  H.Pages.openSnapshot(r1); assert.deepEqual([v('ship'), v('docDate'), chk()], ['TÀU 1', '', false], 'docDate của hồ sơ 2 phải được xóa'); assert.equal(H.Pages._collect('xuatkhau').contractDetailId, 'detail-1');
});
