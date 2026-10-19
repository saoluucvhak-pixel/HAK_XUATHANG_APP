/**
 * contract-overview.js — 🧭 Báo cáo thực hiện hợp đồng (v2.16.0): MỘT bảng cho tất cả hợp đồng, các cột xếp đúng trình tự quy trình:
 *   ① Hợp đồng + phụ lục → ② Chứng thư → ③ Tờ khai → ④ Khai bổ sung → ⑤ Nộp thuế (còn nợ) → ⑥ Xuất hàng → ⑦ Đối chiếu.
 * Dòng đậm = hợp đồng; dòng nhỏ = từng chi tiết (tàu · chứng thư · tờ khai). Dữ liệu dùng chung với trang Tình hình hợp đồng và Hồ sơ hợp đồng.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasNum = (v) => v !== null && v !== undefined && v !== '' && isFinite(+v);
  const CF = () => HAK.ContractFile, CM = () => HAK.CustomsModel, F = () => HAK.Filters;
  const nf = (n) => CF().nf(n), vn = (d) => CF().vn(d);
  const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
  const toast = (m, t) => { if (HAK.UI && HAK.UI.toast) HAK.UI.toast(m, t); };
  const state = { items: [], view: null, loading: false };

  /* Các cột theo trình tự quy trình. band = nhóm; n = cột số. */
  const BANDS = [['① HỢP ĐỒNG + PHỤ LỤC', 4, 'primary'], ['② CHỨNG THƯ', 3, 'success'], ['③ TỜ KHAI HẢI QUAN', 3, 'info'], ['④ KHAI BỔ SUNG', 2, 'warning'], ['⑤ NỘP THUẾ', 3, 'danger'], ['⑥ XUẤT HÀNG', 3, 'secondary'], ['⑦ ĐỐI CHIẾU', 3, 'dark']];
  const COLS = [
    { h: 'Hợp đồng / chi tiết (tàu)', w: 40 }, { h: 'KL gốc (BDMT)', n: 1, w: 14 }, { h: 'Phụ lục', w: 26 }, { h: 'KL hiện hành (BDMT)', n: 1, w: 16 },
    { h: 'Số chứng thư', w: 24 }, { h: 'KL khô thực hiện (BDMT)', n: 1, w: 16 }, { h: '% / còn lại so với HĐ', w: 22 },
    { h: 'Số tờ khai', w: 18 }, { h: 'Ngày mở', w: 11 }, { h: 'Trạng thái', w: 22 },
    { h: 'Số lần', w: 10 }, { h: 'Thuế tăng / giảm (đ)', n: 1, w: 16 },
    { h: 'Thuế phải nộp (đ)', n: 1, w: 16 }, { h: 'Đã nộp (đ)', n: 1, w: 16 }, { h: 'CÒN NỢ (đ)', n: 1, w: 16 },
    { h: 'Chuyến xe', n: 1, w: 9 }, { h: 'Thực giao (tấn)', n: 1, w: 13 }, { h: 'Thời gian cân', w: 22 },
    { h: 'Tờ khai ↔ chứng thư', w: 30 }, { h: 'Chứng thư ↔ hợp đồng', w: 34 }, { h: 'Chứng thư ↔ thực giao', w: 20 }
  ];
  const NUM = new Set(COLS.map((c, i) => (c.n ? i : -1)).filter((i) => i >= 0));

  async function load() {
    const CS = HAK.ContractStatus; await CS.load();
    const groups = CS.state.groups;
    state.items = groups.filter((g) => g.c).map((g) => {
      const m = CF().build(g.key, groups), c = g.c;
      const bad = m.rows.some((r) => r.tkct.s === 'warn' || r.cttt.s === 'warn') || (m.hd && m.hd.ok === false) || m.loose.length > 0;
      return { g, m, f: { id: g.key, type: c.type, no: c.no || '', date: c.date || '', buyerId: c.buyerId || '', buyer: g.f.buyer, status: m.status.code, statusLabel: m.status.label, ships: g.ships, certNos: g.f.certNos, declNos: m.T.map((x) => x.d.no), owing: m.tax.remaining > 0, mismatch: bad, missing: m.steps.some((s) => s.s === 'warn') } };
    });
  }

  /* ---------- Dựng dòng (dùng chung cho màn hình, Excel, PDF) ---------- */
  function rowsOf(it) {
    const { g, m } = it, c = m.c, CMm = CM(), out = [];
    const label = [c.no || c.id, CF().TYPES[c.type] || '', vn(c.date), g.f.buyer].filter(Boolean).join(' · ');
    const pct = m.qty ? Math.round(m.certBdmt / m.qty * 1000) / 10 : null, over = m.qty != null && m.certBdmt > m.qty + 0.005;
    const nBad = m.rows.filter((r) => r.tkct.s === 'warn').length, lots = m.rows.filter((r) => r.cttt.s !== 'none'), nLot = lots.filter((r) => r.cttt.s === 'warn').length;
    out.push({ cls: 'main', t: [], c: [label, nf(c.qtyOrig != null ? c.qtyOrig : c.contractQty), m.addenda.length ? m.addenda.map((a) => (a.no || 'PL') + ': ' + nf(a.qty)).join(' ; ') : '—', nf(c.contractQty),
      m.withCert + '/' + m.rows.length + ' chứng thư', nf(m.certBdmt), pct == null ? '' : nf(pct) + '% · ' + (over ? 'VƯỢT ' + nf(m.certBdmt - m.qty) : 'còn ' + nf(m.qty - m.certBdmt)),
      (m.T.length || 'chưa có') + ' tờ khai', '', m.cleared + '/' + m.T.length + ' thông quan',
      m.supps + ' lần', nf(sum(m.T.map((x) => x.t.extra))), nf(m.tax.payable), nf(m.tax.paid), nf(m.tax.remaining),
      m.trips ? String(m.trips) : '', m.trips ? nf(m.delKg / 1000) : '', g.from ? g.from + (g.to && g.to !== g.from ? ' → ' + g.to : '') : '',
      !m.rows.length ? '' : nBad ? '⚠ ' + nBad + '/' + m.rows.length + ' chi tiết lệch' : '✔ Khớp', m.hd ? (m.hd.ok ? '✔ ' : '⚠ ') + m.hd.note : '', !lots.length ? '—' : nLot ? '⚠ ' + nLot + ' lệch' : '✔ Khớp'] });
    const declCells = (x) => { if (!x) return ['(chưa có tờ khai)', '', '', '', '', '', '', '']; const t = CMm.totals(x), clr = CMm.statusDate(x, 'cleared'); return [x.no + (x.round > 1 ? ' (lần ' + x.round + ')' : ''), vn(x.openDate), CMm.STATUS[x.status] + (x.status === 'cleared' && clr ? ' ' + vn(clr) : ''), String(CMm.active(x.supplements).length), t.extra != null ? nf(t.extra) : '', nf(t.payable), nf(t.paidTax), nf(t.remaining)]; };
    m.rows.forEach((r) => {
      const d = r.d, dc = declCells(r.decl), L = r.lot;
      out.push({ cls: 'sub', c: ['   ' + (d.ship || '(chưa có tàu)'), '', '', '', d.certNo || '(chưa có chứng thư)', nf(d.bdmt), ''].concat(dc, [L && L.trips ? String(L.trips) : '', L && L.trips ? nf(L.delKg / 1000) : '', L && L.from ? L.from + (L.to && L.to !== L.from ? ' → ' + L.to : '') : '', r.tkct.t, '', r.cttt.t]) });
    });
    m.loose.forEach((x) => out.push({ cls: 'sub', c: ['   (tờ khai chưa gắn chi tiết hợp đồng)', '', '', '', '', '', ''].concat(declCells(x), ['', '', '', '⚠ Chưa gắn chi tiết', '', '']) }));
    return out;
  }
  const tone = (v, i) => { v = String(v); if (i === 14 && v && v !== '0') return 'text-danger fw-semibold'; if (i >= 18) return v.charAt(0) === '⚠' ? 'text-danger' : v.charAt(0) === '✔' ? 'text-success' : ''; return ''; };

  /* ---------- Bộ lọc smart ---------- */
  function fields() {
    const f = F(), K = () => HAK.Catalog;
    return [
      f.multi('type', 'Hình thức', () => Object.keys(K().TYPES || {}).map((k) => ({ value: k, label: K().TYPES[k].label })), (r) => r.type),
      f.multi('buyerId', 'Bên mua / nhận', () => K().customers().map((c) => ({ value: c.id, label: c.name })), (r) => r.buyerId),
      f.multi('status', 'Trạng thái hợp đồng', () => [{ value: 'running', label: 'Đang thực hiện' }, { value: 'done', label: 'Đã hoàn thành' }], (r) => r.status),
      { key: 'owing', label: 'Chỉ hợp đồng còn nợ thuế', type: 'bool', match: (r) => r.owing },
      { key: 'mismatch', label: 'Chỉ hợp đồng có lệch đối chiếu', type: 'bool', match: (r) => r.mismatch },
      { key: 'missing', label: 'Chỉ hợp đồng còn thiếu bước (chứng thư, tờ khai, thông quan, nộp thuế)', type: 'bool', match: (r) => r.missing }
    ];
  }
  function smart() {
    const host = $('#coSmart'); if (!host) return null;
    if (!state.view) state.view = F().mount(host, { screenId: 'contract-overview', source: () => state.items.map((i) => i.f), fields: fields(), searchPlaceholder: 'Tìm số hợp đồng, bên mua, tàu, chứng thư, số tờ khai…', quickFields: ['q', 'type', 'buyerId', 'status'],
      matchQ: (r, q) => F().core.hay([r.no, r.buyer, r.ships.join(' '), r.certNos.join(' '), r.declNos.join(' '), r.statusLabel]).includes(q), matchDate: (r, f, t) => F().dateMatch(r.date, f, t), onApply: () => draw() });
    else if (!host.contains(state.view.el)) host.replaceChildren(state.view.el);
    return state.view;
  }
  function filtered() { const v = smart(); if (!v) return state.items; const ids = new Set(v.filter(state.items.map((i) => i.f)).rows.map((r) => r.id)); return state.items.filter((i) => ids.has(i.f.id)); }
  const stamp = () => { const v = state.view; return v ? ' · Bộ lọc: ' + v.describe() : ''; };

  /* ---------- Hiển thị ---------- */
  const card = (l, v, s) => '<div class="col-6 col-md-3 col-xl"><div class="border rounded p-2 h-100"><div class="small muted">' + l + '</div><div class="fw-semibold fs-5">' + v + '</div>' + (s ? '<div class="small muted">' + s + '</div>' : '') + '</div></div>';
  function draw() {
    const host = $('#coBody'); if (!host) return;
    const list = filtered(), T = (k) => sum(list.map((i) => i.m.tax[k])), nDecl = sum(list.map((i) => i.m.T.length)), nClr = sum(list.map((i) => i.m.cleared));
    $('#coCards').innerHTML = card('Hợp đồng', list.length, list.filter((i) => i.m.status.code === 'done').length + ' đã hoàn thành') +
      card('KL hợp đồng hiện hành', nf(sum(list.map((i) => i.m.qty))) + ' BDMT', 'chứng thư: ' + nf(sum(list.map((i) => i.m.certBdmt)))) + card('Tờ khai', nDecl, nClr + ' đã thông quan') +
      card('Thuế phải nộp', nf(T('payable')) + ' đ', 'đã nộp ' + nf(T('paid'))) + card('Thuế CÒN NỢ', '<span class="' + (T('remaining') > 0 ? 'text-danger' : 'text-success') + '">' + nf(T('remaining')) + ' đ</span>', list.filter((i) => i.f.owing).length + ' hợp đồng còn nợ') +
      card('Có lệch đối chiếu', list.filter((i) => i.f.mismatch).length, 'hợp đồng cần kiểm tra');
    const head = '<thead><tr class="text-center">' + BANDS.map((b) => '<th colspan="' + b[1] + '" class="text-bg-' + b[2] + '">' + b[0] + '</th>').join('') + '</tr><tr>' + COLS.map((c, i) => '<th class="' + (c.n ? 'num ' : '') + (i === 0 ? 'co-first' : '') + '">' + esc(c.h) + '</th>').join('') + '</tr></thead>';
    const body = list.length ? list.map((it) => rowsOf(it).map((r) => '<tr class="' + (r.cls === 'main' ? 'table-light fw-semibold co-main' : 'small') + '"' + (r.cls === 'main' ? ' data-co-file="' + esc(it.f.id) + '" style="cursor:pointer" title="Bấm để mở Hồ sơ hợp đồng"' : '') + '>' +
      r.c.map((v, i) => '<td class="' + (COLS[i].n ? 'num text-nowrap ' : '') + (i === 0 ? 'co-first ' : '') + tone(v, i) + '"' + ' style="' + (COLS[i].n ? '' : 'white-space:normal;word-break:break-word;') + (i === 0 ? 'width:300px;min-width:300px;max-width:300px;' : 'min-width:' + (COLS[i].n ? 112 : 120) + 'px;') + (i === 0 && r.cls === 'sub' ? 'padding-left:1.4rem' : '') + '">' + esc(v) + '</td>').join('') + '</tr>').join('')).join('')
      : '<tr><td colspan="' + COLS.length + '" class="muted text-center py-4">Chưa có hợp đồng khớp bộ lọc.</td></tr>';
    host.innerHTML = '<table class="table table-sm align-middle co-table" style="min-width:2300px">' + head + '<tbody>' + body + '</tbody></table>';
    ['#coXls', '#coPdf'].forEach((s) => { const b = $(s); if (b) b.disabled = !list.length; });
  }
  async function render() {
    if (!$('#page-contractoverview') || state.loading) return;
    state.loading = true; $('#coBody').innerHTML = '<div class="muted text-center py-4">Đang đọc dữ liệu…</div>';
    try { await load(); smart(); if (state.view) state.view.refresh(); draw(); }
    catch (e) { console.error(e); $('#coBody').innerHTML = '<div class="text-danger text-center py-4">' + esc(e.message || e) + '</div>'; }
    finally { state.loading = false; }
  }

  /* ---------- Excel / PDF ---------- */
  const xl = (i, v) => (NUM.has(i) && v !== '' && v !== null ? (HAK.NumFmt.parse(v, 'num') === null ? v : HAK.NumFmt.parse(v, 'num')) : v);
  async function exportXls() {
    const list = filtered(); if (!list.length) return;
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report, wb = R.newWorkbook();
    R.buildSheet(wb, 'Báo cáo', 'BÁO CÁO THỰC HIỆN HỢP ĐỒNG THEO QUY TRÌNH', 'Hợp đồng + phụ lục → chứng thư → tờ khai → khai bổ sung → nộp thuế → xuất hàng → đối chiếu' + stamp(),
      COLS.map((c, i) => ({ h: BANDS_OF[i] + ' · ' + c.h, w: c.w, n: c.n ? (i === 15 ? '#,##0' : '#,##0.00') : undefined })),
      list.flatMap((it) => rowsOf(it).map((r) => r.c.map((v, i) => xl(i, v)))), { total: false });
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (!await HAK.Word.Files.saveBlob(blob, 'BaoCaoThucHienHopDong.xlsx')) return;
    toast('Đã xuất Báo cáo thực hiện hợp đồng.', 'success');
  }
  const BANDS_OF = BANDS.flatMap((b) => Array(b[1]).fill(b[0].replace(/^[^\s]+\s/, '')));
  async function exportPdf() {
    const list = filtered(); if (!list.length) return;
    await HAK.Customs.printReport({ file: 'BaoCaoThucHienHopDong', title: 'BÁO CÁO THỰC HIỆN HỢP ĐỒNG THEO QUY TRÌNH', sub: 'Hợp đồng + phụ lục → chứng thư → tờ khai → khai bổ sung → nộp thuế → xuất hàng → đối chiếu' + stamp(),
      tables: [{ cols: COLS.map((c) => ({ h: c.h, n: !!c.n })), rows: list.flatMap((it) => rowsOf(it).map((r) => ({ cls: r.cls, c: r.c }))) }] });
  }

  function init() {
    const host = $('#page-contractoverview'); if (!host || host.dataset.bound) return; host.dataset.bound = '1';
    host.addEventListener('click', (e) => {
      const row = e.target.closest('[data-co-file]'); if (row && !e.target.closest('a,button')) { CF().open(row.dataset.coFile).catch((x) => toast(x.message || String(x), 'error')); return; }
      if (e.target.closest('#coXls')) exportXls().catch((x) => toast(x.message || String(x), 'error'));
      else if (e.target.closest('#coPdf')) exportPdf().catch((x) => toast(x.message || String(x), 'error'));
      else if (e.target.closest('#coReload')) render();
    });
  }
  HAK.ContractOverview = { render, init, rowsOf, COLS, BANDS };
  if (typeof module === 'object' && module.exports) module.exports = HAK.ContractOverview;
})(typeof window !== 'undefined' ? window : globalThis);
