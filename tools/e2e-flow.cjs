/* Kiểm thử xuyên màn hình trên trình duyệt thật (Chromium/Edge/Chrome qua Playwright), dùng Excel mẫu có HAI TÀU CÂN XEN KẼ cùng ngày:
 *   nhập Excel → đổi sheet → (sheet trùng bị từ chối) → chọn phiếu của một tàu → đánh dấu xe trả về → lưu → Thêm mới → mở lại → xuất Excel
 *   → Lưu trữ → Báo cáo (ngày bắt đầu / ngày cân; hồ sơ lỗi đọc chi tiết → phần chưa phân bổ).
 * Đối chiếu mã phiếu, số chuyến, tấn qua cân / thực giao giữa màn hình, hồ sơ đã lưu, file xuất, Lưu trữ và Báo cáo.
 * Chạy: npm run e2e (cần playwright; trong CI cài riêng). Biến HAK_CHROMIUM = đường dẫn trình duyệt khác (vd Edge). Thoát mã 1 nếu có sai lệch. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const T = 'uythac'; // loại có "xe trả về"
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2e-'));
const failures = [],
  check = (cond, msg) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
    if (!cond) failures.push(msg);
  };

/* ---- Excel mẫu ---- */
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
const R = (t, plate, dt, net) => [t, plate, dt, net + 10000, 10000, net];
const DATA = [
  R('T01', '43C-11111', '03/02/2026 07:00', 20000),
  R('T02', '51C-44444', '03/02/2026 07:45', 25000),
  R('T03', '43C-22222', '03/02/2026 08:30', 21000),
  R('T04', '51C-55555', '03/02/2026 09:15', 26000),
  R('T05', '43C-11111', '04/02/2026 07:10', 19000),
  R('T06', '51C-44444', '04/02/2026 08:00', 24000),
  R('T07', '43C-33333', '04/02/2026 09:00', 22000),
  R('T08', '51C-66666', '04/02/2026 10:00', 27000),
];
const SHIP_A = ['T01', 'T03', 'T05', 'T07'],
  RETURNED = 'T03';
const kgOf = (ids) => DATA.filter((r) => ids.includes(r[0])).reduce((a, r) => a + r[5], 0);
const book = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [n, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
  return wb;
};
const write = (name, wb) => {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return f;
};
const twoShips = write('hai-tau.xlsx', book({ CanThu: [H, R('X1', '43C-99999', '01/02/2026 06:00', 5000)], CanChinh: [H].concat(DATA) }));
const dupSheet = write('sheet-trung.xlsx', book({ A_sach: [H, DATA[0], DATA[1]], B_trung: [H, DATA[0], DATA[0], DATA[1]] }));

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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage(),
    errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  const screen = () =>
    p.evaluate(
      (t) => ({
        trips: document.getElementById('sumTrips-' + t).textContent,
        tons: document.getElementById('sumTons-' + t).textContent,
        list: Array.from(document.querySelectorAll('#sumList-' + t + ' li')).map((li) => li.innerText.replace(/\s+/g, ' ')),
      }),
      T
    );
  const toasts = () =>
    p.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
  const clearToasts = () => p.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
  const goto = async (h) => {
    await p.evaluate((x) => {
      location.hash = x;
    }, h);
    await p.waitForTimeout(700);
  };

  console.log('1) Nhập Excel nhiều sheet; sheet có dòng trùng bị từ chối, giữ sheet sạch');
  await goto('#/file');
  await p.click('[data-ft="' + T + '"]');
  await p.waitForTimeout(300);
  await p.setInputFiles('#fileInput', dupSheet);
  await p.waitForTimeout(1800);
  const st = () =>
    p.evaluate(() => ({ sheet: HAK.App.sheet, rows: HAK.App.ds.rows.length, sel: document.getElementById('sheetSelect').value }));
  check((await st()).sheet === 'A_sach' && (await st()).rows === 2, 'nạp file: dùng sheet sạch A_sach (2 dòng)');
  await clearToasts();
  await p.selectOption('#sheetSelect', 'B_trung');
  await p.waitForTimeout(900);
  const afterB = await st(),
    tB = (await toasts()).join(' ');
  check(
    afterB.sheet === 'A_sach' && afterB.rows === 2 && afterB.sel === 'A_sach',
    'đổi sang sheet B bị từ chối: giữ sheet A, ô chọn quay về A'
  );
  check(
    /sheet "B_trung"/.test(tB) && /phiếu T01/.test(tB) && /dòng Excel 2, 3/.test(tB),
    'thông báo nêu đúng sheet B_trung, số phiếu T01, dòng Excel 2, 3'
  );
  await p.evaluate(() => {
    HAK.App.slot().batches.length = 0;
  });
  await goto('#/file');

  console.log('2) Hai tàu cân xen kẽ: nhập → đổi sheet → chọn phiếu → xe trả về → lưu');
  await p.reload();
  await p.waitForFunction(() => window.HAK && HAK.App, null, { timeout: 20000 });
  await p.waitForTimeout(1200);
  {
    const co = await p.$('[data-co="hak"]');
    if (co && (await co.isVisible())) {
      await co.click();
      await p.waitForTimeout(1500);
    }
  }
  await goto('#/file');
  await p.click('[data-ft="' + T + '"]');
  await p.waitForTimeout(300);
  await p.setInputFiles('#fileInput', twoShips);
  await p.waitForTimeout(1800);
  check((await st()).sheet === 'CanThu', 'nạp file: mặc định sheet đầu CanThu');
  await p.selectOption('#sheetSelect', 'CanChinh');
  await p.waitForTimeout(900);
  check((await st()).sheet === 'CanChinh' && (await st()).rows === 8, 'đổi sang CanChinh: 8 phiếu của hai tàu');
  await goto('#/' + T);
  let s = await screen();
  check(s.trips === '8' && s.tons === '184,00', 'khi chưa chọn riêng: 8 phiếu · 184,00 tấn (cả hai tàu)');
  await p.click('#btnPick-' + T);
  await p.waitForTimeout(500);
  await p.fill('#pickPaste', SHIP_A.join('\n'));
  await p.click('#pickApply');
  await p.waitForTimeout(500);
  await p.click('#pickModal button:has-text("Xong")');
  await p.waitForTimeout(700);
  await p.click('#btnReturn-' + T);
  await p.waitForTimeout(500);
  await p.fill('#retPaste', RETURNED);
  await p.click('#retApply');
  await p.waitForTimeout(500);
  await p.click('#returnModal button:has-text("Xong")');
  await p.waitForTimeout(700);
  const retKg = kgOf([RETURNED]),
    wantKg = kgOf(SHIP_A),
    wantDel = wantKg - retKg;
  const fmt = (kg) => (kg / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  s = await screen();
  check(s.trips === '4' && s.tons === fmt(wantKg), 'màn hình: tàu A = 4 phiếu · ' + fmt(wantKg) + ' tấn qua cân');
  check(
    s.list.some((l) => l.includes('Xe trả về 1 xe · ' + fmt(retKg))) && s.list.some((l) => l.includes('Thực giao ' + fmt(wantDel))),
    'màn hình: xe trả về 1 xe · ' + fmt(retKg) + ' t; thực giao ' + fmt(wantDel) + ' tấn'
  );
  await p.click('#page-' + T + ' [data-zone="party"]');
  await p.waitForTimeout(300);
  await p.fill('#f-' + T + '-ship', 'TÀU A');
  await p.waitForTimeout(300);
  await p.click('#page-' + T + ' [data-zone="data"]');
  await p.waitForTimeout(300);
  const before = await p.evaluate((t) => {
    const c = HAK.Pages._collect(t);
    return { pick: c.filter.pick, returned: c.returned, ship: c.ship };
  }, T);
  await p.click('#page-' + T + ' [data-year-save]');
  await p.waitForTimeout(1500);
  const saved = await p.evaluate(async () =>
    (await HAK.Yearbook.read()).records.map((r) => ({
      id: r.id,
      type: r.type,
      tickets: r.rows.map((x) => x.ticket),
      returned: r.params.returned,
      pick: (r.params.filter || {}).pick,
    }))
  );
  check(
    saved.length === 1 && saved[0].tickets.join() === SHIP_A.join(),
    'hồ sơ đã lưu (Sổ hồ sơ năm): đúng 4 mã phiếu ' + SHIP_A.join(', ')
  );
  check(JSON.stringify(saved[0].returned) === JSON.stringify(before.returned), 'hồ sơ đã lưu: cùng danh sách xe trả về với màn hình');

  console.log('3) Thêm mới → mở lại');
  await p.click('#page-' + T + ' [data-year-new]');
  await p.waitForTimeout(1200);
  s = await screen();
  check(s.trips === '8', 'sau Thêm mới: trở về toàn bộ phiếu của sheet (đã bỏ chọn riêng và xe trả về)');
  await p.click('#page-' + T + ' [data-year-list]');
  await p.waitForTimeout(900);
  await p.click('#hakYearModal [data-open]');
  await p.waitForTimeout(1500);
  s = await screen();
  const after = await p.evaluate((t) => {
    const c = HAK.Pages._collect(t);
    return { pick: c.filter.pick, returned: c.returned, ship: c.ship };
  }, T);
  check(s.trips === '4' && s.tons === fmt(wantKg), 'mở lại: 4 phiếu · ' + fmt(wantKg) + ' tấn như lúc lưu');
  check(
    s.list.some((l) => l.includes('Thực giao ' + fmt(wantDel))),
    'mở lại: thực giao ' + fmt(wantDel) + ' tấn như lúc lưu'
  );
  check(JSON.stringify(after) === JSON.stringify(before), 'mở lại: phiếu chọn riêng, xe trả về và tên tàu giống hệt trước khi lưu');

  console.log('4) Xuất Excel và đối chiếu');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#xls-' + T)]);
  const xf = path.join(tmp, 'xuat.xlsx');
  await dl.saveAs(xf);
  const xw = XLSX.read(fs.readFileSync(xf)),
    aoa = XLSX.utils.sheet_to_json(xw.Sheets[xw.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  const flat = JSON.stringify(aoa),
    head = aoa
      .slice(0, 3)
      .map((r) => r.join(' '))
      .join(' | ');
  check(
    SHIP_A.every((t) => flat.includes('"' + t + '"')) && !['T02', 'T04', 'T06', 'T08'].some((t) => flat.includes('"' + t + '"')),
    'file xuất: có đủ phiếu tàu A, không lẫn phiếu tàu B'
  );
  check(flat.includes(String(wantKg)), 'file xuất: dòng tổng cộng = ' + wantKg + ' kg');
  check(
    head.includes('4 phiếu - ' + fmt(wantKg) + ' tấn') &&
      head.includes('xe trả về 1 xe (' + fmt(retKg) + ' tấn)') &&
      head.includes('chỉ 4 phiếu được chọn riêng'),
    'tiêu đề file xuất nêu số phiếu, tấn, xe trả về và phạm vi chọn riêng'
  );

  console.log('5) Lưu trữ và Báo cáo');
  const arch = await p.evaluate(async () => {
    // App lưu hồ sơ Lưu trữ bất đồng bộ SAU khi tải file xong: chờ tối đa 10 giây cho hồ sơ xuất hiện (máy chậm / SQLite); không xuất hiện thì vẫn lỗi.
    let l = await HAK.Archive.list();
    for (let i = 0; i < 50 && !l.length; i++) {
      await new Promise((ok) => setTimeout(ok, 200));
      l = await HAK.Archive.list();
    }
    const d = await HAK.Archive.load(l[0].id);
    return {
      n: l.length,
      trips: l[0].trips,
      kg: l[0].kg,
      retTrips: l[0].retTrips,
      retKg: l[0].retKg,
      tickets: d.rows.map((r) => r.ticket),
    };
  });
  check(
    arch.n === 1 &&
      arch.trips === 4 &&
      arch.kg === wantKg &&
      arch.retTrips === 1 &&
      arch.retKg === retKg &&
      arch.tickets.join() === SHIP_A.join(),
    'Lưu trữ: 4 phiếu, ' + wantKg + ' kg, trả về 1 xe ' + retKg + ' kg, đúng mã phiếu'
  );
  await goto('#/report');
  await p.waitForTimeout(1200);
  const rep = () =>
    p.evaluate(() => ({
      summary: document.getElementById('repFilterSummary').textContent,
      unalloc: (() => {
        const e = document.getElementById('repUnalloc');
        return e && !e.classList.contains('d-none') ? e.innerText.replace(/\s+/g, ' ') : '';
      })(),
      month: document.getElementById('repMonthBody').innerText.replace(/\s+/g, ' '),
    }));
  let r = await rep();
  check(
    /ngày BẮT ĐẦU/.test(r.summary) && r.month.includes(fmt(wantDel)),
    'Báo cáo (ngày bắt đầu): nhãn căn cứ đúng, tháng 02/2026 = ' + fmt(wantDel) + ' tấn thực giao'
  );
  await p.selectOption('#repBasis', 'weigh');
  await p.waitForTimeout(2000);
  r = await rep();
  check(
    /NGÀY CÂN/.test(r.summary) && r.month.includes(fmt(wantDel)) && !r.unalloc,
    'Báo cáo (ngày cân): nhãn căn cứ đúng, cùng ' + fmt(wantDel) + ' tấn, không có cảnh báo chưa phân bổ'
  );

  console.log('6) Hồ sơ lỗi đọc chi tiết (mô phỏng): báo cáo theo ngày cân phải ghi "chưa phân bổ", không tự dồn vào tháng');
  await goto('#/home');
  await p.reload();
  await p.waitForFunction(() => window.HAK && HAK.Archive && HAK.Report, null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  {
    const co = await p.$('[data-co="hak"]');
    if (co && (await co.isVisible())) {
      await co.click();
      await p.waitForTimeout(1500);
    }
  }
  await p.evaluate(() => {
    HAK.Archive.load = async () => {
      throw new Error('mô phỏng: kho dữ liệu hỏng');
    };
  });
  await goto('#/report');
  await p.waitForTimeout(2000);
  await p.selectOption('#repBasis', 'weigh');
  await p.waitForTimeout(2500);
  r = await rep();
  check(
    /Chưa phân bổ: 1 hồ sơ/.test(r.unalloc) &&
      r.unalloc.includes(fmt(wantKg) + ' tấn qua cân') &&
      r.unalloc.includes('mô phỏng: kho dữ liệu hỏng'),
    'cảnh báo nêu 1 hồ sơ, ' + fmt(wantKg) + ' tấn qua cân và nguyên nhân'
  );
  check(!r.month.includes(fmt(wantDel)), 'bảng tháng KHÔNG tự đưa số liệu hồ sơ lỗi vào tháng 02/2026');
  await clearToasts();
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }).catch(() => null), p.click('#repXls')]);
  if (dl2) {
    const f2 = path.join(tmp, 'baocao.xlsx');
    await dl2.saveAs(f2);
    const w2 = XLSX.read(fs.readFileSync(f2));
    check(w2.SheetNames.includes('Chưa phân bổ'), 'Excel báo cáo có sheet "Chưa phân bổ"');
    const tg = XLSX.utils.sheet_to_json(w2.Sheets['Tổng hợp'], { header: 1, blankrows: false });
    check(/CHỈ gồm phần đã xác minh/.test(String(tg[1] && tg[1][0])), 'ghi chú Excel nêu phạm vi chỉ gồm phần đã xác minh');
  } else check(false, 'xuất được Excel báo cáo khi mọi hồ sơ đều chưa phân bổ');

  check(errs.length === 0, 'không có lỗi script trong suốt luồng' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures.length ? '\n✗ ' + failures.length + ' sai lệch' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
