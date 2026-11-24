/* Nghiệm thu bản phát hành trên trình duyệt thật (dữ liệu thử tự tạo, không đụng dữ liệu thật):
 *  A. hai tàu cân xen kẽ cùng ngày, số phiếu tàu B là ĐUÔI số phiếu tàu A (0101 / 101): chọn phiếu, xe trả về,
 *     xuất Word / Excel / PDF (bản in thật → file PDF) rồi ĐỌC LẠI từng file để đối chiếu mã phiếu, kg, tiếng Việt;
 *  B. lưu tàu A → Thêm mới → lưu tàu B → mở lại cả hai;
 *  C. hợp đồng có phụ lục + hai tờ khai (nợ 20 / nộp thừa 20) → mẫu "Tiến độ hợp đồng" (BDMT có / chưa có số chứng thư) và "Hải quan và công nợ thuế";
 *  D. PDF báo cáo dài: tiêu đề bảng lặp ở mọi trang, đủ dòng, mọi cột nằm trong khổ trang, tiếng Việt đủ dấu.
 * Chạy: npm run accept            (thiếu bước nào thì "bỏ qua" và báo riêng)
 *       npm run accept:release    (chế độ phát hành: Word và PDF BẮT BUỘC; bỏ qua = lỗi, chỉ rõ ca chưa xác minh)
 * Không cần công cụ ngoài (unzip, pdftotext): đọc DOCX bằng JSZip có sẵn trong app/libs, đọc PDF bằng pdfjs-dist (devDependency) — chạy như nhau trên Windows và Linux.
 * Trình duyệt: mặc định Chromium của Playwright; HAK_BROWSER_CHANNEL=msedge | chrome để dùng Edge / Chrome đã cài (Windows); HAK_CHROMIUM=<đường dẫn> cho trình duyệt khác.
 * HAK_APP_DIR=<thư mục chứa index.html> để thử gói portable (vd dist/app). Thoát mã 1 nếu có ca lỗi (hoặc, ở --release, có ca bỏ qua).
 * Chưa kiểm được bằng script này: bộ cài Windows, Google Sheet thật (xem docs/INTEGRATION.md). */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const JSZip = require('../app/libs/jszip.min.js');
const RELEASE = process.argv.includes('--release') || process.env.HAK_ACCEPT_RELEASE === '1';
const APP_DIR = path.resolve(process.env.HAK_APP_DIR || path.join(__dirname, '../app'));
const APP = require('node:url').pathToFileURL(path.join(APP_DIR, 'index.html')).href; // đúng cả với đường dẫn Windows (C:\\...)
const T = 'uythac';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-accept-'));
const counts = { pass: 0, fail: 0, skip: 0 };
const failed = [],
  skipped = [];
const check = (ok, msg, extra) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg + (extra ? '  → ' + extra : ''));
  if (ok) counts.pass++;
  else {
    counts.fail++;
    failed.push(msg);
  }
};
/** Ca KHÔNG chạy được: ở --release là lỗi (chưa xác minh), ngược lại chỉ báo "bỏ qua". */
const skip = (msg) => {
  console.log((RELEASE ? '  ✗ CHƯA XÁC MINH: ' : '  - bỏ qua: ') + msg);
  counts.skip++;
  skipped.push(msg);
};
let pdfjs = null;
let pdfjsReady = Promise.resolve();
if (process.env.HAK_ACCEPT_NO_PDF !== '1') {
  pdfjsReady = import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((module) => {
      pdfjs = module;
    })
    .catch(() => {
      pdfjs = null;
    });
} // HAK_ACCEPT_NO_PDF=1: giả lập thiếu công cụ đọc PDF (để thử chế độ --release phải báo lỗi)
/** Chữ trong DOCX: đọc word/document.xml bằng JSZip (không cần unzip). */
const docxText = async (file) => {
  const z = await JSZip.loadAsync(fs.readFileSync(file));
  const f = z.file('word/document.xml');
  if (!f) throw new Error('không phải file DOCX hợp lệ (thiếu word/document.xml)');
  return (await f.async('string')).replace(/<[^>]+>/g, ' ');
};
/** Đọc lại PDF bằng pdfjs: chữ từng trang, khổ trang và phần chữ có tràn ra ngoài lề trang không. */
const readPdf = async (file) => {
  if (!pdfjs) throw new Error('thiếu pdfjs-dist (chạy npm ci)');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i),
      [x0, y0, x1, y1] = pg.view,
      tc = await pg.getTextContent();
    let maxX = -1e9,
      minX = 1e9;
    tc.items.forEach((it) => {
      if (!String(it.str).trim()) return;
      const x = it.transform[4];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + (it.width || 0));
    });
    pages.push({ text: tc.items.map((it) => it.str).join(' '), width: x1 - x0, height: y1 - y0, minX, maxX });
  }
  return { n: doc.numPages, pages, txt: pages.map((x) => x.text).join('\n') };
};
const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng', 'Đơn vị vận chuyển'];
const R = (t, plate, dt, net, c) => [t, plate, dt, net + 10000, 10000, net, c];
const DATA = [
  R('0101', '43C-11111', '03/02/2026 07:00', 20000, 'VT-A'),
  R('101', '51C-44444', '03/02/2026 07:30', 25000, 'VT-B'),
  R('0103', '43C-22222', '03/02/2026 08:00', 21000, 'VT-A'),
  R('103', '51C-55555', '03/02/2026 08:30', 26000, 'VT-B'),
  R('0105', '43C-11111', '03/02/2026 09:00', 19000, 'VT-A'),
  R('105', '51C-44444', '03/02/2026 09:30', 24000, 'VT-B'),
  R('0107', '43C-33333', '03/02/2026 10:00', 22000, 'VT-A'),
  R('107', '51C-66666', '03/02/2026 10:30', 27000, 'VT-B'),
];
const A = ['0101', '0103', '0105', '0107'],
  B = ['101', '103', '105', '107'],
  RET = '0103';
const kg = (ids) => DATA.filter((r) => ids.includes(r[0])).reduce((a, r) => a + r[5], 0);
const fmt = (k) => (k / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H].concat(DATA)), 'Can');
const xlsx = path.join(tmp, 'hai-tau.xlsx');
fs.writeFileSync(xlsx, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
const hasCode = (text, code) => new RegExp('(^|\\D)' + code + '(\\D|$)').test(text);

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
  await pdfjsReady;
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  console.log(
    'Môi trường: ' +
      process.platform +
      ' · Node ' +
      process.version +
      ' · ' +
      (channel || (exe ? exe : 'chromium')) +
      ' ' +
      browser.version() +
      ' · ' +
      (RELEASE ? 'CHẾ ĐỘ PHÁT HÀNH (Word/PDF bắt buộc)' : 'chế độ thường') +
      ' · ' +
      APP_DIR
  );
  const errs = [];
  let p = null;
  /** Mỗi phần chạy trong một phiên trình duyệt MỚI (kho dữ liệu trống) để số hồ sơ đếm được không lẫn với phần trước. */
  const fresh = async () => {
    if (p) await p.context().close();
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
    p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('dialog', (d) => d.accept());
    await login(p);
  };
  await fresh();
  const goto = async (h) => {
    await p.evaluate((x) => {
      location.hash = x;
    }, h);
    await p.waitForTimeout(700);
  };
  const screen = () =>
    p.evaluate(
      (t) => ({
        trips: document.getElementById('sumTrips-' + t).textContent,
        tons: document.getElementById('sumTons-' + t).textContent,
        list: Array.from(document.querySelectorAll('#sumList-' + t + ' li')).map((li) => li.innerText.replace(/\s+/g, ' ')),
      }),
      T
    );
  const loadFile = async () => {
    await goto('#/file');
    await p.click('[data-ft="' + T + '"]');
    await p.waitForTimeout(300);
    await p.setInputFiles('#fileInput', xlsx);
    await p.waitForTimeout(1800);
  };
  const pickShip = async (ids, ret) => {
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
  };
  const setShip = async (name) => {
    await p.click('#page-' + T + ' [data-zone="party"]');
    await p.waitForTimeout(300);
    await p.fill('#f-' + T + '-ship', name);
    await p.waitForTimeout(300);
    await p.click('#page-' + T + ' [data-zone="data"]');
    await p.waitForTimeout(300);
  };
  /** Bản in thật: chặn hộp thoại in, rồi để Chromium dựng file PDF từ đúng nội dung đang in. Trả về chữ trong PDF. */
  const pdfText = async (file) => {
    await p.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
    return readPdf(file);
  };

  console.log('A) Hai tàu cân xen kẽ, số phiếu trùng đuôi (0101 / 101): chọn phiếu, xe trả về, Word / Excel / PDF');
  await loadFile();
  await pickShip(A, RET);
  let s = await screen();
  check(
    s.trips === '4' && s.tons === fmt(kg(A)),
    'tàu A: 4 phiếu · ' + fmt(kg(A)) + ' tấn qua cân, không lẫn 101…',
    s.trips + ' · ' + s.tons
  );
  check(
    s.list.some((l) => l.includes('Xe trả về 1 xe · ' + fmt(21000))) && s.list.some((l) => l.includes('Thực giao ' + fmt(kg(A) - 21000))),
    'tàu A: xe trả về ' + RET + ' (21,00 t), thực giao ' + fmt(kg(A) - 21000)
  );
  await setShip('TÀU A');
  const [dlW] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#gen-' + T)]);
  await dlW.saveAs(path.join(tmp, 'A.docx'));
  try {
    const wt = await docxText(path.join(tmp, 'A.docx'));
    check(
      /TÀU A/.test(wt) && A.every((t) => wt.includes(t)) && !B.some((t) => hasCode(wt, t)),
      'Word (đọc lại DOCX): đủ 4 mã phiếu tàu A, tiếng Việt, không có phiếu tàu B'
    );
  } catch (e) {
    skip('Word: không đọc lại được file DOCX (' + e.message + ')');
  }
  const [dlX] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('#xls-' + T)]);
  await dlX.saveAs(path.join(tmp, 'A.xlsx'));
  const xw = XLSX.read(fs.readFileSync(path.join(tmp, 'A.xlsx')));
  const flat = JSON.stringify(XLSX.utils.sheet_to_json(xw.Sheets[xw.SheetNames[0]], { header: 1, blankrows: false, defval: '' }));
  check(
    A.every((t) => flat.includes('"' + t + '"')) && !B.some((t) => flat.includes('"' + t + '"')) && flat.includes(String(kg(A))),
    'Excel: đủ 4 phiếu tàu A, tổng ' + kg(A) + ' kg, không có phiếu tàu B'
  );
  await p.evaluate(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed++;
    };
  });
  await p.click('#pdf-' + T);
  await p.waitForFunction(() => window.__printed > 0, null, { timeout: 30000 }).catch(() => {});
  if (await p.evaluate(() => window.__printed)) {
    try {
      const { txt, n, pages } = await pdfText(path.join(tmp, 'A.pdf'));
      check(
        A.every((t) => txt.includes(t)) && /TÀU A/.test(txt) && !B.some((t) => hasCode(txt, t)),
        'PDF (đọc lại file): tiếng Việt + 4 mã phiếu tàu A, không có tàu B',
        n + ' trang'
      );
      check(
        pages.every((pg) => pg.minX >= -1 && pg.maxX <= pg.width + 1),
        'PDF Word: mọi chữ nằm trong khổ trang (không bị cắt)'
      );
    } catch (e) {
      skip('PDF Word: không đọc lại được file PDF (' + e.message + ')');
    }
  } else skip('PDF Word: không mở được bản in nên không tạo được file PDF');
  await p.evaluate(() => document.body.classList.remove('printing'));

  console.log('B) Lưu tàu A → Thêm mới → lưu tàu B → mở lại cả hai');
  await fresh();
  await loadFile();
  await pickShip(A, RET);
  await setShip('TÀU A');
  await p.click('#page-' + T + ' [data-year-save]');
  await p.waitForTimeout(1500);
  await p.click('#page-' + T + ' [data-year-new]');
  await p.waitForTimeout(1200);
  s = await screen();
  check(s.trips === '8', 'Thêm mới: trở về 8 phiếu của sheet');
  await pickShip(B, null);
  await setShip('TÀU B');
  s = await screen();
  check(
    s.trips === '4' && s.tons === fmt(kg(B)),
    'tàu B: 4 phiếu · ' + fmt(kg(B)) + ' tấn (101/103/105/107, không lẫn 0101…)',
    s.trips + ' · ' + s.tons
  );
  await p.click('#page-' + T + ' [data-year-save]');
  await p.waitForTimeout(1500);
  const recs = await p.evaluate(async () =>
    (await HAK.Yearbook.read()).records.map((r) => ({
      ship: r.params.ship,
      tickets: r.rows.map((x) => x.ticket),
      returned: r.params.returned || [],
    }))
  );
  const ra = recs.find((r) => r.ship === 'TÀU A'),
    rb = recs.find((r) => r.ship === 'TÀU B');
  check(
    recs.length === 2 && !!ra && !!rb && ra.tickets.join() === A.join() && rb.tickets.join() === B.join(),
    'Sổ hồ sơ năm: 2 hồ sơ, đúng mã phiếu từng tàu'
  );
  check(!!ra && !!rb && ra.returned.length === 1 && rb.returned.length === 0, 'xe trả về chỉ ở tàu A (1 xe), tàu B không có');
  for (const [name, ids, wantRet] of [
    ['TÀU A', A, 1],
    ['TÀU B', B, 0],
  ]) {
    await p.click('#page-' + T + ' [data-year-list]');
    await p.waitForTimeout(900);
    const idx = await p.evaluate(
      (n) =>
        Array.from(document.querySelectorAll('#hakYearModal [data-open]')).findIndex((b) => {
          let e = b;
          for (let i = 0; i < 4 && e; i++, e = e.parentElement)
            if (e.innerText && e.innerText.includes(n) && !(e.innerText.includes('TÀU A') && e.innerText.includes('TÀU B'))) return true;
          return false;
        }),
      name
    );
    const btns = await p.$$('#hakYearModal [data-open]');
    await btns[Math.max(0, idx)].click();
    await p.waitForTimeout(1500);
    s = await screen();
    const c = await p.evaluate((t) => {
      const x = HAK.Pages._collect(t);
      return { ship: x.ship, ret: (x.returned || []).length };
    }, T);
    check(
      c.ship === name && s.trips === '4' && s.tons === fmt(kg(ids)) && c.ret === wantRet,
      'mở lại ' + name + ': 4 phiếu · ' + fmt(kg(ids)) + ' tấn · xe trả về ' + wantRet
    );
  }

  console.log('C) Hợp đồng (gốc 5.000, phụ lục → 6.000), thực giao, hai tờ khai nợ 20 / nộp thừa 20');
  await p.evaluate(async () => {
    const M = HAK.ContractModel,
      CM = HAK.CustomsModel,
      d = HAK.Catalog.core.get();
    const c = M.parent({
      type: 'uythac',
      no: 'HD-NGHIEMTHU',
      date: '2026-01-05',
      contractQty: 5000,
      priceUsd: 176,
      currency: 'USD',
      details: [],
      exporterId: 'k-hak',
    });
    c.qtyOrig = 5000;
    c.addenda = [{ no: 'PL1', date: '2026-01-20', qty: 6000 }];
    M.applyAddenda(c);
    c.details.push(M.child(c.id, { ship: 'TÀU A', certNo: 'C1', bdmt: 4000, mt: 8000, exchangeRate: 26000 }));
    c.details.push(M.child(c.id, { ship: 'TÀU Z', bdmt: 1000, mt: 2000, exchangeRate: 26000 })); // thiếu số chứng thư
    d.customers = d.customers || [];
    d.customers.push({ id: 'k-hak', companyId: 'hak', name: 'HAK' });
    d.contracts.push(c);
    d.customs = d.customs || [];
    [
      [100, 80],
      [100, 120],
    ].forEach(([tax, paid], i) =>
      d.customs.push(
        CM.newDecl({
          no: '30862970' + (1000 + i),
          contractId: c.id,
          detailId: c.details[0].id,
          status: 'cleared',
          openDate: '2026-02-10',
          taxVnd: tax,
          qtyBdmt: 2000,
          payments: [{ amount: paid, receiptNo: 'R' + i }],
        })
      )
    );
    await HAK.Catalog.persist();
    const rows = HAK.App.ds.rows.filter((r) => ['0101', '0103', '0105', '0107'].includes(String(r.ticket)));
    const ret = rows.filter((r) => String(r.ticket) === '0103').map((r) => HAK.Generator.retKey(r));
    // hồ sơ gắn vào CHI TIẾT (lô) của hợp đồng, không phải mã hợp đồng cha
    await HAK.Archive.save(
      'uythac',
      { ship: 'TÀU A', giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: ret, contractId: c.details[0].id },
      { files: [{ name: 'HS-A.xlsx' }], excel: { fileName: 'HS-A.xlsx' }, summary: {} },
      { rows },
      'xlsx'
    );
  });
  await goto('#/report');
  await p.waitForTimeout(1500);
  const table = () =>
    p.evaluate(() => {
      const tb = document.querySelector('#repTplBody table');
      return {
        hs: Array.from(tb.tHead.rows[0].cells).map((c) => c.innerText.trim()),
        rows: Array.from(tb.tBodies[0].rows).map((r) => Array.from(r.cells).map((c) => c.innerText.replace(/\s+/g, ' ').trim())),
      };
    });
  await p.selectOption('#repTpl', 'contracts');
  await p.waitForTimeout(2500);
  const t3 = await table(),
    r3 = t3.rows[0] || [];
  const col3 = (re) => t3.hs.findIndex((h) => re.test(h));
  check(r3[0] === 'HD-NGHIEMTHU', 'mẫu 3: hiện hợp đồng HD-NGHIEMTHU');
  check(
    r3[col3(/BDMT GỐC/)] === '5.000,00' && r3[col3(/HIỆN HÀNH/)] === '6.000,00',
    'mẫu 3: BDMT gốc 5.000 và hiện hành 6.000 (sau phụ lục)'
  );
  check(
    r3[col3(/THỰC GIAO QUA CÂN/)] === '61,00',
    'mẫu 3: MT thực giao qua cân 61,00 (tàu A sau trừ xe trả về)',
    r3[col3(/THỰC GIAO QUA CÂN/)]
  );
  check(r3[col3(/THÔNG QUAN/)] === '2/2 đã thông quan', 'mẫu 3: thông quan 2/2 tờ khai, hiện riêng với cột đóng hợp đồng');
  const v3 = (re) => r3[col3(re)];
  check(
    v3(/BDMT THEO CHI TIẾT HỢP ĐỒNG/) === '5.000,00' &&
      v3(/ĐÃ CÓ SỐ CHỨNG THƯ/) === '4.000,00' &&
      v3(/CHƯA CÓ SỐ CHỨNG THƯ/) === '1.000,00',
    'mẫu 3: BDMT chi tiết 5.000 = 4.000 đã có số chứng thư + 1.000 chưa có số chứng thư',
    [v3(/BDMT THEO CHI TIẾT HỢP ĐỒNG/), v3(/ĐÃ CÓ SỐ CHỨNG THƯ/), v3(/CHƯA CÓ SỐ CHỨNG THƯ/)].join(' / ')
  );
  check(
    v3(/CÒN LẠI/) === '1.000,00' && v3(/CHI TIẾT CÓ CHỨNG THƯ/) === '1/2',
    'mẫu 3: còn lại = 6.000 − 5.000 = 1.000; chi tiết có chứng thư 1/2'
  );
  await p.selectOption('#repTpl', 'tax');
  await p.waitForTimeout(2500);
  const t4 = await table(),
    body4 = await p.evaluate(() => document.getElementById('repTplBody').innerText.replace(/\s+/g, ' '));
  const iOwe = t4.hs.findIndex((h) => /CÒN NỢ/i.test(h)),
    iOver = t4.hs.findIndex((h) => /NỘP THỪA/i.test(h));
  const decl = t4.rows.filter((r) => r.some((c) => /^3086297/.test(c))).map((r) => r[iOwe] + '/' + r[iOver]);
  check(decl.sort().join('|') === '0/20|20/0', 'mẫu 4: hai tờ khai — một nợ 20, một nộp thừa 20, hiện riêng', JSON.stringify(decl));
  check(/Số dư ròng[^.]*không bù trừ/i.test(body4), 'mẫu 4: số dư ròng ghi đúng tên, kèm "không bù trừ giữa các tờ khai"');

  console.log('E) Sao lưu của dữ liệu thử: rà soát toàn vẹn cha–con (hợp đồng, chi tiết, tờ khai, khoản nộp, hồ sơ cân)');
  {
    const text = await p.evaluate(async () => (await HAK.Backup.buildFull()).parts.join(''));
    const j = JSON.parse(text);
    global.window = global;
    global.HAK = global.HAK || {};
    global.HAK.ContractModel = require('../app/js/contract-model.js');
    global.HAK.CustomsModel = require('../app/js/customs-model.js');
    const Integ = require('../app/js/integrity-model.js'),
      data = global.HAK.ContractModel.migrate(j.keys['hak.catalog.v1']).data,
      metas = (j.archive || []).map((x) => x.meta);
    const findings = Integ.audit(data, metas, { attachmentIds: (j.attachments || []).map((x) => x.id) });
    const rep = { errors: findings.filter((f) => f.level === 'error').length, findings, relations: Integ.relations(data, metas) };
    check(
      rep.errors === 0,
      'sao lưu: 0 lỗi toàn vẹn cha–con',
      rep.findings
        .filter((f) => f.level === 'error')
        .map((f) => f.code)
        .join(',')
    );
    check(
      rep.relations.contracts >= 1 && rep.relations.declarations >= 2 && rep.relations.archiveLinked >= 1,
      'bảng quan hệ: có hợp đồng, tờ khai và hồ sơ cân gắn chi tiết',
      JSON.stringify(rep.relations)
    );
  }

  console.log('D) PDF báo cáo dài: tiêu đề bảng lặp lại khi sang trang, tiếng Việt đủ dấu');
  {
    await p.evaluate(() => {
      window.__pr = 0;
      window.print = () => {
        window.__pr++;
      };
      const cols = [{ h: 'Số phiếu' }, { h: 'Công ty / Hợp đồng' }, { h: 'Khối lượng (kg)' }, { h: 'Ghi chú: đơn vị vận chuyển' }];
      const rows = Array.from({ length: 140 }, (_, i) => ({
        c: [
          'T' + String(i).padStart(4, '0'),
          'Công ty Đại Hiệp — HĐ ' + i,
          (i * 1000 + 20000).toLocaleString('vi-VN'),
          'Vận tải Hoàng Anh Khôi',
        ],
      }));
      HAK.Customs.printReport({
        title: 'BÁO CÁO THỬ — Phân tích ĐVVC',
        sub: 'Công ty: HAK · Kỳ: 01/2026',
        tables: [{ caption: 'Bảng 1', cols, rows }],
      });
    });
    await p.waitForFunction(() => window.__pr > 0, null, { timeout: 15000 }).catch(() => {});
    let rd = null;
    if (await p.evaluate(() => window.__pr))
      try {
        rd = await pdfText(path.join(tmp, 'dai.pdf'));
      } catch (e) {
        skip('PDF báo cáo dài: không đọc lại được file PDF (' + e.message + ')');
      }
    else skip('PDF báo cáo dài: không mở được bản in nên không tạo được file PDF');
    if (rd) {
      const { txt, n: pages, pages: pgs } = rd;
      const hdr = pgs.filter((pg) => /Số phiếu/.test(pg.text) && /Ghi chú: đơn vị vận chuyển/.test(pg.text)).length;
      check(pages >= 2 && hdr === pages, 'tiêu đề bảng lặp ở MỌI trang', pages + ' trang, tiêu đề ở ' + hdr + ' trang');
      check(
        pgs.every((pg) => pg.minX >= -1 && pg.maxX <= pg.width + 1),
        'mọi cột nằm trong khổ trang (không tràn lề)'
      );
      check(
        /Đại Hiệp — HĐ/.test(txt) && /Hoàng Anh Khôi/.test(txt) && (txt.match(/T0\d{3}/g) || []).length === 140,
        'tiếng Việt đủ dấu, đủ 140 dòng'
      );
      check(new Set(txt.match(/T0\d{3}/g) || []).size === 140, '140 mã dòng khác nhau, không thiếu, không lặp dòng');
    }
  }

  check(errs.length === 0, 'không có lỗi script trong suốt luồng', errs[0] || '');
  await browser.close();
  const total = counts.pass + counts.fail + counts.skip;
  console.log('\nKết quả (' + total + ' ca): Đạt ' + counts.pass + ' · Lỗi ' + counts.fail + ' · Bỏ qua ' + counts.skip);
  if (counts.fail) console.log('Ca lỗi:\n  - ' + failed.join('\n  - '));
  if (counts.skip) console.log((RELEASE ? 'CHƯA XÁC MINH (chế độ phát hành coi là lỗi):\n  - ' : 'Bỏ qua:\n  - ') + skipped.join('\n  - '));
  const bad = counts.fail > 0 || (RELEASE && counts.skip > 0);
  console.log(bad ? '\n✗ KHÔNG ĐẠT' : '\n✓ Đạt');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
