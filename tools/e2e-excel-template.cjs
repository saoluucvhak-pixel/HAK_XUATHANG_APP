/* tools/e2e-excel-template.cjs — E2E Chromium test for Excel Template feature & Screenshots */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('../app/libs/xlsx.full.min.js');

(async () => {
  const screenshotsDir = path.resolve(__dirname, '../docs/screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // Tạo file Excel mẫu thử nghiệm
  const sampleData = [
    ['PHIẾU CÂN NHÀ CUNG CẤP HẢI VÂN - ĐỢT THÁNG 10/2026'],
    ['Mã phiếu', 'Số xe', 'Thời gian cân', 'Khối lượng hàng', 'Đơn vị tính', 'Kho nhận', 'Ghi chú'],
    ['0101', '43C-123.45', '20/10/2026 08:30:00', 25400, 'kg', 'Kho HAK Đà Nẵng', 'Tàu Biển Đông'],
    ['0102', '43C-678.90', '20/10/2026 09:15:00', 28600, 'kg', 'Kho HAK Đà Nẵng', 'Tàu Biển Đông'],
    ['0103', '43C-111.22', '20/10/2026 10:00:00', 22100, 'kg', 'Kho HAK Đà Nẵng', 'Tàu Biển Đông'],
    ['0104', '43C-333.44', '20/10/2026 11:20:00', 26500, 'kg', 'Kho HAK Đà Nẵng', 'Tàu Biển Đông'],
    ['', '', '', '', '', '', ''],
    ['', 'NGƯỜI LẬP BIỂU', '', 'THỦ KHO', '', 'KẾ TOÁN TRƯỞNG', ''],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(wb, ws, 'PhieuCan');
  const tempExcelPath = path.resolve(screenshotsDir, 'MauCan_HaiVan_Sample.xlsx');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(tempExcelPath, buf);

  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  const appUrl = 'file://' + path.resolve(__dirname, '../app/index.html');

  async function login(p) {
    await p.goto(appUrl);
    const authForm = await p.$('#authForm');
    if (authForm && (await authForm.isVisible())) {
      await p.fill('#auName', 'Test Admin');
      await p.fill('#auUser', 'admin');
      await p.fill('#auPw', 'matkhau123');
      await p.fill('#auPw2', 'matkhau123');
      await p.click('#authForm button[type=submit]');
      await p.waitForTimeout(1200);
      for (let i = 0; i < 4; i++) {
        const nb = await p.$('button:has-text("Tiếp tục")');
        if (!nb || !(await nb.isVisible())) break;
        const chk = await p.$('#auKept');
        if (chk && (await chk.isVisible())) await chk.check();
        await nb.click();
        await p.waitForTimeout(600);
      }
      const co = await p.$('[data-co="hak"]');
      if (co && (await co.isVisible())) {
        await co.click();
        await p.waitForTimeout(1500);
      }
    }
  }

  await login(page);
  await page.waitForFunction(() => window.HAK && HAK.ExcelTemplate && HAK.Settings, null, { timeout: 15000 });

  // 1. Chuyển sang Cài đặt -> Tab Mẫu nhập Excel
  await page.click('a[href="#/settings"]');
  await page.waitForTimeout(600);

  // Click vào pill Mẫu nhập Excel
  await page.click('button[data-bs-target="#tab-excel-tpl"]');
  await page.waitForTimeout(400);

  // Click nút Tạo mẫu mới
  await page.click('#tplBtnNew');
  await page.waitForTimeout(400);

  // Điền thông tin bước 1 & 2
  await page.fill('#wizTplName', 'Mẫu NCC Hải Vân');
  await page.setInputFiles('#wizFileInput', tempExcelPath);
  await page.waitForTimeout(800);

  // Đặt dòng tiêu đề = 2 (vì dòng 1 là tiêu đề lớn)
  await page.fill('#wizHeaderRow', '2');
  await page.click('#wizBtnScan');
  await page.waitForTimeout(500);

  // Chụp ảnh Screenshot 1: Mẫu đã ghép cột
  const shot1 = path.resolve(screenshotsDir, 'screenshot-template-mapping.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log('✓ Screenshot 1 saved:', shot1);

  // Bước 3: Bấm đọc thử
  await page.click('#wizBtnProbe');
  await page.waitForTimeout(600);

  // Chụp ảnh Screenshot 2: Kết quả đọc thử
  const shot2 = path.resolve(screenshotsDir, 'screenshot-template-probe.png');
  await page.screenshot({ path: shot2, fullPage: false });
  console.log('✓ Screenshot 2 saved:', shot2);

  // Bước 4 & 5: Đặt làm mặc định và Lưu mẫu
  await page.check('#wizIsDefault');
  await page.click('#wizBtnSave');
  await page.waitForTimeout(600);

  // Chụp ảnh Screenshot 3: Danh sách mẫu và trạng thái mặc định
  const shot3 = path.resolve(screenshotsDir, 'screenshot-template-default.png');
  await page.screenshot({ path: shot3, fullPage: false });
  console.log('✓ Screenshot 3 saved:', shot3);

  // 2. Kiểm tra nạp file trên trang Chọn File Excel
  await page.click('a[href="#/file"]');
  await page.waitForTimeout(500);
  await page.click('button[data-ft="xuatkhau"]');
  await page.waitForTimeout(500);

  // Nạp file mẫu vào App
  await page.setInputFiles('#fileInput', tempExcelPath);
  await page.waitForTimeout(2000);

  const fileResultVisible = await page.isVisible('#fileResult');
  const alerts = await page.$eval('#fileAlerts', (el) => el.innerText).catch(() => '');
  console.log('File alerts:', alerts);
  const batchTemplateValue = await page.$eval('#batchTemplateSelect', (el) => el.value).catch((e) => 'ERR: ' + e.message);
  const rowCount = await page.$$eval('#previewBody tr', (rows) => rows.length).catch(() => 0);
  console.log('Row count in previewBody:', rowCount);
  const ticketValue = await page.$eval('#previewBody tr td:nth-child(2)', (el) => el.textContent.trim()).catch((e) => 'ERR: ' + e.message);

  console.log('File result visible:', fileResultVisible);
  console.log('Selected batch template:', batchTemplateValue);
  console.log('First ticket with leading zeroes:', ticketValue);

  // Chụp ảnh Screenshot 4: Nạp file đợt áp dụng mẫu mặc định
  const shot4 = path.resolve(screenshotsDir, 'screenshot-file-import-template.png');
  await page.screenshot({ path: shot4, fullPage: false });
  console.log('✓ Screenshot 4 saved:', shot4);

  await browser.close();

  if (errors.length) {
    console.warn('Browser warnings/errors during test:', errors);
  }

  if (!fileResultVisible || ticketValue !== '0101') {
    console.error('E2E verification failed!');
    process.exit(1);
  }

  console.log('E2E Chromium flow completed successfully!');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
