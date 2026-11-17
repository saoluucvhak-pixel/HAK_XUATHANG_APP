/* Hồi quy: chế độ snapshot phải ghép dòng cũ/mới theo MÃ ỔN ĐỊNH, không theo vị trí dòng. Chạy nguyên văn Code.gs trong Google Sheet giả. */
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('node:vm');
global.window = global;
global.HAK = {};
HAK.Store = { get: (k, d) => d, set: () => true };
HAK.UI = { esc: (s) => String(s) };
HAK.Config = { data: { companies: [] } };
global.document = { querySelector: () => null };
require('../app/js/gsync.js');
const G = HAK.GSync;

function makeSS() {
  const sheets = {};
  const mk = (name) => {
    const g = { name, cells: [], fr: {} };
    const get = (r, c) => (g.cells[r - 1] && g.cells[r - 1][c - 1] !== undefined ? g.cells[r - 1][c - 1] : '');
    const set = (r, c, v) => {
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
        const each = (f) => {
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) f(r + i, c + j, i, j);
        };
        return {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
          getFormulasR1C1: () =>
            Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => g.fr[r + i + ',' + (c + j)] || '')),
          setValues: (vals) =>
            vals.forEach((row, i) =>
              row.forEach((v, j) => {
                set(r + i, c + j, v);
                delete g.fr[r + i + ',' + (c + j)];
              })
            ),
          setFormulaR1C1: (f) => {
            g.fr[r + ',' + c] = f;
          },
          clearContent() {
            each((rr, cc) => {
              set(rr, cc, '');
              delete g.fr[rr + ',' + cc];
            });
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
  return {
    getName: () => 'T',
    getSheets: () => Object.values(sheets),
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = mk(n)),
    flush() {},
    _sheets: sheets,
  };
}
function makeScript() {
  const ss = makeSS(),
    ctx = {
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
  vm.runInContext(G.codeGs('t'), ctx);
  return { ss, post: (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t) };
}
const sheet = (rows, name) => ({
  name: name || 'NL_HOPDONG',
  keyCol: 'Mã HĐ (app)',
  cols: [{ h: 'Mã HĐ (app)' }, { h: 'Số hợp đồng' }],
  rows,
});
const push = (S, rows, name) => S.post({ token: 't', action: 'push', keys: [], sheets: [sheet(rows, name)] });
const cells = (S) => S.ss._sheets.NL_HOPDONG.cells;
const noteOf = (S, key) => {
  const t = cells(S),
    n = t[0].indexOf('GHI CHÚ'),
    row = t.find((r, i) => i > 0 && r[0] === key);
  return row ? row[n] : undefined;
};
function seed() {
  const S = makeScript();
  push(S, [
    ['A', 'HD-A'],
    ['B', 'HD-B'],
  ]);
  const g = S.ss._sheets.NL_HOPDONG;
  g.cells[0].push('GHI CHÚ', 'TÍNH');
  g.cells[1][2] = 'ghi chú A';
  g.cells[2][2] = 'ghi chú B';
  g.cells[1][3] = 20;
  g.fr['2,4'] = '=RC[-2]*2'; // công thức tương đối trong cột người dùng (dòng A)
  return S;
}

test('đảo thứ tự A–B → B–A: ghi chú đi cùng mã, không đổi chủ', () => {
  const S = seed();
  push(S, [
    ['B', 'HD-B'],
    ['A', 'HD-A'],
  ]);
  assert.equal(noteOf(S, 'A'), 'ghi chú A');
  assert.equal(noteOf(S, 'B'), 'ghi chú B');
  assert.deepEqual(
    cells(S)
      .slice(1)
      .map((r) => r[0]),
    ['B', 'A']
  );
});
test('công thức cột người dùng đi theo dòng của mã sau khi đảo (R1C1)', () => {
  const S = seed();
  push(S, [
    ['B', 'HD-B'],
    ['A', 'HD-A'],
  ]);
  const g = S.ss._sheets.NL_HOPDONG;
  assert.equal(g.fr['3,4'], '=RC[-2]*2', 'dòng A nay ở hàng 3');
  assert.equal(g.fr['2,4'], undefined, 'dòng B không được thừa công thức của A');
});
test('thêm một hợp đồng ở giữa / bỏ một hợp đồng: ghi chú các mã còn lại giữ nguyên, mã mới trống', () => {
  const S = seed();
  push(S, [
    ['C', 'HD-C'],
    ['B', 'HD-B'],
    ['A', 'HD-A'],
  ]);
  assert.equal(noteOf(S, 'A'), 'ghi chú A');
  assert.equal(noteOf(S, 'B'), 'ghi chú B');
  assert.equal(noteOf(S, 'C'), '');
  const r = push(S, [
    ['C', 'HD-C'],
    ['A', 'HD-A'],
  ]);
  assert.equal(r.result.NL_HOPDONG.removed, 1);
  assert.equal(noteOf(S, 'A'), 'ghi chú A');
  assert.equal(noteOf(S, 'B'), undefined);
  assert.equal(
    cells(S)
      .slice(1)
      .filter((x) => x.some((v) => v !== '')).length,
    2
  );
});
test('đồng bộ lặp cho cùng kết quả (idempotent)', () => {
  const S = seed();
  const rows = [
    ['B', 'HD-B'],
    ['A', 'HD-A'],
  ];
  push(S, rows);
  const a = JSON.stringify(cells(S));
  const fa = JSON.stringify(S.ss._sheets.NL_HOPDONG.fr);
  push(S, rows);
  push(S, rows);
  assert.equal(JSON.stringify(cells(S)), a);
  assert.equal(JSON.stringify(S.ss._sheets.NL_HOPDONG.fr), fa);
});
test('mã thiếu hoặc trùng ở dữ liệu gửi lên: từ chối, nêu rõ bản ghi, KHÔNG ghi gì', () => {
  const S = seed(),
    before = JSON.stringify(cells(S));
  let r = push(S, [
    ['A', 'x'],
    ['A', 'y'],
  ]);
  assert.equal(r.ok, false);
  assert.match(r.error, /NL_HOPDONG.*trùng.*A/);
  r = push(S, [
    ['', 'x'],
    ['B', 'y'],
  ]);
  assert.equal(r.ok, false);
  assert.match(r.error, /dòng 1.*thiếu mã/);
  assert.equal(JSON.stringify(cells(S)), before);
});
test('dòng cũ trên Sheet thiếu mã hoặc trùng mã: giữ nguyên, không ghép theo vị trí, có báo trong kết quả', () => {
  const S = seed(),
    g = S.ss._sheets.NL_HOPDONG;
  g.cells.push(['', 'dòng tay', 'ghi chú tay']);
  g.cells.push(['A', 'HD-A (trùng)', 'ghi chú trùng']);
  const r = push(S, [
    ['B', 'HD-B'],
    ['A', 'HD-A'],
  ]).result.NL_HOPDONG;
  assert.equal(r.orphans, 2, JSON.stringify(r));
  assert.deepEqual(r.dupKeys, ['A']);
  const all = cells(S).map((x) => x.join('|'));
  assert.ok(all.some((x) => x.includes('ghi chú tay')));
  assert.ok(all.some((x) => x.includes('ghi chú trùng')));
  assert.equal(noteOf(S, 'B'), 'ghi chú B');
});
