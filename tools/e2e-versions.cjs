/* E2E phiên bản hồ sơ trên trình duyệt thật: Sổ hồ sơ năm có hồ sơ đã sửa (kèm lý do) → nút "Phiên bản" liệt kê các bản, lý do, người sửa →
 * "Xem / in lại bản này" mở ĐÚNG bản cũ ở chế độ chỉ xem (không ghi vào kho). Chạy: node tools/e2e-versions.cjs */
const { chromium } = require('playwright');
const path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const failures = [];
const check = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) failures.push(msg);
};
async function login(p) {
  await p.goto(APP);
  await p.waitForSelector('#authForm', { timeout: 15000 });
  await p.fill('#auName', 'Nguyễn Văn A');
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
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.dismiss());
  try {
    await login(p);
    const y = new Date().getFullYear();
    const seeded = await p.evaluate(async (year) => {
      const Y = HAK.Yearbook;
      Y.setYear(year);
      const st = await Y.read();
      const now = Date.now();
      const v1rows = [{ idx: 1, ticket: 'P0001', dateStr: '05/02/' + year, plate: '43C-1', time1: '08:00', net: 20000 }];
      const v2rows = v1rows.concat([{ idx: 2, ticket: 'P0002', dateStr: '05/02/' + year, plate: '43C-2', time1: '09:00', net: 22000 }]);
      const params = { ship: 'TÀU PHIÊN BẢN', giaoId: 'hak', filter: {} };
      await Y.commit(st.revision, (s) => {
        s.records.push({
          id: 'y-e2e-version',
          type: 'xuatkhau',
          year,
          revision: 2,
          createdAt: now - 5000,
          updatedAt: now,
          title: 'TÀU PHIÊN BẢN',
          params,
          rows: v2rows,
          status: 'draft',
          versions: [
            {
              revision: 1,
              updatedAt: now - 5000,
              status: 'exported',
              params,
              rows: v1rows,
              supersededBy: { revision: 2, at: now, by: 'Nguyễn Văn A', reason: 'Thêm xe bị sót', changed: true },
            },
          ],
        });
        return s;
      });
      return (await Y.read()).records.length;
    }, y);
    check(seeded === 1, 'có 1 hồ sơ năm: bản 2 (2 phiếu, đã sửa) và bản 1 (1 phiếu, ĐÃ XUẤT)');
    await p.evaluate(() => HAK.Yearbook.show());
    await p.waitForSelector('[data-versions="y-e2e-version"]', { timeout: 10000 });
    check(/Phiên bản \(2\)/.test(await p.textContent('[data-versions="y-e2e-version"]')), 'dòng hồ sơ có nút "Phiên bản (2)"');
    await p.click('[data-versions="y-e2e-version"]');
    await p.waitForSelector('button:has-text("Xem / in lại bản này")', { timeout: 10000 });
    const list = await p.textContent('.modal.show [data-status]');
    check(/Bản 2 \(hiện hành\)/.test(list) && /Bản 1 ·/.test(list), 'liệt kê Bản 2 (hiện hành) và Bản 1');
    check(/Đã xuất/.test(list) && /1 phiếu/.test(list) && /2 phiếu/.test(list), 'hiện trạng thái Đã xuất và số phiếu từng bản');
    check(/lý do: Thêm xe bị sót/.test(list) && /bởi Nguyễn Văn A/.test(list), 'hiện lý do và người sửa');
    const btns = await p.$$('.modal.show button:has-text("Xem / in lại bản này")');
    check(btns.length === 2, 'mỗi bản có nút "Xem / in lại bản này"');
    await btns[1].click(); // danh sách đảo: [bản 2, bản 1] → nút thứ hai = bản 1
    await p.waitForFunction(() => location.hash === '#/xuatkhau', null, { timeout: 10000 });
    await p.waitForTimeout(500);
    const st = await p.evaluate(() => ({
      rows: HAK.Pages._st('xuatkhau').savedDs.rows.length,
      ro: HAK.Pages._st('xuatkhau').ro,
      active: HAK.Yearbook.active('xuatkhau'),
      ship: HAK.Pages._st('xuatkhau').snapshotParams.ship,
    }));
    check(st.rows === 1, 'mở đúng bản 1: 1 phiếu (không phải 2 phiếu của bản hiện hành)');
    check(st.ro === true && st.active.readonly === true && st.active.revision === 1, 'chế độ chỉ xem, bản 1');
    check(st.ship === 'TÀU PHIÊN BẢN', 'thông số của bản cũ');
    const saveErr = await p.evaluate(async () => {
      try {
        await HAK.Yearbook.save('xuatkhau', false, { reason: 'thử ghi đè' });
        return null;
      } catch (e) {
        return e.message;
      }
    });
    check(/phiên bản cũ \(chỉ xem\)/.test(saveErr || ''), 'không ghi đè kho từ bản cũ: ' + saveErr);
    check(
      /Đang xem bản 1 — phiên bản cũ/.test(await p.textContent('#year-note-xuatkhau')),
      'ghi chú trên trang nói rõ đang xem phiên bản cũ'
    );
    const after = await p.evaluate(async () => (await HAK.Yearbook.read()).records[0]);
    check(
      after.revision === 2 && after.rows.length === 2 && after.versions.length === 1,
      'kho giữ nguyên: bản 2 vẫn hiện hành, vẫn có 1 phiên bản cũ'
    );
    check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  } catch (e) {
    console.error(e);
    failures.push(e.message);
  } finally {
    await browser.close();
  }
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})();
