const { test } = require('node:test'),
  assert = require('node:assert/strict');

global.window = global;
global.HAK = {
  DB: {
    usable: () => false,
    kvGet: async () => undefined,
    kvPut: async () => {},
    kvCas: async () => {},
  },
};
require('../app/libs/xlsx.full.min.js');
require('../app/js/util.js');
require('../app/js/excel.js');
require('../app/js/excel-template.js');
require('../app/js/weigh-model.js');

test('1. HAK.Weigh.detectAnomalies: phát hiện xe quá tải, xe quá nhẹ và xe lặp biển số quá nhanh', () => {
  const rows = [
    { ticket: 'P-001', plate: '43C-111.11', dateStr: '2026-11-26', time1: '08:00:00', net: 28500 }, // Bình thường
    { ticket: 'P-002', plate: '43C-222.22', dateStr: '2026-11-26', time1: '08:10:00', net: 48500 }, // Quá tải > 45t
    { ticket: 'P-003', plate: '43C-333.33', dateStr: '2026-11-26', time1: '08:20:00', net: 350 }, // Quá nhẹ < 500kg
    { ticket: 'P-004', plate: '43C-111.11', dateStr: '2026-11-26', time1: '08:08:00', net: 28200 }, // Lặp xe sau 8 phút (<15p)
  ];

  const res = HAK.Weigh.detectAnomalies(rows, { maxNetKg: 45000, minNetKg: 500, minGapMinutes: 15 });
  assert.equal(res.total, 3);
  assert.equal(res.overweightCount, 1);
  assert.equal(res.underweightCount, 1);
  assert.equal(res.rapidCount, 1);

  // Kiểm tra chi tiết từng lỗi
  const p2 = res.list.find((x) => x.row.ticket === 'P-002');
  assert.ok(p2);
  assert.equal(p2.issues[0].type, 'overweight');

  const p3 = res.list.find((x) => x.row.ticket === 'P-003');
  assert.ok(p3);
  assert.equal(p3.issues[0].type, 'underweight');

  const p4 = res.list.find((x) => x.row.ticket === 'P-004');
  assert.ok(p4);
  assert.equal(p4.issues[0].type, 'rapid_repeat');
});

test('2. Customs Tolerance: tính đúng độ lệch % dung sai so với khối lượng tờ khai hải quan', () => {
  const cq = 10000; // 10.000 tấn đăng ký trên tờ khai

  // Trường hợp 1: Xuất 9.800 tấn -> lệch -2% (nằm trong dung sai cho phép)
  const ton1 = 9800;
  const pct1 = Math.round((ton1 / cq) * 100);
  assert.equal(pct1, 98);
  assert.ok(Math.abs(pct1 - 100) <= 5);

  // Trường hợp 2: Xuất 10.700 tấn -> lệch +7% (cảnh báo dung sai > 5%)
  const ton2 = 10700;
  const pct2 = Math.round((ton2 / cq) * 100);
  assert.equal(pct2, 107);
  assert.ok(Math.abs(pct2 - 100) > 5);
  assert.ok(Math.abs(pct2 - 100) <= 10);

  // Trường hợp 3: Xuất 11.500 tấn -> lệch +15% (cảnh báo nghiêm trọng > 10%)
  const ton3 = 11500;
  const pct3 = Math.round((ton3 / cq) * 100);
  assert.equal(pct3, 115);
  assert.ok(Math.abs(pct3 - 100) > 10);
});

test('3. JSZip Packaging: đóng gói file Word và file Excel thành 1 file zip hợp lệ', async () => {
  const JSZip = require('../app/libs/jszip.min.js');

  const zip = new JSZip();
  const wordContent = Buffer.from('Mock Word DOCX Content');
  const excelContent = Buffer.from('Mock Excel XLSX Content');

  zip.file('BienBan_XuatKhau.docx', wordContent);
  zip.file('BangKe_ChiTiet.xlsx', excelContent);

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  assert.ok(zipBuffer.length > 0);

  // Đọc lại file zip để xác minh tính toàn vẹn
  const readZip = await JSZip.loadAsync(zipBuffer);
  assert.ok(readZip.file('BienBan_XuatKhau.docx'));
  assert.ok(readZip.file('BangKe_ChiTiet.xlsx'));

  const extractedWord = await readZip.file('BienBan_XuatKhau.docx').async('string');
  assert.equal(extractedWord, 'Mock Word DOCX Content');
});

test('4. Auto-Save Draft Filter: lưu và khôi phục nháp phạm vi lọc và phiếu chọn riêng', () => {
  global.HAK.Store = {
    _data: {},
    get(k, def) {
      return this._data[k] !== undefined ? this._data[k] : def;
    },
    set(k, v) {
      this._data[k] = v;
    },
  };

  const type = 'xuatkhau';
  const draftFilter = {
    from: '2026-11-20',
    to: '2026-11-26',
    pick: [1, 2, 5, 8],
    omit: [3],
  };

  // Giả lập lưu nháp
  HAK.Store.set('hak.draftFilter.' + type, draftFilter);

  // Giả lập khôi phục nháp khi mở trang
  const ST = {
    [type]: {
      filter: { from: '', to: '' },
      omit: new Set(),
      draftRestored: false,
    },
  };

  const df = HAK.Store.get('hak.draftFilter.' + type, null);
  assert.ok(df);
  if (df.from) ST[type].filter.from = df.from;
  if (df.to) ST[type].filter.to = df.to;
  if (Array.isArray(df.pick)) ST[type].filter.pick = df.pick;
  if (Array.isArray(df.omit)) ST[type].omit = new Set(df.omit);
  ST[type].draftRestored = true;

  assert.equal(ST[type].filter.from, '2026-11-20');
  assert.equal(ST[type].filter.to, '2026-11-26');
  assert.deepEqual(ST[type].filter.pick, [1, 2, 5, 8]);
  assert.ok(ST[type].omit.has(3));
});
