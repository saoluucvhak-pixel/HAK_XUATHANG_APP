/* E2E v2.25.0 — TÁCH THEO CÔNG TY (quyết định 36) + bộ lọc đã lưu theo tài khoản + công ty (mục 32).
 * Dữ liệu 2 công ty: HAK (đang làm) và Đại Hiệp (dh). Khi làm HAK: ô "Chọn hợp đồng" ở form lập hồ sơ, ô hợp đồng ở Chứng từ,
 * Tìm kiếm Ctrl+K KHÔNG có dữ liệu Đại Hiệp; bật "Xem tất cả công ty" thì thấy lại (không mất dữ liệu). Bộ lọc đã lưu ở HAK không hiện ở Đại Hiệp.
 * Chạy: node tools/e2e-company-scope.cjs · SQLite: node tools/e2e-sqlite.cjs tools/e2e-company-scope.cjs. Dữ liệu 100% giả lập. */
/* E2E M5.1 / M4.1: sao lưu → xóa → khôi phục (thay thế) vòng tròn; khôi phục lặp lại; file hỏng / cắt cụt / sai phiên bản.
 * Khẳng định: số liệu trước = sau (hồ sơ Lưu trữ gồm meta.nonPos, danh mục, nguồn TripDetails); khôi phục lặp không nhân đôi;
 * file hỏng bị từ chối bằng thông báo tiếng Việt và KHÔNG làm đổi dữ liệu hiện có. Chạy trên IndexedDB:  node tools/e2e-roundtrip.cjs
 * và trên SQLite (máy chủ tham chiếu):  node tools/e2e-sqlite.cjs tools/e2e-roundtrip.cjs. Dữ liệu 100% giả lập. */
const { chromium } = require('playwright');
const path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
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
  await reopen('hak');
  const MARK = /TAUDHX|HD-DHX|KHACHDHX|PDHX|DHX\.docx/;
  const opts = (id) =>
    p.evaluate((id) => {
      const s = document.getElementById(id);
      return s
        ? Array.from(s.options)
            .map((o) => o.textContent)
            .join(' | ')
        : null;
    }, id);
  const visit = async (nav) => {
    await p.click('[data-nav="' + nav + '"]');
    await p.waitForTimeout(1500);
  };
  const search = async (q) => {
    await p.keyboard.press('Control+k');
    await p.waitForTimeout(500);
    await p.fill('#gsInput', q);
    await p.waitForTimeout(1200);
    const t = await p.evaluate(() => {
      const i = document.getElementById('gsInput');
      const ov = i && i.closest('[hidden], .gs-ov, div');
      let el = i;
      while (el && !el.querySelector('#gsBody')) el = el.parentElement;
      const b = el && el.querySelector('#gsBody');
      return b ? b.innerText : '';
    });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    return t;
  };

  console.log('1) Đang làm HAK: không lộ dữ liệu Đại Hiệp');
  check((await p.evaluate(() => HAK.Auth.company())) === 'hak', 'công ty đang làm = HAK');
  await visit('xuatkhau');
  const fx = await opts('f-xuatkhau-contractId');
  check(
    fx !== null && /HD-HAKX/.test(fx) && !MARK.test(fx),
    'Xuất khẩu — ô "Chọn hợp đồng": có HD-HAKX, không có HD-DHX (' + String(fx).slice(0, 120) + ')'
  );
  await visit('chungtu');
  const ct = await opts('ctFixContract');
  check(ct !== null && /HD-HAKX/.test(ct) && !MARK.test(ct), 'Chứng từ — ô hợp đồng: có HD-HAKX, không có HD-DHX');
  const s1 = await search('TAU');
  check(/TAUHAKX|HAKX/.test(s1) && !MARK.test(s1), 'Tìm kiếm Ctrl+K "TAU": có hồ sơ HAK, không có hồ sơ Đại Hiệp');

  console.log('2) Bật "Xem tất cả công ty": thấy lại dữ liệu Đại Hiệp (không mất)');
  await p.evaluate(() => HAK.Store.set('hak.scope.v1', { catalog: true, archive: true, report: true }));
  await reopen();
  await visit('xuatkhau');
  check(MARK.test((await opts('f-xuatkhau-contractId')) || ''), 'Xuất khẩu — ô hợp đồng có nhóm hợp đồng công ty khác');
  await visit('chungtu');
  check(MARK.test((await opts('ctFixContract')) || ''), 'Chứng từ — ô hợp đồng có HD-DHX');
  check(MARK.test(await search('TAU')), 'Tìm kiếm có hồ sơ Đại Hiệp');
  await p.evaluate(() => HAK.Store.set('hak.scope.v1', {}));
  await reopen();

  console.log('3) Bộ lọc đã lưu tách theo công ty (và tài khoản)');
  const sv = await p.evaluate(() => {
    const st = HAKSmartFilter.core.presets(HAK.Filters.presetStorage);
    const before = st.list('archive');
    st.save('archive', 'BL-HAK', { q: 'TAUHAKX' });
    return { before, after: st.list('archive'), key: HAK.Filters.presetKey('hak.sf.presets', HAK.Auth.current().id, 'hak') };
  });
  check(sv.before.includes('BL-CU'), 'quản trị: lần đầu ở HAK nhận bản sao kho dùng chung cũ (BL-CU)');
  check(sv.after.includes('BL-HAK'), 'lưu BL-HAK ở HAK');
  check(await p.evaluate((k) => HAK.Store.get(k, null) !== null, sv.key), 'lưu vào khóa riêng ' + sv.key);
  check(
    (await p.evaluate(() => JSON.stringify(HAK.Store.get('hak.sf.presets', null)))).indexOf('BL-HAK') < 0,
    'kho dùng chung cũ không bị ghi thêm'
  );
  await reopen('dh');
  const dh = await p.evaluate(() => ({
    co: HAK.Auth.company(),
    list: HAKSmartFilter.core.presets(HAK.Filters.presetStorage).list('archive'),
  }));
  check(dh.co === 'dh' && !dh.list.includes('BL-HAK'), 'đổi sang Đại Hiệp: KHÔNG thấy BL-HAK (' + JSON.stringify(dh.list) + ')');
  await reopen('hak');
  const back = await p.evaluate(() => HAKSmartFilter.core.presets(HAK.Filters.presetStorage).list('archive'));
  check(back.includes('BL-HAK'), 'quay lại HAK (mở lại app): BL-HAK còn');

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
