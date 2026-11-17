/* Đồng bộ Google Sheet nhiều sheet bị gián đoạn (Sheet mô phỏng chạy ĐÚNG mã Apps Script của app): mất phản hồi sau khi Sheet đã ghi, gián đoạn ở từng vị trí, hợp đồng đổi phiên bản giữa hai lần thử — đối chiếu số bản ghi, phiên bản và trạng thái từng bước sau khi thử lại. */
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('node:vm');
global.window = global;
global.HAK = {};
const mem = {};
HAK.Store = {
  get: (k, d) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : d),
  set: (k, v) => {
    mem[k] = JSON.parse(JSON.stringify(v));
    return true;
  },
};
HAK.UI = { esc: (s) => String(s) };
HAK.Config = { data: { companies: [{ id: 'hak', short: 'HAK', name: 'HAK' }] } };
global.document = { querySelector: () => null };
require('../app/js/gsync.js');
const G = HAK.GSync;
function makeScript() {
  const sheets = {},
    mk = (name) => {
      const g = { name, cells: [] };
      const get = (r, c) => (g.cells[r - 1] && g.cells[r - 1][c - 1] !== undefined ? g.cells[r - 1][c - 1] : ''),
        set = (r, c, v) => {
          while (g.cells.length < r) g.cells.push([]);
          const row = g.cells[r - 1];
          while (row.length < c - 1) row.push('');
          row[c - 1] = v;
        };
      return Object.assign(g, {
        getName: () => name,
        getLastRow: () => g.cells.length,
        getLastColumn: () => g.cells.reduce((a, r) => Math.max(a, r.length), 0),
        setFrozenRows() {},
        getRange(r, c, nr, nc) {
          nr = nr || 1;
          nc = nc || 1;
          return {
            getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
            getFormulasR1C1: () => Array.from({ length: nr }, () => Array.from({ length: nc }, () => '')),
            setFormulaR1C1() {},
            setValues: (v) => v.forEach((row, i) => row.forEach((x, j) => set(r + i, c + j, x))),
            clearContent() {
              for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, '');
            },
            setFontWeight() {
              return this;
            },
            setBackground() {
              return this;
            },
            setNumberFormat() {
              return this;
            },
          };
        },
      });
    };
  const ss = {
    getName: () => 'T',
    getSheets: () => Object.values(sheets),
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = mk(n)),
    flush() {},
    _sheets: sheets,
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({
        t,
        setMimeType() {
          return this;
        },
      }),
    },
    JSON,
    Date,
    Math,
    String,
    Array,
    Number,
  };
  vm.createContext(ctx);
  vm.runInContext(G.codeGs('tok'), ctx);
  return { ss, post: (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t) };
}
const lotsSheets = (n) => {
  const dh = { name: 'NL_DH_XB', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'SỐ TKHQ' }], rows: [] },
    pc = { name: 'NL_PC_XH', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'Biển số' }, { h: 'KL' }], rows: [] };
  for (let i = 1; i <= n; i++) {
    dh.rows.push(['L' + i, String(100 + i)]);
    for (let t = 0; t < 3; t++) pc.rows.push(['L' + i, 'xe' + i + t, 10]);
  }
  return [dh, pc];
};
const count = (S, n) => S.ss._sheets[n].cells.slice(1).filter((r) => r.some((v) => v !== '')).length;
function setup(failOn) {
  const S = makeScript();
  let calls = 0;
  HAK.Store.set('hak.gsync.v2', { cos: { hak: { url: 'https://script.google.com/macros/s/X/exec', token: 'tok' } } });
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'push') {
      calls++;
      if (failOn && failOn(calls, body)) return { status: 500, text: async () => '<html>lỗi</html>' };
    }
    return { status: 200, text: async () => JSON.stringify(S.post(body)) };
  };
  return S;
}

const rowsOf = (S, n) => (S.ss._sheets[n] ? S.ss._sheets[n].cells.slice(1).filter((r) => r.some((v) => v !== '')) : []); // sheet chưa tạo → chưa có dòng
const mkPage = (name, key, rows) => ({ name, keyCol: key, cols: [{ h: key }, { h: 'Giá trị' }, { h: 'Phiên bản' }], rows });
const pages = (rev) => [
  mkPage('NL_HOPDONG', 'Mã HĐ (app)', [
    ['hd1', 'HĐ 1 v' + rev, rev],
    ['hd2', 'HĐ 2', 1],
  ]),
  mkPage('NL_CHUNGTHU', 'Mã CT (app)', [
    ['ct1', 'CT 1', 1],
    ['ct2', 'CT 2', 1],
  ]),
  mkPage('NL_TOKHAI', 'Mã TK (app)', [
    ['tk1', 'TK 1', 1],
    ['tk2', 'TK 2', 1],
  ]),
  mkPage('NL_PHULUC', 'Mã PL (app)', [
    ['pl1', 'PL 1', 1],
    ['pl2', 'PL 2', 1],
  ]),
];
const ORDER = ['NL_HOPDONG', 'NL_CHUNGTHU', 'NL_TOKHAI', 'NL_PHULUC'];
const okFetch = (S) => async (url, init) => ({ status: 200, text: async () => JSON.stringify(S.post(JSON.parse(init.body))) });
/** Sheet mô phỏng; failAt(n) → 'drop' = mất kết nối TRƯỚC khi Sheet nhận; 'lost' = Sheet ĐÃ ghi nhưng phản hồi không về app. */
function setupFlaky(failAt) {
  const S = makeScript();
  let calls = 0;
  HAK.Store.set('hak.gsync.v2', { cos: { hak: { url: 'https://script.google.com/macros/s/X/exec', token: 'tok' } } });
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.action !== 'push') return { status: 200, text: async () => JSON.stringify(S.post(body)) };
    calls++;
    const mode = failAt && failAt(calls);
    if (mode === 'drop') throw new Error('Failed to fetch');
    const res = JSON.stringify(S.post(body));
    if (mode === 'lost') throw new Error('Failed to fetch');
    return { status: 200, text: async () => res };
  };
  return S;
}
const tryPush = async (sheets) => {
  try {
    return { r: await G.pushSheets('hak', sheets) };
  } catch (e) {
    return { err: e };
  }
};

test('gián đoạn ở từng trang (đầu / giữa / cuối): báo đúng đã ghi – lỗi – chưa chạy, chạy lại đủ 4 trang × 2 dòng, lặp lại không nhân đôi', async () => {
  for (let k = 1; k <= 4; k++) {
    const S = setupFlaky((n) => (n === k ? 'drop' : null)),
      { err } = await tryPush(pages(1));
    assert.deepEqual(err.partial, { done: ORDER.slice(0, k - 1), failed: ORDER[k - 1], pending: ORDER.slice(k) }, 'gián đoạn ở trang ' + k);
    ORDER.slice(0, k - 1).forEach((n) => assert.equal(rowsOf(S, n).length, 2, 'trang đã ghi trước điểm lỗi còn nguyên: ' + n));
    ORDER.slice(k - 1).forEach((n) => assert.equal(rowsOf(S, n).length, 0, 'trang lỗi / chưa chạy chưa có dữ liệu: ' + n));
    global.fetch = okFetch(S);
    const { r, err: e2 } = await tryPush(pages(1));
    assert.equal(e2, undefined, 'chạy lại không lỗi');
    ORDER.forEach((n) => assert.equal(rowsOf(S, n).length, 2, 'sau chạy lại: ' + n));
    assert.deepEqual(Object.keys(r).sort(), ORDER.slice().sort());
    await G.pushSheets('hak', pages(1));
    ORDER.forEach((n) => assert.equal(rowsOf(S, n).length, 2, 'chạy lặp không nhân đôi: ' + n));
  }
});
test('mất phản hồi SAU khi Sheet đã ghi: app báo lỗi, chạy lại vẫn đủ và không nhân đôi (ghi theo mã bản ghi)', async () => {
  const S = setupFlaky((n) => (n === 2 ? 'lost' : null)),
    { err } = await tryPush(pages(1));
  assert.equal(err.partial.failed, 'NL_CHUNGTHU', 'app tưởng trang 2 lỗi dù Sheet đã nhận');
  assert.equal(rowsOf(S, 'NL_CHUNGTHU').length, 2, 'Sheet thực tế ĐÃ có dữ liệu trang 2');
  assert.equal(rowsOf(S, 'NL_TOKHAI').length, 0);
  global.fetch = okFetch(S);
  const { err: e2 } = await tryPush(pages(1));
  assert.equal(e2, undefined);
  ORDER.forEach((n) => assert.equal(rowsOf(S, n).length, 2, 'không nhân đôi dù trang 2 đã ghi trước đó: ' + n));
});
test('hợp đồng đổi phiên bản giữa hai lần thử: lần chạy lại ghi bản MỚI NHẤT, không còn bản cũ, số dòng không đổi', async () => {
  const S = setupFlaky((n) => (n === 3 ? 'drop' : null)),
    { err } = await tryPush(pages(1));
  assert.equal(err.partial.failed, 'NL_TOKHAI');
  assert.equal(rowsOf(S, 'NL_HOPDONG').find((r) => r[0] === 'hd1')[2], 1, 'trước khi sửa: phiên bản 1');
  // người dùng sửa hợp đồng hd1 (phiên bản 2) rồi bấm đồng bộ lại
  global.fetch = okFetch(S);
  const { err: e2 } = await tryPush(pages(2));
  assert.equal(e2, undefined);
  const hd = rowsOf(S, 'NL_HOPDONG');
  assert.equal(hd.length, 2, 'không thêm dòng mới cho hợp đồng đã có');
  assert.deepEqual(hd.find((r) => r[0] === 'hd1').slice(0, 3), ['hd1', 'HĐ 1 v2', 2], 'phiên bản mới nhất');
  assert.equal(hd.find((r) => r[0] === 'hd2')[2], 1, 'hợp đồng khác không đổi');
  ORDER.forEach((n) => assert.equal(rowsOf(S, n).length, 2));
});
test('lô phiếu cân: mất phản hồi sau khi nhóm đã ghi → chạy lại số dòng khớp lần chạy trọn vẹn, trạng thái từng bước được dọn', async () => {
  G._setBatchTrips(6);
  try {
    const ref = setupFlaky();
    await G.push(lotsSheets(5), null, () => 'hak');
    const refDh = count(ref, 'NL_DH_XB'),
      refPc = count(ref, 'NL_PC_XH');
    const S = setupFlaky((n) => (n === 2 ? 'lost' : null)),
      r1 = await G.push(lotsSheets(5), null, () => 'hak'),
      p = r1.per[0];
    assert.ok(p.error);
    assert.equal(p.lotsDone, 2, 'app chỉ tính 2 lô đã xác nhận');
    assert.equal(p.lotsFailed, 2);
    assert.equal(p.lotsPending, 1);
    assert.ok(count(S, 'NL_DH_XB') >= 2 && count(S, 'NL_DH_XB') <= 4, 'Sheet có thể đã ghi nhiều hơn app biết');
    assert.equal(G._cfg('hak').partial.lotsPending, 1);
    global.fetch = okFetch(S);
    const r2 = await G.push(lotsSheets(5), null, () => 'hak');
    assert.equal(r2.per[0].error, undefined);
    assert.equal(count(S, 'NL_DH_XB'), refDh);
    assert.equal(count(S, 'NL_PC_XH'), refPc);
    assert.ok(!G._cfg('hak').partial, 'trạng thái gián đoạn được xóa sau khi chạy lại thành công');
  } finally {
    G._setBatchTrips(4000);
  }
});
