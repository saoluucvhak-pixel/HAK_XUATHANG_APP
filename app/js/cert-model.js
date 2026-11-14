/**
 * cert-model.js — số liệu CHỨNG THƯ dùng để lập chứng từ (v2.17.0). Hàm thuần, không DOM → kiểm thử trong Node.
 *
 * Nguồn dữ liệu duy nhất: Danh mục → Chi tiết hợp đồng → Chứng thư (số, ngày, MT, BDMT, độ ẩm). Form lập biên bản chỉ ĐIỀN từ chi tiết đã chọn;
 * khi lập chứng từ app lưu BẢN CHỤP (snapshot) vào hồ sơ Lưu trữ: giá trị danh mục lúc lập, giá trị thực dùng, danh sách ô bị sửa riêng + lý do.
 * Mở / in lại chứng từ cũ luôn dùng giá trị đã lưu trong hồ sơ (params) — không đọc lại Danh mục nên không đổi khi Danh mục sửa sau này.
 *
 * Ba chỉ tiêu khối lượng KHÁC NHAU, không được lẫn:
 *   (1) BDMT hợp đồng hiện hành = KL hợp đồng sau phụ lục mới nhất (contract.contractQty)
 *   (2) BDMT theo chứng thư     = detail.bdmt (khô, giám định)            — MT = tấn tươi theo chứng thư (detail.mt)
 *   (3) MT thực giao qua cân    = Σ phiếu cân − xe trả về (lot.delKg / 1000)
 * Quy tắc làm tròn của repo (generator.js): tấn khô = làm tròn 0,01 của MT × (1 − độ ẩm/100); độ ẩm 4 chữ số thập phân.
 * → sai số chấp nhận khi đối chiếu BDMT ≈ MT × (1 − độ ẩm/100): 0,01 tấn + MT × 5e-7 (nửa đơn vị của độ ẩm 4 số lẻ). ĐÂY LÀ SUY RA TỪ QUY TẮC LÀM TRÒN,
 * chưa có tài liệu nghiệp vụ nào ấn định sai số → chỉ CẢNH BÁO (kèm chênh lệch) và cần người dùng xác nhận trước khi lưu; không chặn.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const FIELDS = [['certNo', 'Số chứng thư', 'text'], ['certDate', 'Ngày chứng thư', 'text'], ['certWet', 'KL giám định — tấn tươi (MT)', 'num'], ['certDry', 'KL giám định — tấn khô (BDMT)', 'num'], ['moisture', 'Độ ẩm (%)', 'num']];
  /** Chuỗi kiểu Việt / số → số (null nếu trống / sai). Dấu chấm nghìn, dấu phẩy thập phân; "49,9818" luôn là 49,9818. */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/\s/g, ''); if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s); return isFinite(n) ? n : null;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const tolFor = (mt) => 0.01 + Math.abs(Number(mt) || 0) * 5e-7;
  /**
   * Kiểm tra số liệu chứng thư. v = { mt, bdmt, moisture } (số hoặc chuỗi).
   * @returns {{errors:string[] (chặn lưu), warnings:string[] (cần xác nhận), notes:string[] (thiếu số liệu đối chiếu — chỉ thông tin), expectedBdmt:number|null, diff:number|null, tol:number}}
   */
  function check(v) {
    v = v || {}; const mt = num(v.mt), bdmt = num(v.bdmt), m = num(v.moisture), errors = [], warnings = [], notes = [];
    [['KL tươi (MT)', mt], ['KL khô (BDMT)', bdmt], ['Độ ẩm', m]].forEach(([l, x]) => { if (x !== null && x < 0) errors.push(l + ' không được âm.'); });
    if (m !== null && m >= 100) errors.push('Độ ẩm phải nhỏ hơn 100%.');
    const tol = tolFor(mt);
    if (mt !== null && bdmt !== null && bdmt > mt + tol) errors.push('BDMT (' + r2(bdmt) + ') lớn hơn MT (' + r2(mt) + ') — kiểm tra lại số liệu chứng thư.');
    let expected = null, diff = null;
    if (mt !== null && m !== null && m >= 0 && m < 100) {
      expected = r2(mt * (1 - m / 100));
      if (bdmt !== null) {
        diff = r2(bdmt - expected);
        if (Math.abs(bdmt - mt * (1 - m / 100)) > tol) warnings.push('BDMT ' + r2(bdmt) + ' lệch ' + (diff > 0 ? '+' : '') + diff + ' so với MT × (1 − độ ẩm) = ' + expected + ' (sai số chấp nhận ±' + r2(tol) + '). Cần xác nhận số liệu trên chứng thư gốc.');
      }
    } else if (bdmt !== null && (mt === null || m === null)) notes.push('Chưa đủ MT / độ ẩm để đối chiếu công thức BDMT ≈ MT × (1 − độ ẩm).');
    return { errors, warnings, notes, expectedBdmt: expected, diff, tol };
  }
  /** Số liệu chứng thư của 1 chi tiết hợp đồng (Danh mục) theo mã ô của form lập biên bản. */
  const fromDetail = (d) => ({ certNo: (d && d.certNo) || '', certDate: (d && d.certDate) || '', certWet: d && d.mt != null ? d.mt : '', certDry: d && d.bdmt != null ? d.bdmt : '', moisture: d && d.moisture != null ? d.moisture : '' });
  const same = (kind, a, b) => (kind === 'num' ? num(a) === num(b) : String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim());
  /** Các ô bị sửa riêng trên chứng từ so với Danh mục: [{ id, label, catalog, used }]. */
  function overrides(catalogVals, used) {
    return FIELDS.filter(([id, , kind]) => !same(kind, catalogVals[id], used[id])).map(([id, label, kind]) => ({ id, label, catalog: kind === 'num' ? num(catalogVals[id]) : (catalogVals[id] || ''), used: kind === 'num' ? num(used[id]) : (used[id] || '') }));
  }
  /**
   * Bản chụp lưu vào hồ sơ: { v:1, detailId, at, source:'catalog', catalog:{…}, used:{…}, overrides:[…], reason, check:{errors,warnings} }.
   * detail = chi tiết hợp đồng (Danh mục); used = giá trị ô form lúc lập; reason = lý do điều chỉnh (nếu có).
   */
  function snapshot(detail, used, reason, now) {
    const cat = fromDetail(detail), u = {}; FIELDS.forEach(([id]) => { u[id] = used[id] == null ? '' : used[id]; });
    const ov = overrides(cat, u), ck = check({ mt: u.certWet, bdmt: u.certDry, moisture: u.moisture });
    return { v: 1, detailId: detail && detail.id || '', at: now || Date.now(), source: ov.length ? 'catalog+adjusted' : 'catalog', catalog: cat, used: u, overrides: ov, reason: ov.length ? String(reason || '').trim() : '', check: { errors: ck.errors, warnings: ck.warnings } };
  }
  /** Câu mô tả điều chỉnh (hiển thị ở Lưu trữ / thông báo). '' nếu không có. */
  function describe(snap) {
    if (!snap || !snap.overrides || !snap.overrides.length) return '';
    return snap.overrides.map((o) => o.label + ': Danh mục ' + (o.catalog === '' || o.catalog === null ? '(trống)' : o.catalog) + ' → chứng từ ' + (o.used === '' || o.used === null ? '(trống)' : o.used)).join('; ') + (snap.reason ? ' — Lý do: ' + snap.reason : ' — CHƯA ghi lý do');
  }
  HAK.Cert = { FIELDS, num, check, fromDetail, overrides, snapshot, describe, tolFor };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Cert;
})(typeof window !== 'undefined' ? window : globalThis);
