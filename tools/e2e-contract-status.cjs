/* E2E S1 (vòng 1B): trạng thái "Đã hoàn thành" của hợp đồng có MỘT nguồn — chi tiết đã có phiếu cân (Lưu trữ) được tính chung cho
 * Danh mục, Báo cáo tổng hợp, Chi tiết xuất hàng theo HĐ, Báo cáo thực hiện HĐ, Hồ sơ hợp đồng và trạng thái dùng cho bộ lọc.
 * Kịch bản: HD-F4 có chi tiết A (chứng thư + tờ khai thông quan) và chi tiết B (KHÔNG chứng thư, KHÔNG tờ khai) nhưng hồ sơ tàu B đã xuất (10 phiếu gắn chi tiết B).
 *   → mọi màn "Đang thực hiện", lọc "Đã hoàn thành" loại HĐ này; thêm tờ khai thông quan cho B → mọi màn "Đã hoàn thành".
 * Chạy: node tools/e2e-contract-status.cjs [--perf] (--perf: đo độ trễ nguồn chung với 100 và 1.000 hồ sơ × 150 phiếu). Dữ liệu 100% giả lập. */
const { chromium } = require('playwright');
const path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const PERF = process.argv.includes('--perf');
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
  const goto = async (h, ms) => {
    await p.evaluate((x) => (location.hash = x), h);
    await p.waitForTimeout(ms || 1200);
  };
  const waitTrips = () =>
    p.evaluate(() => (HAK.TripDetails ? HAK.TripDetails.refresh().then((s) => Array.from(s)) : Promise.resolve(null)));

  console.log(
    '0) Dựng HD-F4: chi tiết A (chứng thư + tờ khai thông quan), chi tiết B (không chứng thư, không tờ khai) + hồ sơ tàu B đã xuất 10 phiếu'
  );
  const ids = await p.evaluate(async () => {
    const M = HAK.ContractModel,
      CM = HAK.CustomsModel,
      d = HAK.Catalog.core.get();
    d.customers = (d.customers || []).concat([
      { id: 'k-hak', companyId: 'hak', name: 'HAK' },
      { id: 'k-iwc', companyId: 'hak', name: 'IWC' },
    ]);
    const c = M.parent({
      type: 'xuatkhau',
      no: 'HD-F4',
      date: '2026-05-20',
      contractQty: 2000,
      priceUsd: 150,
      currency: 'USD',
      details: [],
      exporterId: 'k-hak',
      buyerId: 'k-iwc',
    });
    const A = M.child(c.id, { ship: 'TÀU F4A', certNo: 'CT-F4A', bdmt: 1000, mt: 2000, exchangeRate: 26000 });
    const B = M.child(c.id, { ship: 'TÀU F4B', bdmt: 0, mt: 0, exchangeRate: 26000 });
    c.details.push(A, B);
    d.contracts.push(c);
    d.customs = d.customs || [];
    d.customs.push(CM.newDecl({ no: '308629709001', contractId: c.id, detailId: A.id, status: 'cleared', openDate: '2026-06-01' }));
    await HAK.Catalog.persist();
    // hồ sơ Lưu trữ của tàu B: 10 phiếu gắn đúng chi tiết B (meta.contract = mã chi tiết)
    const rows = [];
    for (let i = 1; i <= 10; i++)
      rows.push({
        idx: i + 1,
        uid: 'u' + i,
        ticket: 'F4-' + i,
        plate: '43C-' + (1000 + i),
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
        time1: '05/06/2026 08:' + String(i).padStart(2, '0'),
        time2: '',
        tare: 10000,
        gross: 30000,
        net: 20000,
      });
    const params = { giaoId: 'hak', nhanId: 'k-iwc', ship: 'TÀU F4B', contractId: B.id, returned: [], filter: {} };
    const res = { files: [{ name: 'BB_F4B.docx' }], summary: {} };
    await HAK.Archive.save('xuatkhau', params, res, { rows }, 'word');
    return { c: c.id, A: A.id, B: B.id, n: (await HAK.Archive.list()).length };
  });
  check(ids.n === 1, 'Lưu trữ có 1 hồ sơ (tàu B, 10 phiếu)');
  const trips = await waitTrips();
  check(
    trips && trips.includes(ids.B) && !trips.includes(ids.A),
    'nguồn chung: chi tiết B đã có phiếu cân, chi tiết A thì chưa (' +
      JSON.stringify(trips ? trips.length : 'không có nguồn') +
      ' chi tiết)'
  );

  const screens = async () => {
    const out = {};
    // 1) Danh mục
    await goto('#/catalog');
    out.catalog = await p.evaluate(() => {
      const row = Array.from(document.querySelectorAll('#catalogRoot tr')).find((r) => /HD-F4/.test(r.innerText));
      return row ? row.innerText.replace(/\s+/g, ' ') : '';
    });
    // 2) Báo cáo tổng hợp — bảng hợp đồng
    await goto('#/report');
    await p.selectOption('#repTpl', 'contracts');
    await p.waitForTimeout(2500);
    out.report = await p.evaluate(() => {
      const row = Array.from(document.querySelectorAll('#repTplBody tr')).find((r) => /HD-F4/.test(r.innerText));
      return row ? row.innerText.replace(/\s+/g, ' ') : '';
    });
    // 3) Chi tiết xuất hàng theo HĐ
    await goto('#/contractstatus', 2500);
    out.status = await p.evaluate(() => {
      const row = Array.from(document.querySelectorAll('#page-contractstatus tr, #csrHost tr, [id*=contractstatus] tr')).find((r) =>
        /HD-F4/.test(r.innerText)
      );
      return row ? row.innerText.replace(/\s+/g, ' ') : '';
    });
    out.filterStatus = await p.evaluate(() => {
      const g = HAK.ContractStatus.state.groups.find((x) => x.f.no === 'HD-F4');
      return g ? g.f.status + '|' + g.f.statusLabel : '';
    });
    // 4) Báo cáo thực hiện HĐ
    await goto('#/contractoverview', 2500);
    out.overview = await p.evaluate(() => (document.querySelector('#coCards') || {}).innerText.replace(/\s+/g, ' '));
    // 5) Hồ sơ hợp đồng (mô hình) + nguồn thuần của mô hình trạng thái
    out.model = await p.evaluate(
      (cid) => HAK.CustomsModel.contractStatus(HAK.Customs.activeDecls(), cid, HAK.ContractModel && HAK.Catalog.parent(cid)).code,
      ids.c
    );
    out.ctReport = await p.evaluate(() => {
      const m = HAK.ContractReport.contractReportModel().find((x) => x.c.no === 'HD-F4');
      return m ? m.st.code + '|' + m.f.statusLabel : '';
    });
    return out;
  };
  const has = (s, re) => re.test(s || '');

  console.log('1) Chi tiết B có phiếu cân nhưng chưa có tờ khai thông quan → MỌI màn "Đang thực hiện"');
  let s = await screens();

  check(has(s.catalog, /Đang thực hiện/) && !has(s.catalog, /Đã hoàn thành/), 'Danh mục: Đang thực hiện');
  check(has(s.report, /Đang thực hiện/) && !has(s.report, /Đã hoàn thành/), 'Báo cáo tổng hợp (bảng HĐ): Đang thực hiện');
  check(has(s.status, /Đang thực hiện/) && !has(s.status, /Đã hoàn thành/), 'Chi tiết xuất hàng theo HĐ: Đang thực hiện');
  check(s.filterStatus.startsWith('running|'), 'trạng thái dùng cho bộ lọc: running (' + s.filterStatus + ')');
  check(has(s.overview, /Hợp đồng 1 0 đã hoàn thành/), 'Báo cáo thực hiện HĐ: 0 hợp đồng đã hoàn thành');
  check(s.ctReport.startsWith('running|'), 'Báo cáo hợp đồng – tờ khai (bảng, Excel, PDF): running (' + s.ctReport + ')');
  check(s.model === 'running', 'mô hình trạng thái (dùng cho Google Sheet / Excel / PDF): running');

  console.log('2) Thêm tờ khai thông quan cho chi tiết B → MỌI màn "Đã hoàn thành"');
  await p.evaluate(async (x) => {
    const d = HAK.Catalog.core.get();
    d.customs.push(
      HAK.CustomsModel.newDecl({ no: '308629709002', contractId: x.c, detailId: x.B, status: 'cleared', openDate: '2026-06-10' })
    );
    await HAK.Catalog.persist();
    window.dispatchEvent(new CustomEvent('hak:catalog'));
  }, ids);
  await p.waitForTimeout(800);
  s = await screens();
  check(has(s.catalog, /Đã hoàn thành/), 'Danh mục: Đã hoàn thành');
  check(has(s.report, /Đã hoàn thành/), 'Báo cáo tổng hợp (bảng HĐ): Đã hoàn thành');
  check(has(s.status, /Đã hoàn thành/), 'Chi tiết xuất hàng theo HĐ: Đã hoàn thành');
  check(s.filterStatus.startsWith('done|'), 'trạng thái dùng cho bộ lọc: done (' + s.filterStatus + ')');
  check(has(s.overview, /Hợp đồng 1 1 đã hoàn thành/), 'Báo cáo thực hiện HĐ: 1 hợp đồng đã hoàn thành');
  check(s.ctReport.startsWith('done|'), 'Báo cáo hợp đồng – tờ khai (bảng, Excel, PDF): done (' + s.ctReport + ')');
  check(s.model === 'done', 'mô hình trạng thái: done');

  console.log('3) Xóa hồ sơ tàu B khỏi Lưu trữ → nguồn tự cập nhật (không còn phiếu cân của B), màn đang mở vẽ lại không cần tải lại');
  await goto('#/catalog');
  await p.evaluate(async () => {
    await HAK.Archive.closeVerified(await HAK.Archive.collectItems());
  });
  await p.waitForTimeout(1500);
  const after = await p.evaluate(() => (HAK.TripDetails ? Array.from(HAK.TripDetails.ids() || []) : null));
  check(after && after.length === 0, 'sau khi xóa hồ sơ: không còn chi tiết nào có phiếu cân');

  if (PERF) {
    console.log('4) Đo độ trễ nguồn chung (nền, không chặn giao diện)');
    for (const n of [100, 1000]) {
      const r = await p.evaluate(async (n) => {
        const out = [];
        for (let h = 0; h < n; h++) {
          const rows = [];
          for (let i = 0; i < 150; i++)
            rows.push({
              idx: i + 2,
              ticket: 'P' + h + '-' + i,
              plate: '43C-' + (100 + (i % 80)),
              note: '',
              warn: [],
              ts1: Date.UTC(2026, 5, 1 + (h % 28), 8, i % 60),
              dateStr: String(1 + (h % 28)).padStart(2, '0') + '/06/2026',
              time1: '08:00',
              net: 20000,
              tare: 10000,
              gross: 30000,
            });
          out.push({ rows, ship: 'PERF' + h });
        }
        const t0 = performance.now();
        for (const o of out)
          await HAK.Archive.save(
            'xuatkhau',
            { giaoId: 'hak', ship: o.ship, returned: [], filter: {} },
            { files: [{ name: o.ship + '.docx' }], summary: {} },
            { rows: o.rows },
            'word'
          );
        const tSave = performance.now() - t0;
        HAK.TripDetails.ticketCache.clear();
        const t1 = performance.now();
        await HAK.TripDetails.refresh();
        const cold = performance.now() - t1,
          t2 = performance.now();
        await HAK.TripDetails.refresh();
        const warm = performance.now() - t2;
        // độ trễ mở Danh mục khi nguồn đã có / chưa có: vẽ lại bảng
        const t3 = performance.now();
        HAK.Catalog.render && HAK.Catalog.render();
        const draw = performance.now() - t3;
        await HAK.Archive.closeVerified(await HAK.Archive.collectItems());
        return { n, saveMs: Math.round(tSave), coldMs: Math.round(cold), warmMs: Math.round(warm), drawMs: Math.round(draw) };
      }, n);
      console.log('    ' + JSON.stringify(r));
    }
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
