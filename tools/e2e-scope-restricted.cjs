/* E2E v2.25.11 — NHÂN VIÊN GIỚI HẠN MỘT CÔNG TY (quy tắc 36): sao lưu Lưu trữ (.json), huy hiệu / số đếm Lưu trữ, Nhật ký Chứng từ,
 * Tìm kiếm Ctrl+K và Tổng quan KHÔNG lộ hồ sơ / chứng từ của công ty khác. Dữ liệu 100% giả lập (HAK và Đại Hiệp).
 * Chạy: node tools/e2e-scope-restricted.cjs · SQLite: node tools/e2e-sqlite.cjs tools/e2e-scope-restricted.cjs */
const { chromium } = require('playwright');
const path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const failures = [];
const check = (c, m, d) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined ? '  → ' + d : ''));
  if (!c) failures.push(m);
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
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  // kho bộ lọc dùng chung của bản cũ (trước v2.25.0)
  await p.evaluate(() =>
    HAK.Store.set('hak.sf.presets', { schema: 1, screens: { archive: { 'BL-CU': { state: { q: 'CU' }, savedAt: '2026-01-01' } } } })
  );
  // Dựng dữ liệu 2 công ty: HAK (đang làm) và Đại Hiệp (dh) — dấu nhận diện DH: TAUDHX, HD-DHX, 309999990001, KHACHDHX
  await p.evaluate(async () => {
    const M = HAK.ContractModel,
      CM = HAK.CustomsModel,
      d = HAK.Catalog.core.get();
    d.customers = (d.customers || []).concat([
      { id: 'k-hak1', companyId: 'hak', name: 'KHACHHAKX' },
      { id: 'k-dh1', companyId: 'dh', name: 'KHACHDHX' },
    ]);
    const mk = (no, exp, ship) => {
      const c = M.parent({
        type: 'xuatkhau',
        no,
        date: '2026-05-20',
        contractQty: 1000,
        priceUsd: 100,
        currency: 'USD',
        details: [],
        exporterId: exp,
        buyerId: exp,
      });
      c.details.push(M.child(c.id, { ship, certNo: 'CT-' + no, bdmt: 500, mt: 1000, exchangeRate: 26000 }));
      d.contracts.push(c);
      return c;
    };
    const ch = mk('HD-HAKX', 'k-hak1', 'TAUHAKX'),
      cd = mk('HD-DHX', 'k-dh1', 'TAUDHX');
    d.customs = d.customs || [];
    d.customs.push(
      CM.newDecl({ no: '308888880001', contractId: ch.id, detailId: ch.details[0].id, status: 'cleared', openDate: '2026-06-01' })
    );
    d.customs.push(
      CM.newDecl({ no: '309999990001', contractId: cd.id, detailId: cd.details[0].id, status: 'cleared', openDate: '2026-06-01' })
    );
    await HAK.Catalog.persist();
    const rows = (h) =>
      Array.from({ length: 3 }, (_, i) => ({
        idx: i + 2,
        uid: h + i,
        ticket: h + '-' + i,
        plate: '43C-' + h.length + i + '00',
        driver: '',
        carrier: '',
        wh: '',
        weightType: '',
        weigher: '',
        note: '',
        warn: [],
        ts1: Date.UTC(2026, 5, 5, 8, i),
        ts2: null,
        dateStr: '05/06/2026',
        time1: '08:0' + i,
        time2: '',
        tare: 10000,
        gross: 30000,
        net: 20000,
      }));
    await HAK.Archive.save(
      'xuatkhau',
      { giaoId: 'hak', nhanId: 'k-hak1', ship: 'TAUHAKX', contractId: ch.details[0].id, returned: [], filter: {} },
      { files: [{ name: 'HAKX.docx' }], summary: {} },
      { rows: rows('PHAK') },
      'word'
    );
    await HAK.Archive.save(
      'xuatkhau',
      { giaoId: 'dh', nhanId: 'k-dh1', ship: 'TAUDHX', contractId: cd.details[0].id, returned: [], filter: {} },
      { files: [{ name: 'DHX.docx' }], summary: {} },
      { rows: rows('PDHX') },
      'word'
    );
  });

  const reopen = async (co) => {
    if (co)
      await p.evaluate((c) => {
        const s = JSON.parse(sessionStorage.getItem('hak.session'));
        s.co = c;
        sessionStorage.setItem('hak.session', JSON.stringify(s));
      }, co);
    await p.reload();
    await p.waitForFunction(() => window.HAK && HAK.Auth && HAK.Auth.company(), null, { timeout: 20000 });
    await p.waitForTimeout(2500);
  };
  await p.evaluate(async () => {
    await HAK.Issued.add({
      kind: 'pxk',
      type: 'xuatkhau',
      cid: 'dh',
      cua: 'DAIHIEPXYZ',
      batch: 'DHBATCH.xlsx',
      from: '2026-06-05',
      to: '2026-06-05',
      trips: 3,
      kg: 60000,
      pxkFrom: 1,
      pxkTo: 3,
    });
    await HAK.Issued.add({
      kind: 'pxk',
      type: 'xuatkhau',
      cid: 'hak',
      cua: 'HAKXYZ',
      batch: 'HAKBATCH.xlsx',
      from: '2026-06-05',
      to: '2026-06-05',
      trips: 3,
      kg: 60000,
      pxkFrom: 4,
      pxkTo: 6,
    });
    const a = HAK.Store.get('hak.auth.v1', null);
    a.users[0].role = 'staff';
    a.users[0].companies = ['hak'];
    HAK.Store.set('hak.auth.v1', a);
  });
  await reopen('hak');
  const txt = (sel) => p.evaluate((q) => (document.querySelector(q) || {}).textContent || '', sel);
  await p.evaluate(() => {
    location.hash = '#/archive';
  });
  await p.waitForTimeout(2000);
  check((await txt('#archCount')).trim() === '1', 'huy hiệu menu Lưu trữ chỉ đếm hồ sơ HAK (1)', await txt('#archCount'));
  check(
    /^1 hồ sơ/.test((await txt('#archCountInfo')).trim()),
    'dòng đầu trang Lưu trữ: "1 hồ sơ" (không "1 / 2")',
    await txt('#archCountInfo')
  );
  const exported = await p.evaluate(async () => {
    let got = null;
    HAK.Backup.saveBackupBlob = async (blob) => {
      got = await blob.text();
    };
    const b = document.getElementById('archBackup');
    if (!b) return 'no-button';
    b.click();
    await new Promise((r) => setTimeout(r, 1500));
    return got
      ? JSON.parse(got)
          .items.map((i) => i.meta.ship)
          .join(',')
      : 'none';
  });
  check(exported === 'TAUHAKX', 'sao lưu Lưu trữ (.json) chỉ có hồ sơ HAK', exported);
  await p.evaluate(() => {
    location.hash = '#/chungtu';
  });
  await p.waitForTimeout(1500);
  const lg = await txt('#ctLogBody');
  check(
    /HAKBATCH/.test(lg) && !/DHBATCH|DAIHIEPXYZ/.test(lg),
    'Nhật ký Chứng từ không có dòng của Đại Hiệp',
    lg.replace(/\s+/g, ' ').slice(0, 120)
  );
  const found = await p.evaluate(() => HAK.Issued.scoped('archive').map((r) => r.cid || ''));
  check(
    found.indexOf('dh') < 0 && found.indexOf('hak') >= 0,
    'HAK.Issued.scoped("archive") không trả bản ghi của Đại Hiệp',
    JSON.stringify(found)
  );
  await p.evaluate(() => {
    location.hash = '#/home';
  });
  await p.waitForTimeout(3000);
  const dash = await txt('#dashBody');
  const m = dash.match(/(\d+)\s*Hồ sơ đã xuất/);
  check(
    !!m && m[1] === '1',
    'Tổng quan: "Hồ sơ đã xuất" = 1 (chỉ HAK)',
    m ? m[1] : 'không thấy ' + JSON.stringify(dash.replace(/\s+/g, ' ').slice(0, 400))
  );
  const m2 = dash.match(/(\d+)\s*PXK[A-Z]* đã lập/);
  check(!!m2 && m2[1] === '1', 'Tổng quan: PXK đã lập = 1 (chỉ HAK, không cộng Đại Hiệp)', m2 ? m2[1] : '(không hiện)');
  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
