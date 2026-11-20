/* E2E M6.1: hộp thoại dùng bàn phím — mở bằng nút, Tab 25 lần KHÔNG rơi ra nội dung nền, Esc đóng, tiêu điểm TRẢ VỀ đúng nút đã mở.
 * Hộp thoại chồng nhau: đóng hộp trên cùng chỉ trả tiêu điểm khi không còn hộp nào mở. Chạy: node tools/e2e-dialogs.cjs (dữ liệu giả lập). */
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-dlg-'));
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
const file = path.join(tmp, 'can.xlsx');
{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      H,
      ['T1', '43C-11111', '03/02/2026 07:00', 30000, 10000, 20000],
      ['T2', '43C-22222', '03/02/2026 08:00', 31000, 10000, 21000],
    ]),
    'S'
  );
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
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
    await p.waitForTimeout(2000);
  }
  await p.evaluate(() => (location.hash = '#/file'));
  await p.waitForTimeout(600);
  await p.click('[data-ft="' + T + '"]');
  await p.setInputFiles('#fileInput', file);
  await p.waitForTimeout(1500);
  await p.evaluate((t) => (location.hash = '#/' + t), T);
  await p.waitForTimeout(800);
  const probe = async (name, openSel, modalSel) => {
    console.log(name);
    await p.focus(openSel);
    await p.click(openSel);
    await p.waitForTimeout(800);
    const shown = await p.evaluate((m) => !!document.querySelector(m) && document.querySelector(m).classList.contains('show'), modalSel);
    check(shown, 'mở được bằng nút');
    if (!shown) return;
    check(await p.evaluate((m) => document.querySelector(m).contains(document.activeElement), modalSel), 'tiêu điểm vào trong hộp thoại');
    check(
      await p.evaluate(() => {
        const a = document.activeElement;
        return !(
          a &&
          a.tagName === 'BUTTON' &&
          (/btn-(outline-)?danger/.test(a.className) || /(Xóa|Gỡ|Quay lui|Ghi đè)/i.test(a.textContent))
        );
      }),
      'tiêu điểm đầu tiên KHÔNG ở nút phá hủy (Enter ngay sau khi mở không xóa gì)'
    );
    let leaked = 0;
    for (let i = 0; i < 25; i++) {
      await p.keyboard.press('Tab');
      leaked += await p.evaluate(
        (m) =>
          document.activeElement && document.activeElement !== document.body && !document.querySelector(m).contains(document.activeElement)
            ? 1
            : 0,
        modalSel
      );
    }
    check(leaked === 0, 'Tab 25 lần không rơi ra nội dung nền (' + leaked + ')');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
    check(await p.evaluate((m) => !document.querySelector(m).classList.contains('show'), modalSel), 'Esc đóng hộp thoại');
    check(
      await p.evaluate((o) => !!document.activeElement && document.activeElement.matches(o), openSel),
      'tiêu điểm TRẢ VỀ nút đã mở (' + openSel + ')'
    );
  };
  await probe('1) Chọn phiếu', '#btnPick-' + T, '#pickModal');
  await probe('2) Xe trả về', '#btnReturn-' + T, '#returnModal');
  await probe('3) Bỏ phiếu', '#btnOmit-' + T, '#omitModal');
  console.log('4) Hộp thoại chồng nhau: đóng hộp trên cùng không trả tiêu điểm khi vẫn còn hộp mở');
  const r = await p.evaluate(async () => {
    const mk = (id) => {
      const d = document.createElement('div');
      d.className = 'modal fade';
      d.id = id;
      d.tabIndex = -1;
      d.innerHTML =
        '<div class="modal-dialog"><div class="modal-content"><div class="modal-body"><button id="' +
        id +
        'b">x</button></div></div></div>';
      document.body.appendChild(d);
      return new bootstrap.Modal(d);
    };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const a = mk('tmA'),
      b = mk('tmB');
    document.getElementById('btnPick-' + 'uythac').focus();
    a.show();
    await wait(500);
    b.show();
    await wait(500);
    b.hide();
    await wait(500);
    const aStill = document.getElementById('tmA').classList.contains('show');
    const insideA = document.getElementById('tmA').contains(document.activeElement);
    a.hide();
    await wait(500);
    return { aStill, insideA, back: document.activeElement && document.activeElement.id };
  });
  check(r.aStill && r.insideA, 'đóng hộp B, hộp A vẫn mở và giữ tiêu điểm');
  check(r.back === 'btnPick-' + T, 'đóng nốt hộp A: tiêu điểm về nút ban đầu (' + r.back + ')');
  console.log(
    '5) Tìm kiếm chung (Ctrl+K): gõ được, Esc đóng, tiêu điểm về chỗ cũ; khi đang có hộp thoại không mở chồng (tránh giật tiêu điểm)'
  );
  await p.focus('#btnPick-' + T);
  await p.keyboard.press('Control+k');
  await p.waitForTimeout(500);
  check(await p.evaluate(() => document.activeElement && document.activeElement.id === 'gsInput'), 'Ctrl+K: tiêu điểm ở ô tìm');
  await p.keyboard.type('43C');
  check((await p.inputValue('#gsInput')) === '43C', 'gõ được vào ô tìm');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  check(await p.evaluate(() => document.querySelector('.gs-overlay').hidden), 'Esc đóng tìm kiếm');
  check(
    await p.evaluate((t) => document.activeElement && document.activeElement.id === 'btnPick-' + t, T),
    'tiêu điểm trả về nút đang đứng trước đó'
  );
  await p.click('#btnPick-' + T);
  await p.waitForTimeout(700);
  await p.keyboard.press('Control+k');
  await p.waitForTimeout(500);
  const overlayHidden = await p.evaluate(() => document.querySelector('.gs-overlay').hidden);
  await p.keyboard.type('xe');
  const inModal = await p.evaluate(() => document.getElementById('pickModal').contains(document.activeElement));
  check(overlayHidden && inModal, 'Ctrl+K khi hộp thoại đang mở: không mở tìm kiếm chồng lên; tiêu điểm và chữ gõ vẫn ở trong hộp thoại');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(700);
  console.log('6) L-04: lỗi hộp Thêm hợp đồng nằm trong khung nhìn ở 1366×768 và 390×844');
  for (const vp of [
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await p.setViewportSize(vp);
    await p.evaluate(() => (location.hash = '#/catalog'));
    await p.waitForTimeout(600);
    await p.click('#catAdd');
    await p.waitForSelector('#catModal.show', { timeout: 5000 });
    await p.waitForTimeout(300);
    await p.click('#catSave');
    await p.waitForTimeout(300);
    const l04 = await p.evaluate(() => {
      const err = document.getElementById('catErr');
      const r = err ? err.getBoundingClientRect() : null;
      const inVp = !!r && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
      const invalid = document.querySelectorAll('#catForm .is-invalid').length;
      const overflowX = document.documentElement.scrollWidth > window.innerWidth;
      return { inVp, invalid, overflowX, text: err ? err.textContent.trim() : '' };
    });
    check(
      l04.inVp && l04.invalid > 0 && !l04.overflowX,
      'L-04 (' + vp.width + '×' + vp.height + '): lỗi trong khung nhìn, đánh dấu ô lỗi, không tràn ngang'
    );
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
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
