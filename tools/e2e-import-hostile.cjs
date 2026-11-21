/* E2E Đợt 1b (B1–B4, B7–B8, N-02): nhập file sao lưu chứa payload XSS (<img src=x onerror=window.__xss=1>) và khóa lạ →
 * mở Tổng quan / Lưu trữ / Báo cáo / Chứng từ / Cài đặt → khẳng định window.__xss === undefined, DOM không vỡ, khóa lạ không ghi.
 * Chạy: node tools/e2e-import-hostile.cjs (và qua e2e-sqlite.cjs cho SQLite). */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const failures = [];
const check = (c, m, d) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined ? '  → ' + d : ''));
  if (!c) failures.push(m);
};

const XSS = '<img src=x onerror=window.__xss=1>';

(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());

  await p.goto(APP);
  await p.waitForSelector('#authForm', { timeout: 15000 });
  await p.fill('#auName', 'Admin');
  await p.fill('#auUser', 'admin');
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
    await p.waitForTimeout(600);
  }
  const co = await p.$('[data-co="hak"]');
  if (co && (await co.isVisible())) {
    await co.click();
    await p.waitForTimeout(1500);
  }

  console.log('1) Khôi phục file sao lưu chứa payload XSS ở archive/issued/batches và khóa lạ ngoài danh sách trắng');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-hostile-'));
  const hostileBackup = {
    app: 'hak-bienban-backup',
    v: 1,
    exportedAt: new Date().toISOString(),
    keys: {
      'hak.evil.key': { injected: XSS },
    },
    archive: [
      {
        meta: {
          id: XSS,
          type: 'xuatkhau',
          title: 'Hồ sơ độc 1',
          ship: XSS,
          giao: XSS,
          nhan: XSS,
          trips: XSS,
          kg: 20000,
          updatedAt: Date.now(),
          modes: ['word', XSS],
        },
        data: 'raw:' + JSON.stringify({ rows: [], excluded: [], params: {} }), // đúng định dạng hồ sơ thật (tiền tố raw:); thiếu tiền tố thì L-12 từ chối cả bản sao lưu trước khi tới phần kiểm XSS
      },
      {
        meta: {
          id: 'hs-safe-xss',
          type: 'xuatkhau',
          title: 'Hồ sơ an toàn có trường text XSS',
          ship: XSS,
          giao: XSS,
          nhan: XSS,
          trips: XSS,
          kg: 20000,
          updatedAt: Date.now(),
          modes: ['word', XSS],
        },
        data: 'raw:' + JSON.stringify({ rows: [], excluded: [], params: {} }), // đúng định dạng hồ sơ thật (tiền tố raw:); thiếu tiền tố thì L-12 từ chối cả bản sao lưu trước khi tới phần kiểm XSS
      },
    ],
    batches: [
      {
        meta: {
          id: 'b-xss',
          fileName: XSS + '.xlsx',
          rev: 1,
          veh: { count: XSS, fileName: XSS },
        },
        b64: Buffer.from('PK\x03\x04').toString('base64'),
      },
    ],
    issued: [
      {
        id: 'i-xss-1',
        at: Date.now(),
        kind: 'pxk',
        type: 'xuatkhau',
        cid: 'hak',
        cua: XSS,
        batch: XSS,
        pxkFrom: XSS,
        pxkTo: XSS,
        trips: 1,
        kg: 1000,
      },
    ],
  };

  const fPath = path.join(tmp, 'hostile.json');
  fs.writeFileSync(fPath, JSON.stringify(hostileBackup));

  const res = await p.evaluate(async (raw) => {
    const b = new Blob([raw], { type: 'application/json' });
    b.name = 'hostile.json';
    await HAK.Backup.restoreFile(b, { keepAuth: true, mode: 'merge' });
    return {
      evilKey: HAK.Store.get('hak.evil.key', null),
      metas: await HAK.Archive.list(),
    };
  }, JSON.stringify(hostileBackup));

  check(res.evilKey === null, 'khóa lạ hak.evil.key bị chặn không ghi vào Store');
  check(
    res.metas.some((m) => m.id === 'hs-safe-xss'),
    'lần khôi phục THỰC SỰ chạy: hồ sơ hợp lệ hs-safe-xss (chỉ có trường text độc) được nhập, để các kiểm tra XSS bên dưới có ý nghĩa'
  );
  check(
    !res.metas.some((m) => m.id.includes('<img')),
    'meta có id chứa HTML bị loại khỏi Lưu trữ',
    JSON.stringify(res.metas.map((m) => m.id))
  );

  console.log('2) Mở các màn Tổng quan, Lưu trữ, Báo cáo, Chứng từ, Cài đặt → window.__xss không được kích hoạt');
  for (const h of ['#/home', '#/archive', '#/report', '#/chungtu', '#/settings']) {
    await p.evaluate((hash) => (location.hash = hash), h);
    await p.waitForTimeout(700);
    const xss = await p.evaluate(() => window.__xss);
    check(xss === undefined, 'màn ' + h + ': window.__xss === undefined');
  }

  console.log('3) N-02: Nhập cấu hình hỏng {companies:[null,5],warehouses:[{}]} bị từ chối trước khi ghi');
  const badCfgPath = path.join(tmp, 'badcfg.json');
  fs.writeFileSync(badCfgPath, JSON.stringify({ companies: [null, 5], warehouses: [{}] }));
  await p.evaluate(() => (location.hash = '#/settings'));
  await p.waitForTimeout(500);
  const beforeCfg = await p.evaluate(() => JSON.stringify(HAK.Config.data.companies));
  await p.setInputFiles('#importCfg', badCfgPath);
  await p.waitForTimeout(500);
  const afterCfg = await p.evaluate(() => JSON.stringify(HAK.Config.data.companies));
  check(beforeCfg === afterCfg, 'N-02: cấu hình hiện tại không bị ghi đè bởi file hỏng');

  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await browser.close();
  if (failures.length) {
    console.error('\n✗ Lỗi: ' + failures.length);
    process.exit(1);
  }
  console.log('\n✓ Đạt toàn bộ');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
