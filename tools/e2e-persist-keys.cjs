/* E2E A1: cài đặt người dùng ghi bằng khóa hak.* (bộ lọc đã lưu · Năm làm việc · giao diện) phải BỀN khi mở lại app — trên IndexedDB và SQLite
 * (trước đây ghi thẳng localStorage nên HAK.Storage.hydrate() của SQLite xóa mất), giữ giá trị cũ khi nâng cấp, và có trong sao lưu → khôi phục.
 * Chạy:  node tools/e2e-persist-keys.cjs   và   node tools/e2e-sqlite.cjs tools/e2e-persist-keys.cjs. Dữ liệu giả lập. */
const { chromium } = require('playwright');
const path = require('node:path');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const failures = [];
const check = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) failures.push(m);
};
async function afterLoad(p) {
  await p.waitForFunction(() => window.HAK && HAK.Archive && HAK.Store && HAK.Yearbook, null, { timeout: 25000 });
  await p.waitForTimeout(2500);
  const co = await p.$('[data-co="hak"]');
  if (co && (await co.isVisible())) {
    await co.click();
    await p.waitForTimeout(2000);
  }
}
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
const reload = async (p) => {
  await p.reload();
  await afterLoad(p);
};
const state = (p) =>
  p.evaluate(() => {
    const st = HAKCore.sf.presets(HAK.Filters.presetStorage);
    return {
      presets: st.list('archive'),
      theme: document.documentElement.dataset.hakTheme,
      year: HAK.Yearbook.year,
      backend: (HAK.Storage && HAK.Storage.mode) || 'idb',
    };
  });
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  const first = await state(p);
  console.log('Backend: ' + first.backend);

  console.log('1) Lưu bộ lọc, đổi giao diện, đổi Năm làm việc → mở lại app 2 lần: còn');
  await p.evaluate(() => HAKCore.sf.presets(HAK.Filters.presetStorage).save('archive', 'BL-A1', { sel: { type: ['xuatkhau'] } }));
  await p.selectOption('#hakDesignTheme', 'classic');
  await p.fill('#hakWorkingYear', '2024');
  await p.dispatchEvent('#hakWorkingYear', 'change');
  await p.waitForTimeout(800);
  let s = await state(p);
  check(s.presets.includes('BL-A1') && s.theme === 'classic' && s.year === 2024, 'ngay sau khi đặt: bộ lọc, giao diện classic, năm 2024');
  for (const n of [1, 2]) {
    await reload(p);
    s = await state(p);
    check(s.presets.includes('BL-A1'), 'mở lại lần ' + n + ': bộ lọc đã lưu còn (' + JSON.stringify(s.presets) + ')');
    check(s.theme === 'classic', 'mở lại lần ' + n + ': giao diện còn classic (' + s.theme + ')');
    check(s.year === 2024, 'mở lại lần ' + n + ': Năm làm việc còn 2024 (' + s.year + ')');
  }

  console.log('2) Sao lưu → xóa 3 khóa → khôi phục: còn nguyên');
  const text = await p.evaluate(async () => (await HAK.Backup.buildFull()).parts.join(''));
  check(/hak\.sf\.presets/.test(text) && /hak\.workingYear/.test(text) && /hak\.design\.theme/.test(text), 'file sao lưu có đủ 3 khóa');
  await p.evaluate(() => ['hak.sf.presets', 'hak.workingYear', 'hak.design.theme'].forEach((k) => HAK.Store.remove(k)));
  await p.waitForTimeout(500);
  await reload(p);
  s = await state(p);
  check(!s.presets.includes('BL-A1') && s.year !== 2024, 'sau khi xóa và mở lại: đã mất (đúng như mong đợi trước khi khôi phục)');
  const r = await p.evaluate(async (txt) => {
    try {
      await HAK.Backup.restoreFile(new File([txt], 'sao-luu.json', { type: 'application/json' }), { mode: 'replace', keepAuth: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: String((e && e.message) || e) };
    }
  }, text);
  check(r.ok, 'khôi phục chạy được' + (r.ok ? '' : ': ' + r.msg));
  await reload(p);
  s = await state(p);
  check(
    s.presets.includes('BL-A1') && s.theme === 'classic' && s.year === 2024,
    'sau khôi phục + mở lại: bộ lọc, giao diện, năm đều về đúng (' + JSON.stringify(s) + ')'
  );

  console.log('3) Nâng cấp: khóa cũ ghi thẳng localStorage (bản trước) không bị mất khi mở app');
  await p.evaluate(() => {
    ['hak.sf.presets', 'hak.workingYear', 'hak.design.theme'].forEach((k) => HAK.Store.remove(k));
    // giả lập bản cũ: ghi thẳng localStorage, KHÔNG qua HAK.Store (nên chưa có trong kv)
    localStorage.setItem(
      'hak.sf.presets',
      JSON.stringify({
        schema: 1,
        screens: { archive: { 'BL-CU': { state: { sel: { type: ['uythac'] } }, savedAt: '2026-01-01T00:00:00.000Z' } } },
      })
    );
    localStorage.setItem('hak.workingYear', '2023');
    localStorage.setItem('hak.design.theme', JSON.stringify('neutral'));
  });
  for (const n of [1, 2]) {
    await reload(p);
    s = await state(p);
    check(
      s.presets.includes('BL-CU') && s.year === 2023 && s.theme === 'neutral',
      'khóa cũ còn sau lần mở ' + n + ' (' + JSON.stringify(s) + ')'
    );
  }
  if (first.backend === 'sqlite') {
    console.log('4) SQLite: khóa lạ của nguồn khác KHÔNG bị đẩy vào file .db; khóa danh sách trắng được chuyển một lần');
    await p.evaluate(() => {
      HAK.Store.remove('hak.workingYear');
      // giả lập dữ liệu còn sót của một nguồn khác trong localStorage (không có trong kv của file .db hiện tại)
      localStorage.setItem('hak.ngoai.v1', JSON.stringify({ nguon: 'B' }));
      localStorage.setItem('hak.workingYear', '2022');
    });
    await p.waitForTimeout(1500); // localStorage ghi ở tiến trình này cần thời gian lan sang trang mới sau khi tải lại
    for (const n of [1, 2]) {
      await reload(p);
      const kv = await p.evaluate(async () => ((await HAK.Storage.call('/db/query', { table: 'kv' })).rows || []).map((r) => r.key));
      const ls = await p.evaluate(() => [localStorage.getItem('hak.ngoai.v1'), localStorage.getItem('hak.workingYear')]);
      check(!kv.includes('hak.ngoai.v1') && ls[0] === null, 'lần mở ' + n + ': khóa lạ không vào kv và bị xóa khỏi bản đệm');
      check(
        kv.includes('hak.workingYear') && (await state(p)).year === 2022,
        'lần mở ' + n + ': khóa danh sách trắng đã chuyển vào kv (năm 2022)'
      );
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
