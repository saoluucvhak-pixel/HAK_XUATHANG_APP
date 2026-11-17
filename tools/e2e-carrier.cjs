/* Chi tiết đơn vị vận chuyển phải khớp bảng tổng trên trình duyệt thật: hồ sơ P1 = 10 tấn ngày 31/12/2025, P2 = 20 tấn ngày 01/01/2026,
 * lọc 01/2026 theo NGÀY CÂN → bảng tổng, chi tiết vận chuyển và file Excel đều 20 tấn. Chạy: node tools/e2e-carrier.cjs (cần playwright). */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2ec-'));
const failures = [],
  check = (c, m) => {
    console.log((c ? '  ✓ ' : '  ✗ ') + m);
    if (!c) failures.push(m);
  };
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage(),
    errs = [];
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
  console.log('1) Tạo hồ sơ P1 (31/12/2025, 10 tấn) + P2 (01/01/2026, 20 tấn, xe trả về) qua Archive.save');
  const ok = await p.evaluate(async () => {
    const mk = (n, d, net) => ({
      idx: n,
      uid: 'u' + n,
      ticket: 'P' + n,
      plate: '43C-' + n,
      dateStr: d,
      time1: '08:00',
      net,
      carrier: 'VT-A',
      ts1: Date.parse('2025-12-31T08:00:00Z') + n * 86400000,
    });
    const ds = { rows: [mk(1, '31/12/2025', 10000), mk(2, '01/01/2026', 20000)] };
    const params = { ship: 'TÀU X', giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [] };
    return HAK.Archive.save(
      'uythac',
      params,
      { files: [{ name: 'HS-X.xlsx' }], excel: { fileName: 'HS-X.xlsx' }, summary: {} },
      ds,
      'xlsx'
    );
  });
  check(ok === true, 'Lưu hồ sơ thành công');
  await p.evaluate(() => {
    location.hash = '#/report';
  });
  await p.waitForTimeout(1500);
  await p.selectOption('#repBasis', 'weigh');
  const setRange = (a, b) =>
    p.evaluate(
      ([x, y]) => {
        document.getElementById('repFrom').value = x;
        const t = document.getElementById('repTo');
        t.value = y;
        t.dispatchEvent(new Event('change', { bubbles: true }));
      },
      [a, b]
    );
  await setRange('2026-01-01', '2026-01-31');
  await p.waitForTimeout(2500);
  const total = await p.evaluate(() => document.getElementById('repMain').innerText.replace(/\s+/g, ' '));
  check(/20,00/.test(total) && !/30,00/.test(total), 'Báo cáo tổng hợp: 20,00 tấn (không có 30,00)');
  const opts = await p.evaluate(() => Array.from(document.querySelectorAll('#repCarrierShip option')).map((o) => o.value));
  const key = opts.find((v) => v.indexOf('ship:') === 0);
  await p.selectOption('#repCarrierShip', key);
  await p.waitForTimeout(1500);
  const det = await p.evaluate(() => document.getElementById('repCarrierBody').innerText.replace(/\s+/g, ' '));
  check(/01\/01\/2026/.test(det) && !/31\/12\/2025/.test(det), 'Chi tiết vận chuyển chỉ có ngày 01/01/2026');
  check(/20,00/.test(det) && !/30,00|10,00/.test(det), 'Chi tiết vận chuyển: 20,00 tấn');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#repXlsCarrier')]);
  const f = path.join(tmp, 'dvvc.xlsx');
  await dl.saveAs(f);
  const ws = XLSX.read(fs.readFileSync(f)).Sheets;
  const aoa = XLSX.utils.sheet_to_json(ws[Object.keys(ws)[0]], { header: 1 });
  const data = aoa.filter((r) => typeof r[4] === 'number');
  check(
    data.length === 1 && Math.abs(data[0][4] - 20) < 1e-9 && /01\/01\/2026/.test(String(data[0][1])),
    'Excel ĐVVC: 1 dòng, 20 tấn, ngày 01/01/2026'
  );
  // đổi kỳ → tập mới
  await setRange('2025-12-01', '2025-12-31');
  await p.waitForTimeout(2500);
  await p.selectOption('#repCarrierShip', key);
  await p.waitForTimeout(1500);
  const det2 = await p.evaluate(() => document.getElementById('repCarrierBody').innerText.replace(/\s+/g, ' '));
  check(/31\/12\/2025/.test(det2) && /10,00/.test(det2) && !/20,00/.test(det2), 'Đổi sang 12/2025: chi tiết đổi theo, 10,00 tấn');
  check(errs.length === 0, 'Không có lỗi script' + (errs.length ? ': ' + errs[0] : ''));
  await browser.close();
  if (failures.length) {
    console.log('\n✗ ' + failures.length + ' sai lệch');
    process.exit(1);
  }
  console.log('\n✓ Đạt toàn bộ');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
