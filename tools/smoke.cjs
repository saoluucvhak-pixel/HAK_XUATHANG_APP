/* Smoke test trình duyệt: mở app thật, không được có lỗi script; các trang lập hồ sơ phải dựng được.
 * Chạy: npm run smoke (cần playwright; trong CI cài riêng, không thêm vào dependencies). */
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const page = await browser.newPage(),
    errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  await page.goto('file://' + path.resolve(__dirname, '../app/index.html'));
  await page.waitForFunction(() => window.HAK && HAK.Pages && HAK.Pages.DOCS, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    version: HAK.VERSION,
    modals: typeof HAK.PagesModals,
    contract: typeof HAK.PagesContract,
    filter: typeof HAK.PagesFilter,
    bkls: typeof HAK.PagesBkls,
    types: Object.keys(HAK.Pages.DOCS),
    pick: typeof (HAK.Pages._pick && HAK.Pages._pick.resolveTicket),
  }));
  await browser.close();
  const fail = [];
  if (errs.length) fail.push('Lỗi trong trang:\n  ' + errs.join('\n  '));
  if (r.modals !== 'function') fail.push('HAK.PagesModals chưa nạp');
  if (r.contract !== 'function') fail.push('HAK.PagesContract chưa nạp');
  if (r.filter !== 'function') fail.push('HAK.PagesFilter chưa nạp');
  if (r.bkls !== 'function') fail.push('HAK.PagesBkls chưa nạp');
  if (r.pick !== 'function') fail.push('HAK.Pages._pick.resolveTicket chưa có');
  if (r.types.length < 6) fail.push('Thiếu loại hồ sơ: ' + r.types.join(','));
  console.log(JSON.stringify(r));
  if (fail.length) {
    console.error(fail.join('\n'));
    process.exit(1);
  }
  console.log('Smoke test đạt');
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
