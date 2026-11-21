/* U-06: nhật ký đồng bộ Google Sheet — mỗi lần đồng lô phiếu ghi lại số dòng THÊM / XÓA / CẬP NHẬT (kể cả lần dừng giữa chừng), tối đa 20 lần, hiển thị ở dòng trạng thái;
 * cấu hình cũ chưa có nhật ký vẫn dùng được. Sheet mô phỏng chạy ĐÚNG mã Apps Script của app. */
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
            setValues: (vals) => vals.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))),
            getFormulasR1C1: () => Array.from({ length: nr }, () => Array.from({ length: nc }, () => '')),
            setFormulaR1C1() {},
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
/** n lô, mỗi lô `per` phiếu. */
const lots = (n, per) => {
  const dh = { name: 'NL_DH_XB', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'SỐ TKHQ' }], rows: [] },
    pc = { name: 'NL_PC_XH', keyCol: 'Mã lô (app)', cols: [{ h: 'Mã lô (app)' }, { h: 'Biển số' }, { h: 'KL' }], rows: [] };
  for (let i = 1; i <= n; i++) {
    dh.rows.push(['L' + i, String(100 + i)]);
    for (let t = 0; t < per; t++) pc.rows.push(['L' + i, 'xe' + i + t, 10]);
  }
  return [dh, pc];
};
function setup(failOn) {
  const S = makeScript();
  let calls = 0;
  for (const k of Object.keys(mem)) delete mem[k];
  HAK.Store.set('hak.gsync.v2', { cos: { hak: { url: 'https://script.google.com/macros/s/X/exec', token: 'tok' } } });
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'push') {
      calls++;
      if (failOn && failOn(calls)) return { status: 500, text: async () => '<html>lỗi</html>' };
    }
    return { status: 200, text: async () => JSON.stringify(S.post(body)) };
  };
  return S;
}

test('cấu hình cũ chưa có nhật ký: đọc được, nhật ký rỗng', () => {
  setup();
  assert.deepEqual(G.log('hak'), []);
});
test('lần đồng bộ đầu: nhật ký có 1 dòng, thêm đủ, không xóa', async () => {
  setup();
  await G.push(lots(2, 3), null, () => 'hak');
  const log = G.log('hak');
  assert.equal(log.length, 1);
  assert.equal(log[0].added, 6);
  assert.equal(log[0].removed, 0);
  assert.equal(log[0].lots, 2);
  assert.equal(log[0].trips, 6);
  assert.ok(!log[0].partial);
});
test('đồng bộ lại với ít phiếu hơn (kịch bản L-01: lọc kỳ): nhật ký ghi rõ số dòng XÓA, mới nhất đứng đầu', async () => {
  setup();
  await G.push(lots(1, 3), null, () => 'hak');
  await G.push(lots(1, 1), null, () => 'hak'); // lô L1 còn 1 phiếu
  const log = G.log('hak');
  assert.equal(log.length, 2);
  assert.equal(log[0].removed, 3, 'lần mới nhất xóa 3 dòng cũ của lô');
  assert.equal(log[0].added, 1);
  assert.equal(log[1].added, 3, 'lần đầu ở dưới');
  assert.match(G._lastText('hak'), /xóa 3/);
  assert.match(G._lastText('hak'), /thêm 1/);
});
test('nhật ký chỉ giữ 20 lần gần nhất', async () => {
  setup();
  for (let i = 0; i < 23; i++) await G.push(lots(1, 1 + (i % 2)), null, () => 'hak');
  assert.equal(G.log('hak').length, G.LOG_MAX);
  assert.equal(G.LOG_MAX, 20);
});
test('lần dừng giữa chừng cũng được ghi (đánh dấu partial + lỗi), phần đã ghi vẫn được đếm', async () => {
  setup((n) => n === 2); // nhóm thứ 2 lỗi
  G._setBatchTrips(3);
  try {
    await G.push(lots(4, 3), null, () => 'hak');
  } finally {
    G._setBatchTrips(G.BATCH_TRIPS);
  }
  const log = G.log('hak');
  assert.equal(log.length, 1);
  assert.equal(log[0].partial, true);
  assert.ok(log[0].error);
  assert.ok(log[0].added >= 3, 'nhóm đã ghi trước khi dừng được đếm: ' + log[0].added);
});
test('nhật ký không làm mất url / mã bảo vệ trong cấu hình', async () => {
  setup();
  await G.push(lots(1, 1), null, () => 'hak');
  const c = G._cfg('hak');
  assert.equal(c.url, 'https://script.google.com/macros/s/X/exec');
  assert.equal(c.token, 'tok');
  assert.equal(c.log.length, 1);
});
