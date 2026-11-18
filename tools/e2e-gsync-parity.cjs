/* E2E M5.3 (chỉ GIẢ LẬP — chưa kiểm Google Sheet thật): đồng bộ Google Sheet từ app thật trên Chromium, Sheet mô phỏng chạy NGUYÊN VĂN mã Apps Script (Code.gs) của app.
 * Khẳng định: (1) số phiếu / tổng kg trên Sheet NL_PC_XH = số liệu hồ sơ Lưu trữ (phiếu KL ≤ 0 đã loại KHÔNG có trên Sheet);
 * (2) đồng bộ lại không nhân đôi dòng; mất phản hồi SAU khi Sheet đã ghi → chạy lại đủ, không nhân đôi;
 * (3) trạng thái hợp đồng trên Sheet = trạng thái trên màn Hợp đồng (cùng một nguồn TripDetails / ContractStatus).
 * Chạy: node tools/e2e-gsync-parity.cjs (hoặc qua node tools/e2e-sqlite.cjs để chạy trên SQLite). Dữ liệu 100% giả lập. */
const { chromium } = require('playwright');
const path = require('node:path');
const vm = require('node:vm');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const failures = [];
const check = (c, m, d) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined ? '  → ' + d : ''));
  if (!c) failures.push(m);
};
async function login(p) {
  await p.goto(APP);
  await p.waitForSelector('#authForm', { timeout: 15000 });
  await p.fill('#auName', 'Test');
  await p.fill('#auUser', 'tester');
  await p.fill('#auPw', 'matkhau123');
  await p.fill('#auPw2', 'matkhau123');
  await p.click('#authForm button[type=submit]');
  await p.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) {
    const nb = await p.$('button:has-text("Tiếp tục")');
    if (!nb || !(await nb.isVisible())) break;
    const chk = await p.$('#auKept');
    if (chk && (await chk.isVisible())) await chk.check();
    await nb.click();
    await p.waitForTimeout(700);
  }
  const co = await p.$('[data-co="hak"]');
  if (co && (await co.isVisible())) {
    await co.click();
    await p.waitForTimeout(2000);
  }
}
/** Google Sheet giả + Apps Script thật (Code.gs do app sinh ra). */
function makeScript(code) {
  const sheets = {};
  const mk = (name) => {
    const g = { name, cells: [] };
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
    getName: () => 'XUATHANG_TEST',
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
  vm.runInContext(code, ctx);
  return { ss, post: (body) => JSON.parse(ctx.doPost({ postData: { contents: body } }).t) };
}
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);

  const TOKEN = 'toke2e';
  const code = await p.evaluate((t) => HAK.GSync.codeGs(t), TOKEN);
  const S = makeScript(code);
  let pushes = 0,
    loseOn = 0; // loseOn = số lần gọi push mà phản hồi bị mất SAU khi Sheet đã ghi (0 = không)
  await ctx.route('https://script.google.com/**', async (route) => {
    const body = route.request().postData() || '';
    let out;
    try {
      out = S.post(body);
      if (process.env.HAK_DEBUG) console.log('   [script]', body.slice(0, 160), '→', JSON.stringify(out).slice(0, 200));
    } catch (e) {
      return route.fulfill({ status: 500, body: 'lỗi' });
    }
    if (JSON.parse(body).action === 'push' && ++pushes === loseOn) return route.abort('connectionreset'); // Sheet ĐÃ ghi, trang không nhận được phản hồi
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(out),
    });
  });

  console.log('0) Dữ liệu giả: hợp đồng 2 chi tiết (tàu A có phiếu cân, tàu B chưa có), hồ sơ A có 1 phiếu KL ≤ 0 đã loại');
  await p.evaluate(async (token) => {
    const M = HAK.ContractModel,
      CM = HAK.CustomsModel,
      d = HAK.Catalog.core.get();
    d.customers = (d.customers || []).concat([
      { id: 'k-hak', companyId: 'hak', name: 'HAK' },
      { id: 'k-iwc', companyId: 'hak', name: 'IWC' },
    ]);
    const c = M.parent({
      type: 'xuatkhau',
      no: 'HD-GS',
      date: '2026-05-20',
      contractQty: 2000,
      priceUsd: 150,
      currency: 'USD',
      details: [],
      exporterId: 'k-hak',
      buyerId: 'k-iwc',
    });
    const A = M.child(c.id, { ship: 'TÀU GSA', certNo: 'CT-GSA', bdmt: 1000, mt: 2000, exchangeRate: 26000 });
    const B = M.child(c.id, { ship: 'TÀU GSB', certNo: 'CT-GSB', bdmt: 800, mt: 1600, exchangeRate: 26000 });
    c.details.push(A, B);
    d.contracts.push(c);
    d.customs = d.customs || [];
    d.customs.push(CM.newDecl({ no: '308629709001', contractId: c.id, detailId: A.id, status: 'cleared', openDate: '2026-06-01' }));
    await HAK.Catalog.persist();
    window.__A = A.id;
    const mk = (tag, n, kg) =>
      Array.from({ length: n }, (_, i) => ({
        idx: i + 2,
        uid: tag + i,
        ticket: tag + '-' + i,
        plate: '43C-' + (1000 + i),
        driver: '',
        carrier: '',
        wh: '',
        weightType: '',
        weigher: '',
        note: '',
        warn: [],
        ts1: Date.UTC(2026, 5, 5, 8, i),
        ts2: null,
        dateStr: '05/06/2026',
        time1: '08:' + String(i).padStart(2, '0'),
        time2: '',
        tare: 10000,
        gross: 10000 + kg,
        net: kg,
      }));
    await HAK.Archive.save(
      'xuatkhau',
      { giaoId: 'hak', nhanId: 'k-iwc', ship: 'TÀU GSA', contractId: A.id, returned: [], filter: {} },
      { files: [{ name: 'GS_A.docx' }], summary: {} },
      { rows: mk('GSA', 8, 20000), excluded: [{ ticket: 'GSA-BAD', plate: '43C-999', dateStr: '05/06/2026', net: -300 }] },
      'word'
    );
    HAK.Store.set('hak.gsync.v2', { cos: { hak: { url: 'https://script.google.com/macros/s/E2E/exec', token } } });
  }, TOKEN);

  const rowsOf = (n) => (S.ss._sheets[n] ? S.ss._sheets[n].cells.slice(1).filter((r) => r.some((v) => v !== '')) : []);
  const pushLots = () =>
    p.evaluate(async () => {
      const list = await HAK.Archive.list(),
        model = HAK.Report.compute(list, {});
      const lots = HAK.Report.xhLots(model.used, {}).lots.filter((L) => L.recs.length);
      const trips = await HAK.Report.xhTrips(lots);
      try {
        const r = await HAK.GSync.push(HAK.Report.xhSheetRows(lots, trips, []), null, () => 'hak');
        const bad = (r.per || []).find((x) => x.error);
        if (bad) return { ok: false, error: bad.error };
        return {
          ok: true,
          lots: r.lots,
          trips: r.trips,
          screenTrips: lots.reduce((a, L) => a + L.trips, 0),
          screenKg: lots.reduce((a, L) => a + L.kg, 0),
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });

  console.log('1) Đồng bộ lô phiếu cân: Sheet = hồ sơ (KL ≤ 0 đã loại), đồng bộ lại không nhân đôi');
  let r = await pushLots();
  check(r.ok, 'đồng bộ thành công', JSON.stringify(r));
  const pc = rowsOf('NL_PC_XH');
  check(pc.length === 8, 'Sheet NL_PC_XH có đúng 8 phiếu (hồ sơ 8 phiếu, phiếu KL ≤ 0 đã loại)', String(pc.length));
  check(!pc.some((row) => row.some((v) => String(v).includes('GSA-BAD'))), 'phiếu KL ≤ 0 (GSA-BAD) KHÔNG có trên Sheet');
  check(
    r.screenTrips === pc.length && r.screenKg === 160000,
    'số phiếu / kg màn hình (lô) = Sheet',
    r.screenTrips + ' phiếu, ' + r.screenKg + ' kg'
  );
  const before = JSON.stringify(rowsOf('NL_PC_XH')) + JSON.stringify(rowsOf('NL_DH_XB'));
  r = await pushLots();
  check(
    r.ok && JSON.stringify(rowsOf('NL_PC_XH')) + JSON.stringify(rowsOf('NL_DH_XB')) === before,
    'đồng bộ lại: Sheet y nguyên, không nhân đôi'
  );

  console.log('2) Mất phản hồi SAU khi Sheet đã ghi: báo lỗi; chạy lại vẫn đủ, không nhân đôi');
  await p.evaluate(() => {
    HAK.Store.set('hak.gsync.v2', {
      cos: { hak: { url: 'https://script.google.com/macros/s/E2E/exec', token: HAK.Store.get('hak.gsync.v2', {}).cos.hak.token } },
    });
  });
  Object.keys(S.ss._sheets).forEach((k) => delete S.ss._sheets[k]); // Sheet trống
  pushes = 0;
  loseOn = 1;
  r = await pushLots();
  check(!r.ok, 'app báo lỗi khi mất phản hồi', r.error);
  loseOn = 0;
  r = await pushLots();
  check(
    r.ok && rowsOf('NL_PC_XH').length === 8 && rowsOf('NL_DH_XB').length === rowsOf('NL_DH_XB').length,
    'chạy lại: đủ 8 phiếu, không nhân đôi',
    String(rowsOf('NL_PC_XH').length)
  );

  console.log('3) Hợp đồng: trạng thái trên Sheet = trạng thái trên màn Hợp đồng (một nguồn)');
  const rc = await p.evaluate(async () => {
    const res = await HAK.GSyncContracts.pushAll();
    const items = await HAK.ContractOverview.items();
    return { res, screen: items.map((x) => ({ no: x.g.c.no, label: x.f.statusLabel })) };
  });
  const hd = rowsOf('NL_HOPDONG');
  check(hd.length === 1, 'Sheet NL_HOPDONG có 1 hợp đồng', String(hd.length));
  const hdr = S.ss._sheets['NL_HOPDONG'].cells[0],
    iNo = hdr.findIndex((h) => /Số hợp đồng|Số HĐ/i.test(String(h))),
    iSt = hdr.findIndex((h) => /^Trạng thái hợp đồng$/i.test(String(h)));
  const onSheet = hd[0][iSt];
  const onScreen = (rc.screen.find((x) => x.no === 'HD-GS') || {}).label;
  check(
    iSt >= 0 && !!onSheet && onSheet === onScreen,
    'trạng thái trên Sheet = trạng thái trên màn hình',
    JSON.stringify([onSheet, onScreen])
  );
  check(iNo >= 0, 'cột số hợp đồng tồn tại');
  r = await p.evaluate(async () => (await HAK.GSyncContracts.pushAll()).every((x) => x.skipped || !x.error));
  check(
    r === true && rowsOf('NL_HOPDONG').length === 1 && rowsOf('NL_CHUNGTHU').length === 2,
    'gửi lại hợp đồng: không nhân đôi (1 hợp đồng, 2 chi tiết)'
  );
  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
