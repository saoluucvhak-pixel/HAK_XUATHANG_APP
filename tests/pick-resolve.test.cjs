/* Hộp chọn phiếu: phân giải số phiếu dán vào — khớp đầy đủ trước; khớp đuôi chỉ khi có đúng 1 kết quả; nhiều kết quả → cần xác nhận. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function boot() {
  const node = () => ({ value: '', options: [], textContent: '', checked: false, classList: { toggle() {} }, append() {} });
  const window = { XLSX: require('../app/libs/xlsx.full.min.js'), HAK: { UI: { $: () => node(), $$: () => [], esc: String, todayISO: () => '', toast() {}, Loading: {}, debounce: (f) => f }, App: { slots: {} }, Store: { get: (k, f) => f }, Config: { data: { companies: [], warehouses: [] }, custom: {} } } };
  const ctx = { window, document: { createElement: () => node() }, console, Set, Map, Date, JSON, Math };
  vm.createContext(ctx);
  for (const file of ['excel.js', 'generator.js', 'pages-modals.js', 'pages-contract.js', 'pages-filter.js', 'pages-bkls.js', 'pages.js']) { let src = fs.readFileSync(require.resolve('../app/js/' + file), 'utf8'); if (file === 'pages.js') src = src.replace('  HAK.Pages = {', '  renderFilter=()=>{};updateSummary=()=>{};HAK.Pages = {'); vm.runInContext(src, ctx); }
  return window.HAK;
}
const R = (t) => ({ ticket: t, plate: 'P-' + t });
test('khớp đầy đủ được ưu tiên: dán 123 khi có cả 123 và 99123 → chỉ chọn 123', () => {
  const H = boot(), rows = [R('99123'), R('123'), R('456')], r = H.Pages._pick.resolveTicket(rows, '123');
  assert.equal(r.kind, 'one'); assert.deepEqual(Array.from(r.hits.map((x) => x.ticket)), ['123']);
});
test('khớp đuôi chỉ khi có ĐÚNG MỘT kết quả; nhiều kết quả → many (chờ xác nhận); không có → none', () => {
  const H = boot(), rows = [R('PC-000101'), R('PC-000201'), R('PC-000305')], f = (t) => H.Pages._pick.resolveTicket(rows, t);
  assert.equal(f('305').kind, 'one'); assert.equal(f('305').hits[0].ticket, 'PC-000305');
  assert.equal(f('01').kind, 'many'); assert.equal(f('01').hits.length, 2);
  assert.equal(f('999').kind, 'none'); assert.equal(f('  ').kind, 'none'); assert.equal(f('pc-000101').kind, 'one', 'không phân biệt hoa thường');
});
test('nhiều phiếu trùng số đầy đủ (khác biển số) → many, không tự chọn', () => {
  const H = boot(), rows = [{ ticket: '7', plate: 'A' }, { ticket: '7', plate: 'B' }], r = H.Pages._pick.resolveTicket(rows, '7'); assert.equal(r.kind, 'many'); assert.equal(r.hits.length, 2);
});
