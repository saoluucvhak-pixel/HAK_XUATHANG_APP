/* Phiếu xuất kho PXKKVCNB (đầu ra nhập Bkav): đánh số, số lượng, HopDongSo, điền bổ sung file cũ. */
const { test } = require('node:test'), assert = require('node:assert/strict');
global.window = global; global.HAK = {};
const X = require('../app/js/pxk-model.js'), G = (global.HAK.Generator = {}, null);
const V = { idBatDau: '111', maHang: 'DAM', tenHang: 'Dăm keo', dvt: 'Tấn', tenDonVi: 'Kho A', nhapKho: 'Cảng B', canCuLenh: 'LX-01', veViec: 'Xuất khẩu', lyDo: 'Bán hàng', donViVC: 'ĐVVC mặc định', xuatKhoTai: 'Kho A' };
const truck = (i, kg, extra) => Object.assign({ net: kg, dateStr: '16/08/2026', driver: 'Tài ' + i, carrier: i % 2 ? 'Cty X' : '', plate: '43C-' + i }, extra);
const col = (p, n) => p.aoa[0].indexOf(n);

test('mỗi phiếu cân (1 xe) = 1 dòng PXK; số PXK liên tiếp theo đúng thứ tự file, STT 1..n', () => {
  const rows = Array.from({ length: 1978 }, (_, i) => truck(i + 1, 27000 + i));
  const p = X.aoa(rows, V, { cua: 'CÔNG TY HAK', hopDong: 'IWC/HAKVT26-1793' });
  assert.equal(p.count, 1978); assert.equal(p.from, 111); assert.equal(p.to, 2088); assert.equal(p.aoa.length, 1979);
  assert.equal(p.aoa[1][col(p, 'IDChungTu/MaBill')], 'PXK000111'); assert.equal(p.aoa[1978][col(p, 'IDChungTu/MaBill')], 'PXK002088');
  assert.deepEqual(p.aoa.slice(1).map((r) => r[col(p, 'STT')]).filter((s, i) => s !== i + 1), []);
  const ids = p.aoa.slice(1).map((r) => +r[col(p, 'IDChungTu/MaBill')].slice(3)); for (let i = 1; i < ids.length; i++) assert.equal(ids[i], ids[i - 1] + 1);
});

test('các cột bắt buộc có đủ, thứ tự cột cố định (đầu vào Bkav)', () => {
  assert.deepEqual(X.HEADER.slice(0, 7), ['STT', 'LoaiHoaDon', 'IDChungTu/MaBill', 'MaHang', 'TenHangHoaDichVu', 'DonViTinh/ChietKhau', 'SoLuong']);
  ['HopDongSo', 'PhuongTienVanChuyen', 'XuatKhoTai', 'NguoiVanChuyen', 'DonViVanChuyen', 'CanCuLenh', 'NgayXuatKho', 'LyDoXuatKho'].forEach((c) => assert.ok(X.HEADER.indexOf(c) >= 0, c));
  assert.equal(new Set(X.HEADER).size, X.HEADER.length, 'tiêu đề không trùng');
});

test('nội dung dòng: loại pxk, số lượng tấn, hợp đồng, xe; đơn vị vận chuyển lấy theo xe rồi mới đến mặc định', () => {
  const p = X.aoa([truck(1, 27500), truck(2, 28100)], V, { cua: 'CTY', hopDong: 'HD-9' }), r = p.aoa[1], r2 = p.aoa[2];
  assert.equal(r[col(p, 'LoaiHoaDon')], 'pxk'); assert.equal(r[col(p, 'SoLuong')], 27.5); assert.equal(r[col(p, 'HopDongSo')], 'HD-9'); assert.equal(r[col(p, 'Cua')], 'CTY');
  assert.equal(r[col(p, 'PhuongTienVanChuyen')], '43C-1'); assert.equal(r[col(p, 'DonViVanChuyen')], 'Cty X'); assert.equal(r2[col(p, 'DonViVanChuyen')], 'ĐVVC mặc định');
  assert.equal(X.aoa([truck(1, 1000)], V, {}).aoa[1][col(p, 'HopDongSo')], '');   // chưa chọn hợp đồng → để trống
});

test('kg → tấn làm tròn half-up đúng cho MỌI giá trị kg nguyên (trước đây sai 286/60.000)', () => {
  for (let kg = 0; kg <= 60000; kg++) assert.equal(X.tan(kg), Math.floor((kg + 5) / 10) / 100, 'kg=' + kg);
  assert.equal(X.tan(145), 0.15); assert.equal(X.tan(1005), 1.01); assert.equal(X.tan(27545), 27.55); assert.equal(X.tan(null), 0);
});

test('fillHopDong: chỉ điền ô trống, tick ghi đè thì điền tất cả, bỏ dòng trống, thiếu cột thì thêm, sai file thì báo lỗi', () => {
  const mk = () => [['STT', 'IDChungTu/MaBill', 'HopDongSo'], [1, 'PXK1', ''], [2, 'PXK2', 'CŨ'], ['', '', ''], [3, 'PXK3']];
  let d = mk(), r = X.fillHopDong(d, 'HD-1', false);
  assert.deepEqual(r, { filled: 2, kept: 1 }); assert.deepEqual(d.map((x) => x[2]), ['HopDongSo', 'HD-1', 'CŨ', '', 'HD-1']);
  d = mk(); r = X.fillHopDong(d, 'HD-1', true); assert.deepEqual(r, { filled: 3, kept: 0 }); assert.equal(d[2][2], 'HD-1');
  d = [['STT', 'IDChungTu/MaBill'], [1, 'PXK1']]; X.fillHopDong(d, 'HD-2', false); assert.deepEqual(d[0], ['STT', 'IDChungTu/MaBill', 'HopDongSo']); assert.equal(d[1][2], 'HD-2');
  assert.throws(() => X.fillHopDong([['A', 'B'], [1, 2]], 'x', false), /không phải file phiếu xuất kho/);
  assert.throws(() => X.fillHopDong([], 'x', false));
  d = mk(); X.fillHopDong(d, 'HD-1', false); assert.deepEqual(X.fillHopDong(d, 'HD-1', false), { filled: 0, kept: 3 }, 'chạy lại không điền thêm');
});
