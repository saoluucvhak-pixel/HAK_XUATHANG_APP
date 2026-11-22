/* E2E v2.25.12 — Trạng thái hợp đồng (quy tắc 30) KHÔNG đổi theo công tắc "Xem tất cả công ty" của Báo cáo.
 * Hợp đồng Đại Hiệp có 1 chi tiết chưa có chứng thư nhưng có phiếu cân (hồ sơ Đại Hiệp), chưa có tờ khai; xem từ công ty HAK:
 * cả 3 tổ hợp công tắc (Danh mục / Báo cáo) phải cho CÙNG một trạng thái, không bao giờ "Đã hoàn thành". Dữ liệu 100% giả lập.
 * Chạy: node tools/e2e-contract-status-scope.cjs · SQLite: node tools/e2e-sqlite.cjs tools/e2e-contract-status-scope.cjs */
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
    const M = HAK.ContractModel,
      c = HAK.Catalog.parents().find((c) => c.no === 'HD-DHX');
    const ch2 = M.child(c.id, { ship: 'TAUDH2', bdmt: 100, mt: 200 });
    c.details.push(ch2);
    await HAK.Catalog.persist();
    const rows = Array.from({ length: 2 }, (_, i) => ({
      idx: i + 1,
      ticket: 'Z' + i,
      plate: '43C-8888' + i,
      driver: 'A',
      ts1: Date.UTC(2026, 5, 9, 8, i),
      ts2: null,
      dateStr: '09/06/2026',
      time1: '08:0' + i,
      time2: '',
      tare: 10000,
      gross: 30000,
      net: 20000,
    }));
    await HAK.Archive.save(
      'xuatkhau',
      { giaoId: 'dh', nhanId: 'k-dh1', ship: 'TAUDH2', contractId: ch2.id, returned: [], filter: {} },
      { files: [{ name: 'Z.docx' }], summary: {} },
      { rows },
      'word'
    );
  });
  await reopen('hak');
  const st = async () =>
    p.evaluate(async () => {
      await HAK.TripDetails.refresh();
      const c = HAK.Catalog.parents().find((x) => x.no === 'HD-DHX');
      const cs = HAK.CustomsModel.contractStatus(HAK.Catalog.core.get().customs, c.id, c);
      return cs.code + ' | ' + cs.label;
    });
  const s1 = await st();
  await p.evaluate(() => HAK.Store.set('hak.scope.v1', { catalog: true }));
  const s2 = await st();
  await p.evaluate(() => HAK.Store.set('hak.scope.v1', { catalog: true, report: true }));
  const s3 = await st();
  console.log('  trạng thái:', s1, '/', s2, '/', s3);
  check(s1 === s2 && s2 === s3, 'trạng thái hợp đồng giống nhau ở cả 3 tổ hợp công tắc', [s1, s2, s3].join(' / '));
  check(!/hoàn thành/i.test(s2), 'Danh mục BẬT, Báo cáo TẮT: không báo "Đã hoàn thành" sai', s2);
  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
