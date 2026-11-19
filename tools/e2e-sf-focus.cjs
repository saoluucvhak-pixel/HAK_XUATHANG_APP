/* E2E Đợt C1 (đồng bộ repo gốc HAK_SMART_FILTER): ngăn "Bộ lọc nâng cao"
 *  - vẽ lại ngăn (nạp bộ lọc đã lưu bằng bàn phím) GIỮ tiêu điểm ở đúng ô đang dùng, không nhảy về ô đầu;
 *  - tiêu đề nhỏ của ngăn là tên màn hình, KHÔNG lộ mã nội bộ ("HAK SMART FILTER · <screenId>").
 * Chạy: node tools/e2e-sf-focus.cjs  ·  SQLite: node tools/e2e-sqlite.cjs tools/e2e-sf-focus.cjs. Dữ liệu 100% giả lập. */
const { chromium } = require('playwright');
const path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) failures.push(m);
};
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
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
    await p.waitForTimeout(1500);
  }
  await p.click('[data-nav="archive"]');
  await p.waitForSelector('#archSmartFilter [data-sf-adv]', { timeout: 15000 });

  console.log('1) Tiêu đề ngăn Bộ lọc nâng cao không lộ mã nội bộ');
  await p.click('#archSmartFilter [data-sf-adv]');
  await p.waitForSelector('[data-sf-drawer]');
  const head = await p.evaluate(() => {
    const d = document.querySelector('[data-sf-drawer]');
    return { screen: d.getAttribute('data-sf-drawer'), small: (d.querySelector('.sfd-head small') || {}).textContent || '' };
  });
  check(
    !/HAK SMART FILTER/i.test(head.small) && head.small.indexOf(head.screen) < 0,
    'tiêu đề nhỏ = "' + head.small + '" (không chứa "' + head.screen + '")'
  );
  check(head.small.trim().length > 0, 'tiêu đề nhỏ không rỗng');

  console.log('2) Nạp bộ lọc đã lưu bằng bàn phím → tiêu điểm ở lại ô "Bộ lọc đã lưu"');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await p.evaluate((sid) => {
    const st = HAKSmartFilter.core.presets(HAK.Filters.presetStorage);
    st.save(sid, 'BL-TIEU-DIEM', { q: 'TAU A' });
  }, head.screen);
  await p.click('#archSmartFilter [data-sf-adv]');
  await p.waitForSelector('[data-sf-drawer] [data-sf-presets] select');
  const sel = '[data-sf-drawer] [data-sf-presets] select';
  await p.focus(sel);
  await p.selectOption(sel, { label: 'BL-TIEU-DIEM' });
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => {
    const a = document.activeElement;
    return { label: a && a.getAttribute('aria-label'), tag: a && a.tagName, inDrawer: !!(a && a.closest('[data-sf-drawer]')) };
  });
  check(after.inDrawer && after.label === 'Bộ lọc đã lưu', 'tiêu điểm sau khi vẽ lại: ' + JSON.stringify(after));
  const q = await p.$eval('[data-sf-drawer] [data-sf-q]', (e) => e.value).catch(() => null);
  check(q === null || q === 'TAU A', 'điều kiện của bộ lọc đã nạp vào ngăn (ô tìm = ' + JSON.stringify(q) + ')');

  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close();
  if (failures.length) {
    console.error('\n✗ Lỗi: ' + failures.length);
    process.exit(1);
  }
  console.log('\n✓ Đạt toàn bộ');
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
