/**
 * pxk-model.js — Phiếu xuất kho PXKKVCNB (Excel nhập Bkav): HÀM THUẦN, không DOM → kiểm thử trong Node.
 *  - HEADER: các cột của file PXK; aoa(): đánh số mỗi phiếu cân (mỗi xe) một PXK liên tiếp từ "ID bắt đầu"; fillHopDong(): điền cột HopDongSo cho file cũ.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const HEADER = [
    'STT',
    'LoaiHoaDon',
    'IDChungTu/MaBill',
    'MaHang',
    'TenHangHoaDichVu',
    'DonViTinh/ChietKhau',
    'SoLuong',
    'DonGia',
    'ThanhTien',
    'MaTienTe',
    'TyGia',
    'TenDonVi',
    'MaSoThue',
    'NhapKhoTai',
    'NgayXuatKho',
    'CanCuLenh',
    'Ngay',
    'Cua',
    'VeViec',
    'LyDoXuatKho',
    'NguoiVanChuyen',
    'DonViVanChuyen',
    'HopDongSo',
    'PhuongTienVanChuyen',
    'XuatKhoTai',
    'GhiChu',
  ];
  /** kg → tấn (2 số lẻ), làm tròn half-up TRÊN SỐ NGUYÊN: Math.round(kg/1000*100)/100 làm tròn xuống sai ở 286 / 60.000 mức kg tận cùng 5 (vd 145 kg → 0,14 thay vì 0,15). */
  const tan = (kg) => Math.round((Number(kg) || 0) / 10) / 100;
  const pad6 = (n) => 'PXK' + String(n).padStart(6, '0');
  /**
   * rows = phiếu cân của đợt ({ net (kg), dateStr, driver, carrier, plate }); v = giá trị biểu mẫu; ctx = { cua, hopDong }.
   * 1 phiếu cân = 1 dòng PXK; số PXK = start + thứ tự dòng (đúng thứ tự file). Số lượng = kg / 1000 làm tròn 2 chữ số (tấn).
   * @returns {{ aoa: Array[], from: number, to: number, count: number }}
   */
  function aoa(rows, v, ctx) {
    ctx = ctx || {};
    const start = parseInt(v.idBatDau, 10),
      idx = (n) => HEADER.indexOf(n),
      out = [HEADER.slice()];
    rows.forEach((r, i) => {
      const row = new Array(HEADER.length).fill(null),
        set = (n, val) => {
          const k = idx(n);
          if (k >= 0) row[k] = val;
        };
      set('STT', i + 1);
      set('LoaiHoaDon', 'pxk');
      set('IDChungTu/MaBill', pad6(start + i));
      set('MaHang', v.maHang);
      set('TenHangHoaDichVu', v.tenHang);
      set('DonViTinh/ChietKhau', v.dvt);
      set('SoLuong', tan(r.net));
      set('TenDonVi', v.tenDonVi);
      set('NhapKhoTai', v.nhapKho);
      set('NgayXuatKho', r.dateStr || '');
      set('CanCuLenh', v.canCuLenh);
      set('Ngay', r.dateStr || '');
      set('Cua', ctx.cua || '');
      set('VeViec', v.veViec);
      set('LyDoXuatKho', v.lyDo);
      set('HopDongSo', ctx.hopDong || '');
      set('NguoiVanChuyen', r.driver || '');
      set('DonViVanChuyen', r.carrier || v.donViVC);
      set('PhuongTienVanChuyen', r.plate);
      set('XuatKhoTai', v.xuatKhoTai);
      out.push(row);
    });
    return { aoa: out, from: start, to: start + rows.length - 1, count: rows.length };
  }
  /**
   * Điền số hợp đồng vào file PXK đã tạo (aoa đọc từ Excel, dòng 0 = tiêu đề; sửa tại chỗ).
   * Chỉ ô trống (hoặc tất cả khi overwrite); dòng trống hoàn toàn bỏ qua. Không phải file PXK → ném lỗi.
   * @returns {{ filled: number, kept: number }}
   */
  function fillHopDong(data, no, overwrite) {
    if (!data.length || data[0].indexOf('IDChungTu/MaBill') < 0)
      throw new Error('không phải file phiếu xuất kho (không có cột IDChungTu/MaBill)');
    let col = data[0].indexOf('HopDongSo');
    if (col < 0) {
      col = data[0].length;
      data[0].push('HopDongSo');
    }
    let filled = 0,
      kept = 0;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row.some((x) => String(x).trim() !== '')) continue;
      while (row.length <= col) row.push('');
      if (String(row[col]).trim() === '' || overwrite) {
        if (row[col] !== no) filled++;
        row[col] = no;
      } else kept++;
    }
    return { filled, kept };
  }
  HAK.Pxk = { HEADER, pad6, tan, aoa, fillHopDong };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Pxk;
})(typeof window !== 'undefined' ? window : globalThis);
