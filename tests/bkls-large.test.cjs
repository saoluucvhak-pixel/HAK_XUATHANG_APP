/* BKLS nhiều xe: bỏ giới hạn 100 / 200 xe — Word từng xe không giới hạn, PDF từng xe in theo từng đợt ≤ 100 xe. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function boot(print, confirms) {
  const nodes = new Map(), node = (value = '', tagName = 'INPUT') => ({ value, tagName, options: [], textContent: '', checked: false, classList: { toggle() {} }, append(o) { this.options.push(o); } });
  const toasts = [];
  const window = { XLSX: require('../app/libs/xlsx.full.min.js'), confirm: (m) => { confirms.push(m); return confirms.answers.length ? confirms.answers.shift() : true; }, HAK: { UI: { $: (s) => nodes.get(s), $$: () => [], esc: String, todayISO: () => '', toast: (m, t) => toasts.push([t, m]), Loading: {}, debounce: (f) => f }, App: { slots: {} }, Store: { get: (k, f) => f }, Config: { data: { companies: [], warehouses: [] }, custom: {} }, Word: { Pdf: { print } }, Bkls: { PDF_BATCH: 100 } } };
  const ctx = { window, confirm: window.confirm, document: { createElement: () => node('', 'OPTION') }, console, Set, Map, Date, JSON, Math, setTimeout, Promise };
  vm.createContext(ctx);
  for (const file of ['excel.js', 'generator.js', 'pages.js']) { let src = fs.readFileSync(require.resolve('../app/js/' + file), 'utf8'); if (file === 'pages.js') src = src.replace('  HAK.Pages = {', '  renderFilter=()=>{};updateSummary=()=>{};HAK.Pages = {'); vm.runInContext(src, ctx); }
  return { H: window.HAK, toasts };
}
const files = (n, w) => Array.from({ length: n }, (_, i) => ({ name: 'BKLS_xe_' + String(i + 1).padStart(4, '0') + '.docx', bytes: new Uint8Array(1) })).map((f) => Object.assign(f, { w }));
test('250 xe (mỗi xe một file) → in thành 3 đợt 100 / 100 / 50, hỏi xác nhận giữa các đợt', async () => {
  const calls = [], confirms = []; confirms.answers = [];
  const { H } = boot(async (fs_, o) => { calls.push([fs_.length, o && o.title]); }, confirms);
  await H.Pages._printInBatches(files(250), files(250).map(() => 1));
  assert.deepEqual(calls.map((c) => c[0]), [100, 100, 50]); assert.equal(confirms.length, 2); assert.match(calls[1][1], /dot2of3/);
});
test('bản in theo phần (mỗi file là một đợt ≤ 100 xe) → mỗi file một đợt; dưới 100 xe → một lần in, không hỏi', async () => {
  const calls = [], confirms = []; confirms.answers = [];
  const { H } = boot(async (fs_) => { calls.push(fs_.length); }, confirms);
  await H.Pages._printInBatches(files(3), [100, 100, 50]); assert.deepEqual(calls, [1, 1, 1]); assert.equal(confirms.length, 2);
  calls.length = 0; confirms.length = 0; await H.Pages._printInBatches(files(40), files(40).map(() => 1)); assert.deepEqual(calls, [40]); assert.equal(confirms.length, 0);
});
test('người dùng Hủy giữa chừng thì dừng, không in các đợt còn lại', async () => {
  const calls = [], confirms = []; confirms.answers = [false];
  const { H, toasts } = boot(async (fs_) => { calls.push(fs_.length); }, confirms);
  await H.Pages._printInBatches(files(250), files(250).map(() => 1)); assert.deepEqual(calls, [100]); assert.ok(toasts.some((t) => /Đã dừng sau đợt in 1\/3/.test(t[1])));
});
test('không còn chặn cứng 100 / 200 xe trong mã', () => {
  assert.equal(/tối đa 200 xe/.test(fs.readFileSync(require.resolve('../app/js/bkls-templates.js'), 'utf8')), false);
  assert.equal(/giới hạn 100 xe/.test(fs.readFileSync(require.resolve('../app/js/pages.js'), 'utf8')), false);
});

test('chia đợt in PDF từng xe: 250 xe → [0,100) [100,200) [200,250); 0 xe → 1 đợt rỗng', () => {
  const ctx = { window: { HAK: {} }, document: {}, console, Date, Math, JSON, Set, Map }; ctx.window.JSZip = require('../app/libs/jszip.min.js'); vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require.resolve('../app/js/bkls.js'), 'utf8'), ctx);
  const B = ctx.window.HAK.Bkls; assert.equal(B.PDF_BATCH, 100);
  const J = (x) => JSON.stringify(x);   // mảng tạo trong vm khác realm → so bằng JSON
  assert.equal(J(B.rangesOfSize(250, B.PDF_BATCH)), J([[0, 100], [100, 200], [200, 250]])); assert.equal(J(B.rangesOfSize(0, 100)), J([[0, 0]])); assert.equal(J(B.rangesOfSize(100, 100)), J([[0, 100]]));
  assert.equal(B.tripRanges(1500).length, 1, 'bản Word từng xe vẫn chia file theo mốc cũ (> 1.500 xe)');
});
