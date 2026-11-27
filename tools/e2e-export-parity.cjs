/* E2E M2.2 + tồn mục 29: với CÙNG một bộ lọc, màn hình = Excel = Word = PDF (đọc lại từng file): cùng tập phiếu, cùng số xe, cùng tổng kg.
 * Ca sát biên ngày/giờ (00:00, 23:59, qua nửa đêm), biển số viết khác nhau (quy tắc 26) và phiếu KL ≤ 0 (quy tắc 29: loại khỏi tổng, không có trong file).
 * Chạy: node tools/e2e-export-parity.cjs (dữ liệu giả lập; cần pdfjs-dist đã cài — npm ci). */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const JSZip = require('../app/libs/jszip.min.js');
const APP = process.env.HAK_APP_URL || 'file://' + path.resolve(__dirname, '../app/index.html');
const T = 'uythac';
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) failures.push(m);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-parity-'));
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
const R = (t, plate, dt, net) => [t, plate, dt, net + 10000, 10000, net];
const DATA = [
  R('P01', '43C-11111', '04/02/2026 23:59', 20000),
  R('P02', '43c-111.11', '05/02/2026 00:00', 21000),
  R('P03', '43C-22222', '05/02/2026 08:00', 22000),
  R('P04', '43C-22222', '05/02/2026 23:59', 23000),
  R('P05', '51C-33333', '06/02/2026 00:00', 24000),
  R('P06', '51C-33333', '05/02/2026 12:00', 0),
  R('P07', '51C-44444', '05/02/2026 13:00', -700),
  R('P08', '51C-55555', '05/02/2026 22:30', 25000),
  R('P09', '51C-55555', '06/02/2026 01:30', 26000),
];
const KG = Object.fromEntries(DATA.map((r) => [r[0], r[5]]));
const file = path.join(tmp, 'can.xlsx');
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H].concat(DATA)), 'Can');
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
// ca lọc: [tên, {from,to,tf,tt}, phiếu mong đợi, số xe (biển số chuẩn hóa) mong đợi]
const CASES = [
  ['khoảng ngày 05/02 → 05/02', { from: '2026-02-05', to: '2026-02-05' }, ['P02', 'P03', 'P04', 'P08'], 3],
  ['ca đêm qua nửa đêm 22:00 → 02:00', { tf: '22:00', tt: '02:00' }, ['P01', 'P02', 'P04', 'P05', 'P08', 'P09'], 4],
  ['sát biên 00:00 → 00:00', { tf: '00:00', tt: '00:00' }, ['P02', 'P05'], 2],
  ['sát biên 23:59 → 23:59', { tf: '23:59', tt: '23:59' }, ['P01', 'P04'], 2],
  ['không lọc (cả đợt; phiếu KL ≤ 0 đã loại)', {}, ['P01', 'P02', 'P03', 'P04', 'P05', 'P08', 'P09'], 4],
];
let pdfjs = null;
const docxText = async (f) =>
  (await (await JSZip.loadAsync(fs.readFileSync(f))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ');
const pdfText = async (f) => {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(f)),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  let t = '';
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + '\n';
  return t;
};
const has = (txt, id) => new RegExp('(^|[^A-Za-z0-9])' + id + '([^0-9]|$)').test(txt);
(async () => {
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true })).newPage();
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
  const goto = async (h) => {
    await p.evaluate((x) => (location.hash = x), h);
    await p.waitForTimeout(700);
  };
  await goto('#/file');
  await p.click('[data-ft="' + T + '"]');
  await p.waitForTimeout(300);
  await p.setInputFiles('#fileInput', file);
  await p.waitForTimeout(1800);
  await goto('#/' + T);
  await p.click('#page-' + T + ' [data-zone="party"]');
  await p.waitForTimeout(300);
  await p.fill('#f-' + T + '-ship', 'TÀU PARITY');
  await p.waitForTimeout(300);
  await p.click('#page-' + T + ' [data-zone="data"]');
  await p.waitForTimeout(400);
  const setF = async (f) => {
    // ô ngày nằm trong khung ẩn (bộ lọc thông minh điều khiển); đặt giá trị + phát sự kiện như khi bộ lọc áp dụng
    await p.evaluate(
      ([t, f]) => {
        const map = { from: 'from-', to: 'to-', tf: 'tf-', tt: 'tt-' };
        Object.keys(map).forEach((k) => {
          const el = document.getElementById(map[k] + t);
          el.value = f[k] || '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      },
      [T, f]
    );
    await p.waitForTimeout(600);
  };
  await setF(CASES[0][1]);
  await p.evaluate(() => {
    HAK.Pages._confirmScope = () => true;
    window.savePackageBlob = HAK.Word.Files.saveBlob;
    HAK.Word.Files.saveBlob = async (blob, name) => {
      window.lastPackage = { name, bytes: [...new Uint8Array(await blob.arrayBuffer())] };
      return true;
    };
  });
  await p.click('#btnQuickZip-' + T);
  await p.waitForFunction(() => window.lastPackage, null, { timeout: 20000 });
  const zipped = await JSZip.loadAsync(Uint8Array.from(await p.evaluate(() => window.lastPackage.bytes)));
  const entries = Object.keys(zipped.files);
  check(
    entries.some((f) => /^BKLS_.*_tong\.docx$/i.test(f)),
    'ZIP có BKLS Mẫu 01 tổng'
  );
  check(
    entries.some((f) => /\.docx$/i.test(f) && !f.startsWith('BKLS_')),
    'ZIP có biên bản Word'
  );
  check(
    entries.some((f) => /\.xlsx$/i.test(f)),
    'ZIP có bảng kê Excel'
  );
  await p.getByText(/Đã lưu trọn bộ hồ sơ:/).waitFor();
  await p.evaluate(() => {
    HAK.Pages._confirmScope = () => false;
    window.lastPackage = null;
  });
  await p.click('#btnQuickZip-' + T);
  await p.locator('#btnQuickZip-' + T + ':enabled').waitFor();
  check(!(await p.evaluate(() => window.lastPackage)), 'Hủy xác nhận thì chưa lưu ZIP');
  await p.evaluate(() => {
    HAK.Word.Files.saveBlob = window.savePackageBlob;
    delete window.savePackageBlob;
    delete window.lastPackage;
    delete HAK.Pages._confirmScope;
  });
  let n = 0;
  for (const [name, f, want, plates] of CASES) {
    n++;
    console.log(n + ') ' + name);
    await setF(f);
    const kg = want.reduce((a, t) => a + KG[t], 0);
    const scr = await p.evaluate(
      (t) => ({ trips: document.getElementById('sumTrips-' + t).textContent, tons: document.getElementById('sumTons-' + t).textContent }),
      T
    );
    check(String(scr.trips).replace(/\D/g, '') === String(want.length), 'màn hình: ' + want.length + ' phiếu (' + scr.trips + ')');
    check(
      scr.tons.replace(/\./g, '').replace(',', '.') === (kg / 1000).toFixed(2),
      'màn hình: ' + (kg / 1000).toFixed(2) + ' tấn (' + scr.tons + ')'
    );
    const vehicles = await p.evaluate((t) => document.getElementById('sumList-' + t).innerText.replace(/\s+/g, ' '), T);
    check(
      new RegExp('Số xe \\(biển số\\)\\s*' + plates + '(\\D|$)').test(vehicles),
      'màn hình: ' + plates + ' xe theo biển số chuẩn hóa (' + vehicles.slice(0, 90) + ')'
    );
    const sameSet = (txt) =>
      want.every((t) => has(txt, t)) &&
      DATA.map((r) => r[0])
        .filter((t) => !want.includes(t))
        .every((t) => !has(txt, t));
    // Excel
    const [dx] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#xls-' + T)]);
    const xf = path.join(tmp, 'c' + n + '.xlsx');
    await dx.saveAs(xf);
    const wb = XLSX.read(fs.readFileSync(xf), { type: 'buffer' });
    const cells = wb.SheetNames.flatMap((s) =>
      XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: '' }).map((r) => r.join(' | '))
    ).join('\n');
    check(sameSet(cells), 'Excel: đúng tập phiếu ' + want.join(','));
    check(cells.includes(String(kg)) || cells.includes(kg.toLocaleString('en-US')), 'Excel: có tổng ' + kg + ' kg');
    // Word
    const [dw] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#gen-' + T)]);
    const wf = path.join(tmp, 'c' + n + '.docx');
    await dw.saveAs(wf);
    check(sameSet(await docxText(wf)), 'Word: đúng tập phiếu');
    // PDF (bản in thật)
    await p.evaluate(() => {
      window.__printed = 0;
      window.print = () => {
        window.__printed++;
      };
    });
    await p.click('#pdf-' + T);
    await p.waitForFunction(() => window.__printed > 0, null, { timeout: 30000 }).catch(() => {});
    const pf = path.join(tmp, 'c' + n + '.pdf');
    await p.pdf({ path: pf, printBackground: true, preferCSSPageSize: true });
    check(sameSet(await pdfText(pf)), 'PDF (đọc lại file): đúng tập phiếu');
    await p.evaluate(() => document.body.classList.remove('printing'));
  }
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
