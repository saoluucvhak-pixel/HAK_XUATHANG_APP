/* E2E M4.2 / M4.3: cùng MỘT kịch bản lưu / lưu lặp / xóa hồ sơ Lưu trữ kèm lỗi giữa chừng phải cho CÙNG kết quả ở IndexedDB và SQLite.
 *   node tools/e2e-archive-ops.cjs                         (IndexedDB)
 *   node tools/e2e-sqlite.cjs tools/e2e-archive-ops.cjs     (SQLite, máy chủ tham chiếu hoặc HAKDocs)
 * Lỗi chèn: IndexedDB = lần ghi thứ 2 (dữ liệu) ném QuotaExceeded sau khi meta đã ghi; SQLite = yêu cầu /db/tx bị hủy (chưa tới máy chủ)
 * và (ca khó) phản hồi bị mất SAU KHI máy chủ đã ghi → lưu lại không được nhân đôi. Mọi lúc: mục lục ↔ nội dung khớp (HAK.Archive.verifyIndex).
 * Dữ liệu 100% giả lập. */
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
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  const mode = await p.evaluate(() => (HAK.Storage && HAK.Storage.mode) || 'idb');
  console.log('Backend: ' + (mode === 'sqlite' ? 'SQLite' : 'IndexedDB'));

  // Đưa các hàm thử vào trang: dựng phiếu, lưu, ảnh chụp trạng thái.
  await p.evaluate(() => {
    window.__mk = (tag, n, kg) =>
      Array.from({ length: n }, (_, i) => ({
        idx: i + 2,
        uid: tag + i,
        ticket: tag + '-' + i,
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
        time1: '08:' + String(i).padStart(2, '0'),
        time2: '',
        tare: 10000,
        gross: 10000 + kg,
        net: kg,
      }));
    window.__save = async (ship, rows, excluded, mode) =>
      HAK.Archive.save(
        'xuatkhau',
        { giaoId: 'hak', nhanId: '', ship, returned: [], filter: {} },
        { files: [{ name: ship + '.docx' }], summary: {} },
        excluded ? { rows, excluded } : { rows },
        mode || 'word'
      );
    window.__snap = async () => {
      const list = (await HAK.Archive.list())
        .map((m) => m.ship + ':' + m.trips + ':' + m.kg + ':' + (m.nonPosTrips || 0) + ':' + (m.modes || []).join('+'))
        .sort();
      const v = await HAK.Archive.verifyIndex();
      return { list, issues: v.issues, checked: v.checked };
    };
  });
  const snap = () => p.evaluate(() => window.__snap());
  const save = (ship, n, kg, excluded, m) =>
    p.evaluate(
      ([s, nn, k, ex, mm]) => window.__save(s, window.__mk(s.replace(/\W/g, ''), nn, k), ex, mm),
      [ship, n, kg, excluded || null, m || null]
    );
  const bad = [{ ticket: 'XB', plate: '43C-9', dateStr: '05/06/2026', net: -300 }];

  console.log('1) Lưu, lưu lặp (cùng hồ sơ, hình thức khác), lưu hồ sơ thứ hai');
  check((await save('TÀU A', 10, 20000, bad)) === true, 'lưu TÀU A (10 phiếu, 1 phiếu KL ≤ 0 đã loại) trả true');
  check((await save('TÀU A', 10, 20000, bad, 'pdf')) === true, 'lưu lặp TÀU A (pdf) trả true');
  check((await save('TÀU B', 6, 21000)) === true, 'lưu TÀU B');
  let s = await snap();
  check(
    JSON.stringify(s.list) === JSON.stringify(['TÀU A:10:200000:1:word+pdf', 'TÀU B:6:126000:0:word']),
    'đúng 2 hồ sơ, lưu lặp không nhân đôi, gộp hình thức',
    JSON.stringify(s.list)
  );
  check(s.issues.length === 0, 'mục lục ↔ nội dung khớp (số phiếu, kg, phiếu KL ≤ 0)', JSON.stringify(s.issues));

  console.log('2) Lỗi giữa chừng khi lưu: không hồ sơ nửa vời, dữ liệu cũ nguyên, thử lại được');
  if (mode === 'sqlite') {
    let hits = 0;
    await ctx.route('**/db/tx', (r) => (hits++ === 0 ? r.abort('connectionreset') : r.continue()));
  } else {
    await p.evaluate(() => {
      const orig = IDBObjectStore.prototype.put;
      let n = 0;
      window.__restore = () => (IDBObjectStore.prototype.put = orig);
      IDBObjectStore.prototype.put = function (...a) {
        if (++n === 2) throw new DOMException('Mô phỏng hết dung lượng', 'QuotaExceededError');
        return orig.apply(this, a);
      };
    });
  }
  const failed = await save('TÀU C', 5, 22000);
  check(failed === false, 'lưu lỗi giữa chừng trả false (không báo đã lưu)');
  check(
    !!(await p.evaluate(() => HAK.Archive.lastError)),
    'có thông báo lỗi để hiện cho người dùng',
    await p.evaluate(() => HAK.Archive.lastError)
  );
  if (mode !== 'sqlite') await p.evaluate(() => window.__restore());
  else await ctx.unroute('**/db/tx');
  s = await snap();
  check(
    JSON.stringify(s.list) === JSON.stringify(['TÀU A:10:200000:1:word+pdf', 'TÀU B:6:126000:0:word']),
    'sau lỗi: vẫn đúng 2 hồ sơ cũ, không có TÀU C nửa vời',
    JSON.stringify(s.list)
  );
  check(s.issues.length === 0, 'sau lỗi: mục lục ↔ nội dung vẫn khớp', JSON.stringify(s.issues));
  check((await save('TÀU C', 5, 22000)) === true, 'thử lại lưu TÀU C thành công');
  s = await snap();
  check(s.list.length === 3 && s.list.includes('TÀU C:5:110000:0:word'), 'có đúng một TÀU C', JSON.stringify(s.list));

  console.log('3) Mất phản hồi SAU KHI đã ghi (chỉ SQLite): lưu lại không nhân đôi');
  if (mode === 'sqlite') {
    let hits = 0;
    await ctx.route('**/db/tx', async (r) => {
      if (hits++ === 0) {
        await r.fetch(); // máy chủ đã ghi xong…
        await r.abort('connectionreset'); // …nhưng trang không nhận được phản hồi
      } else r.continue();
    });
    const lost = await save('TÀU D', 4, 23000);
    await ctx.unroute('**/db/tx');
    check(lost === false, 'trang thấy lỗi mạng → báo chưa lưu được');
  } else {
    check((await save('TÀU D', 4, 23000)) === true, 'IndexedDB: lưu TÀU D (không có tình huống mất phản hồi)');
  }
  check((await save('TÀU D', 4, 23000)) === true, 'người dùng bấm lưu lại → thành công');
  s = await snap();
  check(s.list.filter((x) => x.startsWith('TÀU D')).length === 1, 'đúng MỘT hồ sơ TÀU D (không trùng)', JSON.stringify(s.list));

  console.log('4) Xóa một hồ sơ');
  const delId = await p.evaluate(async () => (await HAK.Archive.list()).find((m) => m.ship === 'TÀU B').id);
  await p.evaluate((id) => HAK.Archive.remove(id), delId);
  s = await snap();
  check(
    !s.list.some((x) => x.startsWith('TÀU B')) && s.list.length === 3,
    'xóa TÀU B: còn 3 hồ sơ, không dữ liệu mồ côi',
    JSON.stringify(s.list)
  );
  const orphan = await p.evaluate(async (id) => {
    try {
      await HAK.Archive.load(id);
      return false;
    } catch (e) {
      return true;
    }
  }, delId);
  check(orphan, 'dữ liệu của hồ sơ đã xóa không còn (đọc báo không tìm thấy)');
  check(s.issues.length === 0, 'mục lục ↔ nội dung khớp sau khi xóa', JSON.stringify(s.issues));

  console.log('5) Kiểm tra bắt được hồ sơ lệch (chứng minh phép kiểm có tác dụng)');
  const flagged = await p.evaluate(async () => {
    const m = (await HAK.Archive.list()).find((x) => x.ship === 'TÀU A');
    const data = await HAK.Archive.load(m.id);
    return [
      HAK.Archive.indexIssues(Object.assign({}, m, { trips: m.trips + 1 }), data).length,
      HAK.Archive.indexIssues(Object.assign({}, m, { kg: m.kg + 5 }), data).length,
      HAK.Archive.indexIssues(Object.assign({}, m, { nonPosTrips: 3 }), data).length,
      HAK.Archive.indexIssues(m, data).length,
    ];
  });
  check(
    JSON.stringify(flagged) === '[1,1,1,0]',
    'lệch số phiếu / kg / phiếu KL ≤ 0 đều bị báo; hồ sơ đúng không bị báo',
    JSON.stringify(flagged)
  );
  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
