/* E2E quy tắc 29: phiếu KL ≤ 0 (0 và âm) không cộng vào tổng ở MỌI nơi, liệt kê riêng.
 * Luồng: nhập Excel có 2 phiếu hợp lệ + 2 phiếu KL ≤ 0 → cảnh báo nêu số phiếu → thẻ thống kê → xuất Excel (không có phiếu bị loại)
 * → lưu hồ sơ (meta ghi phiếu đã loại) → Báo cáo › Ngoại lệ cần đối soát liệt kê → Báo cáo tổng hợp có cùng số xe / kg.
 * Chạy: node tools/e2e-nonpositive.cjs (dữ liệu giả lập). */
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-nonpos-'));
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
const R = (t, plate, dt, net) => [t, plate, dt, net + 10000, 10000, net];
const file = path.join(tmp, 'can.xlsx');
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      H,
      R('N101', '43C-11111', '03/02/2026 07:00', 20000),
      R('N102', '43C-22222', '03/02/2026 07:45', 0),
      R('N103', '43C-33333', '03/02/2026 08:30', -500),
      R('N104', '51C-44444', '03/02/2026 09:15', 21000),
    ]),
    'Can'
  );
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
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
    await p.waitForTimeout(2000);
  }
  const goto = async (h, ms) => {
    await p.evaluate((x) => (location.hash = x), h);
    await p.waitForTimeout(ms || 700);
  };
  console.log('1) Nhập Excel: cảnh báo nêu số phiếu bị loại; thống kê chỉ gồm 2 phiếu hợp lệ');
  await goto('#/file');
  await p.click('[data-ft="' + T + '"]');
  await p.waitForTimeout(300);
  await p.setInputFiles('#fileInput', file);
  await p.waitForTimeout(1800);
  const alerts = await p.evaluate(() => document.getElementById('fileAlerts').innerText.replace(/\s+/g, ' '));
  check(
    /2 phiếu có KL hàng ≤ 0/.test(alerts) && /N102/.test(alerts) && /N103/.test(alerts),
    'cảnh báo nêu 2 phiếu KL ≤ 0 và số phiếu N102, N103'
  );
  const st = await p.evaluate(() => ({ trips: HAK.App.ds.stats.trips, kg: HAK.App.ds.stats.kg, plates: HAK.App.ds.stats.plates }));
  check(st.trips === 2 && st.kg === 41000 && st.plates === 2, 'màn Nhập liệu: 2 xe · 41.000 kg · 2 biển số (' + JSON.stringify(st) + ')');

  console.log('2) Trang biên bản: tóm tắt trực tiếp cùng số; xuất Excel không có phiếu bị loại');
  await goto('#/' + T);
  await p.click('#page-' + T + ' [data-zone="party"]');
  await p.waitForTimeout(300);
  await p.fill('#f-' + T + '-ship', 'TÀU NONPOS');
  await p.waitForTimeout(300);
  await p.click('#page-' + T + ' [data-zone="data"]');
  await p.waitForTimeout(500);
  const live = await p.evaluate(
    (t) => ({ trips: document.getElementById('sumTrips-' + t).textContent, tons: document.getElementById('sumTons-' + t).textContent }),
    T
  );
  check(String(live.trips).replace(/\D/g, '') === '2' && /41/.test(live.tons), 'tóm tắt trang biên bản: 2 xe · ' + live.tons + ' tấn');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#xls-' + T)]);
  const xf = path.join(tmp, 'out.xlsx');
  await dl.saveAs(xf);
  const wb = XLSX.read(fs.readFileSync(xf), { type: 'buffer' });
  const cells = wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }).flat()).map(String);
  check(cells.some((c) => c.includes('N101')) && cells.some((c) => c.includes('N104')), 'Excel xuất có phiếu N101, N104');
  check(!cells.some((c) => c.includes('N102') || c.includes('N103')), 'Excel xuất KHÔNG có phiếu KL ≤ 0 (N102, N103)');
  await p.waitForTimeout(800);
  await p.click('#page-' + T + ' [data-year-save]');
  await p.waitForTimeout(1500);

  console.log('3) Lưu trữ + Báo cáo: meta ghi phiếu đã loại; Ngoại lệ cần đối soát liệt kê; Báo cáo tổng hợp cùng số xe / kg');
  const meta = await p.evaluate(async () => {
    const l = await HAK.Archive.list();
    const m = l[0] || {};
    return { n: l.length, trips: m.trips, kg: m.kg, nonPosTrips: m.nonPosTrips, nonPos: (m.nonPos || []).map((x) => x.t).join(',') };
  });
  check(meta.n === 1 && meta.trips === 2 && meta.kg === 41000, 'hồ sơ Lưu trữ: 2 xe · 41.000 kg');
  check(meta.nonPosTrips === 2 && meta.nonPos === 'N102,N103', 'hồ sơ ghi 2 phiếu đã loại: ' + meta.nonPos);
  await goto('#/report', 1500);
  await p.selectOption('#repTpl', 'exceptions');
  await p.waitForTimeout(2500);
  const ex = await p.evaluate(() => document.getElementById('repTplBody').innerText.replace(/\s+/g, ' '));
  check(
    /Phiếu KL ≤ 0 đã loại khỏi tổng/.test(ex) && /N102/.test(ex) && /N103/.test(ex),
    'Báo cáo › Ngoại lệ cần đối soát liệt kê N102, N103'
  );
  await p.selectOption('#repTpl', 'period');
  await p.waitForTimeout(2500);
  const per = await p.evaluate(() => document.getElementById('repTplBody').innerText.replace(/\s+/g, ' '));
  check(/\b2\b/.test(per) && /41[.,]?000|41,00|41 /.test(per), 'Báo cáo theo kỳ: có 2 xe / 41 tấn (không cộng phiếu bị loại)');
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
