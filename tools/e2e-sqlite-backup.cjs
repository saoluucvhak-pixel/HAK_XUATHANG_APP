/* E2E tự sao lưu SQLite (quy tắc 35) — CHỈ chạy qua máy chủ SQLite tham chiếu: node tools/e2e-sqlite.cjs tools/e2e-sqlite-backup.cjs
 * Khẳng định: (1) tới hạn → mở app sao lưu một lần (thư mục mặc định <dữ liệu>/backups), tệp HAK_SQLite_*.db đạt integrity_check; chưa tới hạn → KHÔNG chạy lại;
 * (2) nút "Sao lưu SQLite ngay" luôn chạy; (3) xoay vòng giữ đúng N bản, chỉ xóa HAK_SQLite_*.db; (4) thư mục không ghi được → lỗi tiếng Việt, ghi vào trạng thái "lần chạy gần nhất",
 * sao lưu cũ không mất; (5) sao lưu SQLite KHÔNG chứa cấu hình tự sao lưu của máy (khóa hak.sqlbk.v1). Dữ liệu giả lập. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const DATA = process.env.HAK_E2E_DATA_DIR;
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) failures.push(m);
};
if (!DATA) {
  console.error('Chạy qua: node tools/e2e-sqlite.cjs tools/e2e-sqlite-backup.cjs');
  process.exit(2);
}
const listBk = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /^HAK_SQLite_\d{8}-\d{6}\.db$/.test(f))
        .sort()
    : [];
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
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  const avail = await p.evaluate(() => HAK.Backup.sqlAvailable());
  check(avail === true, 'app đang dùng SQLite');
  const defaultDir = path.join(DATA, 'backups');
  const cfg0 = await p.evaluate(() => HAK.Backup.sqlCfg());
  check(cfg0.on && cfg0.freq === 'day' && cfg0.keep === 30, 'cấu hình mặc định: bật, mỗi ngày, giữ 30');
  check(
    (await p.evaluate(() => HAK.Backup.sqlDir())).replace(/[\\/]+/g, '/') === defaultDir.replace(/[\\/]+/g, '/'),
    'thư mục mặc định = <thư mục dữ liệu>/backups'
  );

  console.log('1) Tới hạn → tự sao lưu một lần; chưa tới hạn → không chạy lại');
  const r1 = await p.evaluate(async () => {
    const r = await HAK.Backup.sqlTick();
    return r ? { ok: true, integrity: r.integrity, path: r.path } : { ok: false };
  });
  check(r1.ok && r1.integrity === 'ok', 'sqlTick lần đầu: đã sao lưu, integrity_check đạt');
  const f1 = listBk(defaultDir);
  check(
    f1.length === 1 && fs.statSync(path.join(defaultDir, f1[0])).size > 0,
    'có 1 tệp HAK_SQLite_*.db trong thư mục mặc định (' + f1.join() + ')'
  );
  const r2 = await p.evaluate(async () => (await HAK.Backup.sqlTick()) === null);
  check(r2 && listBk(defaultDir).length === 1, 'sqlTick lần hai cùng ngày: chưa tới hạn → KHÔNG sao lưu thêm');
  const last = (await p.evaluate(() => HAK.Backup.sqlCfg())).last;
  check(
    last && last.ok === true && /^HAK_SQLite_/.test(last.name),
    'trạng thái "lần chạy gần nhất" ghi đúng (' + (last && last.name) + ')'
  );

  console.log('2) "Sao lưu SQLite ngay" luôn chạy; xoay vòng giữ đúng N bản và chỉ xóa HAK_SQLite_*.db');
  fs.writeFileSync(path.join(defaultDir, 'quan-trong.db'), 'giữ');
  await p.evaluate(() => HAK.Backup.sqlSet(Object.assign(HAK.Backup.sqlCfg(), { keep: 3 })));
  for (const st of ['20261101-000001', '20261102-000001', '20261103-000001', '20261104-000001']) {
    const r = await p.evaluate((n) => HAK.Backup.sqlRunNow({ name: 'HAK_SQLite_' + n + '.db' }).then((x) => x.path), st);
    check(!!r, 'sao lưu ngay ' + st);
  }
  const f2 = listBk(defaultDir);
  check(f2.length === 3, 'xoay vòng: còn đúng 3 bản (' + f2.join() + ')');
  check(f2.includes('HAK_SQLite_20261104-000001.db') && f2.includes('HAK_SQLite_20261103-000001.db'), 'các bản MỚI NHẤT được giữ');
  check(fs.existsSync(path.join(defaultDir, 'quan-trong.db')), 'tệp khác trong thư mục không bị xóa');

  console.log('3) Thư mục tùy chọn; thư mục không ghi được → lỗi tiếng Việt, bản cũ không mất');
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-bk-custom-'));
  await p.evaluate((d) => HAK.Backup.sqlSet(Object.assign(HAK.Backup.sqlCfg(), { dir: d, keep: 5 })), custom);
  await p.evaluate(() => HAK.Backup.sqlRunNow());
  check(listBk(custom).length === 1, 'sao lưu vào thư mục tùy chọn: 1 tệp');
  const badFile = path.join(custom, 'la-mot-tep');
  fs.writeFileSync(badFile, 'x');
  await p.evaluate((d) => HAK.Backup.sqlSet(Object.assign(HAK.Backup.sqlCfg(), { dir: d })), badFile);
  const err = await p.evaluate(() =>
    HAK.Backup.sqlRunNow().then(
      () => '',
      (e) => e.message
    )
  );
  check(/Không ghi được/.test(err), 'thư mục không ghi được → báo lỗi tiếng Việt (' + err.slice(0, 80) + ')');
  const st = (await p.evaluate(() => HAK.Backup.sqlCfg())).last;
  check(
    st.ok === false && /Không ghi được/.test(st.error) && st.okAt > 0,
    'trạng thái "lần chạy gần nhất": lỗi, vẫn nhớ lần thành công trước'
  );
  check(listBk(custom).length === 1 && listBk(defaultDir).length === 3, 'bản sao lưu cũ vẫn còn nguyên');
  const dueNow = await p.evaluate(() => HAK.BackupSchedule.due(HAK.Backup.sqlCfg(), Date.now()));
  check(dueNow === false, 'sau lỗi: chờ ≥ 1 giờ mới thử lại (không dồn dập)');

  console.log('4) Cấu hình tự sao lưu SQLite không đi theo sao lưu toàn bộ / tháng');
  const hasKey = await p.evaluate(async () => (await HAK.Backup.buildFull()).parts.join('').indexOf('hak.sqlbk.v1') >= 0);
  check(hasKey === false, 'file sao lưu toàn bộ KHÔNG chứa hak.sqlbk.v1');
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
