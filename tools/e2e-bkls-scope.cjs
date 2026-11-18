/* E2E: bấm "Lập BKLS" phải hiện hộp xác nhận phạm vi (công ty · tàu · số phiếu · thực giao) GIỐNG Word / PDF / Excel.
 * Hủy → không mở hộp chọn mẫu BKLS; Đồng ý → mở hộp chọn mẫu. Chạy: node tools/e2e-bkls-scope.cjs */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const T = 'uythac';
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) failures.push(m);
};
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
const R = (t, plate, dt, net) => [t, plate, dt, net + 10000, 10000, net];
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hak-bkls-')), 'can.xlsx');
fs.writeFileSync(
  file,
  XLSX.write(
    (() => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([H, R('T01', '43C-11111', '03/02/2026 07:00', 20000), R('T02', '51C-44444', '03/02/2026 07:45', 25000)]),
        'Can'
      );
      return wb;
    })(),
    { type: 'buffer', bookType: 'xlsx' }
  )
);
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
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
  await p.evaluate(() => (location.hash = '#/file'));
  await p.waitForTimeout(600);
  await p.click('[data-ft="' + T + '"]');
  await p.setInputFiles('#fileInput', file);
  await p.waitForTimeout(1800);
  await p.evaluate((t) => (location.hash = '#/' + t), T);
  await p.waitForTimeout(800);
  const msgs = [];
  let answer = false;
  p.on('dialog', (d) => {
    msgs.push(d.message());
    return answer ? d.accept() : d.dismiss();
  });
  const chooser = () => p.evaluate(() => !!document.querySelector('.modal.show .template-select'));
  console.log('1) Hủy hộp xác nhận → không mở hộp chọn mẫu BKLS');
  await p.click('#bkls-' + T);
  await p.waitForTimeout(1200);
  check(msgs.length === 1 && /BKLS/.test(msgs[0]) && /Đúng phạm vi cần lập/.test(msgs[0]), 'có hộp xác nhận phạm vi nêu BKLS');
  check(!(await chooser()), 'Hủy → không mở hộp chọn mẫu');
  console.log('2) Đồng ý → mở hộp chọn mẫu');
  answer = true;
  await p.click('#bkls-' + T);
  await p.waitForTimeout(1500);
  check(msgs.length === 2, 'lần 2 cũng hỏi xác nhận');
  check(await chooser(), 'Đồng ý → mở hộp chọn mẫu BKLS');
  check(errs.length === 0, 'không có lỗi script');
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
