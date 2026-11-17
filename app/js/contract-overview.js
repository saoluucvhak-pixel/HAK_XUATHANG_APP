/**
 * contract-overview.js — 🧭 Báo cáo thực hiện hợp đồng (v2.16.0): MỘT bảng cho tất cả hợp đồng, các cột xếp đúng trình tự quy trình:
 *   ① Hợp đồng + phụ lục → ② Chứng thư → ③ Tờ khai → ④ Khai bổ sung → ⑤ Nộp thuế (còn nợ) → ⑥ Xuất hàng → ⑦ Đối chiếu.
 * Dòng đậm = hợp đồng; dòng nhỏ = từng chi tiết (tàu · chứng thư · tờ khai). Dữ liệu dùng chung với trang Tình hình hợp đồng và Hồ sơ hợp đồng.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const CF = () => HAK.ContractFile,
    CM = () => HAK.CustomsModel,
    F = () => HAK.Filters;
  const nf = (n) => CF().nf(n),
    vn = (d) => CF().vn(d);
  const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
  const toast = (m, t) => {
    if (HAK.UI && HAK.UI.toast) HAK.UI.toast(m, t);
  };
  const state = { items: [], view: null, loading: false };

  /* Các cột theo trình tự quy trình — MỘT nơi định nghĩa: k = khóa, b = nhóm (chỉ số trong BANDS), n = cột số ('int' | 'dec'), sum = cộng ở dòng tổng (chỉ dòng hợp đồng). */
  const BANDS = [
    ['① HỢP ĐỒNG + PHỤ LỤC', 'primary'],
    ['② CHỨNG THƯ', 'success'],
    ['③ TỜ KHAI HẢI QUAN', 'info'],
    ['④ KHAI BỔ SUNG', 'warning'],
    ['⑤ NỘP THUẾ', 'danger'],
    ['⑥ XUẤT HÀNG', 'secondary'],
    ['⑦ ĐỐI CHIẾU', 'dark'],
  ];
  const COLS = [
    { k: 'label', b: 0, h: 'Hợp đồng / chi tiết (tàu)', w: 40 },
    { k: 'qtyOrig', b: 0, h: 'KL gốc (BDMT)', n: 'dec', sum: 1, w: 14 },
    { k: 'addenda', b: 0, h: 'Phụ lục', w: 26 },
    { k: 'qtyNow', b: 0, h: 'KL hiện hành (BDMT)', n: 'dec', sum: 1, w: 16 },
    { k: 'cert', b: 1, h: 'Số chứng thư', w: 24 },
    { k: 'certBdmt', b: 1, h: 'KL khô thực hiện (BDMT)', n: 'dec', sum: 1, w: 16 },
    { k: 'pct', b: 1, h: '% / còn lại so với HĐ', w: 22 },
    { k: 'declNo', b: 2, h: 'Số tờ khai', w: 18 },
    { k: 'openDate', b: 2, h: 'Ngày mở', w: 11 },
    { k: 'declStatus', b: 2, h: 'Trạng thái', w: 22 },
    { k: 'supps', b: 3, h: 'Số lần', w: 10 },
    { k: 'extra', b: 3, h: 'Thuế tăng / giảm (đ)', n: 'int', sum: 1, w: 16 },
    { k: 'payable', b: 4, h: 'Thuế phải nộp (đ)', n: 'int', sum: 1, w: 16 },
    { k: 'paid', b: 4, h: 'Đã nộp (đ)', n: 'int', sum: 1, w: 16 },
    { k: 'owing', b: 4, h: 'CÒN NỢ (đ)', n: 'int', sum: 1, w: 16 },
    { k: 'over', b: 4, h: 'NỘP THỪA (đ)', n: 'int', sum: 1, w: 16 },
    { k: 'undet', b: 4, h: 'Tờ khai chưa xác định thuế', n: 'int', sum: 1, w: 14 },
    { k: 'kho', b: 5, h: 'Kho xuất', w: 22 },
    { k: 'trips', b: 5, h: 'Chuyến xe', n: 'int', sum: 1, w: 9 },
    { k: 'tons', b: 5, h: 'Thực giao (tấn)', n: 'dec', sum: 1, w: 13 },
    { k: 'time', b: 5, h: 'Thời gian cân', w: 22 },
    { k: 'tkct', b: 6, h: 'Tờ khai ↔ chứng thư', w: 30 },
    { k: 'cthd', b: 6, h: 'Chứng thư ↔ hợp đồng', w: 34 },
    { k: 'ctgv', b: 6, h: 'Chứng thư ↔ thực giao', w: 20 },
  ];
  const IX = {};
  COLS.forEach((c, i) => {
    IX[c.k] = i;
  });
  const NUM = new Set(COLS.map((c, i) => (c.n ? i : -1)).filter((i) => i >= 0));
  const bandSpan = (k) => COLS.filter((c) => c.b === k).length;
  const numFmt = (i) => (COLS[i].n === 'dec' ? '#,##0.00' : '#,##0');

  async function load() {
    const CS = HAK.ContractStatus;
    await CS.load();
    const groups = CS.state.groups;
    state.items = groups
      .filter((g) => g.c)
      .map((g) => {
        const m = CF().build(g.key, groups),
          c = g.c;
        const bad = m.rows.some((r) => r.tkct.s === 'warn' || r.cttt.s === 'warn') || (m.hd && m.hd.ok === false) || m.loose.length > 0;
        return {
          g,
          m,
          f: {
            id: g.key,
            type: c.type,
            no: c.no || '',
            date: c.date || '',
            buyerId: c.buyerId || '',
            buyer: g.f.buyer,
            status: m.status.code,
            statusLabel: m.status.label,
            ships: g.ships,
            certNos: g.f.certNos,
            declNos: m.T.map((x) => x.d.no),
            owing: m.tax.remaining > 0,
            mismatch: bad,
            missing: m.steps.some((s) => s.s === 'warn'),
          },
        };
      });
  }

  /* ---------- Dựng dòng (dùng chung cho màn hình, Excel, PDF) ---------- */
  function rowsOf(it) {
    const { g, m } = it,
      c = m.c,
      CMm = CM(),
      out = [];
    const label = [c.no || c.id, CF().TYPES[c.type] || '', vn(c.date), g.f.buyer].filter(Boolean).join(' · ');
    const pct = m.qty ? Math.round((m.certBdmt / m.qty) * 1000) / 10 : null,
      over = m.qty != null && m.certBdmt > m.qty + 0.005;
    const nBad = m.rows.filter((r) => r.tkct.s === 'warn').length,
      lots = m.rows.filter((r) => r.cttt.s !== 'none'),
      nLot = lots.filter((r) => r.cttt.s === 'warn').length,
      nMiss = m.rows.filter((r) => r.tkct.s === 'info').length,
      nLotMiss = lots.filter((r) => r.cttt.s === 'info').length;
    out.push({
      cls: 'main',
      t: [],
      c: [
        label,
        nf(HAK.ContractModel.originalQty(c)),
        m.addenda.length ? m.addenda.map((a) => (a.no || 'PL') + ': ' + nf(a.qty)).join(' ; ') : '—',
        nf(c.contractQty),
        m.withCert + '/' + m.rows.length + ' chứng thư',
        nf(m.certBdmt),
        pct == null ? '' : nf(pct) + '% · ' + (over ? 'VƯỢT ' + nf(m.certBdmt - m.qty) : 'còn ' + nf(m.qty - m.certBdmt)),
        (m.T.length || 'chưa có') + ' tờ khai',
        '',
        m.cleared + '/' + m.T.length + ' thông quan',
        m.supps + ' lần',
        nf(sum(m.T.map((x) => x.t.extra))),
        nf(m.tax.payable),
        nf(m.tax.paid),
        nf(m.tax.owed),
        nf(m.tax.over),
        m.tax.undetermined ? String(m.tax.undetermined) : '',
        g.khos.join(', '),
        m.trips ? String(m.trips) : '',
        m.trips ? nf(m.delKg / 1000) : '',
        g.from ? g.from + (g.to && g.to !== g.from ? ' → ' + g.to : '') : '',
        !m.rows.length
          ? ''
          : nBad
            ? '⚠ ' + nBad + '/' + m.rows.length + ' chi tiết lệch'
            : nMiss
              ? 'Thiếu số liệu đối chiếu (' + nMiss + '/' + m.rows.length + ' chi tiết)'
              : '✔ Khớp',
        m.hd ? (m.hd.ok ? '✔ ' : '⚠ ') + m.hd.note : '',
        !lots.length ? '—' : nLot ? '⚠ ' + nLot + ' lệch' : nLotMiss ? 'Thiếu số liệu đối chiếu' : '✔ Khớp',
      ],
    });
    const declCells = (x) => {
      if (!x) return ['(chưa có tờ khai)', '', '', '', '', '', '', '', '', ''];
      const t = CMm.totals(x),
        clr = CMm.statusDate(x, 'cleared');
      return [
        x.no + (x.round > 1 ? ' (lần ' + x.round + ')' : ''),
        vn(x.openDate),
        CMm.STATUS[x.status] + (x.status === 'cleared' && clr ? ' ' + vn(clr) : ''),
        String(CMm.active(x.supplements).length),
        t.extra != null ? nf(t.extra) : '',
        t.undetermined ? 'Chưa xác định' : nf(t.payable),
        nf(t.paidTax),
        t.undetermined ? '' : nf(t.owed),
        t.undetermined ? '' : nf(t.over),
        t.undetermined ? '1' : '',
      ];
    };
    m.rows.forEach((r) => {
      const d = r.d,
        dc = declCells(r.decl),
        L = r.lot;
      out.push({
        cls: 'sub',
        c: ['   ' + (d.ship || '(chưa có tàu)'), '', '', '', d.certNo || '(chưa có chứng thư)', nf(d.bdmt), ''].concat(dc, [
          L && L.recs.length ? Array.from(new Set(L.recs.map(HAK.ContractStatus.khoOf).filter(Boolean))).join(', ') : '',
          L && L.trips ? String(L.trips) : '',
          L && L.trips ? nf(L.delKg / 1000) : '',
          L && L.from ? L.from + (L.to && L.to !== L.from ? ' → ' + L.to : '') : '',
          r.tkct.t,
          '',
          r.cttt.t,
        ]),
      });
    });
    m.loose.forEach((x) =>
      out.push({
        cls: 'sub',
        c: ['   (tờ khai chưa gắn chi tiết hợp đồng)', '', '', '', '', '', ''].concat(declCells(x), [
          '',
          '',
          '',
          '',
          '⚠ Chưa gắn chi tiết',
          '',
          '',
        ]),
      })
    );
    return out;
  }
  const tone = (v, i) => {
    v = String(v);
    if (i === IX.owing && v && v !== '0') return 'text-danger fw-semibold';
    if (i >= IX.tkct)
      return v.charAt(0) === '⚠'
        ? 'text-danger'
        : v.charAt(0) === '✔'
          ? 'text-success'
          : /^Thiếu số liệu/.test(v)
            ? 'text-warning fw-semibold'
            : '';
    return '';
  };

  /* ---------- Bộ lọc smart ---------- */
  function fields() {
    const f = F(),
      K = () => HAK.Catalog;
    return [
      f.multi(
        'type',
        'Hình thức',
        () => Object.keys(K().TYPES || {}).map((k) => ({ value: k, label: K().TYPES[k].label })),
        (r) => r.type
      ),
      f.multi(
        'buyerId',
        'Bên mua / nhận',
        () =>
          K()
            .customers()
            .map((c) => ({ value: c.id, label: c.name })),
        (r) => r.buyerId
      ),
      f.multi(
        'status',
        'Trạng thái hợp đồng',
        () => [
          { value: 'running', label: 'Đang thực hiện' },
          { value: 'done', label: 'Đã hoàn thành (thông quan đủ / đã đóng)' },
        ],
        (r) => r.status
      ),
      { key: 'owing', label: 'Chỉ hợp đồng còn nợ thuế', type: 'bool', match: (r) => r.owing },
      { key: 'mismatch', label: 'Chỉ hợp đồng có lệch đối chiếu', type: 'bool', match: (r) => r.mismatch },
      {
        key: 'missing',
        label: 'Chỉ hợp đồng còn thiếu bước (chứng thư, tờ khai, thông quan, nộp thuế)',
        type: 'bool',
        match: (r) => r.missing,
      },
    ];
  }
  function smart() {
    const host = $('#coSmart');
    if (!host) return null;
    if (!state.view)
      state.view = F().mount(host, {
        screenId: 'contract-overview',
        source: () => state.items.map((i) => i.f),
        fields: fields(),
        searchPlaceholder: 'Tìm số hợp đồng, bên mua, tàu, chứng thư, số tờ khai…',
        quickFields: ['q', 'type', 'buyerId', 'status'],
        matchQ: (r, q) =>
          F()
            .core.hay([r.no, r.buyer, r.ships.join(' '), r.certNos.join(' '), r.declNos.join(' '), r.statusLabel])
            .includes(q),
        matchDate: (r, f, t) => F().dateMatch(r.date, f, t),
        onApply: () => draw(),
      });
    else if (!host.contains(state.view.el)) host.replaceChildren(state.view.el);
    return state.view;
  }
  function filtered() {
    const v = smart();
    if (!v) return state.items;
    const ids = new Set(v.filter(state.items.map((i) => i.f)).rows.map((r) => r.id));
    return state.items.filter((i) => ids.has(i.f.id));
  }
  const stamp = () => {
    const v = state.view,
      w = HAK.ContractStatus.weighNote ? HAK.ContractStatus.weighNote() : '';
    return (v ? ' · Bộ lọc: ' + v.describe() : '') + (w ? ' · ' + w : '');
  }; // cảnh báo phiếu cân trùng / xung đột đi cùng mọi bản xuất

  /* ---------- Hiển thị ---------- */
  const card = (l, v, s) =>
    '<div class="col-6 col-md-3 col-xl"><div class="border rounded p-2 h-100"><div class="small muted">' +
    l +
    '</div><div class="fw-semibold fs-5">' +
    v +
    '</div>' +
    (s ? '<div class="small muted">' + s + '</div>' : '') +
    '</div></div>';
  function draw() {
    const host = $('#coBody');
    if (!host) return;
    const list = filtered(),
      T = (k) => sum(list.map((i) => i.m.tax[k])),
      nDecl = sum(list.map((i) => i.m.T.length)),
      nClr = sum(list.map((i) => i.m.cleared));
    {
      const w = $('#coWeighWarn'),
        t = HAK.ContractStatus.weighNote ? HAK.ContractStatus.weighNote() : '';
      if (w) {
        w.textContent = t;
        w.classList.toggle('d-none', !t);
      }
    }
    $('#coCards').innerHTML =
      card('Hợp đồng', list.length, list.filter((i) => i.m.status.code === 'done').length + ' đã hoàn thành') +
      card('KL hợp đồng hiện hành', nf(sum(list.map((i) => i.m.qty))) + ' BDMT', 'chứng thư: ' + nf(sum(list.map((i) => i.m.certBdmt)))) +
      card('Tờ khai', nDecl, nClr + ' đã thông quan') +
      card('Thuế phải nộp', nf(T('payable')) + ' đ', 'đã nộp ' + nf(T('paid'))) +
      card(
        'Thuế CÒN NỢ',
        '<span class="' + (T('owed') > 0 ? 'text-danger' : 'text-success') + '">' + nf(T('owed')) + ' đ</span>',
        list.filter((i) => i.f.owing).length +
          ' hợp đồng còn nợ' +
          (T('over') > 0 ? ' · nộp thừa ' + nf(T('over')) + ' đ (không bù trừ)' : '') +
          (T('undetermined') > 0 ? ' · ' + T('undetermined') + ' tờ khai chưa xác định thuế' : '')
      ) +
      card('Có lệch đối chiếu', list.filter((i) => i.f.mismatch).length, 'hợp đồng cần kiểm tra');
    const head =
      '<thead><tr class="text-center">' +
      BANDS.map((b, k) => '<th colspan="' + bandSpan(k) + '" class="text-bg-' + b[1] + '">' + b[0] + '</th>').join('') +
      '</tr><tr>' +
      COLS.map((c, i) => '<th class="' + (c.n ? 'num ' : '') + (i === 0 ? 'co-first' : '') + '">' + esc(c.h) + '</th>').join('') +
      '</tr></thead>';
    const body = list.length
      ? list
          .map((it) =>
            rowsOf(it)
              .map(
                (r) =>
                  '<tr class="' +
                  (r.cls === 'main' ? 'table-light fw-semibold co-main' : 'small') +
                  '"' +
                  (r.cls === 'main' ? ' data-co-file="' + esc(it.f.id) + '" style="cursor:pointer" title="Bấm để mở Hồ sơ hợp đồng"' : '') +
                  '>' +
                  r.c
                    .map(
                      (v, i) =>
                        '<td class="' +
                        (COLS[i].n ? 'num text-nowrap ' : '') +
                        (i === 0 ? 'co-first ' : '') +
                        tone(v, i) +
                        '"' +
                        ' style="' +
                        (COLS[i].n ? '' : 'white-space:normal;word-break:break-word;') +
                        (i === 0 ? 'width:300px;min-width:300px;max-width:300px;' : 'min-width:' + (COLS[i].n ? 112 : 120) + 'px;') +
                        (i === 0 && r.cls === 'sub' ? 'padding-left:1.4rem' : '') +
                        '">' +
                        esc(v) +
                        '</td>'
                    )
                    .join('') +
                  '</tr>'
              )
              .join('')
          )
          .join('')
      : '<tr><td colspan="' + COLS.length + '" class="muted text-center py-4">Chưa có hợp đồng khớp bộ lọc.</td></tr>';
    host.innerHTML =
      '<table class="table table-sm align-middle co-table" style="min-width:2300px">' + head + '<tbody>' + body + '</tbody></table>';
    ['#coXls', '#coPdf'].forEach((s) => {
      const b = $(s);
      if (b) b.disabled = !list.length;
    });
  }
  async function render() {
    if (!$('#page-contractoverview') || state.loading) return;
    state.loading = true;
    $('#coBody').innerHTML = '<div class="muted text-center py-4">Đang đọc dữ liệu…</div>';
    try {
      await load();
      smart();
      if (state.view) state.view.refresh();
      draw();
    } catch (e) {
      console.error(e);
      $('#coBody').innerHTML = '<div class="text-danger text-center py-4">' + esc(e.message || e) + '</div>';
    } finally {
      state.loading = false;
    }
  }

  /* ---------- Excel / PDF ---------- */
  const xl = (i, v) => (NUM.has(i) && v !== '' && v !== null ? (HAK.NumFmt.parse(v, 'num') === null ? v : HAK.NumFmt.parse(v, 'num')) : v);
  /** Thêm các trang tính chi tiết: Chứng thư (mỗi chứng thư 1 dòng), Tờ khai, Phụ lục — cùng nguồn với ☁ Đồng bộ Google Sheet. */
  function addDetailSheets(wb, R, list) {
    const items = list.map((it) => ({ c: it.m.c, buyer: it.g.f.buyer, m: it.m })),
      sheets = HAK.GSyncContracts.buildSheets(items, { types: CF().TYPES });
    const TITLES = {
      NL_CHUNGTHU: ['Chứng thư', 'CHỨNG THƯ THEO HỢP ĐỒNG'],
      NL_TOKHAI: ['Tờ khai', 'TỜ KHAI HẢI QUAN THEO HỢP ĐỒNG'],
      NL_PHULUC: ['Phụ lục', 'PHỤ LỤC HỢP ĐỒNG (ĐIỀU CHỈNH KHỐI LƯỢNG)'],
    };
    sheets
      .filter((sh) => TITLES[sh.name])
      .forEach((sh) => {
        const isDate = (i) => sh.cols[i].n === 'dd/mm/yyyy';
        const rows = sh.rows.map((r) => r.map((v, i) => (isDate(i) && /^\d{4}-\d\d-\d\dT/.test(v || '') ? new Date(v) : v)));
        R.buildSheet(
          wb,
          TITLES[sh.name][0],
          TITLES[sh.name][1],
          'Dòng đầu mỗi bảng = tiêu đề cột · ' + new Date().toLocaleDateString('vi-VN') + stamp(),
          sh.cols.map((c) => ({ h: c.h, w: Math.max(12, Math.min(34, c.h.length + 6)), n: c.n })),
          rows,
          { total: false }
        );
      });
  }
  const BAND_ARGB = ['FF1F4E78', 'FF2E7D32', 'FF0277BD', 'FFB26A00', 'FFC62828', 'FF546E7A', 'FF37474F'];
  async function exportXls() {
    const list = filtered();
    if (!list.length) return;
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report,
      wb = R.newWorkbook(),
      ws = wb.addWorksheet('Báo cáo'),
      XF = 'Arial',
      N = COLS.length;
    const thin = { style: 'thin', color: { argb: 'FF9E9E9E' } },
      B = { top: thin, left: thin, bottom: thin, right: thin };
    const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    ws.columns = COLS.map((c) => ({ width: c.w }));
    ws.mergeCells(1, 1, 1, N);
    Object.assign(ws.getCell(1, 1), { value: 'BÁO CÁO THỰC HIỆN HỢP ĐỒNG THEO QUY TRÌNH', font: { name: XF, size: 14, bold: true } });
    ws.mergeCells(2, 1, 2, N);
    Object.assign(ws.getCell(2, 1), {
      value:
        'Hợp đồng + phụ lục → chứng thư → tờ khai → khai bổ sung → nộp thuế → xuất hàng → đối chiếu' +
        stamp() +
        ' · Ngày xuất: ' +
        new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      font: { name: XF, size: 9, italic: true, color: { argb: 'FF555555' } },
      alignment: { wrapText: true, vertical: 'top' },
    });
    ws.getRow(2).height = 30;
    let col = 1; // hàng 4: nhóm quy trình (gộp ô); hàng 5: tên cột
    BANDS.forEach((bd, k) => {
      const span = bandSpan(k);
      if (span > 1) ws.mergeCells(4, col, 4, col + span - 1);
      Object.assign(ws.getCell(4, col), {
        value: bd[0],
        font: { name: XF, size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
      for (let i = col; i < col + span; i++) {
        ws.getCell(4, i).fill = fill(BAND_ARGB[k]);
        ws.getCell(4, i).border = B;
        ws.getCell(5, i).fill = fill(BAND_ARGB[k]);
      }
      col += span;
    });
    COLS.forEach((c, i) =>
      Object.assign(ws.getCell(5, i + 1), {
        value: c.h,
        font: { name: XF, size: 9, bold: true, color: { argb: 'FFFFFFFF' } },
        border: B,
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      })
    );
    ws.getRow(4).height = 20;
    ws.getRow(5).height = 42;
    let rr = 6;
    const mains = [];
    list.forEach((it) =>
      rowsOf(it).forEach((r) => {
        const isMain = r.cls === 'main';
        if (isMain) mains.push(rr);
        r.c.forEach((v, i) => {
          const cell = ws.getCell(rr, i + 1),
            val = xl(i, v);
          cell.value = val === '' ? null : val;
          cell.border = B;
          const t = tone(v, i),
            red = /danger/.test(t),
            grn = /success/.test(t);
          cell.font = {
            name: XF,
            size: 9,
            bold: isMain || /fw-semibold/.test(t),
            color: { argb: red ? 'FFC00000' : grn ? 'FF2E7D32' : 'FF000000' },
          };
          if (isMain) cell.fill = fill('FFEAF1FB');
          if (COLS[i].n) {
            cell.numFmt = numFmt(i);
            cell.alignment = { horizontal: 'right', vertical: 'top' };
          } else cell.alignment = { wrapText: true, vertical: 'top', indent: i === 0 && !isMain ? 2 : 0 };
        });
        rr++;
      })
    );
    const tot = rr;
    ws.getCell(tot, 1).value = 'TỔNG CỘNG (' + list.length + ' hợp đồng)';
    COLS.forEach((c, i) => {
      const cell = ws.getCell(tot, i + 1);
      cell.fill = fill('FFD9E2F3');
      cell.font = { name: XF, size: 9, bold: true };
      cell.border = {
        top: { style: 'double', color: { argb: 'FF808080' } },
        bottom: { style: 'double', color: { argb: 'FF808080' } },
        left: thin,
        right: thin,
      };
      if (c.n && c.sum) {
        // chỉ cộng dòng hợp đồng (dòng chi tiết không cộng lại)
        const L = String.fromCharCode(65 + i);
        cell.value = {
          formula: mains.map((m) => L + m).join('+'),
          result: mains.reduce((a, m) => a + (+ws.getCell(m, i + 1).value || 0), 0),
        };
        cell.numFmt = numFmt(i);
        cell.alignment = { horizontal: 'right' };
      }
    });
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 5 }];
    ws.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.headerFooter.oddFooter = 'HAK · &D · Trang &P / &N';
    addDetailSheets(wb, R, list);
    const blob = new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (!(await HAK.Word.Files.saveBlob(blob, 'BaoCaoThucHienHopDong.xlsx'))) return;
    toast('Đã xuất Báo cáo thực hiện hợp đồng.', 'success');
  }
  /** PDF chia 2 phần (A4 ngang không đủ chỗ cho 21 cột): phần 1 = ①–④ (đến khai bổ sung), phần 2 = ⑤–⑦ (nộp thuế, xuất hàng, đối chiếu); cột đầu lặp lại để đối chiếu dòng. */
  const PART1 = COLS.map((c, i) => i).filter((i) => COLS[i].b <= 3),
    PART2 = [0].concat(COLS.map((c, i) => i).filter((i) => COLS[i].b >= 4));
  async function exportPdf() {
    const list = filtered();
    if (!list.length) return;
    const all = list.flatMap((it) => rowsOf(it)),
      pick = (idx) => ({
        cols: idx.map((i) => ({ h: COLS[i].h, n: !!COLS[i].n })),
        rows: all.map((r) => ({ cls: r.cls, c: idx.map((i) => r.c[i]) })),
      });
    await HAK.Customs.printReport({
      file: 'BaoCaoThucHienHopDong',
      title: 'BÁO CÁO THỰC HIỆN HỢP ĐỒNG THEO QUY TRÌNH',
      sub: 'Hợp đồng + phụ lục → chứng thư → tờ khai → khai bổ sung → nộp thuế → xuất hàng → đối chiếu' + stamp(),
      tables: [
        Object.assign({ caption: 'PHẦN 1 — ① Hợp đồng + phụ lục · ② Chứng thư · ③ Tờ khai hải quan · ④ Khai bổ sung' }, pick(PART1)),
        Object.assign({ pageBreak: true, caption: 'PHẦN 2 — ⑤ Nộp thuế · ⑥ Xuất hàng · ⑦ Đối chiếu' }, pick(PART2)),
      ],
    });
  }

  /** ☁ Ghi NL_HOPDONG · NL_TOKHAI · NL_PHULUC lên Google Sheet của từng công ty (xem gsync-contracts.js). */
  async function syncSheet() {
    HAK.UI.Loading.show('Đang đọc hợp đồng, tờ khai và phiếu cân…');
    try {
      const r = await HAK.GSyncContracts.pushAll((i, n, name) =>
        HAK.UI.Loading.set(Math.round(((i - 1) / n) * 100), 'Đang ghi Google Sheet ' + name + ' (' + i + '/' + n + ')…')
      );
      HAK.UI.Loading.hide();
      const parts = r.map((p) =>
        p.skipped
          ? p.name + ': chưa cài Sheet'
          : p.error
            ? p.name + ': LỖI — ' + p.error
            : p.name + ': ' + p.hd + ' hợp đồng, ' + p.ct + ' chứng thư, ' + p.tk + ' tờ khai, ' + p.pl + ' phụ lục'
      );
      const bad = r.some((p) => p.skipped || p.error);
      toast(
        (bad ? 'Đồng bộ xong một phần. ' : 'Đã đồng bộ Google Sheet. ') + parts.join(' · ') + '.',
        r.some((p) => p.error) ? 'error' : bad ? 'warning' : 'success'
      );
    } catch (e) {
      HAK.UI.Loading.hide();
      throw e;
    }
  }
  function init() {
    const host = $('#page-contractoverview');
    if (!host || host.dataset.bound) return;
    host.dataset.bound = '1';
    host.addEventListener('click', (e) => {
      const row = e.target.closest('[data-co-file]');
      if (row && !e.target.closest('a,button')) {
        CF()
          .open(row.dataset.coFile)
          .catch((x) => toast(x.message || String(x), 'error'));
        return;
      }
      if (e.target.closest('#coXls')) exportXls().catch((x) => toast(x.message || String(x), 'error'));
      else if (e.target.closest('#coPdf')) exportPdf().catch((x) => toast(x.message || String(x), 'error'));
      else if (e.target.closest('#coGs')) {
        const b = e.target.closest('#coGs');
        HAK.UI.confirmClick(
          b,
          () => syncSheet().catch((x) => toast(x.message || String(x), 'error')),
          'Bấm lần nữa: ghi đè 4 sheet trên Google Sheet'
        );
      } else if (e.target.closest('#coReload')) render();
    });
  }
  HAK.ContractOverview = { render, init, rowsOf, COLS, BANDS, IX, PART1, PART2 };
  if (typeof module === 'object' && module.exports) module.exports = HAK.ContractOverview;
  if (typeof module === 'object' && module.exports) module.exports = HAK.ContractOverview;
})(typeof window !== 'undefined' ? window : globalThis);
