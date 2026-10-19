/* Kiểm thử đồng bộ Google Sheet: chạy NGUYÊN VĂN mã Code.gs mà app sinh ra trong một "Google Sheet giả" (vm) và nối với client gsync.js bằng fetch giả. */
const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
global.window = global; global.HAK = {};
const mem = {}; HAK.Store = { get: (k, d) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : d), set: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); return true; } };
HAK.UI = { esc: (s) => String(s == null ? '' : s) };
HAK.Config = { data: { companies: [{ id: 'hak', short: 'HAK', name: 'HAK' }, { id: 'dh', short: 'ĐH', name: 'Đại Hiệp' }] } };
global.document = { querySelector: () => null };
const G = require('../app/js/gsync.js') && HAK.GSync, CM = require('../app/js/customs-model.js'), M = require('../app/js/contract-model.js');
global.HAK.ContractModel = M; global.HAK.CustomsModel = CM;
const CF = require('../app/js/contract-file.js'), GC = require('../app/js/gsync-contracts.js');
global.HAK.NumFmt = require('../app/js/numfmt.js');

/* ---- Google Sheet giả ---- */
function makeSS() {
  const sheets = {};
  const mk = (name) => {
    const g = { name, cells: [] };
    const rowsN = () => g.cells.length, colsN = () => g.cells.reduce((a, r) => Math.max(a, r.length), 0);
    const get = (r, c) => (g.cells[r - 1] && g.cells[r - 1][c - 1] !== undefined ? g.cells[r - 1][c - 1] : '');
    const set = (r, c, v) => { while (g.cells.length < r) g.cells.push([]); const row = g.cells[r - 1]; while (row.length < c - 1) row.push(''); row[c - 1] = v; };
    return Object.assign(g, {
      getName: () => name, getLastRow: rowsN, getLastColumn: colsN, setFrozenRows() {},
      getRange(r, c, nr, nc) { nr = nr || 1; nc = nc || 1; return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
        setValues: (vals) => vals.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))),
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, ''); },
        setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat(f) { g.fmt = g.fmt || {}; g.fmt[c] = f; return this; } }; }
    });
  };
  return { getName: () => 'XUATHANG_TEST', getSheets: () => Object.values(sheets), getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = mk(n)), flush() {}, _sheets: sheets };
}
function makeScript(token) {
  const ss = makeSS(), ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) }, JSON, Date, Math, String, Array, Number };
  vm.createContext(ctx); vm.runInContext(G.codeGs(token), ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).t);
  return { ss, post, ctx };
}
const table = (ss, n) => ss._sheets[n].cells.map((r) => r.slice());

test('Code.gs: sai mã / dữ liệu hỏng / lệnh lạ bị từ chối; ping trả danh sách sheet', () => {
  const S = makeScript('tok1');
  assert.equal(S.post({ token: 'x', action: 'ping' }).ok, false);
  assert.match(S.post('{khong phai json').error, /không đọc được/);
  assert.match(S.post({ token: 'tok1', action: 'xoa' }).error, /không hợp lệ/);
  const p = S.post({ token: 'tok1', action: 'ping' }); assert.equal(p.ok, true); assert.equal(p.version, 2);
});

test('Code.gs: NL_PC_XH "replace" thay cả lô, giữ dòng lô khác; NL_DH_XB "upsert" cập nhật tại chỗ giữ STT, thêm lô mới cuối', () => {
  const S = makeScript('t'), dh = (rows) => ({ name: 'NL_DH_XB', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'SỐ TKHQ' }, { h: 'TÀU' }], rows });
  const pc = (rows) => ({ name: 'NL_PC_XH', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'Biển số' }, { h: 'KL' }], rows });
  let r = S.post({ token: 't', action: 'push', keys: ['L1', 'L2'], sheets: [dh([['L1', '111', 'A'], ['L2', '222', 'B']]), pc([['L1', 'x1', 10], ['L1', 'x2', 20], ['L2', 'y1', 30]])] });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.result.NL_PC_XH.added, 3); assert.equal(r.result.NL_DH_XB.added, 2);
  // gửi lại L1 với 1 xe (sửa xe trả về) + cột người dùng tự thêm
  S.ss._sheets.NL_DH_XB.cells[0].push('GHI CHÚ'); S.ss._sheets.NL_DH_XB.cells[1][3] = 'ghi chú của tôi';
  r = S.post({ token: 't', action: 'push', keys: ['L1'], sheets: [dh([['L1', '111', 'A2']]), pc([['L1', 'x9', 99]])] });
  assert.equal(r.result.NL_PC_XH.removed, 2); assert.equal(r.result.NL_PC_XH.added, 1); assert.equal(r.result.NL_DH_XB.updated, 1);
  const pcT = table(S.ss, 'NL_PC_XH').filter((x) => x.some((v) => v !== '')).map((x) => x.join('|')); assert.deepEqual(pcT.sort(), ['L2|y1|30', 'Mã lô (app)|Biển số|KL', 'L1|x9|99'].sort());
  const dhT = table(S.ss, 'NL_DH_XB'); assert.equal(dhT[1][2], 'A2'); assert.equal(dhT[2][2], 'B'); assert.equal(dhT[1][3], 'ghi chú của tôi');   // cột tự thêm giữ nguyên
});

test('Code.gs: NL_HOPDONG "snapshot" ghi lại toàn bộ bảng, bớt dòng thì xóa dòng thừa, thêm cột mới tự nối bên phải', () => {
  const S = makeScript('t'), sh = (rows, extra) => ({ name: 'NL_HOPDONG', keyCol: 'Mã HĐ (app)', cols: [{ h: 'Mã HĐ (app)' }, { h: 'Số hợp đồng' }].concat(extra ? [{ h: 'Còn nợ thuế (đ)', n: '#,##0' }] : []), rows });
  let r = S.post({ token: 't', action: 'push', keys: [], sheets: [sh([['a', 'HD1'], ['b', 'HD2'], ['c', 'HD3']])] });
  assert.equal(r.result.NL_HOPDONG.total, 3); assert.equal(table(S.ss, 'NL_HOPDONG').length, 4);
  r = S.post({ token: 't', action: 'push', keys: [], sheets: [sh([['a', 'HD1', 500], ['b', 'HD2', 0]], true)] });
  assert.equal(r.result.NL_HOPDONG.removed, 1); assert.equal(r.result.NL_HOPDONG.updated, 2); assert.equal(r.result.NL_HOPDONG.total, 2);
  const t = table(S.ss, 'NL_HOPDONG'); assert.deepEqual(t[0], ['Mã HĐ (app)', 'Số hợp đồng', 'Còn nợ thuế (đ)']); assert.equal(t[1][2], 500);
  assert.ok(!t[3] || t[3].every((v) => v === ''), 'dòng thừa phải trống');
  assert.equal(S.ss._sheets.NL_HOPDONG.fmt[3], '#,##0');
  assert.equal(S.post({ token: 't', action: 'push', keys: [], sheets: [{ name: 'KHAC', cols: [], rows: [] }] }).result.KHAC, undefined);   // sheet lạ bị bỏ qua
});

test('client: push() gửi đúng theo công ty, báo "chưa cài Sheet"; pushSheets() báo Code.gs cũ; hợp đồng đi tới script mới', async () => {
  const S = makeScript('tokhak');
  global.fetch = async (url, init) => { const body = JSON.parse(init.body); const j = url.includes('/HAK/') ? S.post(body) : { ok: true, result: {} }; return { status: 200, text: async () => JSON.stringify(j) }; };
  HAK.Store.set('hak.gsync.v2', { cos: { hak: { url: 'https://script.google.com/macros/s/HAK/exec', token: 'tokhak', last: null }, dh: { url: 'https://script.google.com/macros/s/OLD/exec', token: 'x', last: null } } });
  const dh = { name: 'NL_DH_XB', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'SỐ TKHQ' }], rows: [['L1', '1'], ['L2', '2']] }, pc = { name: 'NL_PC_XH', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'Biển' }], rows: [['L1', 'a'], ['L1', 'b'], ['L2', 'c']] };
  const r = await G.push([dh, pc], null, (k) => (k === 'L1' ? 'hak' : 'zzz'));
  assert.equal(r.per.find((p) => p.cid === 'hak').added, 2, JSON.stringify(r)); assert.equal(r.per.find((p) => p.cid === 'zzz').skipped, true);
  // đồng bộ hợp đồng: script mới nhận
  const hd = GC.buildSheets([], {});
  assert.deepEqual(hd.map((s) => s.name), ['NL_HOPDONG', 'NL_TOKHAI', 'NL_PHULUC']);
  const ok = await G.pushSheets('hak', hd); assert.equal(ok.NL_HOPDONG.total, 0);
  // script cũ (không trả kết quả cho sheet mới) → lỗi rõ ràng
  await assert.rejects(() => G.pushSheets('dh', hd), /bản cũ.*NL_HOPDONG/);
});

test('buildSheets: số liệu hợp đồng / tờ khai / phụ lục đúng (KL hiện hành, còn lại, thuế còn nợ, tăng giảm)', () => {
  const c = M.parent({ type: 'xuatkhau', no: 'HD1', date: '2026-08-06', contractQty: 6000, priceUsd: 176, details: [] });
  c.details.push(M.child(c.id, { ship: 'M/V A', certNo: 'C1', bdmt: 4000, mt: 8000, exchangeRate: 26000 }));
  c.addenda = [{ no: 'PL1', date: '2026-08-20', qty: 7500, reason: 'tăng' }]; M.applyAddenda(c);
  const decl = CM.newDecl({ no: '308629701721', contractId: c.id, detailId: c.details[0].id, status: 'cleared', qtyBdmt: 4000, taxVnd: 100, openDate: '2026-08-19', supplements: [{ no: '308629701722', date: '2026-08-25', taxVnd: 120 }], payments: [{ amount: 50 }] });
  HAK.Catalog = { core: { get: () => ({ contracts: [c], customers: [], customs: [decl] }) } };
  const m = CF.build(c.id, []), sheets = GC.buildSheets([{ c, buyer: 'IWC', m }], { types: { xuatkhau: 'Xuất khẩu' }, stamp: 'T' });
  const [hd, tk, pl] = sheets.map((s) => s.rows), H = (n) => GC.COLS.NL_HOPDONG.findIndex((x) => x[0] === n), T = (n) => GC.COLS.NL_TOKHAI.findIndex((x) => x[0] === n);
  assert.equal(hd.length, 1); assert.equal(hd[0][H('KL gốc (BDMT)')], 6000); assert.equal(hd[0][H('KL hiện hành (BDMT)')], 7500); assert.equal(hd[0][H('Còn lại (BDMT)')], 3500);
  assert.equal(hd[0][H('% thực hiện')], 53.33); assert.equal(hd[0][H('Thuế XK phải nộp (đ)')], 120); assert.equal(hd[0][H('Còn nợ thuế (đ)')], 70); assert.equal(hd[0][H('Đã thông quan')], 1);
  assert.equal(tk[0][T('Thuế sau bổ sung (đ)')], 120); assert.equal(tk[0][T('Còn nợ (đ)')], 70); assert.equal(tk[0][T('Trạng thái')], 'Đã thông quan');
  assert.equal(pl[0][5], 1500); assert.equal(pl[0][4], 7500);
  sheets.forEach((s) => s.rows.forEach((r) => assert.equal(r.length, s.cols.length)));
});
