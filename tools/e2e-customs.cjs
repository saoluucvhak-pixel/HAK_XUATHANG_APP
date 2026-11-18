/* Kiểm thử NHẬP tờ khai (Excel), OCR giấy nộp tiền, nhập lại cùng giấy, khai bổ sung, hoàn thuế, hủy trước khi lưu và phạm vi công ty
 * trên trình duyệt thật. OCR được giả lập ở HAK.Documents.ocr (Windows OCR chỉ có trong bản cài) — phần đọc chữ → bóc tách → duyệt → lưu chạy thật.
 * Chạy: npm run e2e:customs. HAK_APP_DIR / HAK_CHROMIUM / HAK_BROWSER_CHANNEL như tools/accept.cjs. Thoát mã 1 nếu có ca lỗi. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const XLSX = require('../app/libs/xlsx.full.min.js');
const APP_DIR = path.resolve(process.env.HAK_APP_DIR || path.join(__dirname, '../app'));
const APP = require('node:url').pathToFileURL(path.join(APP_DIR, 'index.html')).href;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2ecs-'));
const failures = [],
  check = (c, m, x) => {
    console.log((c ? '  ✓ ' : '  ✗ ') + m + (x && !c ? '  → ' + x : ''));
    if (!c) failures.push(m);
  };
const DECL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/customs-decl-rows.json'), 'utf8'));
const NO1 = '308629701721';
const NO2 = '308629701799'; // tờ khai bổ sung (file thứ hai)
const xlsxOf = (name, swapNo) => {
  const rows = JSON.parse(JSON.stringify(DECL));
  if (swapNo) rows.forEach((r) => r.forEach((c, i) => (r[i] = c === NO1 ? swapNo : c)));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  const f = path.join(tmp, name);
  fs.writeFileSync(f, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return f;
};
// Giấy nộp tiền thuế xuất khẩu (số tờ khai ở dòng riêng, như mẫu C1-02/NS)
const receipt = (no, receiptNo, amount) =>
  'Số: ' +
  receiptNo +
  '\nNgười nộp thuế: CÔNG TY TNHH HOÀNG ANH KHÔI\nMã số thuế: 0401447476\nTờ khai HQ số(1): ' +
  no +
  ' ngày: 11/06/2026 Loại hình XNK(1): B11\nSTT : Nội dung các khoản nộp NSNN : Số tiền\n1 : Thuế xuất khẩu : ' +
  amount +
  '\nTổng cộng: ' +
  amount +
  '\nNgày nộp: 12/06/2026';
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage(),
    errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);
  const decls = () => p.evaluate(() => JSON.parse(JSON.stringify(HAK.Customs.activeDecls())));
  const toasts = () =>
    p.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
  const clear = () => p.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
  const modalOpen = () => p.evaluate(() => !!document.querySelector('#csModal.show'));
  const closeModal = async (how) => {
    if (how === 'save') await p.click('#csSave');
    else await p.click('#csModal [data-bs-dismiss="modal"]');
    await p.waitForTimeout(900);
  };
  const ocrWith = async (text) => {
    await p.evaluate((t) => {
      HAK.Documents.ocr = async () => ({ pages: [{ text: t, rowsText: t, supplementalText: '' }] });
    }, text);
    const pick = () => p.setInputFiles('#csOcrPay', { name: 'giay-nop-tien.png', mimeType: 'image/png', buffer: Buffer.from('x') });
    await pick();
    // Chẩn đoán trên máy thật: nếu màn duyệt không mở trong 4 giây, in trạng thái trang rồi chọn lại tệp đúng một lần.
    const opened = await p.waitForSelector('#csModal.show', { timeout: 4000 }).then(
      () => true,
      () => false
    );
    if (!opened) {
      const st = await p.evaluate(() => ({
        input: !!document.querySelector('#csOcrPay'),
        modal: (document.querySelector('#csModal') || {}).className,
        toasts: Array.from(document.querySelectorAll('.toast')).map((e) => e.textContent.trim().replace(/\s+/g, ' ')),
        backend: (HAK.Storage && HAK.Storage.backend && HAK.Storage.backend()) || null,
      }));
      console.log('  [chẩn đoán] màn duyệt không mở sau 4 giây: ' + JSON.stringify(st));
      await pick();
    }
  };

  console.log('0) Dữ liệu thử: hợp đồng Ủy thác có chi tiết tàu M/V CONDOR EXPRESS V.2609 (để tự gắn khi nhập tờ khai)');
  await p.evaluate(async () => {
    const M = HAK.ContractModel,
      d = HAK.Catalog.core.get();
    d.customers = (d.customers || []).concat([
      { id: 'k-hak', companyId: 'hak', name: 'HAK' },
      { id: 'k-iwc', companyId: 'hak', name: 'IWC' },
    ]);
    const c = M.parent({
      type: 'xuatkhau',
      no: 'HD-CE-01',
      date: '2026-05-20',
      contractQty: 6000,
      priceUsd: 176,
      currency: 'USD',
      details: [],
      exporterId: 'k-hak',
      buyerId: 'k-iwc',
    });
    c.details.push(
      M.child(c.id, { ship: 'M/V CONDOR EXPRESS V.2609', certNo: '26E04GPT00186-04', bdmt: 6000, mt: 12000, exchangeRate: 26000 })
    );
    d.contracts.push(c);
    await HAK.Catalog.persist();
  });
  await p.evaluate(() => {
    location.hash = '#/catalog';
  });
  await p.waitForTimeout(1000);
  await p.click('[data-ctab="customs"]');
  await p.waitForTimeout(800);

  console.log('1) Nhập tờ khai từ file Excel; nhập lại cùng file');
  await p.setInputFiles('#csImport', xlsxOf('tk1.xlsx')).catch(async () => {
    // tên ô chọn file khác → lấy ô <input type=file> đầu tiên của tab
    await p.setInputFiles('#customsRoot input[type=file] >> nth=0', xlsxOf('tk1.xlsx'));
  });
  await p.waitForTimeout(1800);
  let d = await decls();
  check(d.length === 1 && d[0].no === NO1, 'nhập file: có 1 tờ khai ' + NO1, JSON.stringify(d.map((x) => x.no)));
  check(
    d[0] && d[0].status === 'opened' && d[0].taxVnd === 551696640 && d[0].qtyBdmt === 6000,
    'tờ khai: trạng thái Đã mở, thuế 551.696.640, 6.000 BDMT'
  );
  check(d[0] && !!d[0].contractId && !!d[0].detailId, 'tờ khai tự gắn hợp đồng / chi tiết theo tàu hoặc số TKHQ');
  const t1 = (await toasts()).join(' ');
  check(/Đã nhập 1 tờ khai/.test(t1), 'thông báo "Đã nhập 1 tờ khai"', t1);
  await clear();
  await p.setInputFiles('#customsRoot input[type=file] >> nth=0', xlsxOf('tk1b.xlsx'));
  await p.waitForTimeout(1800);
  d = await decls();
  const t2 = (await toasts()).join(' ');
  check(d.length === 1 && /đã có/.test(t2), 'nhập lại cùng tờ khai: không nhân đôi, báo "đã có"', t2);

  console.log('2) OCR giấy nộp tiền → duyệt → lưu; nhập lại cùng giấy; hủy trước khi lưu');
  await ocrWith(receipt(NO1, 'DN0206/26', '1.000.000'));
  await p.waitForTimeout(900);
  check(await modalOpen(), 'OCR giấy nộp tiền: mở màn duyệt kết quả');
  const preset = await p.evaluate(() => ({
    no: (document.querySelector('#cs-ln-no-0') || {}).value,
    on: (document.querySelector('#cs-ln-on-0') || {}).checked,
    rec: (document.querySelector('#cs-f-receiptNo') || {}).value,
  }));
  check(
    preset.no === NO1 && preset.on === true && preset.rec === 'DN0206/26',
    'màn duyệt: số tờ khai, ô tick và số giấy đọc đúng',
    JSON.stringify(preset)
  );
  await closeModal('save');
  d = await decls();
  check(
    d[0].payments.length === 1 && d[0].payments[0].amount === 1000000 && d[0].payments[0].receiptNo === 'DN0206/26',
    'lưu: 1 khoản nộp 1.000.000 đ, số giấy DN0206/26',
    JSON.stringify(d[0].payments.map((x) => [x.amount, x.receiptNo]))
  );
  await clear();
  await ocrWith(receipt(NO1, 'DN0206/26', '1.000.000'));
  await p.waitForTimeout(900);
  await closeModal('save');
  d = await decls();
  const t3 = (await toasts()).join(' ');
  check(d[0].payments.length === 1, 'nhập lại cùng giấy nộp tiền: KHÔNG nhân đôi khoản nộp', 'payments=' + d[0].payments.length);
  check(/bỏ 1 dòng đã có/.test(t3), 'thông báo nêu bỏ 1 dòng đã có', t3);
  await ocrWith(receipt(NO1, 'DN0999/26', '500.000'));
  await p.waitForTimeout(900);
  await closeModal('cancel');
  d = await decls();
  check(d[0].payments.length === 1 && !(await modalOpen()), 'hủy trước khi lưu: không thêm khoản nộp nào');
  await ocrWith(receipt('308629799999', 'DN0777/26', '200.000'));
  await p.waitForTimeout(900);
  await p.selectOption('#cs-ln-t-0', '__new');
  await closeModal('cancel');
  d = await decls();
  check(d.length === 1, 'hủy khi chọn "Tạo tờ khai mới": không tạo tờ khai');

  console.log('3) Khai bổ sung từ file; hủy trước khi lưu');
  const sf = xlsxOf('bs.xlsx', NO2);
  await p.setInputFiles('#csImportSupp', sf);
  await p.waitForTimeout(900);
  check(await modalOpen(), 'khai bổ sung từ file: mở biểu mẫu với số tờ khai bổ sung');
  const sup = await p.evaluate(() => (document.querySelector('#cs-f-no') || {}).value);
  check(sup === NO2, 'biểu mẫu điền sẵn số tờ khai bổ sung ' + NO2, sup);
  await closeModal('cancel');
  d = await decls();
  check(d[0].supplements.length === 0, 'hủy: chưa có khai bổ sung');
  await p.setInputFiles('#csImportSupp', sf);
  await p.waitForTimeout(900);
  await closeModal('save');
  d = await decls();
  check(
    d[0].supplements.length === 1 && d[0].supplements[0].no === NO2,
    'lưu: có 1 khai bổ sung ' + NO2,
    JSON.stringify(d[0].supplements.map((x) => x.no))
  );

  console.log('4) Hoàn thuế nộp thừa (nút "Ghi nhận hoàn thuế")');
  await p.evaluate(async () => {
    // nộp thừa: nộp thêm cho đủ thuế rồi vượt 100.000 đ
    const c = HAK.CustomsModel.totals(HAK.Customs.activeDecls()[0]);
    return c.payable;
  });
  const need = await p.evaluate(() => HAK.CustomsModel.totals(HAK.Customs.activeDecls()[0]));
  const over = (need.payable || 0) + 100000 - (need.paidTax || 0);
  await ocrWith(receipt(NO1, 'DN0888/26', over.toLocaleString('vi-VN')));
  await p.waitForTimeout(900);
  await closeModal('save');
  let tot = await p.evaluate(() => HAK.CustomsModel.totals(HAK.Customs.activeDecls()[0]));
  check(tot.over === 100000, 'nộp vượt: nộp thừa 100.000 đ', JSON.stringify({ over: tot.over, owed: tot.owed }));
  await p.evaluate(() => {
    location.hash = '#/catalog';
  });
  await p.waitForTimeout(600);
  await p.click('[data-ctab="customs"]');
  await p.waitForTimeout(800);
  if (await p.$('[data-cs="refund-add"]')) {
    await p.click('[data-cs="refund-add"]');
    await p.waitForTimeout(700);
    const pre = await p.evaluate(() => ({
      kind: (document.querySelector('#cs-f-kind') || {}).value,
      amount: (document.querySelector('#cs-f-amount') || {}).value,
    }));
    check(
      pre.kind === 'refund' && /100\.000/.test(pre.amount),
      'nút hoàn thuế: điền sẵn loại "hoàn" và số tiền nộp thừa',
      JSON.stringify(pre)
    );
    await closeModal('cancel');
    tot = await p.evaluate(() => HAK.CustomsModel.totals(HAK.Customs.activeDecls()[0]));
    check(tot.over === 100000 && tot.refunded === 0, 'hủy hoàn thuế: nộp thừa vẫn 100.000, chưa hoàn');
    await p.click('[data-cs="refund-add"]');
    await p.waitForTimeout(700);
    await closeModal('save');
    tot = await p.evaluate(() => HAK.CustomsModel.totals(HAK.Customs.activeDecls()[0]));
    check(
      tot.refunded === 100000 && tot.over === 0,
      'lưu hoàn thuế: đã hoàn 100.000, hết nộp thừa',
      JSON.stringify({ refunded: tot.refunded, over: tot.over })
    );
  } else check(false, 'có nút "Ghi nhận hoàn thuế" khi tờ khai nộp thừa');

  console.log('4b) Ngừng dùng chi tiết / hợp đồng còn tờ khai gắn vào: giữ liên kết lịch sử và BÁO cần đối soát');
  await p.evaluate(() => {
    location.hash = '#/catalog';
  });
  await p.waitForTimeout(700);
  await p.click('[data-ctab="contracts"]');
  await p.waitForTimeout(700);
  const ids = await p.evaluate(() => {
    const c = HAK.Catalog.core.get().contracts.find((x) => x.no === 'HD-CE-01');
    return { cid: c.id, did: c.details[0].id };
  });
  await p.click('[data-master="' + ids.cid + '"]');
  await p.waitForTimeout(500);
  await clear();
  await p.click('[data-detail-archive="' + ids.did + '"]');
  await p.waitForTimeout(1200);
  const tStop = (await toasts()).join(' ');
  check(
    /ngừng dùng chi tiết hợp đồng/i.test(tStop) && /1 tờ khai/.test(tStop) && /GIỮ NGUYÊN/.test(tStop),
    'ngừng dùng chi tiết còn tờ khai: có báo, nêu giữ liên kết lịch sử',
    tStop
  );
  d = await decls();
  check(
    d.length === 1 && d[0].detailId === ids.did && d[0].contractId === ids.cid,
    'tờ khai vẫn gắn đúng chi tiết / hợp đồng (không bị gỡ hay xóa dây chuyền)'
  );
  const stopped = await p.evaluate((did) => HAK.Catalog.core.get().contracts[0].details.find((x) => x.id === did).deletedAt, ids.did);
  check(!!stopped, 'chi tiết được đánh dấu ngừng dùng (không xóa cứng)');

  console.log('5) Phạm vi công ty: công ty khác không thấy tờ khai của HAK trong báo cáo');
  await p.evaluate(() => document.getElementById('btnCompany').click());
  await p.waitForTimeout(800);
  const dh = await p.$('[data-co="dh"]');
  if (dh) {
    await dh.click();
    await p.waitForFunction(() => window.HAK && HAK.Auth && HAK.Auth.company() === 'dh', null, { timeout: 15000 });
    await p.evaluate(() => {
      location.hash = '#/report';
    });
    await p.waitForTimeout(2500);
    const rep = await p.evaluate(() => (document.getElementById('repCsBody') || { textContent: '' }).textContent);
    check(!rep.includes(NO1), 'báo cáo hải quan của công ty khác không có tờ khai ' + NO1 + ' của HAK');
  } else check(false, 'tìm thấy công ty khác để đổi phạm vi');
  check(errs.length === 0, 'không có lỗi script trong suốt luồng', errs[0] || '');
  await browser.close();
  if (failures.length) {
    console.log('\n✗ ' + failures.length + ' ca lỗi');
    process.exit(1);
  }
  console.log('\n✓ Đạt toàn bộ');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
