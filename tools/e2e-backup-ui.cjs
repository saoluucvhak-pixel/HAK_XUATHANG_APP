/* E2E giao diện tab "💾 Sao lưu & khôi phục" (Đợt B): 6 khối đúng thứ tự, "Nơi lưu dữ liệu" chỉ MỘT chỗ, phần sao lưu đã chuyển khỏi tab Chung;
 * Sao lưu theo tháng → tải file đúng tên → khôi phục bằng MỘT nút (tự nhận loại file, xem trước, bản tháng chỉ Nhập bổ sung); bản toàn bộ có Thay thế / Nhập bổ sung.
 * Chụp ảnh desktop 1366×768 + 390 px vào HAK_SHOT_DIR (mặc định _evidence4). Chạy: node tools/e2e-backup-ui.cjs  hoặc  node tools/e2e-sqlite.cjs tools/e2e-backup-ui.cjs. Dữ liệu giả lập. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const SHOT = process.env.HAK_SHOT_DIR || path.resolve(__dirname, '../_evidence4');
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) failures.push(m);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-bkui-'));
async function login(p) {
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
}
(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  // Hộp thoại "Lưu file" của trình duyệt không có trong chế độ không giao diện: giả lập lỗi để app rơi về cách tải xuống thường (vẫn giữ nhận dạng hỗ trợ chọn thư mục)
  await ctx.addInitScript(() => {
    window.showSaveFilePicker = async () => {
      throw new Error('giả lập: không có hộp thoại lưu');
    };
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  const sqlite = await p.evaluate(() => HAK.Backup.sqlAvailable());
  console.log('Backend: ' + (sqlite ? 'sqlite' : 'idb'));
  await p.evaluate(async () => {
    const rows = (n, day, mon, kg) =>
      Array.from({ length: n }, (_, i) => ({
        idx: i + 2,
        uid: 'f#' + (i + 2) + '-' + day + mon,
        ticket: 'U' + day + mon + '-' + i,
        plate: '43C-' + (1000 + i),
        driver: '',
        carrier: '',
        wh: '',
        weightType: '',
        weigher: '',
        note: '',
        warn: [],
        ts1: Date.UTC(2026, mon - 1, day, 8, i),
        ts2: null,
        dateStr: String(day).padStart(2, '0') + '/' + String(mon).padStart(2, '0') + '/2026',
        time1: '08:' + String(i).padStart(2, '0'),
        time2: '',
        tare: 10000,
        gross: 10000 + kg,
        net: kg,
      }));
    const save = (ship, rws) =>
      HAK.Archive.save(
        'xuatkhau',
        { giaoId: 'hak', ship, returned: [], filter: {} },
        { files: [{ name: ship + '.docx' }], summary: {} },
        { rows: rws },
        'word'
      );
    await save('TAU U10', rows(5, 5, 10, 20000));
    await save('TAU U11', rows(4, 7, 11, 21000));
  });
  const openTab = async () => {
    await p.evaluate(() => (location.hash = '#/settings'));
    await p.waitForTimeout(600);
    await p.evaluate(() => document.querySelector('[data-bs-target="#tab-backup"]').click());
    await p.waitForSelector('#bkSave', { timeout: 15000 });
    await p.waitForTimeout(800);
  };
  await openTab();

  console.log('1) Bố cục: tab riêng, 6 khối đúng thứ tự, "Nơi lưu dữ liệu" một chỗ');
  const heads = await p.evaluate(() => Array.from(document.querySelectorAll('#backupBody .bk-block h3')).map((h) => h.textContent.trim()));
  check(heads.length === 6 && heads.map((h) => h.slice(0, 1)).join('') === '①②③④⑤⑥', '6 khối ①…⑥ (' + heads.join(' | ') + ')');
  check(
    /Tình trạng/.test(heads[0]) &&
      /Sao lưu ngay/.test(heads[1]) &&
      /Khôi phục/.test(heads[2]) &&
      /Tự sao lưu/.test(heads[3]) &&
      /Thư mục/.test(heads[4]) &&
      /năm/.test(heads[5]),
    'tên khối đúng thứ tự: Tình trạng · Sao lưu ngay · Khôi phục · Tự sao lưu · Thư mục · Theo năm'
  );
  const storageTitles = await p.evaluate(() => (document.querySelector('#backupBody').innerText.match(/Nơi lưu dữ liệu/g) || []).length);
  check(
    storageTitles === 1 && (await p.evaluate(() => document.querySelectorAll('#backupBody #storageCard').length)) === 1,
    '"Nơi lưu dữ liệu" xuất hiện MỘT lần (' + storageTitles + ')'
  );
  check(
    !(await p.evaluate(() => !!document.querySelector('#tab-general #backupBody, #tab-general #bkSave'))),
    'tab Chung không còn khối sao lưu'
  );
  check(
    await p.evaluate(
      () =>
        !!document.querySelector('#bkSave') &&
        !!document.querySelector('#bkSaveMonth') &&
        document.querySelectorAll('#bkRestore').length === 1
    ),
    'có nút Toàn bộ, Theo tháng và MỘT nút khôi phục'
  );
  check((await p.evaluate(() => !!document.querySelector('#bkSqlNow'))) === sqlite, 'nút "SQLite ngay" chỉ hiện ở bản dùng SQLite');
  const ordered = await p.evaluate(() => {
    const t = document.querySelector('#backupBody').innerText;
    return t.indexOf('Sao lưu JSON gần nhất') < t.indexOf('Sao lưu ngay') && t.indexOf('Khôi phục') > t.indexOf('Sao lưu ngay');
  });
  check(ordered, 'tình trạng (lần sao lưu gần nhất) nằm trên cùng, trước các nút');
  await p.screenshot({ path: path.join(SHOT, 'sao-luu-1366.png') });
  await (await p.$('#tab-backup')).screenshot({ path: path.join(SHOT, 'sao-luu-tab-1366.png') });

  console.log('2) Sao lưu theo tháng 10/2026 → tải file đúng tên');
  await p.selectOption('#bkMonthY', '2026');
  await p.selectOption('#bkMonthM', '10');
  await p.waitForTimeout(300);
  const info = await p.textContent('#bkMonthInfo');
  check(/1 hồ sơ/.test(info), 'gợi ý tháng 10: ' + info.trim());
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#bkSaveMonth')]);
  const f = path.join(tmp, dl.suggestedFilename());
  await dl.saveAs(f);
  check(/^HAK_Thang_10-2026_xuat\d{8}\.json$/.test(dl.suggestedFilename()), 'tên file: ' + dl.suggestedFilename());
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  check(
    j.scope && j.scope.kind === 'month' && j.scope.month === '2026-10' && j.archive.length === 1,
    'file chứa đúng 1 hồ sơ tháng 10 và scope tháng'
  );
  await p.selectOption('#bkMonthM', '03');
  await p.click('#bkSaveMonth');
  await p.waitForTimeout(600);
  check(
    /chưa có hồ sơ/.test(
      await p.evaluate(() =>
        Array.from(document.querySelectorAll('.toast'))
          .map((t) => t.textContent)
          .join(' ')
      )
    ),
    'tháng không có hồ sơ: báo rõ, không tạo file rỗng'
  );

  console.log('3) Khôi phục bằng MỘT nút: bản tháng → xem trước, chỉ "Nhập bổ sung"');
  await p.setInputFiles('#bkRestore', f);
  await p.waitForSelector('#restoreModal.show', { timeout: 10000 });
  const mt = await p.textContent('#restoreModal');
  check(/THEO THÁNG 10\/2026/.test(mt) && /1 hồ sơ Lưu trữ/.test(mt.replace(/\s+/g, ' ')), 'hộp xem trước nêu tháng 10/2026 và số hồ sơ');
  check(
    (await p.$$('#restoreModal [data-choice]')).length === 2 && !(await p.$('#restoreModal [data-choice="replace"]')),
    'bản tháng chỉ có Nhập bổ sung và Hủy (không có Thay thế)'
  );
  await p.screenshot({ path: path.join(SHOT, 'khoi-phuc-thang-1366.png') });
  await p.click('#restoreModal [data-choice="cancel"]');
  await p.waitForTimeout(700);
  check((await p.evaluate(async () => (await HAK.Archive.list()).length)) === 2, 'hủy: vẫn 2 hồ sơ, không đổi gì');

  console.log('4) Khôi phục bản TOÀN BỘ: có Thay thế và Nhập bổ sung');
  const full = await p.evaluate(async () => (await HAK.Backup.buildFull()).parts.join(''));
  const ff = path.join(tmp, 'toan-bo.json');
  fs.writeFileSync(ff, full);
  await p.setInputFiles('#bkRestore', ff);
  await p.waitForSelector('#restoreModal.show', { timeout: 10000 });
  check(
    !!(await p.$('#restoreModal [data-choice="replace"]')) && !!(await p.$('#restoreModal [data-choice="merge"]')),
    'bản toàn bộ: có cả Thay thế và Nhập bổ sung'
  );
  await p.click('#restoreModal [data-choice="cancel"]');
  await p.waitForTimeout(700);

  console.log('5) File lạ bị từ chối bằng thông báo tiếng Việt');
  const bad = path.join(tmp, 'la.json');
  fs.writeFileSync(bad, JSON.stringify({ app: 'khac', v: 1 }));
  await p.setInputFiles('#bkRestore', bad);
  await p.waitForTimeout(800);
  const toastTxt = await p.evaluate(() =>
    Array.from(document.querySelectorAll('.toast'))
      .map((t) => t.textContent)
      .join(' | ')
  );
  check(/Không nhận ra file này là bản sao lưu/.test(toastTxt), 'thông báo: Không nhận ra file…');

  console.log('6) Màn hình hẹp 390 px: không tràn ngang, đủ 6 khối');
  await p.setViewportSize({ width: 390, height: 844 });
  await openTab();
  const ov = await p.evaluate(() => ({
    over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    n: document.querySelectorAll('#backupBody .bk-block').length,
  }));
  check(!ov.over && ov.n === 6, 'không tràn ngang, đủ 6 khối');
  await (await p.$('#tab-backup')).screenshot({ path: path.join(SHOT, 'sao-luu-tab-390.png') });
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
