/* E2E M5.3/mục 29 tồn: BKLS tạo bằng HAK.Bkls.generate THẬT trong Chromium, rồi ĐỌC LẠI file Word (document.xml) để đối chiếu:
 * Word tổng: số BKLS, đủ biển số các xe, tổng khối lượng đúng; Word từng xe: mỗi xe một file, đúng biển số và khối lượng của xe đó, không lẫn xe khác.
 * Chạy: node tools/e2e-bkls-readback.cjs. Dữ liệu 100% giả lập. */
const { chromium } = require('playwright');
const path = require('node:path');
const JSZip = require('../app/libs/jszip.min.js');
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
/** Văn bản của một file .docx (nối mọi w:t trong document.xml, giữ ngắt đoạn bằng xuống dòng). */
async function docxText(bytes) {
  const z = await JSZip.loadAsync(bytes);
  const xml = await z.file('word/document.xml').async('string');
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
(async () => {
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {});
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await login(p);

  console.log('1) Tạo BKLS (Word tổng + Word từng xe) cho 3 xe: 20.000 / 25.000 / 15.000 kg (tổng 60 tấn, hệ số BDMT 0,5)');
  const out = await p.evaluate(async () => {
    const ctx = {
      template: undefined,
      g: {
        tenChu: 'CÔNG TY QA',
        mstChu: '0400000001',
        diaChiChu: 'Đà Nẵng',
        nguonGoc: 'Dăm gỗ keo',
        xuatKhoTai: 'Kho A',
        noiDen: 'Cảng B',
      },
    };
    const trips = [
      ['43C-111.11', 20000],
      ['51C-444.44', 25000],
      ['43C-999.99', 15000],
    ].map(([plate, kg]) => ({
      ngayCanDate: HAK.Bkls.parseDMY('03/02/2026'),
      bienSoRaw: plate,
      tenTaiXe: 'Tài xế',
      klHangKg: kg,
      donViVc: 'QA',
    }));
    const lot = {
      soBkls: '77',
      heSoBdmt: 0.5,
      ngayLap: '2026-02-04',
      ngayLapTheoXe: false,
      listTrips: true,
      benMuaTen: 'BÊN MUA QA',
      benMuaMst: '',
      benMuaDiaChi: '',
      benMuaDt: '',
      benMuaEmail: '',
      trips,
    };
    const res = await HAK.Bkls.generate(ctx, lot, { totalDocx: true, tripDocx: true }, 'BKLS_QA');
    const files = [];
    for (const x of res) {
      const buf = new Uint8Array(await x.blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 16384) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 16384));
      files.push({ key: x.key, name: x.name, b64: btoa(bin) });
    }
    return files;
  });
  check(out.length >= 2, 'tạo được file Word', out.map((x) => x.key + ':' + x.name).join(' | '));
  const total = out.find((x) => x.key === 'totalDocx');
  const per = out.filter((x) => x.key === 'tripDocx');
  const texts = {};
  for (const x of out) texts[x.name] = await docxText(Buffer.from(x.b64, 'base64'));
  if (process.env.HAK_DEBUG) for (const [n, t] of Object.entries(texts)) console.log('---- ' + n + '\n' + t.slice(0, 1800));
  const norm = (s) => s.replace(/[\s.\-]/g, '').toUpperCase();
  console.log('2) Word tổng: đọc lại');
  const tt = total ? texts[total.name] : '';
  check(!!total, 'có Word tổng');
  check(/77/.test(tt), 'có số BKLS 77');
  for (const plate of ['43C11111', '51C44444', '43C99999']) check(norm(tt).includes(plate), 'Word tổng có biển số ' + plate);
  const qtyOf = (t, label) => {
    const m = new RegExp(label + '[^:\\n]*:\\s*([0-9.,]+)').exec(t);
    return m ? m[1] : '';
  };
  check(
    qtyOf(tt, 'Khối lượng/trọng lượng') === '60,00',
    'Word tổng: khối lượng = 60,00 tấn (20 + 25 + 15)',
    qtyOf(tt, 'Khối lượng/trọng lượng')
  );
  check(qtyOf(tt, 'Số lượng \\(bằng số') === '30,00', 'Word tổng: số lượng = 30,00 BDMT (hệ số 0,5)', qtyOf(tt, 'Số lượng \\(bằng số'));
  check(/3 xe vận chuyển/.test(tt), 'Word tổng: ghi 3 xe vận chuyển');
  console.log('3) Word từng xe: một file gồm 3 bản BKLS đánh số 77-0001…0003, mỗi bản đúng biển số và khối lượng xe đó');
  check(per.length === 1, 'có 1 file Word từng xe', String(per.length));
  const pt = per.length ? texts[per[0].name] : '';
  const parts = pt.split(/(?=Số\(1\):\s*77-\d{4})/).filter((x) => /Số\(1\):\s*77-\d{4}/.test(x));
  check(parts.length === 3, 'đọc lại được 3 bản BKLS từng xe', String(parts.length));
  const want = [
    ['77-0001', '43C11111', '20,00', '10,00'],
    ['77-0002', '51C44444', '25,00', '12,50'],
    ['77-0003', '43C99999', '15,00', '7,50'],
  ];
  want.forEach(([so, plate, ton, bd], i) => {
    const t = parts[i] || '';
    check(new RegExp('Số\\(1\\):\\s*' + so).test(t), 'bản ' + (i + 1) + ': đúng số BKLS ' + so);
    check(norm(t).includes(plate), 'bản ' + so + ': đúng biển số ' + plate);
    check(!want.some((o) => o[1] !== plate && norm(t).includes(o[1])), 'bản ' + so + ': không lẫn biển số xe khác');
    check(
      qtyOf(t, 'Khối lượng/trọng lượng') === ton && qtyOf(t, 'Số lượng \\(bằng số') === bd,
      'bản ' + so + ': ' + ton + ' tấn / ' + bd + ' BDMT',
      qtyOf(t, 'Khối lượng/trọng lượng') + ' / ' + qtyOf(t, 'Số lượng \\(bằng số')
    );
  });
  check(errs.length === 0, 'không có lỗi script' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\n✗ ' + failures.length + ' ca lỗi' : '\n✓ Đạt toàn bộ');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
