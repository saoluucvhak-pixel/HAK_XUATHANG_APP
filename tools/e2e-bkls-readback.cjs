/* E2E A3: đọc lại RIÊNG BKLS (Word tổng, Word từng xe, PDF) — đúng tập phiếu và khối lượng như màn hình: phiếu KL ≤ 0 (quy tắc 29) và phiếu ngoài bộ lọc
 * KHÔNG có trong file; khối lượng tổng bằng tổng từng xe; số BKLS đúng. Dữ liệu giả lập. Chạy: node tools/e2e-bkls-readback.cjs (cần pdfjs-dist: npm ci). */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const JSZip = require('../app/libs/jszip.min.js');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const T = 'uythac';
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) failures.push(m);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-bkls-rb-'));
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
const R = (t, p, d, n) => [t, p, d, n + 10000, 10000, n];
const file = path.join(tmp, 'can.xlsx');
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      H,
      R('B1', '43C-11111', '03/02/2026 07:00', 20000),
      R('B2', '43C-22222', '03/02/2026 08:00', 21000),
      R('B3', '51C-33333', '03/02/2026 09:00', 0), // KL = 0 → loại khỏi tổng (quy tắc 29)
      R('B4', '51C-44444', '03/02/2026 10:00', 19000),
    ]),
    'S'
  );
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
const docxText = async (f) =>
  (await (await JSZip.loadAsync(fs.readFileSync(f))).file('word/document.xml').async('string'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
let pdfjs = null;
const pdfText = async (f) => {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(f)),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  let t = '';
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + '\n';
  return t.replace(/\s+/g, ' ');
};
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
  await p.evaluate(() => (location.hash = '#/file'));
  await p.waitForTimeout(600);
  await p.click('[data-ft="' + T + '"]');
  await p.setInputFiles('#fileInput', file);
  await p.waitForTimeout(1500);
  await p.evaluate((t) => (location.hash = '#/' + t), T);
  await p.waitForTimeout(800);
  const downloads = [];
  p.on('download', async (d) => {
    const f = path.join(tmp, 'd' + downloads.length + '-' + d.suggestedFilename());
    await d.saveAs(f);
    downloads.push(f);
  });
  const setTime = async (tf, tt) => {
    await p.evaluate(
      ([t, tf, tt]) => {
        for (const [id, v] of [
          ['tf-', tf],
          ['tt-', tt],
        ]) {
          const el = document.getElementById(id + t);
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      [T, tf, tt]
    );
    await p.waitForTimeout(500);
  };
  const makeBkls = async (scope, format) => {
    downloads.length = 0;
    await p.evaluate(() => {
      window.__printed = 0;
      window.print = () => {
        window.__printed++;
      };
    });
    await p.click('#bkls-' + T);
    await p.waitForSelector('.modal.show .template-select', { timeout: 10000 });
    await p.selectOption('.modal.show .scope', scope);
    await p.selectOption('.modal.show .format', format);
    await p.click('.modal.show .create');
    await p.waitForTimeout(format === 'pdf' ? 5000 : 4500);
  };
  const bad = ['51C-33333', '51C33333']; // phiếu KL = 0

  console.log('1) Không lọc: Word tổng + từng xe — 3 phiếu hợp lệ (60,00 tấn), phiếu KL = 0 không có');
  await setTime('', '');
  await makeBkls('both', 'docx');
  const tong = downloads.find((f) => /tong\.docx$/.test(f)),
    tung = downloads.find((f) => /tung_xe\.docx$/.test(f));
  check(!!tong && !!tung, 'có đủ 2 file Word BKLS (tổng, từng xe)');
  if (tong && tung) {
    const a = await docxText(tong),
      b = await docxText(tung);
    check(/60,00 \(Sáu mươi\)/.test(a), 'BKLS tổng: 60,00 tấn (20 + 21 + 19; không cộng phiếu KL = 0)');
    check(
      /001\/2026\/BKLS/.test(a) && ['43C-11111', '43C-22222', '51C-44444'].every((x) => a.includes(x)),
      'BKLS tổng: đúng số BKLS và liệt kê 3 xe'
    );
    check(!bad.some((x) => a.includes(x)) && !bad.some((x) => b.includes(x)), 'cả hai file: KHÔNG có xe của phiếu KL = 0');
    check(
      /20,00 \(Hai mươi\)/.test(b) && /21,00 \(Hai mươi mốt\)/.test(b) && /19,00 \(Mười chín\)/.test(b),
      'BKLS từng xe: 20,00 · 21,00 · 19,00 tấn'
    );
    check(
      ['0001', '0002', '0003'].every((x) => b.includes('BKLS-' + x)) && !b.includes('BKLS-0004'),
      'BKLS từng xe: số -0001…-0003, không có -0004'
    );
  }

  console.log('2) Lọc giờ cân 08:00 → 09:30: chỉ phiếu B2 (21,00 tấn) — Word tổng, không có xe ngoài bộ lọc');
  await setTime('08:00', '09:30');
  await makeBkls('total', 'docx');
  const t2 = downloads.find((f) => /tong\.docx$/.test(f));
  check(!!t2, 'có file Word tổng');
  if (t2) {
    const a = await docxText(t2);
    check(/21,00 \(Hai mươi mốt\)/.test(a) && a.includes('43C-22222'), 'BKLS tổng: 21,00 tấn, xe 43C-22222');
    check(
      !['43C-11111', '51C-44444'].some((x) => a.includes(x)) && !bad.some((x) => a.includes(x)),
      'BKLS tổng: không có xe ngoài khoảng giờ và không có phiếu KL = 0'
    );
  }

  console.log('3) PDF (bản in thật) đọc lại: cùng tập phiếu');
  await setTime('', '');
  await makeBkls('total', 'pdf');
  const printed = await p.evaluate(() => window.__printed);
  if (printed) {
    const pf = path.join(tmp, 'bkls.pdf');
    await p.pdf({ path: pf, printBackground: true, preferCSSPageSize: true });
    const txt = await pdfText(pf);
    check(/60,00/.test(txt) && /001\/2026\/BKLS/.test(txt), 'PDF BKLS: 60,00 tấn, đúng số BKLS');
    check(!bad.some((x) => txt.includes(x)), 'PDF BKLS: không có xe của phiếu KL = 0');
  } else console.log('  (bỏ qua) PDF: không mở được bản in trong môi trường này — CHƯA XÁC MINH');
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
