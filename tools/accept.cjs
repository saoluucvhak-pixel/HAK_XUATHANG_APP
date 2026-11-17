/* Nghiệm thu bản phát hành trên trình duyệt thật (dữ liệu thử tự tạo, không đụng dữ liệu thật):
 *  A. hai tàu cân xen kẽ cùng ngày, số phiếu tàu B là ĐUÔI số phiếu tàu A (0101 / 101): chọn phiếu, xe trả về,
 *     xuất Word / Excel / PDF (bản in thật → file PDF) và đối chiếu mã phiếu, khối lượng;
 *  B. lưu tàu A → Thêm mới → lưu tàu B → mở lại cả hai;
 *  C. hợp đồng có phụ lục + hai tờ khai (nợ 20 / nộp thừa 20) → mẫu báo cáo "Tiến độ hợp đồng" và "Hải quan và công nợ thuế";
 *  D. PDF của báo cáo dài: tiêu đề bảng lặp lại khi sang trang, tiếng Việt đủ dấu.
 * Chạy: npm run accept   (cần playwright; tùy chọn: unzip, pdftotext, pdfinfo để đọc nội dung Word / PDF — thiếu thì bỏ qua bước đó và báo "bỏ qua").
 * HAK_APP_DIR=<thư mục chứa index.html> để thử gói portable (vd dist/app); HAK_CHROMIUM=<đường dẫn trình duyệt khác>.
 * Thoát mã 1 nếu có ca sai. Chưa kiểm được: Edge / Chrome Windows, bộ cài, Google Sheet thật (xem docs/INTEGRATION.md). */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  cp = require('node:child_process');
const XLSX = require('../app/libs/xlsx.full.min.js');
const APP_DIR = path.resolve(process.env.HAK_APP_DIR || path.join(__dirname, '../app'));
const APP = 'file://' + path.join(APP_DIR, 'index.html');
const T = 'uythac';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-accept-'));
const results = [];
const check = (ok, msg, extra) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg + (extra ? '  → ' + extra : ''));
  results.push(ok);
};
const skip = (msg) => console.log('  - bỏ qua: ' + msg);
const has = (cmd) => {
  try {
    cp.execSync('command -v ' + cmd, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
};
const HAS_UNZIP = has('unzip'),
  HAS_PDF = has('pdftotext') && has('pdfinfo');

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
  const exe = process.env.HAK_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
  const errs = [];
  let p = null;
  /** Mỗi phần chạy trong một phiên trình duyệt MỚI (kho dữ liệu trống) để số hồ sơ đếm được không lẫn với phần trước. */
  const fresh = async () => {
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
    const txt = cp.execSync('pdftotext -layout "' + file + '" -', { encoding: 'utf8' });
    const pages = +/Pages:\s+(\d+)/.exec(cp.execSync('pdfinfo "' + file + '"', { encoding: 'utf8' }))[1];
    return { txt, pages };
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
  if (HAS_UNZIP) {
    const wt = cp
      .execSync('unzip -p "' + path.join(tmp, 'A.docx') + '" word/document.xml', { encoding: 'utf8', maxBuffer: 1 << 26 })
      .replace(/<[^>]+>/g, ' ');
    check(
      /TÀU A/.test(wt) && A.every((t) => wt.includes(t)) && !B.some((t) => hasCode(wt, t)),
      'Word: đủ 4 mã phiếu tàu A, không có phiếu tàu B'
    );
  } else skip('Word (thiếu unzip)');
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
  if (HAS_PDF && (await p.evaluate(() => window.__printed))) {
    const { txt, pages } = await pdfText(path.join(tmp, 'A.pdf'));
    check(
      A.every((t) => txt.includes(t)) && /TÀU A/.test(txt) && !B.some((t) => hasCode(txt, t)),
      'PDF (bản in thật): tiếng Việt + 4 mã phiếu tàu A, không có tàu B',
      pages + ' trang'
    );
  } else skip('PDF (thiếu pdftotext / pdfinfo hoặc không mở được bản in)');
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
  console.log(
    '   (ghi nhận) BDMT theo chứng thư hiện ' +
      r3[col3(/BDMT THEO CHỨNG THƯ/)] +
      ' — gồm cả chi tiết chưa có số chứng thư (4.000 có chứng thư + 1.000 chưa có); cần xác nhận nghiệp vụ'
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

  console.log('D) PDF báo cáo dài: tiêu đề bảng lặp lại khi sang trang, tiếng Việt đủ dấu');
  if (HAS_PDF) {
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
    const { txt, pages } = await pdfText(path.join(tmp, 'dai.pdf'));
    const hdr = (txt.match(/Số phiếu/g) || []).length;
    check(pages >= 2 && hdr >= pages, 'tiêu đề bảng lặp ở mỗi trang', pages + ' trang, tiêu đề ' + hdr + ' lần');
    check(
      /Đại Hiệp — HĐ/.test(txt) && /Hoàng Anh Khôi/.test(txt) && (txt.match(/T0\d{3}/g) || []).length === 140,
      'tiếng Việt đủ dấu, đủ 140 dòng, không cắt cột'
    );
  } else skip('PDF báo cáo dài (thiếu pdftotext / pdfinfo)');

  check(errs.length === 0, 'không có lỗi script trong suốt luồng', errs[0] || '');
  await browser.close();
  const bad = results.filter((x) => !x).length;
  console.log(bad ? '\n✗ ' + bad + ' ca sai (' + results.length + ' ca đã chạy)' : '\n✓ Đạt toàn bộ ' + results.length + ' ca');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
