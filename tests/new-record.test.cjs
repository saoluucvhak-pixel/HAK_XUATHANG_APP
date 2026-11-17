/* Tạo mới / mở hồ sơ: "Thêm mới" xóa sạch trạng thái hồ sơ trước (phiếu bỏ, xe trả về, phiếu chọn riêng, lọc, liên kết hợp đồng); hỏi Lưu / Bỏ / Quay lại khi có thay đổi chưa lưu; mở lại hồ sơ A phục hồi đúng lựa chọn của A. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function boot() {
  const nodes = new Map(), node = (value = '', tagName = 'INPUT') => ({ value, tagName, options: [], textContent: '', checked: false, innerHTML: '', classList: { toggle() {} }, append(o) { this.options.push(o); } });
  ['ship', 'docDate', 'contractNo'].forEach((k) => nodes.set('#f-xuatkhau-' + k, node())); nodes.set('#f-xuatkhau-contractId', node('', 'SELECT')); nodes.set('#year-note-xuatkhau', node()); nodes.set('#ctMsg-xuatkhau', node());
  const log = { saves: 0, clears: 0, saveFails: false };
  const window = { XLSX: require('../app/libs/xlsx.full.min.js'), HAK: { UI: { $: (s) => nodes.get(s), $$: () => [], esc: String, todayISO: () => '', toast() {}, Loading: {}, debounce: (f) => f }, App: { slots: {} }, Store: { get: (k, f) => f }, Config: { data: { companies: [], warehouses: [] }, custom: {} },
    Yearbook: { year: 2026, clear() { log.clears++; }, async save() { if (log.saveFails) throw new Error('Kho hồ sơ đã thay đổi'); log.saves++; }, active: () => null } } };
  const ctx = { window, document: { createElement: () => node('', 'OPTION') }, console, Set, Map, Date, JSON, Math };
  vm.createContext(ctx);
  for (const file of ['excel.js', 'generator.js', 'pages-modals.js', 'pages-contract.js', 'pages-filter.js', 'pages.js']) { let src = fs.readFileSync(require.resolve('../app/js/' + file), 'utf8'); if (file === 'pages.js') src = src.replace('  HAK.Pages = {', '  renderFilter=()=>{};updateSummary=()=>{};HAK.Pages = {'); vm.runInContext(src, ctx); }
  const H = window.HAK, ts = (h) => Date.UTC(2026, 10, 12, h, 0), row = (n, h) => ({ idx: n, uid: 'f#' + n, ticket: 'P' + n, plate: '43C-' + n, ts1: ts(h), dateStr: '12/11/2026', time1: '12/11/2026 ' + h + ':00', net: 1000 * n, note: '', warn: [] });
  const rows = [row(1, 6), row(2, 8), row(3, 10)];
  H.App.slots.xuatkhau = { ds: { ok: true, rows, stats: H.Excel.computeStats(rows) } };
  return { H, nodes, rows, log };
}
const filtered = (H, rows) => H.Generator.filterRows(rows, H.Pages._collect('xuatkhau').filter).map((r) => r.ticket);
test('Thêm mới sau khi bỏ P2 + đánh dấu P3 trả về ở tàu A: tàu B có đủ P1 P2 P3, P3 không còn trả về; mở lại A phục hồi lựa chọn của A', async () => {
  const { H, nodes, rows } = boot(), st = H.Pages._st('xuatkhau');
  nodes.get('#f-xuatkhau-ship').value = 'TÀU A';
  H.Pages.markClean('xuatkhau');
  st.omit.set(H.Generator.omitKey(rows[1]), { key: H.Generator.omitKey(rows[1]), ticket: 'P2', plate: '43C-2', kg: 2000, reason: 'nhập nhầm' }); st.returned.add('f#3');
  assert.deepEqual(filtered(H, rows), ['P1', 'P3']); assert.equal(H.Pages.isDirty('xuatkhau'), true);
  const A = H.Pages.snapshot('xuatkhau');                                          // hồ sơ A đã lập: P1 + P3 (P3 trả về)
  assert.deepEqual(Array.from(A.params.returned), ['f#3']); assert.equal(A.params.filter.omit.length, 1);
  H.Pages._choose = () => 'discard'; assert.equal(await H.Pages.newRecord('xuatkhau'), true);                    // Thêm mới → tàu B
  assert.equal(st.omit.size, 0, 'phiếu bỏ của A không được sót'); assert.equal(st.returned.size, 0, 'P3 chưa bị đánh dấu trả về'); assert.equal(nodes.get('#f-xuatkhau-ship').value, '');
  assert.deepEqual(filtered(H, rows), ['P1', 'P2', 'P3'], 'phạm vi mới có cả P2 và P3'); assert.equal(H.Pages.isDirty('xuatkhau'), false);
  H.Pages.openSnapshot({ type: 'xuatkhau', year: 2026, revision: 1, params: A.params, rows: A.rows });             // mở lại A
  assert.equal(nodes.get('#f-xuatkhau-ship').value, 'TÀU A'); assert.deepEqual(Array.from(st.returned), ['f#3']); assert.equal(st.omit.size, 1); assert.equal(Array.from(st.omit.values())[0].reason, 'nhập nhầm');
  assert.deepEqual(H.Pages._collect('xuatkhau').filter.omit.length, 1);
});
test('thay đổi chưa lưu: Quay lại giữ nguyên form; Bỏ thay đổi thì chuyển; Lưu rồi tiếp tục gọi lưu, lỗi lưu thì ở lại', async () => {
  const { H, nodes, log, rows } = boot(), st = H.Pages._st('xuatkhau'); H.Pages.markClean('xuatkhau');
  st.returned.add('f#2'); nodes.get('#f-xuatkhau-ship').value = 'TÀU A';
  H.Pages._choose = () => 'back'; assert.equal(await H.Pages.newRecord('xuatkhau'), false); assert.deepEqual(Array.from(st.returned), ['f#2']); assert.equal(nodes.get('#f-xuatkhau-ship').value, 'TÀU A', 'Hủy giữ nguyên form');
  log.saveFails = true; H.Pages._choose = () => 'save'; assert.equal(await H.Pages.newRecord('xuatkhau'), false); assert.equal(st.returned.size, 1, 'lưu lỗi → không xóa gì');
  log.saveFails = false; assert.equal(await H.Pages.newRecord('xuatkhau'), true); assert.equal(log.saves, 1); assert.equal(st.returned.size, 0);
  assert.equal(H.Pages.isDirty('xuatkhau'), false); H.Pages._choose = () => { throw new Error('không được hỏi khi không có thay đổi'); }; assert.equal(await H.Pages.newRecord('xuatkhau'), true);
  assert.ok(rows.length);
});
test('liên kết hợp đồng, phạm vi giờ / số phiếu / phiếu chọn riêng và bản chụp không sang hồ sơ mới; công ty / kho mặc định được giữ', async () => {
  const { H, nodes } = boot(), st = H.Pages._st('xuatkhau');
  H.Pages.openSnapshot({ type: 'xuatkhau', year: 2026, revision: 3, params: { ship: 'TÀU A', contractId: 'd1', contractDetailId: 'd1', parentContractId: 'p1', certSnap: { v: 1, overrides: [] }, filter: { from: '', to: '', timeFrom: '06:00', timeTo: '09:00', ticketFrom: '1', ticketTo: '2', pick: ['x'] }, returned: [] }, rows: [] });
  assert.ok(st.snapshotParams && st.filter.timeFrom === '06:00');
  H.Pages._choose = () => 'discard'; await H.Pages.newRecord('xuatkhau');
  const p = H.Pages._collect('xuatkhau'); assert.equal(st.snapshotParams, undefined); assert.equal(p.contractId || '', ''); assert.equal(p.contractDetailId, undefined); assert.equal(p.certSnap, undefined);
  assert.deepEqual(Object.keys(p.filter).sort(), ['from', 'groups', 'to']); assert.equal(nodes.get('#f-xuatkhau-ship').value, '');
});
