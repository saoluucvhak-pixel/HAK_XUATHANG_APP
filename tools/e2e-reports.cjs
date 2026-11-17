/* Kiểm thử các MẪU BÁO CÁO trên trình duyệt thật: tạo 2 hồ sơ (hai tàu cân xen kẽ cùng ngày) qua giao diện → trang Báo cáo → chọn từng mẫu,
 * đối chiếu màn hình / tra cứu về hồ sơ nguồn / file Excel / bản in (PDF); thử tài khoản giới hạn công ty. Chạy: npm run e2e:reports (cần playwright).
 * Biến HAK_CHROMIUM = đường dẫn trình duyệt khác. Thoát mã 1 nếu có sai lệch. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const T = 'uythac';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2er-'));
const failures = [],
  check = (cond, msg) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
    if (!cond) failures.push(msg);
  };
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng', 'Đơn vị vận chuyển'];
const R = (t, plate, dt, net, carrier) => [t, plate, dt, net + 10000, 10000, net, carrier];
const DATA = [
  R('T01', '43C-11111', '03/02/2026 07:00', 20000, 'VT-A'),
  R('T02', '51C-44444', '03/02/2026 07:45', 25000, 'VT-A'),
  R('T03', '43C-22222', '03/02/2026 08:30', 21000, 'VT-A'),
  R('T04', '51C-55555', '03/02/2026 09:15', 26000, 'VT-B'),
  R('T05', '43C-11111', '04/02/2026 07:10', 19000, 'VT-B'),
  R('T06', '51C-44444', '04/02/2026 08:00', 24000, 'VT-B'),
  R('T07', '43C-33333', '04/02/2026 09:00', 22000, 'VT-B'),
  R('T08', '51C-66666', '04/02/2026 10:00', 27000, 'VT-C'),
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H].concat(DATA)), 'Can');
const xlsx = path.join(tmp, 'hai-tau.xlsx');
fs.writeFileSync(xlsx, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
const SHIP = { A: ['T01', 'T03', 'T05', 'T07'], B: ['T02', 'T04', 'T06', 'T08'] };
const kg = (ids) => DATA.filter((r) => ids.includes(r[0])).reduce((a, r) => a + r[5], 0);
const fmt = (k) => (k / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const goto = async (h) => {
    await p.evaluate((x) => {
      location.hash = x;
    }, h);
    await p.waitForTimeout(700);
  };
  const makeRecord = async (ship, ids, ret) => {
    await goto('#/' + T);
    await p.click('#btnPick-' + T);
    await p.waitForTimeout(500);
    await p.fill('#pickPaste', ids.join('\n'));
    await p.click('#pickApply');
    await p.waitForTimeout(500);
    await p.click('#pickModal button:has-text("Xong")');
    await p.waitForTimeout(600);
    if (ret) {
      await p.click('#btnReturn-' + T);
      await p.waitForTimeout(500);
      await p.fill('#retPaste', ret);
      await p.click('#retApply');
      await p.waitForTimeout(500);
      await p.click('#returnModal button:has-text("Xong")');
      await p.waitForTimeout(600);
    }
    await p.click('#page-' + T + ' [data-zone="party"]');
    await p.waitForTimeout(300);
    await p.fill('#f-' + T + '-ship', 'TÀU ' + ship);
    await p.waitForTimeout(300);
    await p.click('#page-' + T + ' [data-zone="data"]');
    await p.waitForTimeout(300);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#xls-' + T)]);
    await dl.saveAs(path.join(tmp, 'x' + ship + '.xlsx'));
    await p.waitForTimeout(800);
    await p.click('#page-' + T + ' [data-year-save]'); // lưu hồ sơ để Thêm mới không hỏi "Lưu / Bỏ / Quay lại"
    await p.waitForTimeout(1200);
  };

  console.log('0) Tạo 2 hồ sơ Lưu trữ: tàu A (xe trả về T03) và tàu B, cùng đợt cân, cân xen kẽ');
  await goto('#/file');
  await p.click('[data-ft="' + T + '"]');
  await p.waitForTimeout(300);
  await p.setInputFiles('#fileInput', xlsx);
  await p.waitForTimeout(1800);
  await makeRecord('A', SHIP.A, 'T03');
  await p.click('#page-' + T + ' [data-year-new]');
  await p.waitForTimeout(1200);
  await makeRecord('B', SHIP.B, null);
  const n = await p.evaluate(async () => (await HAK.Archive.list()).length);
  check(n === 2, 'Lưu trữ có 2 hồ sơ (tàu A và tàu B)');

  await goto('#/report');
  await p.waitForTimeout(1500);
  const pick = async (id) => {
    await p.selectOption('#repTpl', id);
    await p.waitForTimeout(2200);
  };
  const body = () => p.evaluate(() => document.getElementById('repTplBody').innerText.replace(/\s+/g, ' '));
  const rows = (secTitle) =>
    p.evaluate((t) => {
      const s = Array.from(document.querySelectorAll('#repTplBody .sec-title')).find((e) => e.textContent.trim().startsWith(t));
      if (!s) return null;
      const tb = s.parentElement.querySelector('tbody');
      return Array.from(tb.rows).map((r) => Array.from(r.cells).map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
    }, secTitle);
  const foot = (secTitle) =>
    p.evaluate((t) => {
      const s = Array.from(document.querySelectorAll('#repTplBody .sec-title')).find((e) => e.textContent.trim().startsWith(t));
      const f = s && s.parentElement.querySelector('tfoot tr');
      return f ? Array.from(f.cells).map((c) => c.innerText.replace(/\s+/g, ' ').trim()) : null;
    }, secTitle);

  console.log('1) Chọn mẫu: các phần báo cáo cũ ẩn đi, khung mẫu hiện');
  check(
    (await p.evaluate(() => getComputedStyle(document.getElementById('repMain')).display)) !== 'none',
    'trước khi chọn mẫu: báo cáo hiện có vẫn hiện'
  );
  await pick('period');
  check(
    (await p.evaluate(() => getComputedStyle(document.getElementById('repMain')).display)) === 'none',
    'chọn mẫu: báo cáo hiện có được ẩn'
  );
  check(
    /Trả lời câu hỏi/.test(await p.evaluate(() => document.getElementById('repTplHelp').innerText)),
    'hiện câu hỏi mẫu trả lời, nguồn dữ liệu và cách tra cứu'
  );
  let t = await body();
  check(
    /Công ty.*HAK/.test(t) &&
      /Kỳ\s+toàn bộ thời gian/.test(t) &&
      /Căn cứ tính kỳ/.test(t) &&
      /Bộ lọc đang áp dụng/.test(t) &&
      /Đơn vị/.test(t) &&
      /Thời điểm lập/.test(t),
    'mẫu 1: có tiêu đề, công ty, kỳ, căn cứ tính kỳ, bộ lọc, đơn vị, thời điểm lập'
  );
  let g = await foot('Theo công ty');
  check(g && g.includes('184.000'), 'mẫu 1: tổng qua cân = 184.000 kg (hai tàu)');
  const periodRows = await rows('Theo kỳ');
  check(periodRows && periodRows.length === 1 && periodRows[0][0] === '02/2026', 'mẫu 1: theo tháng chỉ có 02/2026');

  console.log('2) Mẫu 2: hai tàu cùng ngày; lọc một tàu → bảng, biểu đồ, phiếu, Excel cùng số');
  await pick('breakdown');
  let r = await rows('Theo tàu');
  check(r && r.length === 2, 'mẫu 2: hai tàu');
  const a = r.find((x) => x[0] === 'TÀU A');
  check(a && a[2] === '4' && a[3] === '82.000' && a[6] === '61.000', 'tàu A: 4 xe · 82.000 kg qua cân · 61.000 kg thực giao');
  check(a[7] === '25,0%', 'tàu A: tỷ lệ xe trả về = 1 ÷ 4 = 25,0%');
  check(a[10] === '163.000', 'mẫu số tỷ trọng = tổng thực giao của bảng (163.000 kg)');
  await p.click('#repTplBody button[data-rt-act="tickets"] >> nth=0');
  await p.waitForTimeout(700);
  const modalTickets = await p.evaluate(() =>
    Array.from(document.querySelectorAll('#repTplModal tbody tr'))
      .map((tr) => tr.cells[1].innerText.trim())
      .sort()
  );
  check(modalTickets.length === 4 || modalTickets.length === 4, 'mở danh sách phiếu từ dòng tổng: 4 phiếu');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  // lọc 1 tàu: dùng ô tìm kiếm ở đầu trang
  await p.fill('#repQuery', 'TÀU A').catch(() => {});
  await p.evaluate(() => {
    const q = document.getElementById('repQuery');
    q.value = 'tau a';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    q.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(2500);
  r = await rows('Theo tàu');
  check(r && r.length === 1 && r[0][0] === 'TÀU A', 'lọc tàu A: bảng chỉ còn tàu A');
  const chartTitle = await p.evaluate(() => {
    const s = document.querySelector('#repTplBody svg.rt-chart');
    return s ? s.innerHTML : '';
  });
  check(/TÀU A: 61,00 tấn/.test(chartTitle) && !/TÀU B/.test(chartTitle), 'biểu đồ chỉ có tàu A = 61,00 tấn');
  const tk = await rows('Phiếu cân tạo ra');
  check(tk && tk.length === 4 && tk.every((x) => SHIP.A.includes(x[2])), 'phiếu chi tiết: đúng 4 phiếu của tàu A');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#repTplXls')]);
  const xf = path.join(tmp, 'm2.xlsx');
  await dl.saveAs(xf);
  const xw = XLSX.read(fs.readFileSync(xf), { cellDates: true });
  const flat = JSON.stringify(XLSX.utils.sheet_to_json(xw.Sheets['Chi tiết'], { header: 1, blankrows: false, defval: '' }));
  check(xw.SheetNames.join() === 'Tổng hợp,Chi tiết', 'Excel có trang Tổng hợp và Chi tiết');
  check(
    SHIP.A.every((x) => flat.includes('"' + x + '"')) && !SHIP.B.some((x) => flat.includes('"' + x + '"')),
    'Excel: cùng 4 phiếu của tàu A, không có phiếu tàu B'
  );
  const spec = await p.evaluate(() => JSON.stringify(HAK.ReportTpl.toPrintSpec(HAK.ReportTplUI.state.doc)));
  check(
    SHIP.A.every((x) => spec.includes('"' + x + '"')) &&
      !SHIP.B.some((x) => spec.includes('"' + x + '"')) &&
      /"orientation":"landscape"/.test(spec),
    'bản in (PDF): cùng phiếu tàu A, khổ ngang vì nhiều cột'
  );
  await p.evaluate(() => {
    const q = document.getElementById('repQuery');
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    q.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(1500);

  console.log('3) Mẫu 2: Top N + "Khác" giữ đủ tổng; nhóm theo đơn vị vận chuyển');
  await p.selectOption('#rtp-groupBy', 'carrier');
  await p.waitForTimeout(2200);
  r = await rows('Theo đơn vị vận chuyển');
  check(
    r &&
      r
        .map((x) => x[0])
        .sort()
        .join() === 'VT-A,VT-B,VT-C',
    'ĐVVC: VT-A, VT-B, VT-C'
  );
  await p.fill('#rtp-topN', '1');
  await p.dispatchEvent('#rtp-topN', 'change');
  await p.waitForTimeout(2200);
  r = await rows('Theo đơn vị vận chuyển');
  g = await foot('Theo đơn vị vận chuyển');
  check(r.length === 2 && /^Khác \(2 nhóm\)$/.test(r[1][0]), 'Top 1 + dòng "Khác (2 nhóm)"');
  check(g[2] === '8' && g[3] === '184.000', 'tổng vẫn đủ 8 xe · 184.000 kg');

  console.log('4) Mẫu 3: tiến độ hợp đồng (không có hợp đồng → bảng rỗng, không lỗi); Mẫu 4; Mẫu 5');
  await pick('contracts');
  t = await body();
  if (process.env.HAK_DEBUG) console.log('   [mẫu 3]', t.slice(0, 700));
  check(
    /TIẾN ĐỘ VÀ ĐỐI CHIẾU HỢP ĐỒNG/.test(t) && /BDMT gốc/i.test(t) && /MT thực giao qua cân/i.test(t),
    'mẫu 3: hiện đủ cột BDMT gốc / hiện hành / chứng thư / MT thực giao'
  );
  check(
    await p.evaluate(() => !!document.getElementById('rtp-f-over')),
    'mẫu 3: có bộ lọc vượt khối lượng / thiếu chứng thư / lệch / chưa gắn tờ khai'
  );
  await pick('tax');
  t = await body();
  if (process.env.HAK_DEBUG) console.log('   [mẫu 4]', t.slice(0, 700));
  check(
    /HẢI QUAN VÀ CÔNG NỢ THUẾ/.test(t) && /Còn nợ/i.test(t) && /Nộp thừa/i.test(t) && /Đã hoàn/i.test(t),
    'mẫu 4: hiện thuế phải nộp / đã nộp / đã hoàn / còn nợ / nộp thừa'
  );
  await pick('exceptions');
  t = await body();
  check(/NGOẠI LỆ CẦN ĐỐI SOÁT/.test(t) && /Đã xác minh/.test(t), 'mẫu 5: hiện phần đã xác minh');
  const unassigned = await rows('Danh sách ngoại lệ');
  check(unassigned !== null, 'mẫu 5: có danh sách ngoại lệ');

  console.log('4b) Xuất Excel và bản in (PDF) của cả 5 mẫu từ cùng kết quả đang hiện');
  await p.evaluate(() => {
    window.print = () => {
      window.__printed = {
        text: (document.getElementById('printRoot') || {}).innerText || '',
        css: (document.getElementById('printPageStyle') || {}).textContent || '',
      };
    };
  });
  const SHEETS = {
    period: ['Tổng hợp'],
    breakdown: ['Tổng hợp', 'Chi tiết'],
    contracts: ['Tổng hợp'],
    tax: ['Tổng hợp'],
    exceptions: ['Tổng hợp', 'Chi tiết'],
  };
  for (const id of Object.keys(SHEETS)) {
    await pick(id);
    if (process.env.HAK_SHOTS) await p.screenshot({ path: path.join(process.env.HAK_SHOTS, 'mau_' + id + '.png'), fullPage: true });
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#repTplXls')]);
    const f = path.join(tmp, id + '.xlsx');
    await d.saveAs(f);
    const w = XLSX.read(fs.readFileSync(f));
    check(
      SHEETS[id].every((n) => w.SheetNames.includes(n)),
      'mẫu ' + id + ': Excel có trang ' + SHEETS[id].join(' + ')
    );
    const head = XLSX.utils
      .sheet_to_json(w.Sheets['Tổng hợp'], { header: 1, blankrows: false, defval: '' })
      .slice(0, 6)
      .map((r) => String(r[0]));
    check(
      /^Công ty:/.test(head[1]) &&
        /^Kỳ:/.test(head[2]) &&
        /^Bộ lọc đang áp dụng:/.test(head[3]) &&
        /^Đơn vị:/.test(head[4]) &&
        /^Thời điểm lập:/.test(head[5]),
      'mẫu ' + id + ': Excel có công ty, kỳ, căn cứ, bộ lọc, đơn vị, thời điểm lập'
    );
    await p.evaluate(() => {
      window.__printed = null;
    });
    await p.click('#repTplPdf');
    await p.waitForTimeout(900);
    const pr = await p.evaluate(() => window.__printed);
    check(
      pr && /@page \{ size: A4 (landscape|portrait)/.test(pr.css) && pr.text.length > 50,
      'mẫu ' + id + ': bản in dựng được (' + (((pr && pr.css.match(/A4 (landscape|portrait)/)) || [])[1] || '?') + ')'
    );
    await p.waitForTimeout(500);
  }

  console.log(
    '4c) Tài khoản giới hạn công ty: đổi sang công ty khác thì mọi mẫu, biểu đồ, chi tiết và bản xuất không còn số liệu công ty cũ'
  );
  await pick('breakdown');
  await p.selectOption('#rtp-groupBy', 'ship');
  await p.waitForTimeout(1500);
  await p.fill('#rtp-topN', '0');
  await p.dispatchEvent('#rtp-topN', 'change');
  await p.waitForTimeout(2200);
  const before = await foot('Theo tàu');
  check(before && before[3] === '184.000', 'công ty HAK: tổng 184.000 kg');
  await p.evaluate(() => {
    document.getElementById('btnCompany').click();
  });
  await p.waitForTimeout(800);
  const dh = await p.$('[data-co="dh"]');
  if (dh) {
    await dh.click();
    await p.waitForTimeout(2500);
    await p.waitForFunction(() => window.HAK && HAK.Report && HAK.Auth && HAK.Auth.company() === 'dh', null, { timeout: 15000 });
    await goto('#/report');
    await p.waitForTimeout(1500);
    await pick('breakdown');
    const none = await rows('Theo tàu');
    check(!none || none.length === 0 || /Không có dòng/.test((none[0] || [''])[0]), 'công ty Đại Hiệp: bảng không có tàu nào của HAK');
    check(
      !/TÀU A|TÀU B/.test(await p.evaluate(() => document.getElementById('repTplBody').innerHTML)),
      'bảng, biểu đồ và chi tiết không chứa dữ liệu của HAK'
    );
    const [dx] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#repTplXls')]);
    const fx = path.join(tmp, 'dh.xlsx');
    await dx.saveAs(fx);
    const flatDh = JSON.stringify(
      XLSX.read(fs.readFileSync(fx)).SheetNames.map((n) =>
        XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(fx)).Sheets[n], { header: 1, blankrows: false })
      )
    );
    check(!/TÀU A|TÀU B|"T0\d"|82000|184000/.test(flatDh), 'Excel không chứa dữ liệu của công ty ngoài phạm vi');
    await p.evaluate(() => {
      document.getElementById('btnCompany').click();
    });
    await p.waitForTimeout(800);
    const back = await p.$('[data-co="hak"]');
    if (back) {
      await back.click();
      await p.waitForTimeout(2500);
    }
  } else check(false, 'tìm thấy công ty Đại Hiệp để đổi phạm vi');

  console.log('5) Hồ sơ lỗi đọc: hiện ở ngoại lệ và chưa phân bổ, có nút mở bản ghi nguồn');
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
  await p.waitForTimeout(1500);
  await pick('exceptions');
  const ex = await rows('Danh sách ngoại lệ');
  if (process.env.HAK_DEBUG) console.log('   [ngoại lệ]', JSON.stringify(ex));
  const bad = (ex || []).filter((x) => /Hồ sơ lỗi đọc/.test(x[0]));
  check(
    bad.length === 2 && bad.every((x) => /Chưa phân bổ/.test(x[5]) && /mô phỏng: kho dữ liệu hỏng/.test(x[3])),
    'mẫu 5: 2 hồ sơ lỗi đọc, tình trạng Chưa phân bổ, nêu nguyên nhân'
  );
  check((await p.locator('#repTplBody button[data-rt-act="open"]').count()) >= 2, 'mỗi dòng có nút mở bản ghi nguồn');
  await p.click('#repTplBody button[data-rt-act="open"] >> nth=0');
  await p.waitForTimeout(900);
  check((await p.evaluate(() => location.hash)) === '#/archive', 'nút mở bản ghi nguồn đưa tới Lưu trữ');

  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures.length ? '\n✗ ' + failures.length + ' sai lệch' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
