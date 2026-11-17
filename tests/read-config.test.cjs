/* Đổi cách đọc Excel (sheet / dòng tiêu đề / ánh xạ cột): đọc thử trước khi áp dụng; có dòng trùng hoặc kết quả không hợp lệ thì giữ cấu hình hợp lệ gần nhất. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const XLSX = require('../app/libs/xlsx.full.min.js');
global.XLSX = XLSX;
require('../app/js/excel.js');
require('../app/js/generator.js');
const RC = require('../app/js/read-config.js');

const H = ['Số phiếu', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
const r1 = ['P1', '43C-12345', '03/02/2026 08:15', 30000, 10000, 20000],
  r2 = ['P2', '43C-22222', '03/02/2026 09:00', 31000, 10000, 21000];
const book = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return wb;
};
const cfg = (sheet, extra) => Object.assign({ sheet, mapping: {}, headerRow: null }, extra);

test('sheet A sạch, sheet B có dòng trùng: đổi sang B bị từ chối và báo đúng sheet, số phiếu, số dòng Excel; A vẫn dùng được', () => {
  const wb = book({ A: [H, r1, r2], B: [H, r1, r1, r2] });
  const a = RC.probeRead(wb, cfg('A')),
    b = RC.probeRead(wb, cfg('B'));
  assert.equal(a.ds.ok, true);
  assert.equal(a.dups.length, 0);
  assert.equal(RC.decide(true, a).apply, true);
  const v = RC.decide(true, b);
  assert.equal(v.apply, false);
  assert.equal(v.code, 'dup');
  assert.match(v.why, /sheet "B"/);
  assert.match(v.why, /phiếu P1/);
  assert.match(v.why, /dòng Excel 2, 3/);
  assert.match(v.why, /1 dòng trùng hoàn toàn/);
  assert.match(v.hint, /chọn sheet khác/);
  assert.equal(RC.decide(false, b).apply, false, 'đợt chưa hợp lệ cũng không nhận dữ liệu trùng');
});
test('đổi ánh xạ làm hai dòng cùng nhận diện bị từ chối; sửa lại ánh xạ thì áp dụng được', () => {
  const H2 = ['Số phiếu', 'Mã phụ', 'Biển số', 'Ngày giờ cân', 'Trọng lượng xe + hàng', 'Trọng lượng xe', 'Trọng lượng hàng'];
  const wb = book({
    S: [
      H2,
      ['P1', 'K1', '43C-12345', '03/02/2026 08:15', 30000, 10000, 20000],
      ['P2', 'K1', '43C-12345', '03/02/2026 08:15', 31000, 10000, 21000],
    ],
  });
  const auto = RC.probeRead(wb, cfg('S'));
  assert.equal(auto.ds.ok, true);
  assert.equal(auto.dups.length, 0, 'nhận diện tự động dùng cột Số phiếu → hai phiếu khác nhau');
  const colMaPhu = auto.ds.columns.findIndex((c) => /Mã phụ/.test(c.name || c.header || c));
  const bad = RC.probeRead(wb, cfg('S', { mapping: { ticket: colMaPhu >= 0 ? colMaPhu : 1 } }));
  const v = RC.decide(true, bad);
  assert.equal(v.apply, false);
  assert.match(v.why, /phiếu K1/);
  assert.match(v.why, /dòng Excel 2, 3/);
  const fixed = RC.probeRead(wb, cfg('S', { mapping: { ticket: 0 } }));
  assert.equal(fixed.dups.length, 0);
  assert.equal(RC.decide(true, fixed).apply, true);
});
test('đang có dữ liệu hợp lệ mà cách đọc mới không hợp lệ: giữ cấu hình cũ; đợt chưa hợp lệ thì cho thử tiếp', () => {
  const wb = book({ A: [H, r1, r2], RONG: [['không', 'có', 'dữ liệu cân']] });
  const bad = RC.probeRead(wb, cfg('RONG'));
  assert.equal(bad.ds.ok, false);
  const keep = RC.decide(true, bad);
  assert.equal(keep.apply, false);
  assert.equal(keep.code, 'invalid');
  assert.match(keep.hint, /chọn sheet khác/);
  assert.equal(RC.decide(false, bad).apply, true, 'đợt hiện chưa hợp lệ: cho người dùng chỉnh tiếp để sửa');
});
test('sheet không tồn tại / lỗi đọc được coi là không hợp lệ chứ không làm văng', () => {
  const wb = book({ A: [H, r1] });
  const p = RC.probeRead(wb, cfg('KHONG_CO'));
  assert.equal(p.ds.ok, false);
  assert.equal(RC.decide(true, p).apply, false);
});
test('ba dòng giống hệt: báo số dòng thừa, không phải số nhóm', () => {
  const wb = book({ A: [H, r1, r1, r1, r2] });
  const v = RC.decide(true, RC.probeRead(wb, cfg('A')));
  assert.match(v.why, /2 dòng trùng hoàn toàn/);
  assert.match(v.why, /dòng Excel 2, 3, 4/);
});
test('dòng giống nhau về số phiếu nhưng khác biển số hoặc giờ cân không bị coi là trùng (khớp quy tắc nạp file)', () => {
  const wb = book({
    A: [H, r1, ['P1', '43C-99999', '03/02/2026 08:15', 30000, 10000, 20000], ['P1', '43C-12345', '03/02/2026 10:00', 30000, 10000, 20000]],
  });
  const p = RC.probeRead(wb, cfg('A'));
  assert.equal(p.dups.length, 0);
  assert.equal(RC.decide(true, p).apply, true);
});
