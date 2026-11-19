/* E2E sao lưu THEO THÁNG (quy tắc 33–35) trên IndexedDB và SQLite (node tools/e2e-sqlite.cjs tools/e2e-month-backup.cjs).
 * Tháng 10 và tháng 11 đều có hồ sơ; hồ sơ qua 2 tháng (28/10 → 02/11) thuộc tháng 10; hợp đồng dùng chung cho cả hai tháng; có tệp đính kèm, chứng từ, đợt Excel.
 * Khẳng định: bản tháng chỉ chứa phần của tháng đó + danh mục liên quan; khôi phục vào máy trống / máy đã có tháng khác (tháng kia NGUYÊN VẸN);
 * lặp lại không nhân đôi; chế độ "Thay thế" bị từ chối và không đổi dữ liệu; file toàn bộ cũ vẫn khôi phục được. Dữ liệu 100% giả lập. */
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

  console.log(
    '0) Dựng dữ liệu: 2 hợp đồng (HD-S dùng chung 2 tháng, HD-O chỉ tháng 10), hồ sơ tháng 10 / hồ sơ qua 2 tháng / hồ sơ tháng 11, chứng từ, đợt Excel, tệp đính kèm'
  );
  await p.evaluate(async () => {
    const M = HAK.ContractModel,
      CM = HAK.CustomsModel,
      d = HAK.Catalog.core.get();
    d.customers = (d.customers || []).concat([
      { id: 'k-hak', companyId: 'hak', name: 'HAK' },
      { id: 'k-iwc', companyId: 'hak', name: 'IWC' },
      { id: 'k-khac', companyId: 'hak', name: 'KHÁC' },
    ]);
    const mk = (no, buyer, ships) => {
      const c = M.parent({
        type: 'xuatkhau',
        no,
        date: '2026-05-20',
        contractQty: 2000,
        priceUsd: 150,
        currency: 'USD',
        details: [],
        exporterId: 'k-hak',
        buyerId: buyer,
      });
      ships.forEach((s) => c.details.push(M.child(c.id, { ship: s, certNo: 'CT-' + s, bdmt: 500, mt: 1000, exchangeRate: 26000 })));
      return c;
    };
    const S = mk('HD-S', 'k-iwc', ['TAU S1', 'TAU S2', 'TAU S3']);
    const O = mk('HD-O', 'k-khac', ['TAU O1']);
    S.contractFiles = ['att-hds'];
    d.contracts.push(S, O);
    d.customs = d.customs || [];
    d.customs.push(
      CM.newDecl({ no: '308629707001', contractId: S.id, detailId: S.details[0].id, status: 'cleared', openDate: '2026-10-05' })
    );
    d.customs.push(
      CM.newDecl({ no: '308629707002', contractId: O.id, detailId: O.details[0].id, status: 'cleared', openDate: '2026-10-06' })
    );
    await HAK.Catalog.persist();
    await HAK.DB.put('attachments', { id: 'att-hds', name: 'hd-s.pdf', base64: 'QUJD' });
    await HAK.DB.put('attachments', { id: 'att-khac', name: 'khac.pdf', base64: 'QUJD' });
    const rows = (n, day, mon, kg, file) =>
      Array.from({ length: n }, (_, i) => ({
        idx: i + 2,
        uid: file + '#' + (i + 2) + '-' + day + mon,
        ticket: 'M' + day + mon + '-' + i,
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
    const save = (ship, contractId, rws, files, type) =>
      HAK.Archive.save(
        type || 'xuatkhau',
        { giaoId: 'hak', nhanId: 'k-iwc', ship, contractId, returned: [], filter: files ? { files } : {} },
        { files: [{ name: ship + '.docx' }], summary: {} },
        { rows: rws },
        'word'
      );
    await HAK.Batches.save(
      'xuatkhau',
      { fileName: 'can-t10.xlsx', size: 3, sheet: 'S', mapping: {}, addedAt: Date.now() },
      new Uint8Array([1, 2, 3]).buffer
    );
    await HAK.Batches.save(
      'xuatkhau',
      { fileName: 'can-t11.xlsx', size: 3, sheet: 'S', mapping: {}, addedAt: Date.now() },
      new Uint8Array([4, 5, 6]).buffer
    );
    await save('TAU S1', S.details[0].id, rows(5, 5, 10, 20000, 'can-t10.xlsx'), ['can-t10.xlsx']); // tháng 10
    await save('TAU O1', O.details[0].id, rows(4, 12, 10, 21000, 'can-t10.xlsx'), ['can-t10.xlsx']); // tháng 10
    await save('TAU S2', S.details[1].id, rows(3, 28, 10, 22000, 'can-t10.xlsx').concat(rows(3, 2, 11, 22000, 'can-t10.xlsx')), [
      'can-t10.xlsx',
    ]); // 28/10 → 02/11: tháng 10 (ngày cân đầu)
    await save('TAU S3', S.details[2].id, rows(6, 5, 11, 19000, 'can-t11.xlsx'), ['can-t11.xlsx']); // tháng 11
    await HAK.Issued.add({
      kind: 'bkls',
      type: 'xuatkhau',
      cid: 'hak',
      from: '05/10/2026',
      to: '05/10/2026',
      batch: 'can-t10.xlsx',
      soBkls: '001/2026/BKLS',
      trips: 5,
      kg: 100000,
    });
    await HAK.Issued.add({
      kind: 'bkls',
      type: 'xuatkhau',
      cid: 'hak',
      from: '05/11/2026',
      to: '05/11/2026',
      batch: 'can-t11.xlsx',
      soBkls: '002/2026/BKLS',
      trips: 6,
      kg: 114000,
    });
  });
  const snap = () =>
    p.evaluate(async () => {
      const list = (await HAK.Archive.list()).map((m) => m.id + '|' + m.from + '|' + m.trips + '|' + m.kg).sort();
      const cat = HAK.Store.get('hak.catalog.v1', null) || {};
      const att = (await HAK.DB.getAll('attachments')).map((a) => a.id).sort();
      const bat = (await HAK.Batches.exportAll()).map((b) => b.meta.fileName).sort();
      const iss = (await HAK.DB.getAll('issued')).map((r) => r.soBkls).sort();
      return {
        list,
        contracts: (cat.contracts || []).map((c) => c.no + ':' + (c.details || []).length).sort(),
        decls: (cat.customs || []).map((x) => x.no).sort(),
        customers: (cat.customers || []).map((c) => c.id).sort(),
        att,
        bat,
        iss,
      };
    });
  const wipe = async () => {
    await reloadApp();
    return wipeRaw();
  };
  const wipeRaw = () =>
    p.evaluate(async () => {
      await HAK.Archive.closeVerified(await HAK.Archive.collectItems());
      const d = HAK.Catalog.core.get();
      d.contracts.length = 0;
      d.customs.length = 0;
      d.customers.length = 0;
      await HAK.Catalog.persist();
      for (const a of await HAK.DB.getAll('attachments')) await HAK.DB.del('attachments', a.id);
      for (const b of await HAK.Batches.exportAll()) (await HAK.DB.del('batches', b.meta.id), await HAK.DB.del('batchdata', b.meta.id));
      for (const r of await HAK.DB.getAll('issued')) await HAK.DB.del('issued', r.id);
      HAK.Issued.list = [];
    });
  const restoreRaw = (txt, mode) =>
    p.evaluate(
      async ([txt, mode]) => {
        try {
          await HAK.Backup.restoreFile(new File([txt], 'x.json', { type: 'application/json' }), { mode, keepAuth: true });
          return { ok: true };
        } catch (e) {
          return { ok: false, msg: String((e && e.message) || e) };
        }
      },
      [txt, mode]
    );
  const restore = async (txt, mode) => {
    const r = await restoreRaw(txt, mode);
    await reloadApp(); // danh mục trong bộ nhớ phải đọc lại sau khôi phục
    return r;
  };
  const reloadApp = async () => {
    await p.reload();
    await p.waitForFunction(() => window.HAK && HAK.Archive && HAK.Catalog && HAK.Backup, null, { timeout: 25000 });
    await p.waitForTimeout(2500);
    const co = await p.$('[data-co="hak"]');
    if (co && (await co.isVisible())) {
      await co.click();
      await p.waitForTimeout(2000);
    }
  };
  const full = await snap();
  check(full.list.length === 4 && full.contracts.join() === 'HD-O:1,HD-S:3', 'dữ liệu nguồn: 4 hồ sơ, 2 hợp đồng');

  console.log('1) Danh sách tháng + nội dung bản tháng 10 / tháng 11');
  const months = await p.evaluate(async () => HAK.Backup.listMonths());
  check(
    months.list.map((m) => m.month + ':' + m.archive + ':' + m.issued).join() === '2026-11:1:1,2026-10:3:1',
    'liệt kê tháng: 11 (1 hồ sơ, 1 chứng từ), 10 (3 hồ sơ gồm hồ sơ qua 2 tháng, 1 chứng từ)'
  );
  const build = (ym) =>
    p.evaluate(async (ym) => {
      const b = await HAK.Backup.buildMonth(ym);
      return { text: b.parts.join(''), archive: b.archive, batches: b.batches, issued: b.issued, scope: b.scope };
    }, ym);
  const oct = await build('2026-10'),
    nov = await build('2026-11');
  check(
    oct.archive === 3 && oct.issued === 1 && oct.batches === 1 && oct.scope.counts.contracts === 2,
    'bản tháng 10: 3 hồ sơ, 1 chứng từ, 1 đợt Excel, 2 hợp đồng (' + JSON.stringify(oct.scope.counts) + ')'
  );
  check(
    nov.archive === 1 && nov.issued === 1 && nov.batches === 1 && nov.scope.counts.contracts === 1 && nov.scope.counts.attachments === 1,
    'bản tháng 11: 1 hồ sơ, hợp đồng dùng chung HD-S kèm tệp đính kèm (' + JSON.stringify(nov.scope.counts) + ')'
  );
  check(!/att-khac/.test(oct.text + nov.text), 'tệp đính kèm không liên quan không có trong bản tháng');
  const name = await p.evaluate(() => HAK.Backup.monthFileName('2026-10'));
  check(/^HAK_Thang_10-2026_xuat\d{8}\.json$/.test(name), 'tên file: ' + name);
  const full0 = await p.evaluate(async () => (await HAK.Backup.buildFull()).parts.join(''));

  console.log('2) Khôi phục tháng 11 → máy trống: chỉ có phần tháng 11');
  await wipe();
  const r1 = await restore(nov.text, 'merge');
  const sNov = await snap();
  check(
    r1.ok && sNov.list.length === 1 && sNov.list[0].includes('TAU') === false && sNov.iss.join() === '002/2026/BKLS',
    'máy trống + bản tháng 11: 1 hồ sơ, chứng từ 002/2026/BKLS' + (r1.ok ? '' : ' — ' + r1.msg)
  );
  check(
    sNov.contracts.join() === 'HD-S:3' && sNov.decls.length === 1 && sNov.bat.join() === 'can-t11.xlsx' && sNov.att.join() === 'att-hds',
    'danh mục liên quan: HD-S (3 chi tiết), tờ khai, đợt can-t11, tệp att-hds; KHÔNG có HD-O'
  );

  console.log('3) Máy ĐÃ có tháng 11: khôi phục tháng 10 → tháng 11 nguyên vẹn; lặp lại không nhân đôi');
  const novBefore = JSON.stringify(sNov.list);
  const r2 = await restore(oct.text, 'merge');
  const s2 = await snap();
  check(r2.ok && s2.list.length === 4 && s2.list.includes(sNov.list[0]), 'sau khôi phục tháng 10: đủ 4 hồ sơ, hồ sơ tháng 11 nguyên vẹn');
  check(
    s2.contracts.join() === 'HD-O:1,HD-S:3' && s2.decls.length === 2,
    'danh mục: HD-O mới thêm, HD-S dùng chung KHÔNG nhân đôi (3 chi tiết), 2 tờ khai'
  );
  check(
    s2.iss.length === 2 && s2.bat.length === 2 && s2.att.join() === 'att-hds',
    'chứng từ 2, đợt Excel 2, tệp đính kèm 1 (không nhân đôi)'
  );
  const r3 = await restore(oct.text, 'merge'),
    r4 = await restore(nov.text, 'merge');
  const s3 = await snap();
  check(r3.ok && r4.ok && JSON.stringify(s3) === JSON.stringify(s2), 'khôi phục lặp cả hai bản tháng: không đổi gì');
  check(
    !s3.list.some((x) => x.includes('|0|')) &&
      JSON.stringify(s3.list.filter((x) => x === sNov.list[0])) === JSON.stringify([sNov.list[0]]) &&
      novBefore.length > 0,
    'hồ sơ tháng 11 vẫn đúng một bản'
  );

  console.log('4) Chế độ "Thay thế" với bản tháng bị từ chối; dữ liệu không đổi');
  const rr = await restore(oct.text, 'replace');
  const s4 = await snap();
  check(
    !rr.ok && /Nhập bổ sung/.test(rr.msg || '') && JSON.stringify(s4) === JSON.stringify(s2),
    'từ chối bằng thông báo tiếng Việt, dữ liệu giữ nguyên'
  );

  console.log('5) Tự nhận loại file + file toàn bộ cũ vẫn khôi phục được');
  const kinds = await p.evaluate(
    async ([a, b, c]) =>
      [
        HAK.Backup.kindOf(JSON.parse(a)),
        HAK.Backup.kindOf(JSON.parse(b)),
        HAK.Backup.kindOf(JSON.parse(c)),
        HAK.Backup.kindOf({ app: 'hak-yearbook' }),
        HAK.Backup.kindOf({ app: 'khac' }),
      ].join(),
    [oct.text, full0, JSON.stringify({ app: 'hak-bienban-archive', items: [] })]
  );
  check(kinds === 'month,full,archive,year,', 'kindOf: tháng · toàn bộ · Lưu trữ cũ · năm · lạ (' + kinds + ')');
  await wipe();
  const rf = await restore(full0, 'replace');
  const s5 = await snap();
  check(
    rf.ok && JSON.stringify(s5.list) === JSON.stringify(full.list) && s5.contracts.join() === full.contracts.join(),
    'file toàn bộ (không có scope) khôi phục thay thế đủ 4 hồ sơ, 2 hợp đồng'
  );

  console.log('6) Mở lại app: dữ liệu còn nguyên');
  await reloadApp();
  const s6 = await snap();
  check(
    JSON.stringify(s6.list) === JSON.stringify(s5.list) && s6.contracts.join() === s5.contracts.join(),
    'sau mở lại app: hồ sơ và danh mục khớp'
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
