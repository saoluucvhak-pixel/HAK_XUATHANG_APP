/* E2E di trú IndexedDB → SQLite trên trình duyệt thật, qua GIAO DIỆN: tạo dữ liệu ở chế độ IndexedDB → Cài đặt › Sao lưu & khôi phục › "Nơi lưu dữ liệu" → chuyển → kích hoạt →
 * mở lại: nhãn "Dữ liệu: SQLite", dữ liệu còn đủ, ghi mới chỉ vào SQLite → quay lui → mất kết nối thì BỊ CHẶN. Máy chủ SQLite tham chiếu ở cổng 31879. Chạy: node tools/e2e-migrate.cjs */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { createServer } = require('./hakdb/server.cjs');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const TOKEN = require('node:crypto').randomBytes(16).toString('hex');
const failures = [];
const SHOT = process.env.HAK_SHOT_DIR; // đặt để chụp ảnh giao diện (trước / sau) cho báo cáo bàn giao
const shot = async (p, name, sel) => {
  if (!SHOT) return;
  fs.mkdirSync(SHOT, { recursive: true });
  const f = path.join(SHOT, name + '.png');
  if (sel && (await p.$(sel))) await (await p.$(sel)).screenshot({ path: f });
  else await p.screenshot({ path: f });
};
const check = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) failures.push(msg);
};

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
async function loginExisting(p) {
  await p.goto(APP);
  await p.waitForTimeout(1500);
  const u = await p.$('#auUser');
  if (u && (await u.isVisible())) {
    await p.fill('#auUser', 'tester');
    await p.fill('#auPw', 'matkhau123');
    await p.click('#authForm button[type=submit]');
    await p.waitForTimeout(1500);
  }
  const co = await p.$('[data-co="hak"]');
  if (co && (await co.isVisible())) {
    await co.click();
    await p.waitForTimeout(2000);
  }
}
const openBackup = async (p) => {
  await p.evaluate(() => (location.hash = '#/settings'));
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const b = document.querySelector('[data-bs-target="#tab-backup"]');
    if (b) b.click();
  });
  await p.waitForSelector('#storageCard', { timeout: 15000 });
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2e-mig-'));
  const srv = createServer({ dataDir: dir, token: TOKEN }); // CHƯA kích hoạt
  await new Promise((ok, no) => (srv.on('error', no), srv.listen(31879, '127.0.0.1', ok)));
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  await ctx.route('**/native/hakdocs-token.js', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: "window.HAK_DOCS_TOKEN='" + TOKEN + "';" })
  );
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  try {
    console.log('1) Dữ liệu ở chế độ IndexedDB (HAKDocs-SQLite có sẵn nhưng chưa kích hoạt)');
    await login(p);
    check((await p.evaluate(() => HAK.Storage.mode)) === 'idb', 'app đang dùng IndexedDB');
    check((await p.evaluate(() => HAK.Storage.available)) === true, 'HAKDocs-SQLite trả lời (có thể di trú)');
    const seed = await p.evaluate(async () => {
      const M = HAK.ContractModel,
        CM = HAK.CustomsModel;
      const c1 = M.parent({
        id: 'hd-e2e',
        type: 'uythac',
        no: '000123/HĐ',
        contractQty: 5000,
        exporterId: 'k-hak',
        details: [{ id: 'ct-e2e', ship: 'TÀU E2E', qty: 1000, bdmt: 4000.5, certNo: '00045' }],
        addenda: [{ id: 'pl-e2e', no: 'PL1', date: '2026-01-01', qty: 4500 }],
      });
      const cat = HAK.Store.get('hak.catalog.v1', { v: 3, customers: [], products: [], contracts: [], customs: [] });
      cat.v = 3;
      cat.customers = [{ id: 'k-hak', name: 'HAK', companyId: 'hak' }];
      cat.contracts = [c1];
      cat.customs = [
        CM.newDecl({
          id: 'tk-e2e',
          no: '000308629701',
          contractId: 'hd-e2e',
          detailId: 'ct-e2e',
          taxVnd: 1000,
          payments: [{ id: 'nt-e2e', receiptNo: 'DN0206/26', amount: 1000, kind: 'tax' }],
        }),
      ];
      HAK.Store.set('hak.catalog.v1', cat);
      await HAK.DB.kvPut('hak.catalog.v1', cat, false);
      const ok = await HAK.Archive.save(
        'xuatkhau',
        { ship: 'TÀU E2E', giaoId: 'hak', contractId: 'ct-e2e', filter: {} },
        { files: [{ name: 'BB.docx' }], summary: {} },
        {
          rows: [
            { idx: 1, ticket: 'P0001', dateStr: '05/02/2026', plate: '43C-1', time1: '08:00', net: 21000.5 },
            { idx: 2, ticket: 'P0002', dateStr: '05/02/2026', plate: '43C-2', time1: '09:00', net: 22000 },
          ],
        },
        'word'
      );
      const bytes = new Uint8Array([0, 1, 2, 255, 0, 128]).buffer;
      const b = await HAK.Batches.save(
        'xuatkhau',
        { fileName: 'tauE2E.xlsx', sheet: 'S1', mapping: {}, headerRow: 1, addedAt: Date.now() },
        bytes
      );
      await HAK.Issued.add({ id: 'i-e2e', kind: 'pxk', no: '000045', cid: 'hak', at: Date.now() });
      return { ok, b };
    });
    check(seed.ok === true && seed.b === true, 'tạo hồ sơ Lưu trữ, đợt Excel, nhật ký chứng từ, Danh mục');
    const idbCount = await p.evaluate(async () => ({
      arch: (await HAK.Archive.list()).length,
      batches: (await HAK.DB.getAll('batches')).length,
    }));
    check(idbCount.arch === 1 && idbCount.batches === 1, 'IndexedDB có 1 hồ sơ + 1 đợt');

    console.log('2) Chuyển qua giao diện');
    await openBackup(p);
    check(/IndexedDB/.test(await p.textContent('#storageCard')), 'thẻ "Nơi lưu dữ liệu" nêu rõ đang dùng IndexedDB / trình duyệt');
    await shot(p, '1-truoc-chuyen-indexeddb', '#storageCard');
    await p.evaluate(() => {
      window.__bk = null;
      HAK.Backup.saveBackupBlob = async (blob, name) => {
        window.__bk = { size: blob.size, name };
        return true; // hộp thoại lưu hệ điều hành không tự động hóa được; ZIP vẫn được tạo và ĐỌC LẠI thật trong bước ①
      };
    });
    await p.click('#storageCard button:has-text("Bắt đầu chuyển sang SQLite")');
    await p.waitForSelector('#storageCard button:has-text("Kích hoạt SQLite")', { timeout: 60000 });
    await shot(p, '2-doi-chieu-dat-cho-kich-hoat', '#storageCard');
    const txt = await p.textContent('#storageCard');
    check(/✔ ① Sao lưu ZIP/.test(txt) && /đọc lại khớp 1 hồ sơ/.test(txt), 'bước ① sao lưu ZIP đọc lại khớp');
    check(/✔ ② Chụp dữ liệu nhất quán/.test(txt), 'bước ② chụp nhất quán');
    check(/✔ ④ Đối chiếu/.test(txt) && /khớp \d+ bản ghi/.test(txt), 'bước ④ đối chiếu khớp');
    check((await p.evaluate(() => window.__bk && window.__bk.size)) > 0, 'đã tạo ZIP sao lưu trước khi chuyển');
    check((await p.evaluate(() => HAK.Storage.mode)) === 'idb', 'nhập xong CHƯA kích hoạt: vẫn là IndexedDB');
    const mid = srv.hakdb.counts();
    check(
      mid.archive_records === 1 && mid.batch_files === 1 && mid.contract_details === 1 && mid.customs_payments === 1,
      'SQLite (chưa kích hoạt) có đủ bản ghi: ' +
        JSON.stringify({ a: mid.archive_records, f: mid.batch_files, d: mid.contract_details, p: mid.customs_payments })
    );
    check(srv.hakdb.meta('active_backend') === null, 'máy chủ chưa đặt cờ nguồn chính');

    console.log('3) Kích hoạt, mở lại');
    await p.click('#storageCard button:has-text("Kích hoạt SQLite")');
    await p.waitForFunction(
      () => !!document.querySelector('[data-hak-storage]') && document.querySelector('[data-hak-storage]').textContent === 'SQLite',
      null,
      { timeout: 30000 }
    );
    check(srv.hakdb.meta('active_backend') === 'sqlite', 'máy chủ đã đặt nguồn chính = sqlite');
    check(
      fs.readdirSync(path.join(dir, 'backups')).some((f) => /^pre-activate-.*\.db$/.test(f)),
      'có bản sao SQLite trước kích hoạt'
    );
    await loginExisting(p);
    check((await p.textContent('[data-hak-storage]')) === 'SQLite', 'thanh bên hiện "Dữ liệu: SQLite"');
    check((await p.evaluate(() => HAK.DB.backend)) === 'sqlite', 'HAK.DB dùng backend sqlite');
    const after = await p.evaluate(async () => {
      const l = await HAK.Archive.list();
      const d = await HAK.Archive.load(l[0].id);
      return {
        n: l.length,
        ship: l[0].ship || l[0].title || '',
        rows: d.rows.length,
        kg: l[0].kg,
        cat: HAK.Store.get('hak.catalog.v1').contracts.length,
        bytes: Array.from(new Uint8Array(await HAK.DB.get('batchdata', 'xuatkhau|tauE2E.xlsx'))),
      };
    });
    check(after.n === 1 && after.rows === 2 && after.kg === 43000.5, 'hồ sơ Lưu trữ đọc lại từ SQLite: 2 phiếu, 43000,5 kg');
    check(JSON.stringify(after.bytes) === JSON.stringify([0, 1, 2, 255, 0, 128]), 'tệp gốc đợt Excel nguyên byte');
    check(after.cat === 1, 'Danh mục còn đủ hợp đồng');
    await openBackup(p);
    await shot(p, '3-sau-chuyen-sqlite', '#storageCard');
    await shot(p, '3b-thanh-ben-sqlite', '#sidebar');
    const t2 = await p.textContent('#storageCard');
    check(/SQLite \(HAKDocs\)/.test(t2) && t2.includes(path.join(dir, 'hak.db')), 'thẻ nêu đường dẫn tệp SQLite');
    const bkText = await p.textContent('#backupBody');
    check(/Cơ sở dữ liệu SQLite|SQLite \(HAKDocs\)/.test(bkText), 'màn Sao lưu hiển thị nguồn SQLite');

    console.log('4) Ghi mới chỉ vào SQLite');
    await p.evaluate(async () => {
      await HAK.Issued.add({ id: 'i-moi', kind: 'bkls', no: '7', cid: 'hak', at: Date.now() });
      await HAK.DB.kvPut('hak.test.moi', { n: 1 }, true);
    });
    check(srv.hakdb.query({ table: 'issued', where: { id: 'i-moi' } }).rows.length === 1, 'nhật ký mới nằm trong SQLite');
    const idbNew = await p.evaluate(
      () =>
        new Promise((ok) => {
          const rq = indexedDB.open('hak-app');
          rq.onsuccess = () => {
            const g = rq.result.transaction('issued', 'readonly').objectStore('issued').get('i-moi');
            g.onsuccess = () => ok(!!g.result);
          };
        })
    );
    check(idbNew === false, 'IndexedDB cũ KHÔNG nhận dữ liệu mới');

    console.log('5) Quay lui');
    await openBackup(p);
    p.once('dialog', (d) => d.accept());
    await p.click('#storageCard button:has-text("Quay lui")');
    await p.waitForFunction(
      () => document.querySelector('[data-hak-storage]') && document.querySelector('[data-hak-storage]').textContent !== 'SQLite',
      null,
      { timeout: 30000 }
    );
    await loginExisting(p);
    check((await p.evaluate(() => HAK.Storage.mode)) === 'idb', 'sau quay lui app dùng lại IndexedDB');
    check((await p.evaluate(async () => (await HAK.Archive.list()).length)) === 1, 'IndexedDB cũ còn nguyên hồ sơ');
    check(srv.hakdb.counts().archive_records === 1, 'dữ liệu trong SQLite không bị xóa khi quay lui');
    check(
      (await p.evaluate(async () => ((await HAK.Issued.list) || []).some((x) => x.id === 'i-moi'))) === false,
      'dữ liệu phát sinh sau di trú không có trong IndexedDB (đúng như tài liệu: cần xuất / nhập bổ sung)'
    );

    console.log('6) Kích hoạt lại rồi mất kết nối: bị chặn');
    srv.hakdb.setMeta('active_backend', 'sqlite');
    await p.evaluate(() => localStorage.setItem('hak-storage-mode', 'sqlite'));
    await p.reload();
    await p.waitForTimeout(1500);
    check((await p.evaluate(() => HAK.Storage.mode)) === 'sqlite', 'mở lại: chế độ sqlite');
    await new Promise((ok) => srv.close(ok));
    await p.reload();
    await p.waitForSelector('#storageBlocked', { timeout: 15000 });
    await shot(p, '4-bi-chan-mat-ket-noi');
    check(/không kết nối được/.test(await p.textContent('#storageBlocked')), 'mất kết nối: hiện màn BỊ CHẶN nêu nguyên nhân');
    const box = await p.evaluate(() => {
      const r = document.querySelector('#storageBlocked').getBoundingClientRect();
      return {
        w: r.width,
        h: r.height,
        vw: innerWidth,
        vh: innerHeight,
        authForm: !!document.querySelector('#authForm'),
        label: (document.querySelector('[data-hak-storage]') || {}).textContent,
      };
    });
    check(box.w >= box.vw && box.h >= box.vh && !box.authForm, 'màn chặn phủ kín trang và không dựng màn đăng nhập / giao diện thao tác');
    check(box.label === 'BỊ CHẶN', 'thanh bên ghi "Dữ liệu: BỊ CHẶN"');
    check((await p.evaluate(() => HAK.Storage.mode)) === 'blocked', 'chế độ blocked, không lặng lẽ quay về IndexedDB');
    check(
      errs.filter((e) => !/Failed to fetch|không kết nối/i.test(e)).length === 0,
      'không có lỗi script ngoài dự kiến' + (errs.length ? ': ' + errs.join(' | ') : '')
    );
  } catch (e) {
    console.error(e);
    failures.push(e.message);
  } finally {
    await browser.close();
    try {
      await new Promise((ok) => (srv.listening ? srv.close(ok) : ok()));
    } catch (e) {
      /* đã đóng */
    }
  }
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})();
