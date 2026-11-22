/* E2E v2.25.15 — Ô tick ở Báo cáo tổng hợp: tick = hồ sơ được cộng vào, không tick = bỏ ra. Quy tắc này áp dụng NHƯ NHAU cho
 * Báo cáo và Tổng quan ("Thực giao đã lập hồ sơ"). Trạng thái hợp đồng KHÔNG đổi theo ô tick (bỏ tick không được làm hợp đồng sai thành "Đã hoàn thành").
 * Chạy: node tools/e2e-report-tick.cjs · SQLite: node tools/e2e-sqlite.cjs tools/e2e-report-tick.cjs. Dữ liệu 100% giả lập. */
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

  const reopen = async () => {
    await p.reload();
    await p.waitForFunction(() => window.HAK && HAK.Auth && HAK.Auth.company(), null, { timeout: 20000 });
    await p.waitForTimeout(2500);
  };
  await p.evaluate(async () => {
    const M = HAK.ContractModel,
      c = HAK.Catalog.parents().find((x) => x.no === 'HD-HAKX');
    const d2 = M.child(c.id, { ship: 'TAUHAK2', bdmt: 100, mt: 200 }); // chi tiết CHƯA có số chứng thư: "đã có phiếu cân" quyết định trạng thái
    c.details.push(d2);
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
      { giaoId: 'hak', nhanId: 'k-hak1', ship: 'TAUHAK2', contractId: d2.id, returned: [], filter: {} },
      { files: [{ name: 'Z.docx' }], summary: {} },
      { rows },
      'word'
    );
  });
  await p.evaluate(async () => {
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
      pxkFrom: 1,
      pxkTo: 3,
    });
  });
  await reopen();
  const status = () =>
    p.evaluate(async () => {
      await HAK.TripDetails.refresh();
      const c = HAK.Catalog.parents().find((x) => x.no === 'HD-HAKX');
      return HAK.CustomsModel.contractStatus(HAK.Catalog.core.get().customs, c.id, c).code;
    });
  const dashTon = async () => {
    await p.evaluate(() => {
      location.hash = '#/catalog';
    });
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      location.hash = '#/home';
    });
    await p.waitForTimeout(3000);
    return p.evaluate(() => {
      const t = (document.querySelector('#dashDel') || {}).textContent || '';
      const m = t.match(/([\d.,]+)\s*Thực giao đã lập hồ sơ/);
      return m ? m[1] : 'không thấy: ' + t.slice(0, 80);
    });
  };
  const setTick = (on) =>
    p.evaluate(async (v) => {
      const m = (await HAK.Archive.list()).find((x) => x.ship === 'TAUHAK2');
      const cur = HAK.Store.get('hak.report.manual', {}) || {};
      cur[m.id] = v;
      HAK.Store.set('hak.report.manual', cur);
      window.dispatchEvent(new CustomEvent('hak:reportpick'));
    }, on);

  const before = await status();
  const tonBefore = await dashTon();
  check(before === 'running', 'trạng thái hợp đồng HAK: "Đang thực hiện" (chi tiết đã xuất, chưa có chứng thư)', before);
  check(/^100([.,]0+)?$/.test(tonBefore), 'đang tick: Tổng quan ghi 100 tấn thực giao (60 + 40)', tonBefore);

  await setTick(false);
  await p.waitForTimeout(1500);
  const off = await status();
  const tonOff = await dashTon();
  check(/^60([.,]0+)?$/.test(tonOff), 'BỎ tick hồ sơ TAUHAK2 (40 tấn): Tổng quan còn 60 tấn, khớp Báo cáo', tonOff);
  check(off === 'running', 'BỎ tick KHÔNG làm hợp đồng sai thành "Đã hoàn thành" (hàng đã xuất vẫn là hàng đã xuất)', off);

  await setTick(true);
  await p.waitForTimeout(1500);
  const tonOn = await dashTon();
  check(/^100([.,]0+)?$/.test(tonOn), 'TICK lại: Tổng quan trở về 100 tấn', tonOn);
  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
