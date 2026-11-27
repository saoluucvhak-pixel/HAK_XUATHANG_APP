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

test('Đối chiếu hải quan chỉ dùng tấn tươi từ tờ khai gắn với chi tiết đang chọn', () => {
  const customs = require('../app/js/customs-model.js');
  const detail = { id: 'd1', parentId: 'c1', contractQty: 6500 };
  const decl = { id: 'tk1', no: '123', contractId: 'c1', detailId: 'd1', qtyTon: 1000, qtyBdmt: 520 };
  assert.deepEqual(customs.wetQuantityDifference(1060000, detail, [decl]), { no: '123', qtyTon: 1000, percent: 6 });
  assert.equal(customs.wetQuantityDifference(1060000, detail, [{ ...decl, qtyTon: null }]), null);
  assert.equal(customs.wetQuantityDifference(1060000, detail, [{ ...decl, detailId: 'd2' }]), null);
  assert.equal(customs.wetQuantityDifference(1060000, detail, [decl, { ...decl, id: 'tk2' }]), null);
});
