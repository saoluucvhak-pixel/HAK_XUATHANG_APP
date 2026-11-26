/* Kiểm thử nhập, chuyển và khôi phục đợt Excel theo mẫu nhà cung cấp trên Chromium. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const XLSX = require('../app/libs/xlsx.full.min.js');

const appUrl = process.env.HAK_APP_URL || pathToFileURL(path.resolve(__dirname, '../app/index.html')).href;
const headers = ['Mã phiếu', 'Số xe', 'Thời gian cân', 'Khối lượng hàng'];
const ticket = ['0101', '43C-123.45', '20/10/2026 08:30:00', 25];
const mainSheet = 'PhieuCan';
const sourceType = 'xuatkhogui';
const destinationType = 'xuatkhau';

function writeWorkbook(dir, name, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [sheet, rows, origin = 'A1'] of sheets) {
    const worksheet = XLSX.utils.sheet_add_aoa({}, rows, { origin });
    const area = XLSX.utils.decode_range(worksheet['!ref']);
    area.s = XLSX.utils.decode_cell(origin);
    worksheet['!ref'] = XLSX.utils.encode_range(area);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet);
  }
  const file = path.join(dir, name);
  fs.writeFileSync(file, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  return file;
}

async function login(page) {
  await page.goto(appUrl);
  await page.locator('#authForm').waitFor();
  await page.fill('#auName', 'Test Admin');
  await page.fill('#auUser', 'admin');
  await page.fill('#auPw', 'matkhau123');
  await page.fill('#auPw2', 'matkhau123');
  await page.click('#authForm button[type=submit]');
  await page.waitForTimeout(1200);
  for (let i = 0; i < 4; i++) {
    const next = page.getByRole('button', { name: 'Tiếp tục', exact: true }).first();
    if (!(await next.isVisible())) break;
    const kept = page.locator('#auKept');
    if (await kept.isVisible()) await kept.check();
    await next.click();
    await page.waitForTimeout(600);
  }
  const company = page.locator('[data-co="hak"]');
  if (await company.isVisible()) await company.click();
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-excel-template-'));
  let browser;
  try {
    const exe = process.env.HAK_CHROMIUM;
    browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page);

    const origin = 'C5';
    const decoy = ['CanThu', [headers, ['9999', '43C-999.99', '20/10/2026 06:30:00', 1000]]];
    const sample = writeWorkbook(dir, 'mau.xlsx', [[mainSheet, [headers, ticket], origin]]);
    await page.click('a[href="#/settings"]');
    await page.click('button[data-bs-target="#tab-excel-tpl"]');
    await page.click('#tplBtnNew');
    await page.fill('#wizTplName', 'Mẫu NCC Hải Vân');
    await page.setInputFiles('#wizFileInput', sample);
    await page.locator('#wizSheetSelect option[value=PhieuCan]').waitFor({ state: 'attached' });
    await page.fill('#wizHeaderRow', '5');
    await page.click('#wizBtnScan');
    assert.match(await page.locator('.wiz-col-select[data-field="ticket"] option:checked').innerText(), /Cột C/);
    await page.selectOption('#wizFallbackUnit', 'tan');
    await page.click('#wizBtnProbe');
    assert.match(await page.locator('#wizProbeResult').innerText(), /Đọc thử hợp lệ/);
    await page.check('#wizIsDefault');
    await page.click('#wizBtnSave');
    const defaultTemplate = await page.evaluate(() => HAK.ExcelTemplate.getDefault());
    assert.equal(defaultTemplate.headerRow, 5);

    await page.click('a[href="#/file"]');
    await page.click('button[data-ft="' + sourceType + '"]');

    const input = (file) => page.setInputFiles('#fileInput', file);
    const waitForSaved = (name) => page.waitForFunction((fileName) => HAK.App.cur().fileName === fileName && HAK.App.cur().saved, name);

    const kgFile = writeWorkbook(dir, 'kg.xlsx', [
      decoy,
      [
        mainSheet,
        [
          [...headers.slice(0, 3), 'Khối lượng hàng (kg)'],
          [...ticket.slice(0, 3), 25000],
        ],
        origin,
      ],
    ]);
    await input(kgFile);
    await waitForSaved('kg.xlsx');
    assert.equal(await page.evaluate(() => HAK.App.ds.stats.kg), 25000);
    assert.equal(await page.locator('#batchTemplateSelect').inputValue(), defaultTemplate.id);
    assert.equal(await page.locator('#previewBody tr td:nth-child(2)').first().innerText(), '0101');
    assert.doesNotMatch(await page.locator('#fileAlerts').innerText(), /không khớp hoàn toàn/);

    const rejectedId = await page.evaluate((template) => {
      const saved = HAK.ExcelTemplate.save({ ...template, id: null, name: 'Dòng tiêu đề khác', headerRow: 50, isDefault: false });
      return saved.id;
    }, defaultTemplate);

    const tons = writeWorkbook(dir, 'tan.xlsx', [[mainSheet, [headers, ['0102', '43C-678.90', ...ticket.slice(2)]], origin]]);
    await input(tons);
    await waitForSaved('tan.xlsx');
    await page.selectOption('#batchTemplateSelect', rejectedId);
    assert.equal(await page.locator('#batchTemplateSelect').inputValue(), defaultTemplate.id);
    assert.equal(await page.evaluate(() => HAK.App.headerRow), 5);
    const transfer = await page.evaluate(
      async ({ source, dest }) => {
        const current = HAK.App.cur();
        const copied = await HAK.App.copyBatches(source, [current], dest);
        const batch = HAK.App.slots[dest].batches[0];
        const persisted = await HAK.DB.get('batches', dest + '|' + batch.fileName);
        return {
          copied,
          kg: batch.ds.stats.kg,
          sourceKg: current.ds.stats.kg,
          unit: persisted.fallbackUnit,
          templateId: persisted.templateId,
        };
      },
      { source: sourceType, dest: destinationType }
    );
    assert.deepEqual(transfer, { copied: true, kg: 25000, sourceKg: 25000, unit: 'tan', templateId: defaultTemplate.id });

    const dup = writeWorkbook(dir, 'trung.xlsx', [decoy, [mainSheet, [headers, ticket, ticket], origin]]);
    await input(dup);
    await page.getByText(/sheet "PhieuCan" có 1 dòng trùng hoàn toàn/).waitFor();
    assert.equal(await page.evaluate(() => HAK.App.cur().fileName), 'tan.xlsx');
    assert.ok(!(await page.evaluate((type) => HAK.DB.get('batches', type + '|trung.xlsx'), sourceType)));

    const otherHeaders = [...headers.slice(0, 3), 'Đơn giá', 'Trọng lượng hàng (kg)'];
    const wrong = writeWorkbook(dir, 'doi-cot.xlsx', [[mainSheet, [[...otherHeaders], [...ticket.slice(0, 3), 18000, 25000]], origin]]);
    await input(wrong);
    await page.locator('#btnSwitchAutoDetect').waitFor();
    assert.deepEqual(await page.evaluate((type) => ({ ok: HAK.App.ds.ok, kg: HAK.App.slots[type].ds.stats.kg }), sourceType), {
      ok: false,
      kg: 50000,
    });
    assert.ok(!(await page.evaluate((type) => HAK.DB.get('batches', type + '|doi-cot.xlsx'), sourceType)));
    await page.click('#btnSwitchAutoDetect');
    await waitForSaved('doi-cot.xlsx');
    assert.equal(await page.evaluate(() => HAK.App.ds.stats.kg), 25000);
    assert.equal(await page.locator('#batchTemplateSelect').inputValue(), '');

    const restored = await page.evaluate(async () => {
      const backup = await HAK.Backup.buildFull();
      HAK.Store.remove(HAK.Constants.KEYS.EXCEL_TEMPLATES);
      await HAK.Backup.restoreFile(new File(backup.parts, 'sao-luu.json', { type: 'application/json' }), {
        keepAuth: true,
        mode: 'replace',
      });
      return HAK.ExcelTemplate.load();
    });
    assert.equal(restored.defaultId, defaultTemplate.id);
    assert.deepEqual(restored.templates.map((t) => t.id).sort(), [defaultTemplate.id, rejectedId].sort());
    assert.deepEqual(errors, []);
    console.log('✓ Mẫu Excel: tiêu đề C5, kg/tấn, chuyển đợt, từ chối mẫu sai, chặn phiếu trùng và khôi phục.');
  } finally {
    if (browser) await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
