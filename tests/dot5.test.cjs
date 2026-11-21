/**
 * tests/dot5.test.cjs — Kiểm thử cho Đợt 5 (v2.25.6)
 * L-16 (+ N-07), L-17, L-18, L-31, N-08 & N-09, N-10, N-11 & N-12 (+ U-04)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.HAK = {};

require('../app/js/ui.js');
require('../app/js/util.js');
require('../app/js/excel.js');
require('../app/js/doc-extract.js');
const CP = require('../app/js/contract-parser.js');
const D = require('../app/js/document-import.js');
require('../app/js/pages-modals.js');
require('../app/js/generator.js');

test('L-17 & HAK.UI.confirm: uiConfirm trả về Promise<boolean> và hỗ trợ _confirm hook', async () => {
  assert.equal(typeof HAK.UI.confirm, 'function');
  // Mặc định trong môi trường Node không có DOM / Bootstrap
  const r1 = await HAK.UI.confirm('Test confirm');
  assert.equal(typeof r1, 'boolean');

  // Test hook HAK.UI._confirm
  let askedMsg = '';
  HAK.UI._confirm = (msg) => {
    askedMsg = msg;
    return false;
  };
  const r2 = await HAK.UI.confirm('Cảnh báo xóa dữ liệu?');
  assert.equal(askedMsg, 'Cảnh báo xóa dữ liệu?');
  assert.equal(r2, false);
  delete HAK.UI._confirm;
});

test('L-17: Cảnh báo thiếu HĐ và thiếu đơn giá trong generator', () => {
  // Mock Config for generator
  HAK.Config = {
    data: { general: { blankDots: 10 } },
    company: (id) => ({ id: id || 'co1', name: 'Công ty ' + id, short: 'CT' }),
    warehouse: (id) => ({ id: id || 'wh1', name: 'Kho ' + id, short: 'K1' }),
  };
  const ds = {
    ok: true,
    rows: [
      {
        idx: 1,
        ticket: '101',
        plate: '43C-1234',
        driver: 'A',
        net: 10000,
        ts1: Date.UTC(2026, 6, 1, 8, 0),
        dateStr: '01/07/2026',
        time1: '08:00',
      },
    ],
  };

  // Xuất bán: thiếu contractNo và thiếu unitPrice
  const xbRes = HAK.Generator.build('xuatban', ds, {
    giaoId: 'co1',
    nhanId: 'co2',
    contractNo: '',
    unitPrice: '',
  });
  assert.ok(xbRes.warnings.some((w) => w.includes('hợp đồng mua bán')));
  assert.ok(xbRes.warnings.some((w) => w.includes('đơn giá')));

  // Ủy thác: thiếu contractNo
  const utRes = HAK.Generator.build('uythac', ds, {
    giaoId: 'co1',
    nhanId: 'co2',
    ship: 'TAU A',
    contractNo: '',
  });
  assert.ok(utRes.warnings.some((w) => w.includes('hợp đồng ủy thác')));
});

test('L-18: word.js không lộ HAKDocs và xử lý result.error là object', async () => {
  // Đọc mã nguồn word.js để đảm bảo không còn chuỗi "trình hỗ trợ lưu tệp (HAKDocs)"
  const fs = require('fs');
  const code = fs.readFileSync(require.resolve('../app/js/word.js'), 'utf8');
  assert.ok(!code.includes('trình hỗ trợ lưu tệp (HAKDocs)'), 'Không còn lộ tên nội bộ HAKDocs');
  assert.ok(code.includes("result.error === 'object'"), 'Đã có kiểm tra result.error là object');
});

test('L-31: Cảnh báo ô dạng ngoặc "(1.200)" ở contract-parser.js theo Quy tắc 28', () => {
  const text = 'PURCHASE ORDER\nSeller: CTY A\nBuyer: CTY B\nQuantity: (1.200) BDMT\nPrice: (150) USD/BDMT';
  const notes = CP.parenNumberNotes(text);
  assert.deepEqual(notes, ['(1.200)', '(150)']);

  const extracted = CP.extract([{ page: 1, text }]);
  assert.equal(extracted.lots.length, 0, 'Không biến số ngoặc thành số lô');
  assert.ok(extracted.warnings.length >= 1, 'Có cảnh báo Quy tắc 28');
  assert.ok(extracted.warnings[0].includes('quy tắc 28'), 'Cảnh báo nêu rõ quy tắc 28');
});

test('N-11 & N-12: Chuẩn hóa mã phiếu, xử lý ngoặc kép và khoảng trắng', () => {
  const norm = HAK.PagesModals.normTicketToken;
  assert.equal(norm('"12345"'), '12345');
  assert.equal(norm("'0123'"), '0123');
  assert.equal(norm('“43C-999”'), '43C-999');
  assert.equal(norm('  "AB 123"  '), 'AB 123');

  const parse = HAK.PagesModals.parseTicketTokens;
  assert.deepEqual(parse('"001", "002"; 003\n"004"'), ['001', '002', '003', '004']);
  assert.deepEqual(parse('101 102, "103 104"'), ['101', '102', '103 104']);

  const rows = [{ ticket: '0101' }, { ticket: 'AB-0102' }, { ticket: 'ABC/103' }, { ticket: '43C 123' }];
  const res = HAK.PagesModals.resolveTicket;
  assert.equal(res(rows, '"0101"').kind, 'one');
  assert.equal(res(rows, '0102').kind, 'one'); // khớp đuôi
  assert.equal(res(rows, '"ABC"').kind, 'one'); // khớp tiền tố
  assert.equal(res(rows, '"43C 123"').kind, 'one'); // khớp có khoảng trắng
  assert.equal(res(rows, '9999').kind, 'none');
});

test('N-11 & N-12: Tách số phiếu phân biệt ngoài phạm vi giờ/ngày vs KL<=0 vs không tìm thấy', () => {
  const split = HAK.PagesModals.splitMissing;
  const excluded = [{ ticket: '0099' }];
  const allRows = [{ ticket: '0101' }, { ticket: '0102' }, { ticket: '0103' }];
  const inScopeRows = [{ ticket: '0101' }];

  const res = split(excluded, ['0102', '0099', 'unknown'], allRows, inScopeRows);
  assert.deepEqual(res.outOfRange, ['0102'], '0102 có trong dữ liệu nhưng ngoài phạm vi lọc');
  assert.deepEqual(res.excluded, ['0099'], '0099 bị loại do KL <= 0');
  assert.deepEqual(res.notFound, ['unknown'], 'unknown không tìm thấy');
});
