/**
 * customs-report.js — Báo cáo "Tình hình khai hải quan và nộp thuế" trên màn hình (bộ lọc, phạm vi công ty, bảng, thẻ tổng).
 * Tách từ customs.js (không đổi công thức / giao diện / lưu trữ); giữ API HAK.Customs trong customs.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { vnDate } = HAK.Util || (typeof require === 'function' ? require('./util.js') : {}); // hàm dùng chung (util.js)
  const {
    $,
    CM,
    applyDeclFilter,
    byOpenDesc,
    card,
    contractOf,
    cstatus,
    declFlat,
    declSmartCfg,
    decls,
    esc,
    money,
    smartView,
    statusBadge,
    sums,
  } = HAK.CustomsCommon;

  /* ---------------- Báo cáo "Tình hình khai hải quan và nộp thuế" ---------------- */
  const csRepView = () =>
    smartView(
      'csRep',
      '#repCsSmart',
      declSmartCfg(
        'report-customs',
        () => reportScope().map(declFlat),
        () => drawReport()
      )
    );
  function reportScope() {
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    return decls().filter((d) => {
      const c = contractOf(d.contractId);
      return !scope || !c || !HAK.Catalog.relatedTo || HAK.Catalog.relatedTo(c, scope);
    });
  }
  /** Tờ khai của báo cáo: đã áp dụng phạm vi công ty + bộ lọc smart, xếp theo ngày mở. */
  function reportList() {
    const v = csRepView();
    return (v ? applyDeclFilter(v, reportScope()) : reportScope()).sort((a, b) => -byOpenDesc(a, b));
  }
  function drawReport() {
    const host = $('#repCsBody');
    if (!host || !root.HAK.Catalog || !HAK.Catalog.core) return;
    const v0 = csRepView();
    if (v0) v0.refresh();
    const rows = reportList(),
      s = sums(rows);
    const cc = (d) => {
      const c = contractOf(d.contractId);
      return c ? cstatus(c.id).label : '';
    };
    host.innerHTML =
      '<div class="row g-2 mb-2">' +
      card('Tờ khai', rows.length, s.opened + ' đã mở · ' + s.waiting + ' chờ thông quan · ' + s.cleared + ' đã thông quan') +
      card('Thuế XK phải nộp', money(s.payable) + ' đ') +
      card('Đã nộp thuế', money(s.paid) + ' đ', 'Lệ phí đã nộp: ' + money(s.fee) + ' đ') +
      card('Còn phải nộp', '<span class="' + (s.remaining > 0 ? 'text-danger' : 'text-success') + '">' + money(s.remaining) + ' đ</span>') +
      '</div>' +
      '<div class="tbl-wrap"><table class="table table-sm"><thead><tr><th>Số tờ khai</th><th>Ngày mở</th><th class="num">Lần</th><th>Hợp đồng</th><th>Tàu</th><th>Trạng thái</th><th>Ngày thông quan</th><th class="num">Thuế phải nộp</th><th class="num">Đã nộp thuế</th><th class="num">Còn phải nộp</th><th class="num">Khai bổ sung</th><th>Hợp đồng</th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map((d) => {
              const t = CM().totals(d),
                c = contractOf(d.contractId);
              return (
                '<tr><td class="mono">' +
                esc(d.no) +
                '</td><td>' +
                esc(vnDate(d.openDate)) +
                '</td><td class="num">' +
                esc(d.round || 1) +
                '</td><td>' +
                esc(c ? c.no : '') +
                '</td><td>' +
                esc(d.ship || '') +
                '</td><td>' +
                statusBadge(d.status) +
                '</td><td>' +
                esc(vnDate(CM().statusDate(d, 'cleared'))) +
                '</td><td class="num">' +
                esc(money(t.payable)) +
                '</td><td class="num">' +
                esc(money(t.paidTax)) +
                '</td><td class="num ' +
                (t.remaining > 0 ? 'text-danger' : '') +
                '">' +
                esc(money(t.remaining)) +
                '</td><td class="num">' +
                CM().active(d.supplements).length +
                '</td><td>' +
                esc(cc(d)) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="12" class="muted text-center">Chưa có tờ khai hải quan trong khoảng đã chọn. Thêm ở Danh mục → 🛃 Tờ khai hải quan.</td></tr>') +
      '</tbody></table></div>';
    const b = $('#repCsXls');
    if (b) b.disabled = !rows.length;
    const bp = $('#repCsPdf');
    if (bp) bp.disabled = !rows.length;
  }
  HAK.CustomsReport = { csRepView, drawReport, reportList };
})(window);
