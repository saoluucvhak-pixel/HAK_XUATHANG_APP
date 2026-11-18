/* E2E M5.1 / M4.1: sao lưu → xóa → khôi phục (thay thế) vòng tròn; khôi phục lặp lại; file hỏng / cắt cụt / sai phiên bản.
 * Khẳng định: số liệu trước = sau (hồ sơ Lưu trữ gồm meta.nonPos, danh mục, nguồn TripDetails); khôi phục lặp không nhân đôi;
 * file hỏng bị từ chối bằng thông báo tiếng Việt và KHÔNG làm đổi dữ liệu hiện có. Chạy trên IndexedDB:  node tools/e2e-roundtrip.cjs
 * và trên SQLite (máy chủ tham chiếu):  node tools/e2e-sqlite.cjs tools/e2e-roundtrip.cjs. Dữ liệu 100% giả lập. */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
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
  // Khôi phục CHÉO backend: HAK_RT_EXPORT=<tệp> (dựng dữ liệu, ghi sao lưu + ảnh chụp rồi thoát) · HAK_RT_IMPORT=<tệp> (máy trống, khôi phục từ tệp đó). Xem e2e-roundtrip-cross.cjs.
  const EXPORT = process.env.HAK_RT_EXPORT,
    IMPORT = process.env.HAK_RT_IMPORT;

  if (!IMPORT) {
    console.log('0) Dựng dữ liệu: hợp đồng + tờ khai + 2 hồ sơ Lưu trữ (một hồ sơ có phiếu KL ≤ 0 đã loại)');
    await p.evaluate(async () => {
      const M = HAK.ContractModel,
        CM = HAK.CustomsModel,
        d = HAK.Catalog.core.get();
      d.customers = (d.customers || []).concat([
        { id: 'k-hak', companyId: 'hak', name: 'HAK' },
        { id: 'k-iwc', companyId: 'hak', name: 'IWC' },
      ]);
      const c = M.parent({
        type: 'xuatkhau',
        no: 'HD-RT',
        date: '2026-05-20',
        contractQty: 2000,
        priceUsd: 150,
        currency: 'USD',
        details: [],
        exporterId: 'k-hak',
        buyerId: 'k-iwc',
      });
      const A = M.child(c.id, { ship: 'TÀU RTA', certNo: 'CT-RTA', bdmt: 1000, mt: 2000, exchangeRate: 26000 });
      const B = M.child(c.id, { ship: 'TÀU RTB', bdmt: 0, mt: 0, exchangeRate: 26000 });
      c.details.push(A, B);
      d.contracts.push(c);
      d.customs = d.customs || [];
      d.customs.push(CM.newDecl({ no: '308629708001', contractId: c.id, detailId: A.id, status: 'cleared', openDate: '2026-06-01' }));
      await HAK.Catalog.persist();
      const mk = (h, n, kg) =>
        Array.from({ length: n }, (_, i) => ({
          idx: i + 2,
          uid: 'u' + h + i,
          ticket: 'RT' + h + '-' + i,
          plate: '43C-' + (1000 + i),
          driver: '',
          carrier: '',
          wh: '',
          weightType: '',
          weigher: '',
          note: '',
          warn: [],
          ts1: Date.UTC(2026, 5, 5 + h, 8, i),
          ts2: null,
          dateStr: String(5 + h).padStart(2, '0') + '/06/2026',
          time1: '08:' + String(i).padStart(2, '0'),
          time2: '',
          tare: 10000,
          gross: 10000 + kg,
          net: kg,
        }));
      await HAK.Archive.save(
        'xuatkhau',
        { giaoId: 'hak', nhanId: 'k-iwc', ship: 'TÀU RTB', contractId: B.id, returned: [], filter: {} },
        { files: [{ name: 'RT_B.docx' }], summary: {} },
        { rows: mk(0, 10, 20000), excluded: [{ ticket: 'RT-BAD', plate: '43C-999', dateStr: '05/06/2026', net: -300 }] },
        'word'
      );
      await HAK.Archive.save(
        'uythac',
        { giaoId: 'hak', nhanId: 'k-iwc', ship: 'TÀU RTX', returned: [], filter: {} },
        { files: [{ name: 'RT_X.docx' }], summary: {} },
        { rows: mk(1, 6, 21000) },
        'word'
      );
    });
  }
  const snap = () =>
    p.evaluate(async () => {
      const list = (await HAK.Archive.list())
        .map((m) => ({
          id: m.id,
          type: m.type,
          trips: m.trips,
          kg: m.kg,
          nonPosTrips: m.nonPosTrips || 0,
          nonPos: JSON.stringify(m.nonPos || []),
          contract: m.contract || '',
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const cat = HAK.Store.get('hak.catalog.v1', null) || {};
      const ids = HAK.TripDetails ? Array.from(await HAK.TripDetails.refresh()).sort() : null;
      const rows = [];
      for (const m of list) {
        const d = await HAK.Archive.load(m.id);
        rows.push(m.id + ':' + ((d && d.rows) || []).length);
      }
      return {
        list,
        rows,
        contracts: (cat.contracts || []).map((c) => c.no + ':' + (c.details || []).length).sort(),
        decls: (cat.customs || []).map((x) => x.no).sort(),
        trips: ids,
      };
    });
  const S1 = IMPORT ? JSON.parse(fs.readFileSync(IMPORT + '.snap.json', 'utf8')) : await snap();
  check(S1.list.length === 2 && S1.list.some((x) => x.nonPosTrips === 1), 'có 2 hồ sơ Lưu trữ, một hồ sơ ghi 1 phiếu KL ≤ 0 đã loại');
  check(S1.contracts.join() === 'HD-RT:2' && S1.decls.length === 1, 'danh mục: 1 hợp đồng 2 chi tiết, 1 tờ khai');
  if (S1.trips) check(S1.trips.length === 1, 'nguồn TripDetails: 1 chi tiết đã có phiếu cân');

  console.log('1) Sao lưu toàn bộ → xóa hồ sơ + danh mục → khôi phục (thay thế)');
  const text = IMPORT
    ? fs.readFileSync(IMPORT, 'utf8')
    : await p.evaluate(async () => {
        const b = await HAK.Backup.buildFull();
        return b.parts.join('');
      });
  if (EXPORT) {
    fs.writeFileSync(EXPORT, text);
    fs.writeFileSync(EXPORT + '.snap.json', JSON.stringify(S1));
    console.log('  (đã ghi sao lưu + ảnh chụp: ' + EXPORT + ')');
    await browser.close();
    process.exit(failures.length ? 1 : 0);
  }
  check(text.length > 1000 && /"archive":\[/.test(text), 'file sao lưu có phần hồ sơ (' + text.length + ' ký tự)');
  await p.evaluate(async () => {
    await HAK.Archive.closeVerified(await HAK.Archive.collectItems());
    const d = HAK.Catalog.core.get();
    if (d.contracts) d.contracts.length = 0; // máy trống (khôi phục chéo backend) chưa có hợp đồng
    if (d.customs) d.customs.length = 0;
    await HAK.Catalog.persist();
  });
  const wiped = await snap();
  check(wiped.list.length === 0 && wiped.contracts.length === 0, 'đã xóa sạch (0 hồ sơ, 0 hợp đồng)');
  const restore = (txt, name, mode) =>
    p.evaluate(
      async ([txt, name, mode]) => {
        try {
          const r = await HAK.Backup.restoreFile(new File([txt], name, { type: 'application/json' }), {
            mode: mode || 'replace',
            keepAuth: true,
          });
          return { ok: true, archive: r.added };
        } catch (e) {
          return { ok: false, msg: String((e && e.message) || e) };
        }
      },
      [txt, name, mode]
    );
  const r1 = await restore(text, 'sao-luu.json');
  check(r1.ok, 'khôi phục thành công' + (r1.ok ? '' : ': ' + r1.msg));
  await p.reload();
  await p.waitForFunction(() => window.HAK && HAK.Archive && HAK.Catalog, null, { timeout: 20000 });
  await p.waitForTimeout(2500);
  {
    const co = await p.$('[data-co="hak"]');
    if (co && (await co.isVisible())) {
      await co.click();
      await p.waitForTimeout(2000);
    }
  }
  const S2 = await snap();
  check(JSON.stringify(S2.list) === JSON.stringify(S1.list), 'hồ sơ Lưu trữ trước = sau (meta, kg, phiếu, nonPos)');
  check(JSON.stringify(S2.rows) === JSON.stringify(S1.rows), 'số dòng phiếu của từng hồ sơ trước = sau');
  check(
    JSON.stringify(S2.contracts) === JSON.stringify(S1.contracts) && JSON.stringify(S2.decls) === JSON.stringify(S1.decls),
    'danh mục (hợp đồng, chi tiết, tờ khai) trước = sau'
  );
  check(
    JSON.stringify(S2.trips) === JSON.stringify(S1.trips),
    'nguồn TripDetails trước = sau (' + JSON.stringify(S2.trips ? S2.trips.length : null) + ')'
  );

  console.log('2) Khôi phục lặp lại cùng file: không nhân đôi');
  const r2 = await restore(text, 'sao-luu.json');
  const r3 = await restore(text, 'sao-luu.json', 'merge');
  const S3 = await snap();
  check(r2.ok && r3.ok, 'khôi phục + nhập bổ sung lặp đều chạy được');
  check(
    JSON.stringify(S3.list) === JSON.stringify(S1.list) &&
      JSON.stringify(S3.contracts) === JSON.stringify(S1.contracts) &&
      S3.decls.length === 1,
    'không nhân đôi hồ sơ / hợp đồng / tờ khai'
  );

  console.log('3) File hỏng: cắt cụt, không phải JSON, sai ứng dụng/phiên bản → từ chối rõ ràng, dữ liệu hiện có KHÔNG đổi');
  const bad = [
    ['cắt cụt', text.slice(0, Math.floor(text.length / 2))],
    ['không phải JSON', 'xin chao khong phai du lieu'],
    ['sai ứng dụng', JSON.stringify({ app: 'khac', v: 1, keys: {} })],
    ['phiên bản lạ', JSON.stringify({ app: JSON.parse(text).app, v: 999, keys: {}, archive: [] })],
    ['rỗng', ''],
  ];
  for (const [name, txt] of bad) {
    const r = await restore(txt, 'hong.json');
    check(
      !r.ok && /[à-ỹ]/i.test(r.msg || '') && !/undefined|\[object|at \w+ \(|TypeError/.test(r.msg || ''),
      name + ': bị từ chối bằng thông báo tiếng Việt (' + String(r.msg).slice(0, 80) + ')'
    );
  }
  const S4 = await snap();
  check(
    JSON.stringify(S4.list) === JSON.stringify(S1.list) && JSON.stringify(S4.contracts) === JSON.stringify(S1.contracts),
    'sau các file hỏng: dữ liệu hiện có không đổi'
  );
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
