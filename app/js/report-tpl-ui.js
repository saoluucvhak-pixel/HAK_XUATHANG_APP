/**
 * report-tpl-ui.js — bộ chọn "Mẫu báo cáo" ở màn Báo cáo tổng hợp: chọn mẫu theo mục đích, đặt tham số, xem bảng + biểu đồ, tra từ số tổng về hồ sơ nguồn,
 * xuất Excel / PDF. Toàn bộ số liệu do report-tpl.js dựng MỘT lần thành doc; màn hình, Excel và PDF đều đọc doc đó (cùng kết quả tính và phạm vi lọc).
 * Kỳ, năm, căn cứ tính kỳ, bộ lọc và phạm vi công ty lấy từ phần đầu trang Báo cáo (mẫu 1, 2, 5); mẫu 3, 4 lấy tình trạng tại thời điểm lập.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);
  const T = () => HAK.ReportTpl;
  const toast = (m, t) => HAK.UI.toast(m, t);

  const DEFAULTS = {
    period: { granularity: 'month', groupBy: 'company', compare: true },
    breakdown: { groupBy: 'ship', sort: 'delKg', dir: 'desc', topN: 0 },
    contracts: { flags: [], q: '' },
    tax: { q: '' },
    exceptions: {},
  };
  const st = { id: '', doc: null, seq: 0, params: JSON.parse(JSON.stringify(DEFAULTS)), timer: null };
  const LEGACY = ['#repEmpty', '#repContracts', '#repCustoms', '#repMain'];
  const opt = (v, label, cur) =>
    '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
  const sel = (id, label, options, cur, col) =>
    '<div class="' +
    (col || 'col-6 col-md-3') +
    '"><label class="form-label" for="' +
    id +
    '">' +
    esc(label) +
    '</label><select id="' +
    id +
    '" class="form-select form-select-sm" data-rtp="' +
    id.replace('rtp-', '') +
    '">' +
    options.map((o) => opt(o[0], o[1], cur)).join('') +
    '</select></div>';

  /* ---------------- tham số riêng từng mẫu ---------------- */
  function renderParams() {
    const host = $('#repTplParams');
    if (!host) return;
    const p = st.params[st.id] || {},
      b = T().BY_TEXT,
      G = T().GRAN_TEXT;
    let h = '';
    if (st.id === 'period')
      h =
        sel(
          'rtp-granularity',
          'Độ chi tiết theo kỳ',
          Object.keys(G).map((k) => [k, G[k].charAt(0).toUpperCase() + G[k].slice(1)]),
          p.granularity
        ) +
        sel(
          'rtp-groupBy',
          'Nhóm theo',
          ['company', 'type', 'kho'].map((k) => [k, b[k].charAt(0).toUpperCase() + b[k].slice(1)]),
          p.groupBy
        ) +
        '<div class="col-12 col-md-4 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" id="rtp-compare" data-rtp="compare"' +
        (p.compare ? ' checked' : '') +
        '><label class="form-check-label" for="rtp-compare">So sánh với kỳ trước cùng độ dài (cần chọn kỳ có đủ ngày bắt đầu và kết thúc)</label></div></div>';
    else if (st.id === 'breakdown')
      h =
        sel(
          'rtp-groupBy',
          'Phân tích theo',
          ['ship', 'kho', 'carrier'].map((k) => [k, b[k].charAt(0).toUpperCase() + b[k].slice(1)]),
          p.groupBy
        ) +
        sel(
          'rtp-sort',
          'Sắp xếp theo',
          [
            ['delKg', 'Thực giao'],
            ['kg', 'Qua cân'],
            ['trips', 'Số xe'],
            ['retRate', 'Tỷ lệ xe trả về'],
            ['share', 'Tỷ trọng'],
            ['label', 'Tên nhóm'],
          ],
          p.sort
        ) +
        sel(
          'rtp-dir',
          'Chiều',
          [
            ['desc', 'Giảm dần'],
            ['asc', 'Tăng dần'],
          ],
          p.dir,
          'col-6 col-md-2'
        ) +
        '<div class="col-6 col-md-2"><label class="form-label" for="rtp-topN">Top N (0 = tất cả)</label><input type="number" min="0" max="200" class="form-control form-control-sm" id="rtp-topN" data-rtp="topN" value="' +
        esc(p.topN || 0) +
        '"></div>';
    else if (st.id === 'contracts')
      h =
        '<div class="col-12 col-md-8"><div class="form-label mb-1">Chỉ hiện hợp đồng (chọn nhiều = thỏa một trong các điều kiện)</div><div class="d-flex flex-wrap gap-3">' +
        Object.keys(T().FLAGS)
          .map(
            (k) =>
              '<div class="form-check"><input class="form-check-input" type="checkbox" id="rtp-f-' +
              k +
              '" data-rtf="' +
              k +
              '"' +
              ((p.flags || []).indexOf(k) >= 0 ? ' checked' : '') +
              '><label class="form-check-label" for="rtp-f-' +
              k +
              '">' +
              esc(T().FLAGS[k]) +
              '</label></div>'
          )
          .join('') +
        '</div></div><div class="col-12 col-md-4"><label class="form-label" for="rtp-q">Tìm số hợp đồng / bên mua</label><input type="search" class="form-control form-control-sm" id="rtp-q" data-rtp="q" value="' +
        esc(p.q || '') +
        '"></div>';
    else if (st.id === 'tax')
      h =
        '<div class="col-12 col-md-5"><label class="form-label" for="rtp-q">Tìm số hợp đồng / số tờ khai</label><input type="search" class="form-control form-control-sm" id="rtp-q" data-rtp="q" value="' +
        esc(p.q || '') +
        '"></div>';
    host.innerHTML = h || '<div class="col-12 small muted">Mẫu này không có tùy chọn thêm; kỳ và bộ lọc lấy từ phần đầu trang.</div>';
  }

  /* ---------------- ngữ cảnh ---------------- */
  /** Phiếu trong các đợt Excel đang nạp nhưng chưa thuộc hồ sơ nào trong Lưu trữ (nhận diện theo công ty + số phiếu + ngày + biển số). */
  function unassignedTickets(base) {
    const W = HAK.Weigh,
      slots = HAK.App && HAK.App.slots;
    if (!W || !slots) return [];
    const co = (HAK.Auth && HAK.Auth.company && HAK.Auth.company()) || '',
      known = new Set();
    base.tickets.forEach((list) => list.forEach((t) => t.id && known.add(t.id.replace(/#\d+$/, ''))));
    const out = [];
    Object.keys(slots).forEach((type) => {
      const ds = slots[type] && slots[type].ds;
      if (!ds || !ds.ok) return;
      ds.rows.forEach((r) => {
        const k = W.identity(r, co);
        if (!k || known.has(k)) return;
        out.push({ type, batch: String(r.uid || '').replace(/#\d+$/, ''), ticket: r.ticket, plate: r.plate, date: r.dateStr, net: r.net });
      });
    });
    return out;
  }
  async function buildCtx(id) {
    const base = await HAK.Report.tplContext(),
      ctx = Object.assign({}, base);
    if (id === 'contracts' || id === 'tax' || id === 'exceptions') {
      ctx.contracts = await HAK.ContractOverview.items(); // đã áp phạm vi công ty báo cáo (ContractStatus.load)
      if (id === 'exceptions') {
        ctx.unlinked = ((HAK.ContractStatus && HAK.ContractStatus.state.unlinked) || []).map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type,
          ship: r.ship,
          kg: r.kg,
        }));
        // Chỉ kiểm "phiếu chưa gắn hồ sơ" khi đọc được phiếu của MỌI hồ sơ; nếu không thì không thể khẳng định phiếu nào chưa thuộc hồ sơ nào.
        const unread = base.metas.filter((m) => !base.tickets.has(m.id)).length;
        if (unread) ctx.unassignedSkipped = unread;
        else ctx.unassigned = unassignedTickets(base);
      }
    }
    return ctx;
  }

  /* ---------------- hiển thị ---------------- */
  const numCol = (c) => c.t !== 'text' && c.t !== 'id' && c.t !== 'date';
  function actionsOf(sec, row, ri) {
    const d = row.drill || {},
      b = [];
    const btn = (act, label) =>
      '<button type="button" class="btn btn-sm btn-outline-primary py-0 px-1 me-1 mb-1" data-rt-act="' +
      act +
      '" data-sec="' +
      esc(sec.id) +
      '" data-row="' +
      ri +
      '">' +
      esc(label) +
      '</button>';
    if (d.recs && d.recs.length) b.push(btn('recs', 'Hồ sơ (' + d.recs.length + ')'));
    if (d.tickets && d.tickets.length) b.push(btn('tickets', 'Phiếu cân (' + d.tickets.length + ')'));
    if (d.contractId) {
      b.push(btn('contract', 'Hồ sơ hợp đồng'));
      if (d.hasTrips) b.push(btn('trips', 'Phiếu cân'));
    }
    if (d.declId) b.push(btn('decl', 'Giấy nộp tiền · khai bổ sung'));
    if (row.open) b.push(btn('open', 'Mở bản ghi nguồn'));
    return b.join('');
  }
  function sectionHtml(doc, sec) {
    const hasAct = sec.rows.some((r) => r.drill || r.open);
    let h = '<div class="mb-4"><div class="sec-title">' + esc(sec.title) + '</div>';
    if (sec.note) h += '<div class="form-text mt-0 mb-2">' + esc(sec.note) + '</div>';
    if (sec.chart) h += '<div class="mb-2">' + T().chartSvg(sec.chart) + '</div>';
    h += '<div class="tbl-wrap" style="max-height:none"><table class="table table-sm align-middle rt-table"><thead><tr>';
    h += sec.columns.map((c) => '<th' + (numCol(c) ? ' class="num"' : '') + '>' + esc(T().headerText(c)) + '</th>').join('');
    h += (hasAct ? '<th>Tra cứu</th>' : '') + '</tr></thead><tbody>';
    if (!sec.rows.length)
      h +=
        '<tr><td colspan="' +
        (sec.columns.length + (hasAct ? 1 : 0)) +
        '" class="muted">Không có dòng nào trong phạm vi đang chọn.</td></tr>';
    sec.rows.forEach((r, ri) => {
      h +=
        '<tr class="' +
        esc(r.cls || '') +
        '">' +
        sec.columns.map((c) => '<td' + (numCol(c) ? ' class="num"' : '') + '>' + esc(T().fmtCell(c, r.c[c.k])) + '</td>').join('') +
        (hasAct ? '<td class="text-nowrap">' + actionsOf(sec, r, ri) + '</td>' : '') +
        '</tr>';
    });
    h += '</tbody>';
    if (sec.totals && sec.rows.length)
      h +=
        '<tfoot><tr class="fw-semibold table-light">' +
        sec.columns.map((c) => '<td' + (numCol(c) ? ' class="num"' : '') + '>' + esc(T().fmtCell(c, sec.totals[c.k])) + '</td>').join('') +
        (hasAct ? '<td></td>' : '') +
        '</tr></tfoot>';
    return h + '</table></div></div>';
  }
  function docHtml(doc) {
    const h = doc.header;
    let s = '<h5 class="mb-2">' + esc(doc.title) + '</h5><dl class="row small mb-2 rt-meta">';
    [
      ['Công ty', h.company],
      ['Kỳ', h.period],
      ['Căn cứ tính kỳ', h.basis],
      ['Bộ lọc đang áp dụng', h.filters],
      ['Đơn vị', h.units],
      ['Thời điểm lập', h.createdText],
    ].forEach(([k, v]) => {
      s += '<dt class="col-sm-3 col-md-2 fw-semibold">' + esc(k) + '</dt><dd class="col-sm-9 col-md-10 mb-0">' + esc(v) + '</dd>';
    });
    s += '</dl>';
    doc.warnings.forEach((w) => (s += '<div class="alert alert-warning py-1 px-2 small mb-1">⚠ ' + esc(w) + '</div>'));
    if (doc.notes.length) s += '<div class="small muted mb-2">' + doc.notes.map(esc).join('<br>') + '</div>';
    return s + doc.sections.map((x) => sectionHtml(doc, x)).join('');
  }

  /* ---------------- dựng lại ---------------- */
  function applyMode() {
    const on = !!st.id;
    LEGACY.forEach((s) => $(s) && $(s).classList.toggle('rt-hide', on));
    const panel = $('#repTplPanel');
    if (panel) panel.classList.toggle('d-none', !on);
    const t = T().TEMPLATES.find((x) => x.id === st.id);
    const help = $('#repTplHelp');
    if (help)
      help.innerHTML = t
        ? '<b>Trả lời câu hỏi:</b> ' +
          esc(t.q) +
          '<br><b>Dữ liệu lấy từ:</b> ' +
          esc(t.src) +
          '<br><b>Tra từ số tổng về nguồn:</b> ' +
          esc(t.trace)
        : 'Chọn một mẫu để xem báo cáo theo đúng mục đích; để trống là báo cáo hiện có (tất cả các phần bên dưới).';
  }
  async function refresh() {
    const s = $('#repTpl');
    if (!s) return;
    st.id = s.value;
    applyMode();
    renderParams();
    if (!st.id) {
      st.doc = null;
      return;
    }
    const mine = ++st.seq,
      body = $('#repTplBody');
    body.innerHTML = '<div class="muted small">Đang dựng báo cáo…</div>';
    $('#repTplXls').disabled = $('#repTplPdf').disabled = true;
    try {
      const ctx = await buildCtx(st.id),
        params = Object.assign({}, ctx.params, st.params[st.id]);
      if (mine !== st.seq) return;
      const doc = T().build(st.id, ctx, params);
      st.doc = doc;
      body.innerHTML = docHtml(doc);
      $('#repTplXls').disabled = $('#repTplPdf').disabled = false;
    } catch (e) {
      console.error(e);
      if (mine === st.seq)
        body.innerHTML = '<div class="alert alert-danger small">Không dựng được báo cáo: ' + esc(e.message || String(e)) + '</div>';
    }
  }
  /** Gọi từ HAK.Report.draw(): kỳ / bộ lọc / phạm vi đổi → mẫu đang chọn dựng lại (gộp nhiều lần gọi liên tiếp). */
  function onDraw() {
    if (!st.id) return;
    clearTimeout(st.timer);
    st.timer = setTimeout(refresh, 60);
  }

  /* ---------------- tra cứu (drill-down) ---------------- */
  function modal(title, html) {
    let m = $('#repTplModal');
    if (!m) {
      m = document.createElement('div');
      m.className = 'modal fade';
      m.id = 'repTplModal';
      m.tabIndex = -1;
      m.innerHTML =
        '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div><div class="modal-body"></div></div></div>';
      document.body.appendChild(m);
    }
    m.querySelector('.modal-title').textContent = title;
    m.querySelector('.modal-body').innerHTML = html;
    bootstrap.Modal.getOrCreateInstance(m).show();
  }
  const hideModal = () => {
    const m = $('#repTplModal');
    if (m && root.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
  };
  const tbl = (cols, rows) =>
    '<div class="tbl-wrap" style="max-height:none"><table class="table table-sm"><thead><tr>' +
    cols.map((c) => '<th' + (c.n ? ' class="num"' : '') + '>' + esc(c.h) + '</th>').join('') +
    '</tr></thead><tbody>' +
    (rows.length
      ? rows
          .map(
            (r) =>
              '<tr>' +
              r.map((x, i) => '<td' + (cols[i].n ? ' class="num"' : '') + (cols[i].raw ? '>' + x : '>' + esc(x)) + '</td>').join('') +
              '</tr>'
          )
          .join('')
      : '<tr><td colspan="' + cols.length + '" class="muted">Không có dòng nào.</td></tr>') +
    '</tbody></table></div>';
  const F = (n) => T().fmtNum(n, 0);
  function openRecord(id) {
    hideModal();
    if (HAK.Archive && HAK.Archive.focus) HAK.Archive.focus(id);
    else location.hash = '#/archive';
  }
  function openSource(o) {
    if (!o) return;
    if (o.kind === 'record') openRecord(o.id);
    else if (o.kind === 'contract') HAK.ContractFile.open(o.id).catch((e) => toast(e.message || String(e), 'error'));
    else if (o.kind === 'batch') {
      location.hash = '#/file';
      setTimeout(() => {
        const b = document.querySelector('[data-ft="' + o.type + '"]');
        if (b) b.click();
      }, 400);
    }
  }
  function onAction(btn) {
    const sec = st.doc && st.doc.sections.find((x) => x.id === btn.dataset.sec),
      row = sec && sec.rows[+btn.dataset.row];
    if (!row) return;
    const act = btn.dataset.rtAct,
      d = row.drill || {};
    if (act === 'recs')
      modal(
        'Hồ sơ tạo ra số liệu — ' + (row.c.grp || row.c.per || row.c.title || ''),
        tbl(
          [
            { h: 'Hồ sơ' },
            { h: 'Hình thức' },
            { h: 'Từ ngày' },
            { h: 'Đến ngày' },
            { h: 'Số xe', n: 1 },
            { h: 'Qua cân (kg)', n: 1 },
            { h: 'Thực giao (kg)', n: 1 },
            { h: '', raw: 1 },
          ],
          d.recs.map((r) => [
            r.title || r.id,
            r.type,
            r.from,
            r.to,
            F(r.trips),
            F(r.kg),
            F(r.delKg),
            '<button type="button" class="btn btn-sm btn-primary py-0" data-rt-focus="' + esc(r.id) + '">Mở hồ sơ</button>',
          ])
        ) + (d.members ? '<div class="small muted mt-2">Gồm các nhóm: ' + esc(d.members.join('; ')) + '</div>' : '')
      );
    else if (act === 'tickets')
      modal(
        'Phiếu cân tạo ra số liệu — ' + (row.c.grp || ''),
        tbl(
          [
            { h: 'Hồ sơ' },
            { h: 'Số phiếu' },
            { h: 'Ngày cân' },
            { h: 'Biển số' },
            { h: 'Đơn vị vận chuyển' },
            { h: 'Qua cân (kg)', n: 1 },
            { h: 'Xe trả về' },
          ],
          d.tickets.map((t) => [t.recTitle, t.ticket, T().fmtDate(t.ts), t.plate, t.carrier, F(t.kg), t.ret ? 'Có' : ''])
        ) +
          '<div class="small muted mt-2">Tổng ' +
          d.tickets.length +
          ' phiếu · ' +
          F(d.tickets.reduce((a, t) => a + t.kg, 0)) +
          ' kg — cùng tập phiếu với dòng tổng đã bấm.</div>'
      );
    else if (act === 'contract') HAK.ContractFile.open(d.contractId).catch((e) => toast(e.message || String(e), 'error'));
    else if (act === 'trips') HAK.ContractStatus.openTrips(d.contractId).catch((e) => toast(e.message || String(e), 'error'));
    else if (act === 'decl')
      modal(
        'Tờ khai ' + d.no + ' — căn cứ tính thuế',
        '<div class="alert alert-info py-1 small">' +
          esc(d.basis) +
          '</div><h6>Lần khai bổ sung</h6>' +
          tbl(
            [{ h: 'Lần' }, { h: 'Số tờ khai bổ sung' }, { h: 'Ngày' }, { h: 'Thuế sau khai bổ sung (VND)', n: 1 }, { h: 'Lý do' }],
            d.supps.map((x) => [x.round, x.no, T().fmtDate(x.date), x.taxVnd == null ? '' : F(x.taxVnd), x.reason])
          ) +
          '<h6>Giấy nộp tiền / hoàn thuế</h6>' +
          tbl(
            [{ h: 'Số giấy' }, { h: 'Số tham chiếu' }, { h: 'Ngày' }, { h: 'Loại' }, { h: 'Số tiền (VND)', n: 1 }, { h: 'Nội dung' }],
            d.receipts.map((x) => [x.receiptNo, x.refNo, T().fmtDate(x.date), x.kind, F(x.amount), x.content])
          )
      );
    else if (act === 'open') openSource(row.open);
  }

  /* ---------------- xuất ---------------- */
  const stamp = () => {
    const d = new Date(),
      p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  };
  async function exportExcel() {
    if (!st.doc) return;
    try {
      if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
      const wb = T().toExcel(st.doc, root.ExcelJS),
        buf = await wb.xlsx.writeBuffer(),
        name = 'BaoCao_' + st.doc.id + '_xuat' + stamp() + '.xlsx';
      if (
        !(await HAK.Word.Files.saveBlob(
          new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
          name
        ))
      )
        return;
      toast('Đã xuất: ' + name, 'success');
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), 'error');
    }
  }
  async function exportPdf() {
    if (!st.doc) return;
    try {
      await HAK.Customs.printReport(T().toPrintSpec(st.doc));
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), 'error');
    }
  }

  /* ---------------- khởi tạo ---------------- */
  function init() {
    const s = $('#repTpl');
    if (!s || s.dataset.ready) return;
    s.dataset.ready = '1';
    s.innerHTML =
      '<option value="">Báo cáo hiện có (tất cả các phần bên dưới)</option>' +
      T()
        .TEMPLATES.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>')
        .join('');
    s.addEventListener('change', refresh);
    const panel = $('#repTplPanel');
    panel.addEventListener('change', (e) => {
      const k = e.target.dataset.rtp,
        f = e.target.dataset.rtf,
        p = st.params[st.id];
      if (f) p.flags = Array.from(panel.querySelectorAll('[data-rtf]:checked')).map((x) => x.dataset.rtf);
      else if (k)
        p[k] =
          e.target.type === 'checkbox'
            ? e.target.checked
            : e.target.type === 'number'
              ? Math.max(0, parseInt(e.target.value, 10) || 0)
              : e.target.value;
      else return;
      refresh();
    });
    let t2 = null;
    panel.addEventListener('input', (e) => {
      if (e.target.dataset.rtp !== 'q') return;
      clearTimeout(t2);
      t2 = setTimeout(() => {
        st.params[st.id].q = e.target.value;
        refresh();
      }, 300);
    });
    panel.addEventListener('click', (e) => {
      const a = e.target.closest('[data-rt-act]');
      if (a) onAction(a);
    });
    document.addEventListener('click', (e) => {
      const f = e.target.closest('[data-rt-focus]');
      if (f) openRecord(f.dataset.rtFocus);
    });
    $('#repTplXls').addEventListener('click', exportExcel);
    $('#repTplPdf').addEventListener('click', exportPdf);
    applyMode();
  }

  HAK.ReportTplUI = { init, onDraw, refresh, state: st, exportExcel, exportPdf };
})(typeof window !== 'undefined' ? window : globalThis);
