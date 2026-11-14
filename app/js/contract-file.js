/**
 * contract-file.js — 📋 Hồ sơ hợp đồng (v2.16.0): xem MỘT hợp đồng theo đúng quy trình trên một màn hình:
 *   Hợp đồng + phụ lục → chứng thư → tờ khai hải quan → thông quan → khai bổ sung → nộp thuế → xuất hàng,
 * kèm đối chiếu (tờ khai ↔ chứng thư, chứng thư ↔ thực giao, chứng thư ↔ hợp đồng) và thuế còn nợ. Chỉ đọc dữ liệu có sẵn.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasNum = (v) => v !== null && v !== undefined && v !== '' && isFinite(+v);
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const nf = (n) => (hasNum(n) ? HAK.NumFmt.txt(r4(+n), 'num') : '');
  const vn = (iso) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : iso || '');
  const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const shipKey = (s) => fold(s).replace(/^m\s*\/?\s*v\.?\s*/, '').replace(/[^a-z0-9]/g, '');
  const certKey = (s) => fold(s).replace(/[^a-z0-9]/g, '');
  const TYPES = { xuatkhau: 'Xuất khẩu', uythac: 'Ủy thác xuất khẩu', xuatban: 'Xuất bán', traodoi: 'Trao đổi' };
  const ICON = { ok: '✔', warn: '⚠', none: '○', info: 'ℹ' };
  let current = null;

  function build(cid, groups) {
    const data = HAK.Catalog.core.get(), CM = HAK.CustomsModel, M = HAK.ContractModel;
    const c = (data.contracts || []).find((x) => x.id === cid); if (!c) throw Error('Không tìm thấy hợp đồng.');
    const cust = (data.customers || []).find((x) => x.id === c.buyerId);
    const details = (c.details || []).filter((d) => !d.deletedAt), addenda = M.addendaOf(c);
    const decls = CM.active(data.customs).filter((d) => d.contractId === cid);
    const g = (groups || []).find((x) => x.key === cid), lots = g ? g.lots : [];
    const lotOf = (d) => lots.find((L) => L.c && L.c.id === d.id) || null;
    const declOf = (d) => decls.find((x) => x.detailId === d.id) || null;
    const loose = decls.filter((x) => !details.some((d) => d.id === x.detailId));
    const rows = details.map((d) => ({ d, v: M.valuation(c, d), decl: declOf(d), lot: lotOf(d) }));
    const T = decls.map((d) => ({ d, t: CM.totals(d) }));
    // Thuế KHÔNG bù trừ giữa các tờ khai: còn nợ và nộp thừa cộng riêng; tờ khai chưa xác định nghĩa vụ tách riêng; số dư ròng chỉ để tham khảo.
    const st = CM.settlement(decls), tax = { payable: st.payable, paid: st.paidTax, fee: st.paidFee, remaining: st.owed, owed: st.owed, over: st.over, net: st.net, undetermined: st.undetermined, paidUndetermined: st.paidUndetermined, text: CM.taxText(st) };
    const certBdmt = details.reduce((a, d) => a + (Number(d.bdmt) || 0), 0), qty = hasNum(c.contractQty) ? Number(c.contractQty) : null;
    const delKg = lots.reduce((a, L) => a + (L.delKg || 0), 0), trips = lots.reduce((a, L) => a + (L.trips || 0), 0);
    const cleared = decls.filter((d) => d.status === 'cleared').length, supps = decls.reduce((a, d) => a + CM.active(d.supplements).length, 0);
    const withCert = details.filter((d) => d.certNo).length;

    /* --- 1. Các bước quy trình --- */
    const steps = [
      { n: 1, t: 'Hợp đồng + phụ lục', s: 'ok', x: (qty != null ? nf(qty) + ' BDMT' : 'chưa nhập KL') + (addenda.length ? ' · ' + addenda.length + ' phụ lục (gốc ' + (M.originalQty(c) == null ? 'để trống' : nf(M.originalQty(c))) + ')' : '') },
      { n: 2, t: 'Chứng thư', s: !details.length ? 'none' : withCert === details.length ? 'ok' : 'warn', x: withCert + '/' + details.length + ' chi tiết có chứng thư · ' + nf(certBdmt) + ' BDMT' },
      { n: 3, t: 'Tờ khai hải quan', s: !decls.length ? (c.type === 'xuatkhau' || c.type === 'uythac' ? 'warn' : 'none') : (rows.every((r) => r.decl) && !loose.length ? 'ok' : 'warn'), x: decls.length ? decls.length + ' tờ khai' : 'chưa có tờ khai' },
      { n: 4, t: 'Thông quan', s: !decls.length ? 'none' : cleared === decls.length ? 'ok' : 'warn', x: cleared + '/' + decls.length + ' đã thông quan' },
      { n: 5, t: 'Khai bổ sung', s: supps ? 'info' : 'none', x: supps ? supps + ' lần khai bổ sung' : 'không có' },
      { n: 6, t: 'Nộp thuế', s: !decls.length ? 'none' : tax.owed > 0 ? 'warn' : tax.undetermined || tax.over > 0 ? 'info' : tax.payable || tax.paid ? 'ok' : 'none', x: tax.text },
      { n: 7, t: 'Xuất hàng', s: trips ? 'ok' : 'none', x: trips ? trips + ' chuyến · ' + nf(delKg / 1000) + ' tấn thực giao' : 'chưa có phiếu cân' }
    ];

    /* --- 2. Đối chiếu --- */
    const checks = [];
    const add = (who, what, a, b, tol, fmt, kind) => {
      const bothNum = hasNum(a) && hasNum(b), diff = bothNum ? Number(a) - Number(b) : null;
      // Một bên trống = THIẾU SỐ LIỆU ĐỐI CHIẾU (ok = null), không được tính là khớp.
      const ok = kind === 'text' ? (!a || !b ? null : what === 'Tên tàu' ? shipKey(a) === shipKey(b) : fold(a) === fold(b)) : bothNum ? Math.abs(diff) <= tol : null;
      checks.push({ who, what, a: fmt ? fmt(a) : a, b: fmt ? fmt(b) : b, diff: kind === 'text' ? '' : diff === null ? '' : nf(diff), ok, miss: !(a || a === 0) || !(b || b === 0) });
    };
    rows.forEach((r) => {
      const from0 = checks.length;
      const d = r.d, who = [d.ship, d.certNo && 'CT ' + d.certNo].filter(Boolean).join(' · ') || 'Chi tiết hợp đồng';
      if (!r.decl) { checks.push({ who, what: 'Tờ khai ↔ chứng thư', a: '', b: '', diff: '', ok: false, note: 'Chưa gắn tờ khai hải quan' }); }
      else {
        const x = r.decl;
        add(who, 'KL khô: tờ khai ↔ chứng thư (BDMT)', x.qtyBdmt, d.bdmt, 0.01, nf);
        add(who, 'Trị giá: tờ khai (hóa đơn) ↔ chứng thư × đơn giá (USD)', x.invoiceUsd, r.v.valueUsd, 1, nf);
        add(who, 'Tỷ giá tính thuế (VNĐ/USD)', x.exchangeRate, d.exchangeRate, 0.5, nf);
        add(who, 'Tên tàu', x.ship, d.ship, 0, null, 'text');
        add(who, 'Số chứng thư', certKey(x.certNo), certKey(d.certNo), 0, (v) => (v ? (v === certKey(x.certNo) ? x.certNo : d.certNo) : ''), 'text');
      }
      // Giá trị = BDMT chứng thư × đơn giá hợp đồng (× tỷ giá của chi tiết nếu tính USD): thiếu đơn giá / tỷ giá → THIẾU SỐ LIỆU ĐỐI CHIẾU (không im lặng bỏ qua).
      { const vnd = c.currency === 'VND', noPrice = !hasNum(c.priceUsd), noRate = !vnd && !hasNum(d.exchangeRate);
        checks.push({ who, what: 'Đơn giá · tiền tệ · tỷ giá của trị giá chứng thư', a: noPrice ? '' : (vnd ? 'VND ' : 'USD ') + nf(c.priceUsd) + '/BDMT', b: vnd ? 'VND — không cần tỷ giá' : hasNum(d.exchangeRate) ? 'tỷ giá ' + nf(d.exchangeRate) : '', diff: '', ok: noPrice || noRate ? null : true, note: noPrice || noRate ? 'Thiếu số liệu đối chiếu: ' + [noPrice && 'đơn giá hợp đồng', noRate && 'tỷ giá chi tiết'].filter(Boolean).join(', ') : '' }); }
      if (r.lot && r.lot.trips > 0) add(who, 'KL tươi: MT theo chứng thư ↔ MT thực giao qua cân, đã trừ xe trả về (tấn)', hasNum(d.mt) ? d.mt : null, r.lot.delKg / 1000, 0.01, nf);
      const mine = checks.slice(from0).filter((k) => !/^Đơn giá/.test(k.what)), SH = { 'KL khô': 'KL khô', 'Trị giá': 'Trị giá', 'Tỷ giá': 'Tỷ giá', 'Tên tàu': 'Tên tàu', 'Số chứng thư': 'Số CT' };
      const bad = mine.filter((k) => !/^KL tươi/.test(k.what) && k.ok === false), tw = mine.find((k) => /^KL tươi/.test(k.what));
      r.tkct = !r.decl ? { s: 'warn', t: '⚠ Chưa có tờ khai' } : bad.length ? { s: 'warn', t: '⚠ Lệch: ' + bad.map((k) => (SH[Object.keys(SH).find((x) => k.what.indexOf(x) === 0)] || k.what) + (k.diff ? ' ' + k.diff : '')).join(', ') } : mine.some((k) => !/^KL tươi/.test(k.what) && k.ok === null) ? { s: 'info', t: 'Thiếu số liệu đối chiếu: ' + mine.filter((k) => !/^KL tươi/.test(k.what) && k.ok === null).map((k) => SH[Object.keys(SH).find((x) => k.what.indexOf(x) === 0)] || k.what).join(', ') } : { s: 'ok', t: '✔ Khớp' };
      r.cttt = !tw ? { s: 'none', t: '—' } : tw.ok === null ? { s: 'info', t: 'Thiếu số liệu đối chiếu' } : tw.ok ? { s: 'ok', t: '✔ Khớp' } : { s: 'warn', t: '⚠ Lệch ' + tw.diff + ' tấn' };
    });
    loose.forEach((x) => checks.push({ who: 'Tờ khai ' + x.no, what: 'Tờ khai chưa gắn chi tiết hợp đồng (tàu · chứng thư)', a: '', b: '', diff: '', ok: false, note: 'Gắn ở Danh mục → Chi tiết hợp đồng' }));
    if (qty != null) checks.push({ who: 'Cả hợp đồng', what: 'Chứng thư ↔ hợp đồng: Σ BDMT theo chứng thư ↔ BDMT hợp đồng hiện hành sau phụ lục', a: nf(certBdmt), b: nf(qty), diff: nf(certBdmt - qty), ok: certBdmt <= qty + 0.005, note: certBdmt <= qty + 0.005 ? 'Còn lại ' + nf(qty - certBdmt) + ' BDMT (' + (qty ? nf(Math.round(certBdmt / qty * 1000) / 10) : 0) + '% đã thực hiện)' : 'VƯỢT hợp đồng ' + nf(certBdmt - qty) + ' BDMT' });

    { const aud = M.auditOriginal(c); if (aud) checks.push({ who: 'Cả hợp đồng', what: 'KL gốc ↔ phụ lục đầu tiên (nghi ghi nhầm)', a: nf(c.qtyOrig), b: nf(addenda[0].qty), diff: '', ok: null, note: 'CẦN ĐỐI CHIẾU chứng từ: ' + aud }); }

    /* --- 3. Dòng thời gian --- */
    const ev = [];
    if (c.date) ev.push([c.date, 'Hợp đồng', 'Ký hợp đồng ' + (c.no || '') + ' · KL ' + (M.originalQty(c) == null ? '(chưa nhập)' : nf(M.originalQty(c))) + ' BDMT']);
    addenda.forEach((a) => ev.push([a.date, 'Phụ lục', (a.no || 'Phụ lục') + ' → KL ' + nf(a.qty) + ' BDMT' + (a.reason ? ' (' + a.reason + ')' : '')]));
    details.forEach((d) => { if (d.certDate || d.certNo) ev.push([d.certDate || '', 'Chứng thư', [d.certNo, d.ship, hasNum(d.bdmt) ? nf(d.bdmt) + ' BDMT' : ''].filter(Boolean).join(' · ')]); });
    decls.forEach((d) => {
      ev.push([d.openDate || '', 'Tờ khai', 'Mở tờ khai ' + d.no + ' (lần ' + (d.round || 1) + ')' + (d.ship ? ' · ' + d.ship : '')]);
      (d.statusLog || []).filter((s) => s.status !== 'opened').forEach((s) => ev.push([s.at || '', 'Tờ khai', 'Tờ khai ' + d.no + ': ' + CM.STATUS[s.status]]));
      CM.active(d.supplements).forEach((s) => ev.push([s.date || '', 'Khai bổ sung', 'Bổ sung lần ' + (s.round || 2) + ' · tờ khai ' + d.no + (hasNum(s.taxVnd) ? ' · thuế sau bổ sung ' + nf(s.taxVnd) + ' đ' : '') + (s.reason ? ' (' + s.reason + ')' : '')]));
      CM.active(d.payments).forEach((p) => ev.push([p.date || '', 'Nộp tiền', 'Giấy nộp tiền ' + (p.receiptNo || '') + ' · ' + nf(p.amount) + ' đ (' + (p.kind === 'fee' ? 'lệ phí' : 'thuế XK') + ') · tờ khai ' + d.no]));
    });
    lots.forEach((L) => { if (L.fromTs != null) ev.push([new Date(L.fromTs).toISOString().slice(0, 10), 'Xuất hàng', 'Xuất hàng ' + (L.ship || '') + ': ' + L.trips + ' chuyến · ' + nf(L.delKg / 1000) + ' tấn' + (L.from && L.to && L.from !== L.to ? ' (' + L.from + ' → ' + L.to + ')' : '')]); });
    ev.sort((a, b) => String(a[0] || '9999').localeCompare(String(b[0] || '9999')));

    /* --- 4. Thuế --- */
    const khoOf = HAK.ContractStatus && HAK.ContractStatus.khoOf ? HAK.ContractStatus.khoOf : () => '';
    const xh = rows.filter((r) => r.lot && r.lot.trips > 0).map((r) => ({ ship: r.d.ship || '', kho: Array.from(new Set((r.lot.recs || []).map(khoOf).filter(Boolean))).join(', '), trips: r.lot.trips, ton: r.lot.delKg / 1000, from: r.lot.from || '', to: r.lot.to || '', mt: r.d.mt }));
    const hd = checks.find((k) => k.who === 'Cả hợp đồng') || null;
    return { xh, rows, loose, supps, cleared, withCert, hd, c, cust, steps, checks, ev, T, tax, certBdmt, qty, delKg, trips, status: CM.contractStatus(data.customs, cid, c), axes: CM.axes(c, data.customs, { delKg, trips, certBdmt, mtCert: details.reduce((a, d) => a + (Number(d.mt) || 0), 0) }), addenda };
  }

  function specOf(m) {
    const c = m.c, CM = HAK.CustomsModel, label = (c.no || c.id) + ' · ' + (TYPES[c.type] || '') + (m.cust ? ' · ' + m.cust.name : '');
    const tables = [
      { caption: 'Các bước quy trình', cols: [{ h: 'Bước' }, { h: 'Nội dung' }, { h: 'Tình trạng' }, { h: 'Số liệu' }], rows: m.steps.map((s) => ({ c: [s.n, s.t, ICON[s.s], s.x], tone: s.s })) },
      { caption: 'Chứng thư (chi tiết hợp đồng: tàu · chứng thư · tờ khai)', cols: [{ h: 'Tàu / chuyến' }, { h: 'Số chứng thư' }, { h: 'Ngày chứng thư' }, { h: 'KL tươi MT (tấn)', n: 1 }, { h: 'KL khô BDMT', n: 1 }, { h: 'Độ ẩm (%)', n: 1 }, { h: 'Tỷ giá', n: 1 }, { h: 'Giá trị (USD)', n: 1 }, { h: 'Giá trị (VNĐ)', n: 1 }, { h: 'Số tờ khai' }, { h: 'Trạng thái tờ khai' }],
        rows: m.rows.length ? m.rows.map((r) => ({ c: [r.d.ship || '', r.d.certNo || '(chưa có)', vn(r.d.certDate), hasNum(r.d.mt) ? nf(r.d.mt) : '', hasNum(r.d.bdmt) ? nf(r.d.bdmt) : '', hasNum(r.d.moisture) ? nf(r.d.moisture) : '', hasNum(r.d.exchangeRate) ? nf(r.d.exchangeRate) : '', hasNum(r.v.valueUsd) ? nf(r.v.valueUsd) : '', hasNum(r.v.valueVnd) ? nf(r.v.valueVnd) : '', r.decl ? r.decl.no : '(chưa có)', r.decl ? CM.STATUS[r.decl.status] : ''] })).concat([{ cls: 'total', c: ['TỔNG CỘNG', String(m.withCert) + '/' + m.rows.length + ' chứng thư', '', nf(m.rows.reduce((a, r) => a + (Number(r.d.mt) || 0), 0)), nf(m.certBdmt), '', '', nf(m.rows.reduce((a, r) => a + (Number(r.v.valueUsd) || 0), 0)), nf(m.rows.reduce((a, r) => a + (Number(r.v.valueVnd) || 0), 0)), '', ''] }]) : [{ c: ['Chưa có chi tiết hợp đồng', '', '', '', '', '', '', '', '', '', ''] }] },
      { caption: 'Đối chiếu tờ khai ↔ chứng thư ↔ hợp đồng ↔ thực giao', cols: [{ h: 'Tàu · chứng thư' }, { h: 'Nội dung đối chiếu' }, { h: 'Bên 1', n: 1 }, { h: 'Bên 2', n: 1 }, { h: 'Chênh lệch', n: 1 }, { h: 'Kết quả' }],
        rows: m.checks.length ? m.checks.map((k, i) => ({ c: [i && m.checks[i - 1].who === k.who ? '' : k.who, k.what, k.a, k.b, k.diff, k.note || (k.ok === null ? 'Thiếu số liệu đối chiếu' : k.ok ? ICON.ok + ' Khớp' : ICON.warn + ' Lệch')], tone: k.ok === null ? 'none' : k.ok ? 'ok' : 'warn' })) : [{ c: ['Chưa có chi tiết hợp đồng', '', '', '', '', ''] }] },
      { caption: 'Thuế xuất khẩu và nộp tiền theo tờ khai', cols: [{ h: 'Số tờ khai' }, { h: 'Lần' }, { h: 'Trạng thái' }, { h: 'Thuế tờ khai gốc', n: 1 }, { h: 'Sau bổ sung', n: 1 }, { h: 'Phải nộp', n: 1 }, { h: 'Đã nộp', n: 1 }, { h: 'CÒN NỢ', n: 1 }, { h: 'NỘP THỪA', n: 1 }, { h: 'Lệ phí đã nộp', n: 1 }],
        rows: m.T.map((x) => ({ c: [x.d.no, x.d.round || 1, CM.STATUS[x.d.status], nf(x.t.base), x.t.lastSupplement ? nf(x.t.lastSupplement.taxVnd) : '', x.t.undetermined ? 'Chưa xác định' : nf(x.t.payable), nf(x.t.paidTax), x.t.undetermined ? '' : nf(x.t.owed), x.t.undetermined ? '' : nf(x.t.over), nf(x.t.paidFee)], tone: x.t.owed > 0 ? 'warn' : x.t.undetermined || x.t.over > 0 ? 'none' : 'ok' })).concat(m.T.length ? [{ cls: 'total', c: ['TỔNG CỘNG (không bù trừ giữa các tờ khai)', '', '', '', '', nf(m.tax.payable), nf(m.tax.paid), nf(m.tax.owed), nf(m.tax.over), nf(m.tax.fee)], tone: m.tax.owed > 0 ? 'warn' : 'ok' }, { c: ['Số dư ròng (phải nộp − đã nộp, chỉ để tham khảo)', '', '', '', '', '', '', nf(m.tax.net), '', ''] }] : [{ c: ['Chưa có tờ khai', '', '', '', '', '', '', '', '', ''] }]) },
      { caption: 'Xuất hàng theo chi tiết (tàu) — kho xuất, chuyến xe, thực giao', cols: [{ h: 'Tàu / chuyến' }, { h: 'Kho xuất' }, { h: 'Chuyến xe', n: 1 }, { h: 'Thực giao (tấn)', n: 1 }, { h: 'MT chứng thư (tấn)', n: 1 }, { h: 'MT − thực giao', n: 1 }, { h: 'Thời gian cân' }],
        rows: m.xh.length ? m.xh.map((x) => ({ c: [x.ship, x.kho, String(x.trips), nf(x.ton), hasNum(x.mt) ? nf(x.mt) : '', hasNum(x.mt) ? nf(x.mt - x.ton) : '', x.from + (x.to && x.to !== x.from ? ' → ' + x.to : '')] })).concat([{ cls: 'total', c: ['TỔNG CỘNG', '', String(m.xh.reduce((a, x) => a + x.trips, 0)), nf(m.xh.reduce((a, x) => a + x.ton, 0)), '', '', ''] }]) : [{ c: ['Chưa có phiếu cân gắn vào hợp đồng này', '', '', '', '', '', ''] }] },
      { pageBreak: true, caption: 'Dòng thời gian của hợp đồng', cols: [{ h: 'Ngày' }, { h: 'Bước' }, { h: 'Diễn biến' }], rows: m.ev.map((e) => ({ c: [vn(e[0]), e[1], e[2]] })) }
    ];
    return { title: 'HỒ SƠ HỢP ĐỒNG ' + (c.no || ''), sub: label + ' · KL hiện hành ' + nf(m.qty) + ' BDMT · Tiến độ: ' + m.axes.progress.label + ' · Thông quan: ' + m.axes.customs.label + (m.axes.customs.text ? ' (' + m.axes.customs.text + ')' : '') + ' · Thuế: ' + m.axes.tax.label + (m.axes.tax.text ? ' — ' + m.axes.tax.text : '') + ' · Thực giao: ' + m.axes.delivery.label, file: 'HoSoHopDong_' + String(c.no || c.id).replace(/[^\w-]+/g, '_'), tables };
  }

  function html(m, spec) {
    const c = m.c;
    const stepper = '<div class="d-flex flex-wrap gap-2 mb-3">' + m.steps.map((s) => '<div class="border rounded p-2 flex-fill ' + (s.s === 'warn' ? 'border-warning bg-warning-subtle' : s.s === 'ok' ? 'border-success-subtle' : '') + '" style="min-width:150px"><div class="small muted">Bước ' + s.n + '</div><div class="fw-semibold">' + ICON[s.s] + ' ' + esc(s.t) + '</div><div class="small">' + esc(s.x) + '</div></div>').join('') + '</div>';
    const cards = '<div class="row g-2 mb-3">' + [['KL hợp đồng hiện hành', nf(m.qty) + ' BDMT', m.addenda.length ? 'gốc ' + (HAK.ContractModel.originalQty(c) == null ? 'để trống' : nf(c.qtyOrig)) + ' · ' + m.addenda.length + ' phụ lục' : 'chưa có phụ lục'], ['Σ KL khô chứng thư', nf(m.certBdmt) + ' BDMT', m.qty != null ? 'còn lại ' + nf(m.qty - m.certBdmt) : ''], ['Thực giao (qua cân)', nf(m.delKg / 1000) + ' tấn', m.trips + ' chuyến'], ['Thuế còn nợ', '<span class="' + (m.tax.owed > 0 ? 'text-danger' : 'text-success') + '">' + nf(m.tax.owed) + ' đ</span>', 'phải nộp ' + nf(m.tax.payable) + ' · đã nộp ' + nf(m.tax.paid) + (m.tax.over > 0 ? ' · NỘP THỪA ' + nf(m.tax.over) : '') + (m.tax.undetermined ? ' · ' + m.tax.undetermined + ' tờ khai chưa xác định nghĩa vụ' : '')]]
      .map((x) => '<div class="col-6 col-md-3"><div class="border rounded p-2 h-100"><div class="small muted">' + x[0] + '</div><div class="fs-5 fw-semibold">' + x[1] + '</div><div class="small muted">' + esc(x[2]) + '</div></div></div>').join('') + '</div>';
    const tbl = (t) => '<h6 class="mt-3">' + esc(t.caption) + '</h6><div class="tbl-wrap" style="max-height:none;overflow-x:visible"><table class="table table-sm align-middle small"><thead><tr>' + t.cols.map((x) => '<th' + (x.n ? ' class="num"' : '') + '>' + esc(x.h) + '</th>').join('') + '</tr></thead><tbody>' +
      t.rows.map((r) => '<tr class="' + (r.cls === 'total' ? 'fw-semibold table-light' : '') + (r.tone === 'warn' ? ' table-warning' : '') + '">' + r.c.map((x, i) => '<td' + (t.cols[i] && t.cols[i].n ? ' class="num text-nowrap"' : ' style="white-space:normal;word-break:break-word"') + '>' + esc(x == null ? '' : x) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    return '<div class="d-flex flex-wrap gap-2 align-items-center mb-2">' + [['Tiến độ', m.axes.progress, m.axes.progress.code === 'closed' || m.axes.progress.code === 'full' ? 'success' : 'primary'], ['Thông quan', m.axes.customs, m.axes.customs.code === 'cleared' ? 'success' : m.axes.customs.code === 'partial' ? 'warning' : 'secondary'], ['Thuế', m.axes.tax, m.axes.tax.code === 'paid' ? 'success' : m.axes.tax.code === 'owing' ? 'danger' : m.axes.tax.code === 'none' ? 'secondary' : 'warning'], ['Thực giao', m.axes.delivery, m.axes.delivery.code === 'shipped' ? 'success' : 'secondary']].map((a) => '<span class="badge text-bg-' + a[2] + '" title="' + esc(a[1].text || '') + '">' + a[0] + ': ' + esc(a[1].label) + '</span>').join(' ') + '</div><div class="small muted mb-2">' + esc(spec.sub) + '</div>' + cards + stepper + spec.tables.slice(1).map(tbl).join('');
  }

  function ensureModal() {
    let m = $('#cfModal'); if (m) return m;
    m = document.createElement('div'); m.className = 'modal fade'; m.id = 'cfModal'; m.tabIndex = -1;
    m.innerHTML = '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="cfTitle"></h5><button type="button" class="btn btn-sm btn-success ms-auto" id="cfXls">📊 Xuất Excel</button><button type="button" class="btn btn-sm btn-outline-secondary me-2" id="cfPdf">🖨 Tải PDF</button><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div><div class="modal-body" id="cfBody"></div></div></div>';
    document.body.append(m);
    $('#cfPdf').addEventListener('click', () => { if (current && HAK.Customs && HAK.Customs.printReport) HAK.Customs.printReport(current).catch((e) => HAK.UI.toast('Không in được PDF hồ sơ hợp đồng: ' + (e && e.message ? e.message : e), 'error')); });
    $('#cfXls').addEventListener('click', () => exportXls().catch((e) => HAK.UI.toast(e.message || String(e), 'error')));
    return m;
  }
  /** Excel của 1 hợp đồng: mỗi bảng một trang tính (Quy trình, Đối chiếu, Thuế, Xuất hàng, Dòng thời gian). */
  async function exportXls() {
    if (!current) return;
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report, wb = R.newWorkbook(), names = ['Quy trình', 'Chứng thư', 'Đối chiếu', 'Thuế', 'Xuất hàng', 'Dòng thời gian'];
    current.tables.forEach((t, k) => {
      const widths = t.cols.map((c, i) => Math.min(60, Math.max(c.n ? 16 : 14, ...t.rows.map((r) => String(r.c[i] == null ? '' : r.c[i]).length * 0.9 + 2))));
      R.buildSheet(wb, names[k] || 'Bảng ' + (k + 1), current.title + ' — ' + t.caption, current.sub,
        t.cols.map((c, i) => ({ h: c.h, w: widths[i], n: c.n ? '#,##0.00' : undefined })),
        t.rows.map((r) => r.c.map((v, i) => { if (!t.cols[i].n || v === '' || v == null) return v; const x = HAK.NumFmt.parse(String(v), 'num'); return x === null ? v : x; })), { total: false });
    });
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (!await HAK.Word.Files.saveBlob(blob, current.file + '.xlsx')) return;
    HAK.UI.toast('Đã xuất Excel hồ sơ hợp đồng.', 'success');
  }
  async function open(cid) {
    const CS = HAK.ContractStatus; if (CS && CS.load) { try { await CS.load(); } catch (e) { /* vẫn hiển thị phần không có phiếu cân */ } }
    const m = build(cid, CS && CS.state ? CS.state.groups : []), spec = specOf(m); current = spec;
    const el = ensureModal(); $('#cfTitle').textContent = '📋 Hồ sơ hợp đồng — ' + (m.c.no || m.c.id); $('#cfBody').innerHTML = html(m, spec);
    bootstrap.Modal.getOrCreateInstance(el).show();
  }
  /** Dải 7 bước nhỏ (dưới số hợp đồng ở trang Tình hình hợp đồng): ✔ đủ · ⚠ thiếu / còn nợ · ○ chưa có. */
  function strip(cid, groups) {
    try {
      const m = build(cid, groups), short = ['HĐ', 'CT', 'TK', 'TQ', 'BS', 'Thuế', 'Xuất'];
      return '<div class="mt-1 d-flex flex-wrap gap-1 fw-normal">' + m.steps.map((x, i) => '<span class="badge ' + (x.s === 'ok' ? 'text-bg-success' : x.s === 'warn' ? 'text-bg-warning' : x.s === 'info' ? 'text-bg-info' : 'text-bg-light border') + '" style="font-size:.68rem" title="' + esc(x.t + ': ' + x.x) + '">' + ICON[x.s] + ' ' + short[i] + '</span>').join('') + '</div>';
    } catch (e) { return ''; }
  }
  HAK.ContractFile = { open, build, specOf, html, strip, nf, vn, TYPES };
  if (typeof module === 'object' && module.exports) module.exports = HAK.ContractFile;
})(typeof window !== 'undefined' ? window : globalThis);
