/* Chụp "dấu vân tay" phần hải quan trên trình duyệt thật để so TRƯỚC / SAU khi tái cấu trúc (không đổi công thức, giao diện, lưu trữ):
 *   node tools/customs-snapshot.cjs <file-ra.json> [--scope]
 * Tạo dữ liệu thử cố định (hợp đồng + phụ lục + chứng thư, tờ khai nợ / nộp thừa / khai bổ sung / hoàn thuế / chưa xác định, hồ sơ cân gắn hợp đồng),
 * rồi ghi lại: chữ trên màn hình (tab Tờ khai, báo cáo hải quan, báo cáo thực hiện hợp đồng), đặc tả PDF (customsPdfSpec / contractPdfSpec),
 * chữ trong bản in thật (#printRoot), nội dung hai file Excel (mọi trang tính, giá trị + kiểu ô), mô hình contractReportModel, và các hàm HAK.Customs đang có.
 * --scope: thêm tài khoản chỉ được xem công ty khác (đổi công ty làm việc) và chụp lại phạm vi.
 * So sánh: node tools/customs-snapshot.cjs trước.json  →  (sau khi sửa)  node tools/customs-snapshot.cjs sau.json  →  diff trước.json sau.json
 * Chuẩn hóa mã ngẫu nhiên (tk-…, bs-…, hd-…) và thời điểm lập để hai lần chạy so sánh được. HAK_APP_DIR / HAK_CHROMIUM / HAK_BROWSER_CHANNEL như tools/accept.cjs. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const out = process.argv[2];
if (!out) {
  console.error('Dùng: node tools/customs-snapshot.cjs <file-ra.json> [--scope]');
  process.exit(2);
}
const WITH_SCOPE = process.argv.includes('--scope');
const APP_DIR = path.resolve(process.env.HAK_APP_DIR || path.join(__dirname, '../app'));
const APP = require('node:url').pathToFileURL(path.join(APP_DIR, 'index.html')).href;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-snap-'));
const norm = (v) =>
  JSON.parse(
    JSON.stringify(v)
      .replace(/\b(?:tk|bs|nt|ct|hd|k|a|np|pay|pl)-[0-9a-f]{6,}(?:-[0-9a-f]{4,}){0,4}\b/g, 'ID')
      .replace(/\b\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\b/g, 'DD/MM/YYYY HH:MM')
      .replace(/"a[0-9a-z]{6,12}"/g, '"AID"')
  );
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
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage(),
    errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  const snap = { api: null, model: null, screens: {}, specs: {}, print: {}, excel: {}, scope: null };
  // ---- dữ liệu thử cố định ----
  await p.evaluate(async () => {
    const M = HAK.ContractModel,
      CM = HAK.CustomsModel,
      d = HAK.Catalog.core.get();
    d.customers = d.customers || [];
    d.customers.push({ id: 'k-hak', companyId: 'hak', name: 'HAK' }, { id: 'k-buy', companyId: 'hak', name: 'IWC Trading' });
    const mk = (type, no, date, qty, details, extra) => {
      const c = M.parent(
        Object.assign(
          { type, no, date, contractQty: qty, priceUsd: 176, currency: 'USD', details: [], exporterId: 'k-hak', buyerId: 'k-buy' },
          extra || {}
        )
      );
      details.forEach((x) => c.details.push(M.child(c.id, Object.assign({ exchangeRate: 26000 }, x))));
      d.contracts.push(c);
      return c;
    };
    const c1 = mk('uythac', 'HD-UT-01', '2026-01-05', 5000, [
      { ship: 'TÀU A', certNo: 'C1', bdmt: 4000, mt: 8000 },
      { ship: 'TÀU Z', bdmt: 1000, mt: 2000 },
    ]);
    c1.qtyOrig = 5000;
    c1.addenda = [{ no: 'PL1', date: '2026-01-20', qty: 6000 }];
    M.applyAddenda(c1);
    const c2 = mk('xuatkhau', 'HD-XK-02', '2025-12-10', 3000, [{ ship: 'TÀU B', certNo: 'C9', bdmt: 3000, mt: 6000 }]);
    M.closeContract(c2, '2026-03-01');
    d.customs = d.customs || [];
    const decl = (o) => d.customs.push(CM.newDecl(o));
    decl({
      no: '308629701000',
      contractId: c1.id,
      detailId: c1.details[0].id,
      status: 'cleared',
      openDate: '2026-02-10',
      taxVnd: 100,
      qtyBdmt: 2000,
      ship: 'TÀU A',
      payments: [{ amount: 80, receiptNo: 'R0' }],
    });
    decl({
      no: '308629701001',
      contractId: c1.id,
      detailId: c1.details[0].id,
      status: 'cleared',
      openDate: '2026-02-11',
      taxVnd: 100,
      qtyBdmt: 2000,
      ship: 'TÀU A',
      payments: [{ amount: 120, receiptNo: 'R1' }],
    });
    decl({
      no: '308629701002',
      contractId: c2.id,
      detailId: c2.details[0].id,
      status: 'waiting',
      openDate: '2025-12-31',
      taxVnd: 200,
      qtyBdmt: 3000,
      ship: 'TÀU B',
      supplements: [{ no: '1', date: '2026-01-03', round: 2, taxVnd: 150 }],
      payments: [
        { amount: 150, receiptNo: 'R2' },
        { amount: 50, kind: 'refund', receiptNo: 'H2' },
        { amount: 7, kind: 'fee', receiptNo: 'F2' },
      ],
    });
    decl({ no: '308629701003', status: 'opened', openDate: '2026-04-01', ship: 'TÀU X', payments: [{ amount: 5, receiptNo: 'R3' }] }); // chưa gắn hợp đồng, chưa xác định thuế
    await HAK.Catalog.persist();
    const rows = [1, 2, 3, 4].map((n) => ({
      idx: n,
      uid: 'u' + n,
      ticket: 'P' + n,
      plate: '43C-' + n,
      dateStr: n < 3 ? '31/12/2025' : '01/01/2026',
      time1: '08:00',
      net: 10000 * n,
      carrier: 'VT-' + (n % 2 ? 'A' : 'B'),
    }));
    await HAK.Archive.save(
      'uythac',
      { ship: 'TÀU A', giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [], contractId: c1.details[0].id },
      { files: [{ name: 'HS-A.xlsx' }], excel: { fileName: 'HS-A.xlsx' }, summary: {} },
      { rows },
      'xlsx'
    );
  });
  snap.api = await p.evaluate(() => Object.keys(HAK.Customs).sort());
  snap.model = norm(await p.evaluate(() => JSON.parse(JSON.stringify(HAK.Customs.contractReportModel()))));
  // ---- màn hình ----
  await p.evaluate(() => {
    location.hash = '#/report';
  });
  await p.waitForTimeout(2500);
  const text = (sel) => p.evaluate((s) => (document.querySelector(s) || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(), sel);
  snap.screens.csReport = norm(await text('#repCsBody'));
  snap.screens.ctReport = norm(await text('#repCtBody'));
  await p.evaluate(() => {
    HAK.Customs.render();
  });
  snap.screens.csTab = norm(await text('#customsRoot'));
  // ---- đặc tả PDF + bản in thật ----
  snap.specs.cs = norm(await p.evaluate(() => JSON.parse(JSON.stringify(HAK.Customs.customsPdfSpec()))));
  snap.specs.ct = norm(await p.evaluate(() => JSON.parse(JSON.stringify(HAK.Customs.contractPdfSpec()))));
  for (const which of ['cs', 'ct']) {
    await p.evaluate(() => {
      window.__txt = null;
      window.print = () => {
        window.__txt = (document.getElementById('printRoot') || { innerText: '(không có #printRoot)' }).innerText;
      };
    });
    await p.evaluate((w) => HAK.Customs.pdfReport(w), which);
    await p.waitForFunction(() => window.__txt !== null, null, { timeout: 15000 }).catch(() => {});
    snap.print[which] = norm((await p.evaluate(() => window.__txt)) || '(chưa in)');
    await p.evaluate(() => document.body.classList.remove('printing'));
  }
  // ---- Excel ----
  for (const [k, sel] of [
    ['cs', '#repCsXls'],
    ['ct', '#repCtXls'],
  ]) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click(sel)]);
    const f = path.join(tmp, k + '.xlsx');
    await dl.saveAs(f);
    const wb = XLSX.read(fs.readFileSync(f), { cellDates: true });
    snap.excel[k] = norm({
      name: dl.suggestedFilename().replace(/\d{4}[-_]?\d{2}[-_]?\d{2}[-_ ]?\d*/g, 'DATE'),
      sheets: wb.SheetNames.map((n) => ({
        n,
        rows: XLSX.utils
          .sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true })
          .map((r) => r.map((v) => (v instanceof Date ? 'D:' + v.toISOString().slice(0, 10) : v))),
        types: Object.keys(wb.Sheets[n])
          .filter((a) => a[0] !== '!')
          .map((a) => a + ':' + wb.Sheets[n][a].t)
          .join(','),
      })),
    });
  }
  if (WITH_SCOPE) {
    // Phạm vi công ty: đổi công ty làm việc sang Đại Hiệp (qua giao diện) → báo cáo không còn dữ liệu của HAK
    await p.evaluate(() => document.getElementById('btnCompany').click());
    await p.waitForTimeout(800);
    const dh = await p.$('[data-co="dh"]');
    if (dh) {
      await dh.click();
      await p.waitForFunction(() => window.HAK && HAK.Auth && HAK.Auth.company() === 'dh', null, { timeout: 15000 });
    }
    await p.evaluate(() => {
      location.hash = '#/report';
    });
    await p.waitForTimeout(2500);
    await p.evaluate(() => HAK.Customs.drawReport());
    snap.scope = norm({ cs: await text('#repCsBody'), ct: await text('#repCtBody') });
  }
  snap.errors = errs;
  fs.writeFileSync(out, JSON.stringify(snap, null, 1));
  console.log('Đã ghi ' + out + ' · lỗi script: ' + errs.length);
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
