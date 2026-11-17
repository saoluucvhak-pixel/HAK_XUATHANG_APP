/* Đồng bộ Google Sheet bị gián đoạn giữa chừng rồi chạy lại: báo đã ghi / lỗi / chưa chạy; gửi lại không nhân đôi dòng; trang tính hợp đồng báo từng trang. */
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
test('lô gửi theo nhóm: nhóm 2 lỗi → báo đã ghi / lỗi / chưa chạy; chạy lại đủ, số dòng khớp lần chạy trọn vẹn, không nhân đôi', async () => {
  G._setBatchTrips(6); // 2 lô (6 phiếu) / nhóm → 5 lô = 3 nhóm
  const ref = setup();
  await G.push(lotsSheets(5), null, () => 'hak');
  const refDh = count(ref, 'NL_DH_XB'),
    refPc = count(ref, 'NL_PC_XH');
  assert.equal(refDh, 5);
  assert.equal(refPc, 15);
  const S = setup((n) => n === 2),
    r1 = await G.push(lotsSheets(5), null, () => 'hak'),
    p = r1.per[0];
  assert.ok(p.error);
  assert.equal(p.lotsDone, 2);
  assert.equal(p.lotsFailed, 2);
  assert.equal(p.lotsPending, 1);
  assert.equal(count(S, 'NL_DH_XB'), 2);
  assert.equal(count(S, 'NL_PC_XH'), 6);
  assert.match(G._cfg('hak').partial.error, /.+/);
  assert.equal(G._cfg('hak').partial.lotsPending, 1);
  // "đóng rồi mở lại app" = cấu hình đọc lại từ Store; chạy lại toàn bộ
  global.fetch = async (url, init) => ({ status: 200, text: async () => JSON.stringify(S.post(JSON.parse(init.body))) });
  const r2 = await G.push(lotsSheets(5), null, () => 'hak');
  assert.equal(r2.per[0].error, undefined);
  assert.equal(count(S, 'NL_DH_XB'), refDh);
  assert.equal(count(S, 'NL_PC_XH'), refPc);
  assert.ok(!G._cfg('hak').partial);
  await G.push(lotsSheets(5), null, () => 'hak');
  assert.equal(count(S, 'NL_PC_XH'), refPc, 'chạy lặp không nhân đôi');
  G._setBatchTrips(4000);
});
test('trang tính hợp đồng: lỗi ở trang giữa → nêu trang đã ghi / lỗi / chưa chạy; chạy lại hoàn tất', async () => {
  const mk = (n, key) => ({
    name: n,
    keyCol: key,
    cols: [{ h: key }, { h: 'Giá trị' }],
    rows: [
      ['a', 1],
      ['b', 2],
    ],
  });
  const sheets = [
    mk('NL_HOPDONG', 'Mã HĐ (app)'),
    mk('NL_CHUNGTHU', 'Mã CT (app)'),
    mk('NL_TOKHAI', 'Mã TK (app)'),
    mk('NL_PHULUC', 'Mã PL (app)'),
  ];
  const S = setup((n) => n === 3);
  let err;
  try {
    await G.pushSheets('hak', sheets);
  } catch (e) {
    err = e;
  }
  assert.deepEqual(err.partial, { done: ['NL_HOPDONG', 'NL_CHUNGTHU'], failed: 'NL_TOKHAI', pending: ['NL_PHULUC'] });
  assert.match(err.message, /Đã ghi: NL_HOPDONG, NL_CHUNGTHU\. Lỗi tại: NL_TOKHAI\. Chưa chạy: NL_PHULUC/);
  global.fetch = async (url, init) => ({ status: 200, text: async () => JSON.stringify(S.post(JSON.parse(init.body))) });
  const r = await G.pushSheets('hak', sheets);
  assert.equal(r.NL_PHULUC.total, 2);
  assert.equal(count(S, 'NL_HOPDONG'), 2);
  assert.equal(count(S, 'NL_TOKHAI'), 2);
  await G.pushSheets('hak', sheets);
  assert.equal(count(S, 'NL_HOPDONG'), 2, 'lặp không nhân đôi');
});
