/* tests/excel-template.test.cjs — Kiểm thử toàn diện Mẫu nhập Excel theo HAK Standards */
const { test } = require('node:test'),
  assert = require('node:assert/strict');

global.window = global;
global.HAK = {};
const XLSX = require('../app/libs/xlsx.full.min.js');
global.XLSX = XLSX;

// Giả lập HAK.Store trong RAM cho test
const storeMap = new Map();
global.HAK.Store = {
  get: (k, def) => (storeMap.has(k) ? JSON.parse(storeMap.get(k)) : def),
  set: (k, v) => {
    storeMap.set(k, JSON.stringify(v));
    return true;
  },
  remove: (k) => storeMap.delete(k),
  keys: () => Array.from(storeMap.keys()),
};

require('../app/js/excel.js');
require('../app/js/generator.js');
require('../app/js/read-config.js');
const ExcelTemplate = require('../app/js/excel-template.js');

const createWorkbook = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return wb;
};

test('1. Quản lý mẫu: tạo, sửa, sao chép, xóa và đặt làm mặc định', () => {
  storeMap.clear();

  // Tạo mẫu mới
  const tpl1 = ExcelTemplate.save({
    name: 'Mẫu Cân Cảng Hải Vân',
    headerRow: 1,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng' },
    fallbackUnit: 'kg',
    isDefault: true,
  });

  assert.ok(tpl1.id);
  assert.equal(tpl1.name, 'Mẫu Cân Cảng Hải Vân');
  assert.equal(ExcelTemplate.getDefaultId(), tpl1.id);
  assert.equal(ExcelTemplate.getDefault().name, 'Mẫu Cân Cảng Hải Vân');

  // Sửa mẫu
  tpl1.fallbackUnit = 'tan';
  ExcelTemplate.save(tpl1);
  assert.equal(ExcelTemplate.get(tpl1.id).fallbackUnit, 'tan');

  // Sao chép mẫu
  const copied = ExcelTemplate.copy(tpl1.id);
  assert.notEqual(copied.id, tpl1.id);
  assert.equal(copied.name, 'Mẫu Cân Cảng Hải Vân (bản sao)');
  assert.equal(copied.fallbackUnit, 'tan');
  assert.equal(copied.isDefault, false);
  assert.equal(ExcelTemplate.list().length, 2);

  // Đổi mặc định sang Tự nhận diện
  ExcelTemplate.setDefault(null);
  assert.equal(ExcelTemplate.getDefault(), null);

  // Xóa mẫu
  const removed = ExcelTemplate.remove(copied.id);
  assert.equal(removed, true);
  assert.equal(ExcelTemplate.list().length, 1);
});

test('2. Tiêu đề hai dòng: dòng 1 là tiêu đề bảng/nhóm, dòng 2 là tiêu đề cột', () => {
  // Dòng 1: Tiêu đề báo cáo
  // Dòng 2: Tiêu đề cột
  // Dòng 3, 4: Dữ liệu
  const sheetData = [
    ['CÔNG TY CỔ PHẦN CÂN ĐIỆN TỬ BÌNH ĐỊNH - PHIẾU CÂN XUẤT HÀNG'],
    ['Mã phiếu', 'Số xe', 'Thời gian', 'Khối lượng hàng'],
    ['0101', '43C-111.11', '20/10/2026 08:30', 25000],
    ['0102', '43C-222.22', '20/10/2026 09:15', 28000],
  ];
  const wb = createWorkbook({ Sheet1: sheetData });

  const tpl = {
    name: 'Mẫu 2 dòng',
    headerRow: 2,
    headerNames: { ticket: 'Mã phiếu', plate: 'Số xe', date: 'Thời gian', net: 'Khối lượng hàng' },
    fallbackUnit: 'kg',
  };

  const probe = ExcelTemplate.probeTemplate(wb, 'Sheet1', tpl);
  assert.equal(probe.ok, true);
  assert.equal(probe.stats.trips, 2);
  assert.equal(probe.stats.kg, 53000);
  assert.equal(probe.sampleRows[0].ticket, '0101');
  assert.equal(probe.sampleRows[0].plate, '43C-111.11');
});

test('3. Đổi thứ tự cột: ghép theo tên tiêu đề đã lưu vẫn nhận diện chính xác', () => {
  // Thứ tự đảo lộn: Biển số -> Khối lượng -> Ngày -> Phiếu
  const sheetData = [
    ['Số xe', 'KL hàng hóa', 'Ngày cân', 'Số phiếu'],
    ['43C-999.99', 35000, '21/10/2026 10:00', '0205'],
    ['43C-888.88', 32000, '21/10/2026 10:30', '0206'],
  ];
  const wb = createWorkbook({ Sheet1: sheetData });

  const tpl = {
    name: 'Mẫu đổi thứ tự',
    headerRow: 1,
    headerNames: {
      ticket: 'Số phiếu',
      plate: 'Số xe',
      date: 'Ngày cân',
      net: 'KL hàng hóa',
    },
    fallbackUnit: 'kg',
  };

  const match = ExcelTemplate.matchTemplate(tpl, sheetData[0]);
  assert.equal(match.ok, true);
  assert.equal(match.mapping.plate, 0); // Số xe ở cột 0
  assert.equal(match.mapping.net, 1); // KL hàng hóa ở cột 1
  assert.equal(match.mapping.date, 2); // Ngày cân ở cột 2
  assert.equal(match.mapping.ticket, 3); // Số phiếu ở cột 3

  const probe = ExcelTemplate.probeTemplate(wb, 'Sheet1', tpl);
  assert.equal(probe.ok, true);
  assert.equal(probe.stats.trips, 2);
  assert.equal(probe.stats.kg, 67000);
  assert.equal(probe.sampleRows[0].plate, '43C-999.99');
  assert.equal(probe.sampleRows[0].ticket, '0205');
});

test('4. Thiếu hoặc trùng tiêu đề: phát hiện và báo lỗi rõ ràng', () => {
  // Thiếu cột Biển số
  const headersMissing = ['Số phiếu', 'Ngày cân', 'Khối lượng'];
  const tpl = {
    name: 'Mẫu test',
    headerRow: 1,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng' },
  };

  const matchMissing = ExcelTemplate.matchTemplate(tpl, headersMissing);
  assert.equal(matchMissing.ok, false);
  assert.ok(matchMissing.errors.some((e) => e.includes('Biển số xe')));

  // Cột tại vị trí cũ có nội dung khác thì mẫu phải được xác nhận lại.
  const wrongHeader = ExcelTemplate.matchTemplate({ ...tpl, columns: { net: 3 } }, ['Số phiếu', 'Biển số', 'Ngày cân', 'Đơn giá']);
  assert.equal(wrongHeader.ok, false);
  assert.equal(wrongHeader.mapping.net, -1);
  const qualifiedTemplate = { ...tpl, headerNames: { ...tpl.headerNames, net: 'Khối lượng (khô)' } };
  const qualified = ExcelTemplate.matchTemplate(qualifiedTemplate, [
    'Số phiếu',
    'Biển số',
    'Ngày cân',
    'Khối lượng (tươi)',
    'Khối lượng (khô)',
  ]);
  assert.equal(qualified.ok, true);
  assert.equal(qualified.mapping.net, 4);
  assert.equal(ExcelTemplate.matchTemplate(qualifiedTemplate, ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng (tươi)']).ok, false);

  // Trùng tiêu đề Biển số ở 2 cột
  const headersDup = ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng', 'Biển số'];
  const matchDup = ExcelTemplate.matchTemplate(tpl, headersDup);
  assert.equal(matchDup.ok, false);
  assert.ok(matchDup.errors.some((e) => e.includes('Trùng tiêu đề')));
});

test('5. Chuẩn hóa đơn vị kg / tấn (dòng, tiêu đề, fallbackUnit)', () => {
  // Ca 5a: Cột đơn vị ghi 'tấn' vs 'kg'
  const sheetUnitCol = [
    ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng', 'Đơn vị tính'],
    ['P1', '43C-111.11', '22/10/2026', 20.5, 'tấn'],
    ['P2', '43C-222.22', '22/10/2026', 15000, 'kg'],
  ];
  const wb1 = createWorkbook({ S1: sheetUnitCol });
  const tplUnitCol = {
    name: 'Mẫu có cột DVT',
    headerRow: 1,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng', unit: 'Đơn vị tính' },
  };
  const p1 = ExcelTemplate.probeTemplate(wb1, 'S1', tplUnitCol);
  assert.equal(p1.ok, true);
  assert.equal(p1.sampleRows[0].net, 20500); // 20.5 tấn -> 20,500 kg
  assert.equal(p1.sampleRows[1].net, 15000); // 15,000 kg

  // Ca 5b: Tiêu đề ghi '(tấn)'
  const sheetHeadUnit = [
    ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng (tấn)'],
    ['P3', '43C-333.33', '22/10/2026', 30.2],
  ];
  const wb2 = createWorkbook({ S2: sheetHeadUnit });
  const tplHead = {
    name: 'Mẫu tiêu đề tấn',
    headerRow: 1,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng (tấn)' },
  };
  const p2 = ExcelTemplate.probeTemplate(wb2, 'S2', tplHead);
  assert.equal(p2.ok, true);
  assert.equal(p2.sampleRows[0].net, 30200); // 30.2 -> 30,200 kg

  // Ca 5c: Không ghi đơn vị nhưng fallbackUnit = 'tan'
  const sheetPlain = [
    ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng'],
    ['P4', '43C-444.44', '22/10/2026', 18.4],
  ];
  const wb3 = createWorkbook({ S3: sheetPlain });
  const tplFallbackTan = {
    name: 'Mẫu dự phòng tấn',
    headerRow: 1,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng' },
    fallbackUnit: 'tan',
  };
  const p3 = ExcelTemplate.probeTemplate(wb3, 'S3', tplFallbackTan);
  assert.equal(p3.ok, true);
  assert.equal(p3.sampleRows[0].net, 18400); // 18.4 * 1000 = 18,400 kg

  const wb4 = createWorkbook({
    S4: [
      ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng (kg)', 'Đơn vị tính'],
      ['P5', '43C-555.55', '22/10/2026', 25000, ''],
      ['P6', '43C-666.66', '22/10/2026', 20, 'tấn'],
    ],
  });
  const p4 = ExcelTemplate.probeTemplate(wb4, 'S4', { ...tplUnitCol, fallbackUnit: 'tan' });
  assert.equal(p4.ok, true);
  assert.deepEqual(
    p4.sampleRows.map((r) => r.net),
    [25000, 20000]
  );
});

test('Tiêu đề ngoài dòng/cột đầu dùng đúng tọa độ Excel và giữ số 0 của mã phiếu', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(
    ws,
    [
      ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng'],
      [102, '43C-12345', '22/10/2026', 25000],
    ],
    {
      origin: 'C5',
    }
  );
  ws['!ref'] = 'C5:F6';
  ws.C6.z = '0000';
  ws.C6.w = '0102';
  XLSX.utils.book_append_sheet(wb, ws, 'Cân');
  const probe = ExcelTemplate.probeTemplate(wb, 'Cân', {
    headerRow: 5,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng' },
  });
  assert.equal(probe.ok, true);
  assert.equal(probe.ds.headerRow, 4);
  assert.equal(probe.ds.columns[0].letter, 'C');
  assert.equal(probe.sampleRows[0].ticket, '0102');
});

test('6. Bỏ qua dòng chữ ký / ngày ký ở cuối bảng không bị coi là lỗi', () => {
  const sheetData = [
    ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng hàng'],
    ['P10', '43C-555.55', '23/10/2026', 22000],
    ['P11', '43C-666.66', '23/10/2026', 24000],
    ['', '', 'Đà Nẵng, ngày 23 tháng 10 năm 2026', ''],
    ['', 'NGƯỜI LẬP BIỂU', '', 'THỦ KHO'],
    ['', '(Ký, ghi rõ họ tên)', '', '(Ký, ghi rõ họ tên)'],
  ];
  const wb = createWorkbook({ S: sheetData });
  const tpl = {
    name: 'Mẫu có chữ ký',
    headerRow: 1,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng hàng' },
  };

  const probe = ExcelTemplate.probeTemplate(wb, 'S', tpl);
  assert.equal(probe.ok, true);
  assert.equal(probe.stats.trips, 2);
  assert.equal(probe.stats.kg, 46000);
  assert.equal(probe.ds.noWeightRows.length, 0); // Không bị đếm nhầm dòng chữ ký thành noWeight
});

test('7. Giữ nguyên số 0 ở đầu của mã phiếu (0101, 00456)', () => {
  const sheetData = [
    ['Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng hàng'],
    ['0101', '43C-101.01', '24/10/2026', 21000],
    ['00456', '43C-202.02', '24/10/2026', 23000],
  ];
  const wb = createWorkbook({ S: sheetData });
  const tpl = {
    name: 'Mẫu số 0 đầu',
    headerRow: 1,
    headerNames: { ticket: 'Số phiếu', plate: 'Biển số', date: 'Ngày cân', net: 'Khối lượng hàng' },
  };

  const probe = ExcelTemplate.probeTemplate(wb, 'S', tpl);
  assert.equal(probe.ok, true);
  assert.equal(probe.sampleRows[0].ticket, '0101');
  assert.equal(probe.sampleRows[1].ticket, '00456');
});

test('8. Tải lại app: khôi phục mẫu và giữ nguyên cấu hình của đợt cũ khi mẫu mặc định đổi', () => {
  storeMap.clear();

  // Lưu mẫu M1 làm mặc định
  const m1 = ExcelTemplate.save({
    name: 'Mẫu NCC 1',
    headerRow: 1,
    headerNames: { ticket: 'Phiếu', plate: 'Xe', date: 'Ngày', net: 'Hàng' },
    fallbackUnit: 'kg',
    isDefault: true,
  });

  // Giả lập lưu đợt dữ liệu Batch A theo M1
  const batchA = {
    fileName: 'dotA.xlsx',
    sheet: 'Sheet1',
    headerRow: m1.headerRow,
    mapping: { ticket: 0, plate: 1, date: 2, net: 3 },
    templateId: m1.id,
    templateName: m1.name,
    fallbackUnit: m1.fallbackUnit,
  };

  // Quản trị viên sau đó tạo mẫu M2 và đặt M2 làm mặc định
  const m2 = ExcelTemplate.save({
    name: 'Mẫu NCC 2 (mới)',
    headerRow: 2,
    headerNames: { ticket: 'Mã số phiếu', plate: 'Biển kiểm soát', date: 'Thời điểm', net: 'Trọng lượng' },
    fallbackUnit: 'tan',
    isDefault: true,
  });

  assert.equal(ExcelTemplate.getDefaultId(), m2.id);

  // Khi đợt A mở lại (từ IndexedDB meta), nó giữ nguyên cấu hình của nó
  assert.equal(batchA.templateId, m1.id);
  assert.equal(batchA.templateName, 'Mẫu NCC 1');
  assert.equal(batchA.headerRow, 1);
  assert.equal(batchA.fallbackUnit, 'kg');

  // Đọc lại batch A với workbook
  const wbA = createWorkbook({
    Sheet1: [
      ['Phiếu', 'Xe', 'Ngày', 'Hàng'],
      ['P100', '43C-777.77', '25/10/2026', 19000],
    ],
  });

  const parsed = HAK.Excel.parseSheet(wbA, batchA.sheet, {
    headerRow: batchA.headerRow,
    mapping: batchA.mapping,
    fallbackUnit: batchA.fallbackUnit,
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.stats.trips, 1);
  assert.equal(parsed.stats.kg, 19000);
});

test('7. Tự động xuất và tải file Excel mẫu (.xlsx) theo cấu hình mẫu mới', async () => {
  const tpl = {
    name: 'Mẫu Cân Cảng Thị Vải',
    sheet: 'PHIEU CAN THI VAI',
    headerRow: 3,
    fallbackUnit: 'tan',
    headerNames: {
      ticket: 'Số Phiếu Cân',
      plate: 'Biển Số Xe',
      date: 'Thời Gian Cân',
      tare: 'TL Xe Không',
      gross: 'TL Có Hàng',
      net: 'Trọng Lượng Hàng',
      unit: 'ĐVT',
      wh: 'Kho Hàng',
      note: 'Ghi Chú Đợt',
    },
    columns: {
      ticket: 0,
      date: 1,
      plate: 2,
      tare: 3,
      gross: 4,
      net: 5,
      unit: 6,
      wh: 7,
      note: 8,
    },
  };

  const wb = ExcelTemplate.buildTemplateWorkbook(tpl);
  assert.ok(wb);
  assert.ok(wb.Sheets['PHIEU CAN THI VAI']);
  assert.ok(wb.Sheets['DS XE - TAI XE']);
  assert.ok(wb.Sheets['HUONG DAN']);

  // Kiểm tra sheet chính
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['PHIEU CAN THI VAI'], { header: 1, raw: true });
  assert.ok(rows.length >= 6); // dòng 1 (tiêu đề), dòng 2 (trống), dòng 3 (tiêu đề cột), dòng 4-6 (3 dòng mẫu)

  // Dòng 1: Tiêu đề phiếu
  assert.match(String(rows[0][0]), /BẢNG KÊ PHIẾU CÂN/i);

  // Dòng 3 (0-indexed = 2): Tiêu đề các cột
  const headerCells = rows[2];
  assert.equal(headerCells[0], 'Số Phiếu Cân');
  assert.equal(headerCells[1], 'Thời Gian Cân');
  assert.equal(headerCells[2], 'Biển Số Xe');
  assert.equal(headerCells[5], 'Trọng Lượng Hàng');
  assert.equal(headerCells[6], 'ĐVT');

  // Dòng dữ liệu mẫu 4 (0-indexed = 3): Đơn vị tấn
  const sample1 = rows[3];
  assert.equal(sample1[0], '00101');
  assert.equal(sample1[2], '51C-123.45');
  assert.equal(sample1[5], 15.5); // 15.5 tấn
  assert.equal(sample1[6], 'tấn');

  // Sheet DS XE - TAI XE có thông tin 3 xe
  const xeRows = XLSX.utils.sheet_to_json(wb.Sheets['DS XE - TAI XE'], { header: 1, raw: true });
  assert.equal(xeRows[1][1], '51C-123.45');
  assert.equal(xeRows[2][1], '60A-987.65');
  assert.equal(xeRows[3][1], '72B-456.78');

  // Sheet HUONG DAN có thông tin mẫu
  const hdRows = XLSX.utils.sheet_to_json(wb.Sheets['HUONG DAN'], { header: 1, raw: true });
  assert.match(String(hdRows[0][0]), /HƯỚNG DẪN/i);

  // Thử downloadTemplateFile với cấu hình object
  const out = await ExcelTemplate.downloadTemplateFile(tpl);
  assert.ok(out);
});

test('tiêu đề gộp dọc và ngày, giờ vào, giờ ra riêng được đọc theo cùng cấu hình', () => {
  const wb = createWorkbook({
    Can: [
      ['Số phiếu', 'Biển số', 'Thời gian', null, null, 'Khối lượng (kg)'],
      [null, null, 'Ngày cân', 'Giờ cân vào', 'Giờ cân ra'],
      ['0101', '43C-12345', '26/11/2026', 23.5 / 24, 0, 25000],
    ],
  });
  wb.Sheets.Can['!merges'] = ['A1:A2', 'B1:B2', 'C1:E1', 'F1:F2'].map(XLSX.utils.decode_range);
  const template = {
    headerRow: 2,
    headerNames: {
      ticket: 'Số phiếu',
      plate: 'Biển số',
      date: 'Ngày cân',
      timeIn: 'Giờ cân vào',
      timeOut: 'Giờ cân ra',
      net: 'Khối lượng',
    },
    fallbackUnit: 'tan',
    explicitTime: true,
  };
  const result = ExcelTemplate.probeTemplate(wb, 'Can', template);
  assert.equal(result.ok, true);
  assert.equal(result.stats.kg, 25000);
  assert.equal(result.sampleRows[0].ts1, Date.UTC(2026, 10, 26, 23, 30));
  assert.equal(result.sampleRows[0].ts2, Date.UTC(2026, 10, 27));
  assert.equal(result.headerCells[2], 'Ngày cân');

  const timeAsDate = ExcelTemplate.probeTemplate(wb, 'Can', {
    ...template,
    headerNames: { ...template.headerNames, date: 'Giờ cân vào', timeIn: '' },
  });
  assert.equal(timeAsDate.ok, false);
  assert.match(timeAsDate.errors.join(' '), /không có giá trị ngày hợp lệ/);
});

test('mẫu có ngày giờ chung tôn trọng lựa chọn để trống các cột giờ riêng', () => {
  const wb = createWorkbook({
    Can: [
      ['Biển số', 'Ngày giờ cân', 'Giờ cân vào', 'Giờ cân ra', 'Khối lượng'],
      ['43C-12345', '26/11/2026 08:20', '12:10', '13:15', 21000],
    ],
  });
  const template = {
    headerRow: 1,
    headerNames: { plate: 'Biển số', date: 'Ngày giờ cân', net: 'Khối lượng' },
    explicitTime: true,
  };
  const result = ExcelTemplate.probeTemplate(wb, 'Can', template);
  assert.equal(result.ok, true);
  assert.equal(result.sampleRows[0].ts1, Date.UTC(2026, 10, 26, 8, 20));
  assert.equal(result.sampleRows[0].ts2, null);
});
