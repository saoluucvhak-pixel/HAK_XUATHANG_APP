/* E2E M5.4: nhập tờ khai từ Excel / khai bổ sung từ Excel — ô dạng ngoặc "(1.200)" (quy tắc 28) phải được CẢNH BÁO ở mọi đường nhập (không chỉ đường OCR),
 * giá trị không bị đổi thành số âm; nhập lại cùng file không tạo trùng. Chạy: node tools/e2e-import-warn.cjs (IndexedDB) | node tools/e2e-sqlite.cjs tools/e2e-import-warn.cjs (SQLite).
 * Dữ liệu 100% giả lập. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const APP = require('node:url').pathToFileURL(path.resolve(__dirname, '../app/index.html')).href;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2eiw-'));
const failures = [];
const check = (c, m, d) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined ? '  → ' + d : ''));
  if (!c) failures.push(m);
};
const DECL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/customs-decl-rows.json'), 'utf8'));
const NO1 = '308629701721',
  NO2 = '308629701799';
/** Bản xác nhận tờ khai giả; swapNo đổi số tờ khai; paren = thay ô thuế bằng "(1.200)". */
const xlsxOf = (name, swapNo, paren) => {
  const rows = JSON.parse(JSON.stringify(DECL));
  if (swapNo) rows.forEach((r) => r.forEach((c, i) => (r[i] = c === NO1 ? swapNo : c)));
  if (paren) rows.forEach((r) => r.forEach((c, i) => (r[i] = c === '551696640' || c === 551696640 ? '(1.200)' : c)));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  const f = path.join(tmp, name);
  fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return f;
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
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  await p.evaluate(() => {
    location.hash = '#/catalog';
  });
  await p.waitForTimeout(1000);
  await p.click('[data-ctab="customs"]');
  await p.waitForTimeout(800);
  const toasts = () =>
    p.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
  const clear = () => p.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
  const decls = () => p.evaluate(() => JSON.parse(JSON.stringify(HAK.Customs.activeDecls())));

  console.log('1) Nhập Excel: tờ khai có ô thuế "(1.200)" → cảnh báo nêu ô đó; giá trị không âm');
  await clear();
  await p.setInputFiles('#csImport', xlsxOf('paren.xlsx', null, true));
  await p.waitForTimeout(1800);
  let d = await decls();
  check(d.length === 1 && d[0].no === NO1, 'nhập được tờ khai ' + NO1, JSON.stringify(d.map((x) => x.no)));
  check(!(d[0].taxVnd < 0), 'thuế KHÔNG bị đổi thành số âm', String(d[0].taxVnd));
  let t = (await toasts()).join(' | ');
  check(/ngoặc/.test(t) && /\(1\.200\)/.test(t), 'thông báo nêu rõ ô dạng ngoặc "(1.200)" cần đối chiếu', t);

  console.log('2) Nhập lại cùng file: không tạo trùng, vẫn báo đã có');
  await clear();
  await p.setInputFiles('#csImport', xlsxOf('paren2.xlsx', null, true));
  await p.waitForTimeout(1500);
  d = await decls();
  t = (await toasts()).join(' | ');
  check(d.length === 1, 'vẫn đúng 1 tờ khai (không nhân đôi)', String(d.length));
  check(/đã có/.test(t), 'thông báo nêu tờ khai đã có', t);

  console.log('3) Khai bổ sung từ Excel có ô "(1.200)": cảnh báo khi mở phiếu bổ sung');
  await clear();
  await p.evaluate(
    (id) => document.querySelector('[data-id="' + id + '"]') && document.querySelector('[data-id="' + id + '"]').click(),
    d[0].id
  );
  await p.waitForTimeout(500);
  await p.setInputFiles('#csImportSupp', xlsxOf('supp.xlsx', NO2, true));
  await p.waitForTimeout(1500);
  t = (await toasts()).join(' | ');
  check(/ngoặc/.test(t) && /\(1\.200\)/.test(t), 'khai bổ sung: cảnh báo ô dạng ngoặc hiện ra', t);
  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
