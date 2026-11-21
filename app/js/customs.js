/**
 * customs.js — tab "🛃 Tờ khai hải quan" trong Danh mục: lõi ghi dữ liệu (commit), biểu mẫu tờ khai / khai bổ sung / giấy nộp tiền, liên kết hợp đồng, và facade API HAK.Customs.
 * Các phần đã tách (nạp theo thứ tự trong index.html): customs-common.js (dùng chung) · customs-report.js · customs-contract-report.js · customs-export.js · customs-print.js (báo cáo, Excel, bản in) ·
 * customs-receipt.js · customs-import.js (nhập Excel / OCR, duyệt giấy nộp tiền; nạp sau file này). Phần cũ của tiêu đề: báo cáo "Tình hình khai hải quan và nộp thuế" (v2.14.0).
 *  - Bảng cha: tờ khai hải quan. Bảng con: khai bổ sung, giấy nộp tiền. Trạng thái: Đã mở tờ khai → Chờ thông quan → Đã thông quan.
 *  - Nhập tờ khai từ file .xls/.xlsx (bản xác nhận nội dung tờ khai VNACCS) hoặc OCR bản in / ảnh; OCR giấy nộp tiền (mẫu C1-02/NS).
 *  - Dữ liệu nằm trong cùng snapshot Danh mục (data.customs) → đi theo Sao lưu, Lưu trữ năm, đồng bộ như hợp đồng.
 *  - Hợp đồng: Đang thực hiện → Đã hoàn thành khi mọi tờ khai của hợp đồng đã thông quan (contractBadge).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { vnDate } = HAK.Util || (typeof require === 'function' ? require('./util.js') : {}); // hàm dùng chung (util.js)
  const {
    $,
    CM,
    NF,
    applyDeclFilter,
    byOpenDesc,
    card,
    contractBadge,
    contractLabel,
    contractOf,
    contracts,
    core,
    cstatus,
    customsList,
    declFlat,
    declSmartCfg,
    decls,
    detailOf,
    esc,
    money,
    shipKey,
    smartView,
    statusBadge,
    statusOpts,
    sums,
    toast,
    today,
  } = HAK.CustomsCommon;
  const { drawReport } = HAK.CustomsReport;
  const { contractReportModel, drawContractReport } = HAK.ContractReport;
  const { exportContractReport, exportReport } = HAK.CustomsExport;
  const { contractPdfSpec, customsPdfSpec, pdfReport, printReport } = HAK.CustomsPrint;

  ('use strict');
  const st = { sel: '', q: '', status: '', showDeleted: false, modal: null };
  /* ---------------- Ghi dữ liệu ---------------- */
  /** fn nhận bản sao của dữ liệu Danh mục, sửa tại chỗ hoặc trả về dữ liệu mới. Lỗi → khôi phục và ném lại. */
  async function commit(fn) {
    const before = core().get(),
      base = CM().copy(before);
    try {
      const out = fn(base) || base;
      core().set(out);
      await core().persist();
      core().changed();
    } catch (e) {
      core().set(before);
      throw e;
    }
  }
  /** Gắn tờ khai với chi tiết hợp đồng: 1 đợt ↔ 1 tờ khai; số TKHQ của đợt lấy theo tờ khai. */
  function syncDetail(next, rec) {
    (next.customs || []).forEach((x) => {
      if (x.id !== rec.id && rec.detailId && x.detailId === rec.detailId) delete x.detailId;
    });
    if (!rec.contractId || !rec.detailId) return;
    const c = (next.contracts || []).find((x) => x.id === rec.contractId),
      d = detailOf(c, rec.detailId);
    if (c && d && d.tkhq !== rec.no) {
      d.tkhq = rec.no;
      d.revision = (d.revision || 0) + 1;
      c.revision = (c.revision || 0) + 1;
    }
  }
  const upsertInto = (next, rec) => {
    const r = CM().upsert(next, rec);
    if (r.error) throw Error(r.error);
    syncDetail(r.data, r.rec);
    return r;
  };

  /* ---------------- Gợi ý hợp đồng / chi tiết hợp đồng từ tờ khai ---------------- */
  function suggestLink(rec) {
    const key = shipKey(rec.ship);
    for (const c of contracts())
      for (const d of (c.details || []).filter((x) => !x.deletedAt)) {
        if ((d.tkhq && CM().digits(d.tkhq) === rec.no) || (key && shipKey(d.ship) === key)) return { contractId: c.id, detailId: d.id };
      }
    return {};
  }

  /* ---------------- Biểu mẫu (hộp thoại dùng chung) ---------------- */
  const FIELD_COL = { text: 6, num: 4, date: 4, select: 6, textarea: 12 };
  function fieldHtml(f, v) {
    const id = 'cs-f-' + f.id,
      col = f.col || FIELD_COL[f.type || 'text'] || 6,
      lbl = '<label class="form-label" for="' + id + '">' + f.label + '</label>';
    const help = f.help ? '<div class="form-text">' + f.help + '</div>' : '';
    let ctl;
    if (f.type === 'select')
      ctl =
        '<select class="form-select" id="' +
        id +
        '">' +
        (f.options || [])
          .map(
            (o) =>
              '<option value="' +
              esc(o[0]) +
              '"' +
              (String(o[0]) === String(v == null ? '' : v) ? ' selected' : '') +
              '>' +
              esc(o[1]) +
              '</option>'
          )
          .join('') +
        '</select>';
    else if (f.type === 'textarea')
      ctl = '<textarea class="form-control" rows="2" id="' + id + '">' + esc(v == null ? '' : v) + '</textarea>';
    else if (f.type === 'num')
      ctl =
        '<input class="form-control" id="' +
        id +
        '" type="text" inputmode="decimal" data-numfmt="num" autocomplete="off" value="' +
        esc(v === null || v === undefined || v === '' ? '' : NF().txt(+v, 'num')) +
        '"' +
        (f.ro ? ' readonly' : '') +
        '>';
    else
      ctl =
        '<input class="form-control" id="' +
        id +
        '" type="' +
        (f.type === 'date' ? 'date' : 'text') +
        '" autocomplete="off" value="' +
        esc(v == null ? '' : v) +
        '"' +
        (f.ro ? ' readonly' : '') +
        '>';
    return '<div class="col-md-' + col + '">' + lbl + ctl + help + '</div>';
  }
  function readFields(fields) {
    const out = {};
    fields.forEach((f) => {
      const el = $('#cs-f-' + f.id);
      if (!el) return;
      const text = String(el.value || '').trim();
      if (f.type === 'num') {
        if (text === '') {
          out[f.id] = null;
          return;
        }
        const n = NF().parse(text, 'num');
        if (n === null) throw Error('Ô "' + f.label.replace(/<[^>]+>/g, '') + '": "' + text + '" không phải là số');
        out[f.id] = n;
      } else out[f.id] = text;
    });
    return out;
  }
  function ensureModal() {
    let m = $('#csModal');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal fade';
    m.id = 'csModal';
    m.tabIndex = -1;
    m.innerHTML =
      '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="csTitle"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
      '<div class="modal-body"><div id="csNote"></div><div class="row g-2" id="csForm"></div></div>' +
      '<div class="modal-footer"><div class="me-auto text-danger small" id="csErr" role="alert"></div><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button><button type="button" class="btn btn-primary" id="csSave">Lưu</button></div></div></div>';
    document.body.append(m);
    NF().attach($('#csForm'));
    return m;
  }
  /** spec: {title, fields, values, notice(html), extraHtml, onOpen(), onSave(values) → Promise, saveLabel} */
  function openModal(spec) {
    const m = ensureModal(),
      vals = spec.values || {};
    $('#csTitle').textContent = spec.title;
    $('#csErr').textContent = '';
    $('#csNote').innerHTML = spec.notice || '';
    $('#csForm').innerHTML =
      (spec.fields || [])
        .map((f) =>
          f.section ? '<div class="col-12"><div class="sec-title mt-2 mb-0">' + f.section + '</div></div>' : fieldHtml(f, vals[f.id])
        )
        .join('') + (spec.extraHtml || '');
    const save = $('#csSave');
    save.textContent = spec.saveLabel || 'Lưu';
    save.disabled = false;
    save.onclick = async () => {
      save.disabled = true;
      $('#csErr').textContent = '';
      try {
        await spec.onSave(readFields((spec.fields || []).filter((f) => !f.section)));
        bootstrap.Modal.getOrCreateInstance(m).hide();
      } catch (e) {
        $('#csErr').textContent = 'Chưa lưu: ' + HAK.UI.friendly(e.message || e);
      } finally {
        save.disabled = false;
      }
    };
    if (spec.onOpen) spec.onOpen();
    bootstrap.Modal.getOrCreateInstance(m).show();
  }

  const contractOpts = () => [['', '— Chưa gắn hợp đồng —']].concat(contracts().map((c) => [c.id, contractLabel(c)]));
  const detailOpts = (cid) =>
    [['', '— Chưa gắn chi tiết hợp đồng —']].concat(
      ((contractOf(cid) || {}).details || [])
        .filter((d) => !d.deletedAt)
        .map((d) => [d.id, [d.ship, d.tkhq && 'TKHQ ' + d.tkhq, d.product].filter(Boolean).join(' · ') || d.id])
    );
  function declFields() {
    return [
      { section: 'Tờ khai' },
      { id: 'no', label: 'Số tờ khai', type: 'text', col: 4, help: 'Dãy số, thường 12 chữ số' },
      { id: 'openDate', label: 'Ngày mở tờ khai (ngày đăng ký)', type: 'date', col: 4 },
      { id: 'round', label: 'Lần khai', type: 'num', col: 2, help: '1 = tờ khai gốc' },
      { id: 'type', label: 'Loại hình', type: 'text', col: 2 },
      { id: 'status', label: 'Trạng thái', type: 'select', options: statusOpts(), col: 4 },
      { id: 'statusAt', label: 'Ngày của trạng thái', type: 'date', col: 4 },
      { id: 'office', label: 'Chi cục hải quan', type: 'text', col: 4 },
      { section: 'Hợp đồng và chi tiết hợp đồng' },
      { id: 'contractId', label: 'Hợp đồng', type: 'select', options: contractOpts(), col: 6 },
      { id: 'detailId', label: 'Chi tiết hợp đồng (tàu · chứng thư)', type: 'select', options: [['', '—']], col: 6 },
      { section: 'Hàng hóa' },
      { id: 'ship', label: 'Tàu / chuyến', type: 'text', col: 6 },
      { id: 'bill', label: 'Số vận đơn', type: 'text', col: 3 },
      { id: 'certNo', label: 'Số chứng thư', type: 'text', col: 3 },
      { id: 'goods', label: 'Mô tả hàng hóa', type: 'text', col: 9 },
      { id: 'hs', label: 'Mã HS', type: 'text', col: 3 },
      { id: 'qtyBdmt', label: 'KL (BDMT)', type: 'num', col: 3 },
      { id: 'qtyTon', label: 'KL (tấn)', type: 'num', col: 3 },
      { id: 'invoiceNo', label: 'Số hóa đơn', type: 'text', col: 3 },
      { id: 'invoiceUsd', label: 'Trị giá hóa đơn (USD)', type: 'num', col: 3 },
      { section: 'Thuế xuất khẩu' },
      { id: 'exchangeRate', label: 'Tỷ giá tính thuế (VNĐ/USD)', type: 'num', col: 3 },
      { id: 'taxableVnd', label: 'Trị giá tính thuế (VNĐ)', type: 'num', col: 3 },
      { id: 'taxRate', label: 'Thuế suất (%)', type: 'num', col: 2 },
      {
        id: 'taxVnd',
        label: 'Thuế xuất khẩu phải nộp (VNĐ)',
        type: 'num',
        col: 4,
        help: 'Nếu có khai bổ sung, số phải nộp lấy theo lần bổ sung mới nhất.',
      },
      { section: 'Các bên' },
      { id: 'exporter', label: 'Người xuất khẩu', type: 'text', col: 6 },
      { id: 'importer', label: 'Người nhập khẩu', type: 'text', col: 6 },
      { id: 'note', label: 'Ghi chú', type: 'textarea', col: 12 },
    ];
  }
  function openDecl(id, prefill, opts) {
    opts = opts || {};
    const cur = id ? customsList().find((d) => d.id === id) : null;
    const base = cur ? Object.assign({}, cur) : Object.assign({ status: 'opened', round: 1 }, prefill || {});
    base.statusAt = cur ? CM().statusDate(cur, cur.status) || today() : today();
    const fields = declFields();
    const hl =
      prefill && !cur ? Object.keys(prefill).filter((k) => prefill[k] !== null && prefill[k] !== '' && prefill[k] !== undefined) : [];
    openModal({
      title: cur ? 'Sửa tờ khai ' + cur.no : 'Thêm tờ khai hải quan',
      fields,
      values: base,
      notice:
        (opts.warnings && opts.warnings.length
          ? '<div class="alert alert-warning py-2 small">' + opts.warnings.map((w) => '⚠ ' + esc(w)).join('<br>') + '</div>'
          : '') +
        (opts.ocrText
          ? '<details class="mb-2"><summary class="small">Xem chữ OCR</summary><pre class="small text-wrap">' +
            esc(opts.ocrText) +
            '</pre></details>'
          : '') +
        (hl.length
          ? '<div class="small text-success mb-1">Các ô tô vàng do ' +
            (opts.fromOcr ? 'OCR' : 'file') +
            ' điền — đối chiếu với bản gốc rồi mới Lưu.</div>'
          : ''),
      onOpen() {
        const cSel = $('#cs-f-contractId'),
          dSel = $('#cs-f-detailId');
        const fillDetails = (keep) => {
          dSel.innerHTML = detailOpts(cSel.value)
            .map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === keep ? ' selected' : '') + '>' + esc(o[1]) + '</option>')
            .join('');
        };
        cSel.value = base.contractId || '';
        fillDetails(base.detailId || '');
        cSel.onchange = () => fillDetails('');
        hl.forEach((k) => {
          const el = $('#cs-f-' + k);
          if (el) el.classList.add('ocr-filled');
        });
      },
      async onSave(v) {
        const rec = Object.assign({}, cur || {}, prefill && !cur ? prefill : {}, v);
        delete rec.statusAt;
        if (cur) rec.statusLog = (cur.statusLog || []).slice();
        else rec.statusLog = [];
        let saved;
        await commit((next) => {
          const r = upsertInto(
            next,
            Object.assign({}, rec, {
              id: cur ? cur.id : undefined,
              statusLog: rec.statusLog,
              supplements: cur ? cur.supplements : [],
              payments: cur ? cur.payments : [],
            })
          );
          const d = r.data.customs.find((x) => x.id === r.rec.id);
          const log = d.statusLog || (d.statusLog = []),
            last = log[log.length - 1];
          if (!last) log.push({ status: d.status, at: v.statusAt || today() });
          else if (last.status !== d.status) log.push({ status: d.status, at: v.statusAt || today() });
          else if (v.statusAt && last.at !== v.statusAt) last.at = v.statusAt;
          saved = d;
          return r.data;
        });
        st.sel = saved.id;
        draw();
        toast('Đã lưu tờ khai ' + saved.no + '.', 'success');
        notifyContract(saved);
      },
    });
  }
  function notifyContract(d) {
    if (!d || !d.contractId || d.status !== 'cleared') return;
    const s = cstatus(d.contractId);
    if (s.code === 'done')
      toast('Hợp đồng ' + ((contractOf(d.contractId) || {}).no || '') + ' đã hoàn thành (mọi tờ khai đã thông quan).', 'success');
  }
  async function setStatus(id, status) {
    const d = customsList().find((x) => x.id === id);
    if (!d || d.status === status) return;
    try {
      await commit((next) => {
        CM().setStatus(
          next.customs.find((x) => x.id === id),
          status,
          today(),
          HAK.Auth && HAK.Auth.who ? HAK.Auth.who() : ''
        );
      });
      draw();
      core().render();
      toast('Tờ khai ' + d.no + ': ' + CM().STATUS[status] + '.', 'success');
      notifyContract(customsList().find((x) => x.id === id));
    } catch (e) {
      toast(e.message || String(e), 'error');
    }
  }
  async function removeDecl(id, restore) {
    try {
      await commit((next) => {
        const d = next.customs.find((x) => x.id === id);
        if (!d) throw Error('Không tìm thấy tờ khai.');
        if (restore) delete d.deletedAt;
        else {
          d.deletedAt = new Date().toISOString();
          delete d.detailId;
        }
        d.revision = (d.revision || 0) + 1;
      });
      draw();
      core().render();
      toast(restore ? 'Đã khôi phục tờ khai.' : 'Đã xóa tờ khai (có thể khôi phục ở "Xem tờ khai đã xóa").', 'info');
    } catch (e) {
      toast(e.message || String(e), 'error');
    }
  }

  /* ---------------- Khai bổ sung / giấy nộp tiền (bảng con) ---------------- */
  function openSupp(declId, id, prefill) {
    const d = customsList().find((x) => x.id === declId);
    if (!d) return;
    const cur = id ? (d.supplements || []).find((x) => x.id === id) : null;
    const nextRound = Math.max(1, ...(d.supplements || []).filter((x) => !x.deletedAt).map((x) => x.round || 1)) + 1;
    const vals = cur ? cur : Object.assign({ round: nextRound, date: today() }, prefill || {});
    openModal({
      title: (cur ? 'Sửa' : 'Thêm') + ' khai bổ sung — tờ khai ' + d.no,
      fields: [
        { id: 'no', label: 'Số tờ khai bổ sung', col: 4, help: 'Để trống nếu bổ sung trên chính tờ khai gốc' },
        { id: 'date', label: 'Ngày khai bổ sung', type: 'date', col: 4 },
        { id: 'round', label: 'Lần khai', type: 'num', col: 4 },
        { id: 'reason', label: 'Lý do / nội dung bổ sung', col: 12 },
        { id: 'qtyBdmt', label: 'KL (BDMT) sau bổ sung', type: 'num', col: 4 },
        {
          id: 'taxVnd',
          label: 'Thuế xuất khẩu phải nộp sau bổ sung (VNĐ)',
          type: 'num',
          col: 8,
          help: 'Tổng thuế của tờ khai sau khi bổ sung (không phải số chênh lệch). Số phải nộp của tờ khai lấy theo lần bổ sung mới nhất.',
        },
        { id: 'note', label: 'Ghi chú', type: 'textarea', col: 12 },
      ],
      values: vals,
      async onSave(v) {
        await commit((next) => {
          const dd = next.customs.find((x) => x.id === declId),
            s = CM().newSupp(Object.assign({}, cur || {}, v, { id: cur ? cur.id : undefined }));
          const at = (dd.supplements || []).findIndex((x) => x.id === s.id);
          if (at >= 0) dd.supplements[at] = s;
          else (dd.supplements = dd.supplements || []).push(s);
          dd.revision = (dd.revision || 0) + 1;
        });
        draw();
        toast('Đã lưu khai bổ sung.', 'success');
      },
    });
  }
  function openPay(declId, id, prefill) {
    const d = customsList().find((x) => x.id === declId);
    if (!d) return;
    const cur = id ? (d.payments || []).find((x) => x.id === id) : null;
    openModal({
      title: (cur ? 'Sửa' : 'Thêm') + ' giấy nộp tiền — tờ khai ' + d.no,
      fields: [
        { id: 'receiptNo', label: 'Số giấy nộp tiền', col: 3, help: 'Vd 6753554 hoặc DN0206/26' },
        { id: 'formCode', label: 'Mã hiệu', col: 3, help: 'Vd 262021301A' },
        { id: 'refNo', label: 'Số tham chiếu', col: 6 },
        { id: 'date', label: 'Ngày nộp', type: 'date', col: 3 },
        { id: 'periodDate', label: 'Kỳ thuế / ngày quyết định', type: 'date', col: 3 },
        {
          id: 'kind',
          label: 'Loại khoản nộp',
          type: 'select',
          options: Object.keys(CM().PAY_KIND).map((k) => [k, CM().PAY_KIND[k]]),
          col: 3,
        },
        { id: 'amount', label: 'Số tiền VND', type: 'num', col: 3 },
        { id: 'content', label: 'Nội dung khoản nộp', col: 6 },
        { id: 'chapter', label: 'Mã chương', col: 2 },
        { id: 'ndkt', label: 'Mã NDKT / tiểu mục', col: 2 },
        { id: 'dbhc', label: 'Mã ĐBHC', col: 2 },
        { id: 'payer', label: 'Người nộp thuế', col: 12 },
        { id: 'note', label: 'Ghi chú', type: 'textarea', col: 12 },
      ],
      values: cur || Object.assign({ date: today(), kind: 'tax', content: 'Thuế xuất khẩu' }, prefill || {}),
      async onSave(v) {
        await commit((next) => {
          const dd = next.customs.find((x) => x.id === declId),
            p = CM().newPay(Object.assign({}, cur || {}, v, { id: cur ? cur.id : undefined }));
          const dup = CM().findSamePayment(dd.payments, p, p.id);
          if (
            dup &&
            !confirm(
              'Đã có khoản nộp giống hệt (giấy ' +
                (dup.receiptNo || dup.refNo || '?') +
                ', ' +
                money(dup.amount) +
                ' đ, cùng loại và mã NDKT/kỳ thuế). Có thể là nhập trùng.\n\nBấm OK nếu đây là khoản nộp KHÁC và vẫn muốn thêm; Hủy để bỏ.'
            )
          )
            throw Error('Đã hủy — khoản nộp trùng.');
          const at = (dd.payments || []).findIndex((x) => x.id === p.id);
          if (at >= 0) dd.payments[at] = p;
          else (dd.payments = dd.payments || []).push(p);
          dd.revision = (dd.revision || 0) + 1;
        });
        draw();
        toast('Đã lưu giấy nộp tiền.', 'success');
      },
    });
  }
  async function removeChild(declId, kind, id) {
    try {
      await commit((next) => {
        const d = next.customs.find((x) => x.id === declId),
          list = d && d[kind === 'supp' ? 'supplements' : 'payments'];
        const x = list && list.find((y) => y.id === id);
        if (!x) throw Error('Không tìm thấy dòng.');
        x.deletedAt = new Date().toISOString();
        d.revision = (d.revision || 0) + 1;
      });
      draw();
      toast('Đã xóa dòng.', 'info');
    } catch (e) {
      toast(e.message || String(e), 'error');
    }
  }

  /** Tờ khai khác cùng số vận đơn nhưng số nhỏ hơn → có thể tờ khai này là khai bổ sung của nó. */
  function parentCandidate(d) {
    if (!d || !d.bill || d.deletedAt || CM().active(d.supplements).length) return null;
    return (
      decls()
        .filter((x) => x.id !== d.id && x.bill === d.bill && x.no < d.no)
        .sort((a, b) => a.no.localeCompare(b.no))[0] || null
    );
  }
  /** Chuyển tờ khai thành khai bổ sung (bảng con) của tờ khai gốc; giấy nộp tiền đã gắn chuyển sang tờ khai gốc, tờ khai độc lập bị xóa (khôi phục được). */
  async function convertToSupp(id) {
    const child = customsList().find((x) => x.id === id),
      parent = parentCandidate(child);
    if (!child || !parent) return;
    try {
      await commit((next) => {
        const p = next.customs.find((x) => x.id === parent.id),
          c = next.customs.find((x) => x.id === id);
        const round =
          Math.max(
            1,
            ...CM()
              .active(p.supplements)
              .map((x) => x.round || 1)
          ) + 1;
        (p.supplements = p.supplements || []).push(
          CM().newSupp({
            no: c.no,
            date: c.changedAt || c.openDate || today(),
            round,
            reason: 'Khai bổ sung theo tờ khai ' + c.no,
            taxVnd: c.taxVnd,
            qtyBdmt: c.qtyBdmt,
          })
        );
        CM()
          .active(c.payments)
          .forEach((x) => p.payments.push(x));
        c.payments = [];
        c.deletedAt = new Date().toISOString();
        delete c.detailId;
        c.revision = (c.revision || 0) + 1;
        p.revision = (p.revision || 0) + 1;
      });
      st.sel = parent.id;
      draw();
      core().render();
      toast('Tờ khai ' + child.no + ' đã chuyển thành khai bổ sung của tờ khai ' + parent.no + '.', 'success');
    } catch (e) {
      toast(e.message || String(e), 'error');
    }
  }

  /** 4 ô cho bảng "Bảng chi tiết hợp đồng": ngày mở tờ khai · lần khai · thuế XK phải nộp · trạng thái. */
  function detailCells(c, d) {
    const x = customsList().find((k) => !k.deletedAt && k.detailId === d.id);
    if (!x) return '<td class="muted">—</td><td class="num muted">—</td><td class="num muted">—</td><td class="muted">—</td>';
    const t = CM().totals(x);
    return (
      '<td>' +
      esc(vnDate(x.openDate)) +
      '</td><td class="num">' +
      esc(x.round || 1) +
      '</td><td class="num">' +
      esc(money(t.payable)) +
      '</td><td>' +
      statusBadge(x.status) +
      '</td>'
    );
  }
  const SKELETON =
    '<div class="d-flex flex-wrap gap-2 mb-2"><button class="btn btn-primary" type="button" data-cs="add">＋ Thêm tờ khai</button>' +
    '<label class="btn btn-outline-secondary mb-0" title="File .xls/.xlsx &quot;Bản xác nhận nội dung tờ khai&quot; (chọn được nhiều file)">⬆ Nhập tờ khai từ file<input type="file" id="csImport" accept=".xls,.xlsx,.xlsm" multiple hidden></label>' +
    '<label class="btn btn-outline-primary mb-0" title="Bản in tờ khai (PDF hoặc ảnh chụp) — đọc bằng Windows OCR">🔎 Đọc tờ khai bằng OCR<input type="file" id="csOcrDecl" accept=".pdf,.jpg,.jpeg,.png,.bmp" hidden></label>' +
    '<label class="btn btn-outline-primary mb-0" title="Giấy nộp tiền vào ngân sách nhà nước (PDF hoặc ảnh chụp) — đọc bằng Windows OCR">🧾 Đọc giấy nộp tiền (OCR)<input type="file" id="csOcrPay" accept=".pdf,.jpg,.jpeg,.png,.bmp" hidden></label></div>' +
    '<div id="csSmart"></div><div class="mb-2"><label class="form-check mb-0 d-inline-block"><input class="form-check-input" type="checkbox" id="csDeleted"> Xem tờ khai đã xóa</label></div>' +
    '<div id="csCards" class="row g-2 mb-2"></div><div class="tbl-wrap"><table class="table table-hover align-middle mb-0"><thead><tr><th>Số tờ khai</th><th>Ngày mở</th><th class="num">Lần</th><th>Loại hình</th><th>Hợp đồng</th><th>Tàu</th><th>Trạng thái</th><th class="num">Thuế XK phải nộp</th><th class="num">Đã nộp</th><th class="num">Còn phải nộp</th><th></th></tr></thead><tbody id="csBody"></tbody></table></div>' +
    '<div class="text-center muted py-4 d-none" id="csEmpty"></div><div id="csDetail" class="mt-3"></div>' +
    '<div class="form-text mt-2">Tờ khai là bảng cha; <b>khai bổ sung</b> và <b>giấy nộp tiền</b> là bảng con của tờ khai. Trạng thái: Đã mở tờ khai → Chờ thông quan → Đã thông quan. Khi <b>mọi tờ khai</b> của một hợp đồng đã thông quan, hợp đồng tự chuyển từ <b>Đang thực hiện</b> sang <b>Đã hoàn thành</b>. Chi tiết đã có <b>chứng thư</b> hoặc <b>phiếu cân</b> (trong Lưu trữ) cũng cần có tờ khai thông quan. Số liệu nằm trong <b>Sao lưu toàn bộ</b>.</div>';
  const csView = () =>
    smartView(
      'cs',
      '#csSmart',
      declSmartCfg(
        'customs',
        () => decls(st.showDeleted).map(declFlat),
        () => draw()
      )
    );
  function filtered() {
    const v = csView();
    return (v ? applyDeclFilter(v, decls(st.showDeleted)) : decls(st.showDeleted)).sort(byOpenDesc);
  }
  function draw() {
    const host = $('#customsRoot');
    if (!host) return;
    if (!host.dataset.built) {
      host.innerHTML = SKELETON;
      host.dataset.built = '1';
      bind(host);
    }
    const list = filtered(),
      s = sums(list);
    $('#csCards').innerHTML =
      card('Tờ khai', list.length, s.opened + ' đã mở · ' + s.waiting + ' chờ thông quan · ' + s.cleared + ' đã thông quan') +
      card('Thuế XK phải nộp', money(s.payable) + ' đ') +
      card('Đã nộp thuế', money(s.paid) + ' đ', 'Lệ phí đã nộp: ' + money(s.fee) + ' đ') +
      card('Còn phải nộp', '<span class="' + (s.remaining > 0 ? 'text-danger' : 'text-success') + '">' + money(s.remaining) + ' đ</span>');
    if (!list.some((d) => d.id === st.sel)) st.sel = list[0] ? list[0].id : '';
    $('#csBody').innerHTML = list
      .map((d) => {
        const t = CM().totals(d),
          c = contractOf(d.contractId);
        return (
          '<tr data-cs-sel="' +
          esc(d.id) +
          '" class="' +
          (st.sel === d.id ? 'table-active' : '') +
          (d.deletedAt ? ' opacity-50' : '') +
          '" style="cursor:pointer"><td class="mono fw-semibold">' +
          esc(d.no) +
          '</td><td>' +
          esc(vnDate(d.openDate)) +
          '</td><td class="num">' +
          esc(d.round || 1) +
          '</td><td>' +
          esc(d.type || '') +
          '</td><td>' +
          esc(c ? c.no || '' : '') +
          '</td><td>' +
          esc(d.ship || '') +
          '</td>' +
          '<td>' +
          (d.deletedAt
            ? '<span class="badge text-bg-dark">Đã xóa</span>'
            : '<select class="form-select form-select-sm" style="min-width:10.5rem" data-cs-status="' +
              esc(d.id) +
              '" aria-label="Trạng thái tờ khai">' +
              statusOpts()
                .map((o) => '<option value="' + o[0] + '"' + (o[0] === d.status ? ' selected' : '') + '>' + o[1] + '</option>')
                .join('') +
              '</select>') +
          '</td>' +
          '<td class="num">' +
          esc(money(t.payable)) +
          '</td><td class="num">' +
          esc(money(t.paidTax)) +
          '</td><td class="num ' +
          (t.remaining > 0 ? 'text-danger' : '') +
          '">' +
          esc(money(t.remaining)) +
          '</td>' +
          '<td class="text-end text-nowrap"><div class="btn-group btn-group-sm">' +
          (d.deletedAt
            ? '<button class="btn btn-outline-primary" data-cs-restore="' + esc(d.id) + '" type="button">Khôi phục</button>'
            : '<button class="btn btn-outline-primary" data-cs-edit="' +
              esc(d.id) +
              '" type="button">Sửa</button><button class="btn btn-outline-danger" data-cs-del="' +
              esc(d.id) +
              '" type="button" aria-label="Xóa tờ khai">🗑</button>') +
          '</div></td></tr>'
        );
      })
      .join('');
    $('#csEmpty').innerHTML = decls().length
      ? 'Không có tờ khai khớp bộ lọc.'
      : 'Chưa có tờ khai hải quan. Bấm <b>＋ Thêm tờ khai</b>, <b>⬆ Nhập tờ khai từ file</b> (file .xls "Bản xác nhận nội dung tờ khai") hoặc <b>🔎 Đọc tờ khai bằng OCR</b>.';
    $('#csEmpty').classList.toggle('d-none', list.length > 0);
    drawDetail();
  }
  function drawDetail() {
    const box = $('#csDetail'),
      d = customsList().find((x) => x.id === st.sel);
    if (!box) return;
    if (!d) {
      box.innerHTML = '';
      return;
    }
    const t = CM().totals(d),
      c = contractOf(d.contractId),
      det = detailOf(c, d.detailId),
      off = !!d.deletedAt;
    const info = (l, v) =>
      v === '' || v == null ? '' : '<div class="col-6 col-md-3"><div class="small muted">' + l + '</div><div>' + esc(v) + '</div></div>';
    const flow = CM()
      .STATUS_ORDER.map((k) => {
        const at = CM().statusDate(d, k);
        return (
          '<span class="me-3 ' +
          (d.status === k ? 'fw-bold' : at ? '' : 'muted') +
          '">' +
          (at || d.status === k ? '●' : '○') +
          ' ' +
          CM().STATUS[k] +
          (at ? ' (' + esc(vnDate(at)) + ')' : '') +
          '</span>'
        );
      })
      .join('');
    const supp = (d.supplements || []).filter((x) => !x.deletedAt).sort((a, b) => (a.round || 0) - (b.round || 0)),
      pays = (d.payments || []).filter((x) => !x.deletedAt);
    box.innerHTML =
      '<div class="border rounded p-3"><div class="d-flex flex-wrap gap-2 align-items-center mb-2"><h6 class="mb-0">Tờ khai ' +
      esc(d.no) +
      '</h6>' +
      statusBadge(d.status) +
      (c ? contractBadge(c.id) : '') +
      '<div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Đổi trạng thái">' +
      statusOpts()
        .map(
          (o) =>
            '<button type="button" class="btn ' +
            (d.status === o[0] ? 'btn-primary' : 'btn-outline-primary') +
            '" data-cs-set="' +
            o[0] +
            '"' +
            (off ? ' disabled' : '') +
            '>' +
            o[1] +
            '</button>'
        )
        .join('') +
      '</div></div>' +
      (parentCandidate(d)
        ? '<div class="alert alert-info py-2 small d-flex flex-wrap align-items-center gap-2">Tờ khai này cùng số vận đơn với tờ khai <b>' +
          esc(parentCandidate(d).no) +
          '</b> — có thể là <b>khai bổ sung</b> của tờ khai đó.<button type="button" class="btn btn-sm btn-outline-primary ms-auto" data-cs="to-supp">Chuyển thành khai bổ sung của ' +
          esc(parentCandidate(d).no) +
          '</button></div>'
        : '') +
      '<div class="small mb-2">' +
      flow +
      '</div><div class="row g-2 mb-3">' +
      info('Hợp đồng', c ? contractLabel(c) : '') +
      info('Chi tiết hợp đồng', det ? [det.ship, det.product].filter(Boolean).join(' · ') : '') +
      info('Tàu / chuyến', d.ship) +
      info('Hàng hóa', d.goods) +
      info('KL (BDMT)', d.qtyBdmt != null ? money(d.qtyBdmt) : '') +
      info('Trị giá hóa đơn (USD)', d.invoiceUsd != null ? money(d.invoiceUsd) : '') +
      info('Tỷ giá', d.exchangeRate != null ? money(d.exchangeRate) : '') +
      info('Thuế suất', d.taxRate != null ? d.taxRate + '%' : '') +
      info('Số chứng thư', d.certNo) +
      info('Người nhập khẩu', d.importer) +
      info('Số vận đơn', d.bill) +
      info('Ghi chú', d.note) +
      '</div>' +
      '<div class="d-flex flex-wrap gap-2 align-items-center mb-1"><h6 class="mb-0">Khai bổ sung</h6><span class="small muted">(bảng con)</span><span class="ms-auto d-flex gap-2"><label class="btn btn-sm btn-outline-secondary mb-0">⬆ Nhập khai bổ sung từ file<input type="file" id="csImportSupp" accept=".xls,.xlsx,.xlsm" hidden' +
      (off ? ' disabled' : '') +
      '></label><button class="btn btn-sm btn-primary" type="button" data-cs="supp-add"' +
      (off ? ' disabled' : '') +
      '>＋ Thêm khai bổ sung</button></span></div>' +
      '<div class="tbl-wrap mb-3"><table class="table table-sm align-middle"><thead><tr><th>Số tờ khai bổ sung</th><th>Ngày</th><th class="num">Lần</th><th>Lý do</th><th class="num">KL (BDMT)</th><th class="num">Thuế XK sau bổ sung</th><th class="num">Chênh lệch</th><th></th></tr></thead><tbody>' +
      (supp.length
        ? supp
            .map(
              (x) =>
                '<tr><td class="mono">' +
                esc(x.no || '(trên tờ khai gốc)') +
                '</td><td>' +
                esc(vnDate(x.date)) +
                '</td><td class="num">' +
                esc(x.round) +
                '</td><td>' +
                esc(x.reason) +
                '</td><td class="num">' +
                esc(money(x.qtyBdmt)) +
                '</td><td class="num">' +
                esc(money(x.taxVnd)) +
                '</td><td class="num">' +
                (x.taxVnd != null && d.taxVnd != null ? esc((x.taxVnd - d.taxVnd > 0 ? '+' : '') + money(x.taxVnd - d.taxVnd)) : '') +
                '</td><td class="text-end text-nowrap"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" data-cs-child="supp" data-id="' +
                esc(x.id) +
                '" data-act="edit" type="button"' +
                (off ? ' disabled' : '') +
                '>Sửa</button><button class="btn btn-outline-danger" data-cs-child="supp" data-id="' +
                esc(x.id) +
                '" data-act="del" type="button" aria-label="Xóa"' +
                (off ? ' disabled' : '') +
                '>🗑</button></div></td></tr>'
            )
            .join('')
        : '<tr><td colspan="8" class="muted">Chưa có khai bổ sung.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="d-flex flex-wrap gap-2 align-items-center mb-1"><h6 class="mb-0">Giấy nộp tiền</h6><span class="small muted">(bảng con)</span><span class="ms-auto d-flex gap-2">' +
      (t.over > 0
        ? '<button class="btn btn-sm btn-warning" type="button" data-cs="refund-add" title="Ghi nhận khoản NSNN hoàn lại để tất toán phần nộp thừa"' +
          (off ? ' disabled' : '') +
          '>↩ Nhập hoàn thuế (' +
          esc(money(t.over)) +
          ')</button>'
        : '') +
      '<button class="btn btn-sm btn-primary" type="button" data-cs="pay-add"' +
      (off ? ' disabled' : '') +
      '>＋ Thêm giấy nộp tiền</button></span></div>' +
      (t.over > 0
        ? '<div class="alert alert-warning py-1 px-2 small mb-1">⚠ Nộp thừa <b>' +
          esc(money(t.over)) +
          ' đ</b> — cần làm thủ tục hoàn thuế. Khi nhận được tiền hoàn, bấm “Nhập hoàn thuế” để tất toán.</div>'
        : '') +
      '<div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th>Số giấy nộp tiền</th><th>Mã hiệu</th><th>Số tham chiếu</th><th>Ngày nộp</th><th>Kỳ thuế</th><th>Loại</th><th>Nội dung</th><th>Chương</th><th>NDKT</th><th class="num">Số tiền</th><th></th></tr></thead><tbody>' +
      (pays.length
        ? pays
            .map(
              (x) =>
                '<tr><td class="mono">' +
                esc(x.receiptNo) +
                '</td><td class="mono">' +
                esc(x.formCode) +
                '</td><td class="mono small">' +
                esc(x.refNo) +
                '</td><td>' +
                esc(vnDate(x.date)) +
                '</td><td>' +
                esc(vnDate(x.periodDate)) +
                '</td><td>' +
                esc(CM().PAY_KIND[x.kind] || '') +
                '</td><td>' +
                esc(x.content) +
                '</td><td>' +
                esc(x.chapter) +
                '</td><td>' +
                esc(x.ndkt) +
                '</td><td class="num">' +
                esc(money(x.amount)) +
                '</td><td class="text-end text-nowrap"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" data-cs-child="pay" data-id="' +
                esc(x.id) +
                '" data-act="edit" type="button"' +
                (off ? ' disabled' : '') +
                '>Sửa</button><button class="btn btn-outline-danger" data-cs-child="pay" data-id="' +
                esc(x.id) +
                '" data-act="del" type="button" aria-label="Xóa"' +
                (off ? ' disabled' : '') +
                '>🗑</button></div></td></tr>'
            )
            .join('')
        : '<tr><td colspan="11" class="muted">Chưa có giấy nộp tiền.</td></tr>') +
      '</tbody>' +
      '<tfoot><tr><th colspan="8">Thuế XK phải nộp ' +
      esc(money(t.payable)) +
      ' đ · đã nộp thuế ' +
      esc(money(t.paidTax)) +
      (t.refunded > 0 ? ' đ (đã trừ hoàn ' + esc(money(t.refunded)) + ')' : '') +
      ' đ · lệ phí đã nộp ' +
      esc(money(t.paidFee)) +
      ' đ</th><th colspan="2" class="num ' +
      (t.remaining > 0 ? 'text-danger' : 'text-success') +
      '">Còn ' +
      esc(money(t.remaining)) +
      '</th><th></th></tr></tfoot></table></div></div>';
  }
  function bind(host) {
    host.addEventListener('click', (e) => {
      const t = e.target;
      const act = t.closest('[data-cs]');
      if (act) {
        const a = act.dataset.cs;
        if (a === 'add') openDecl(null);
        else if (a === 'supp-add') openSupp(st.sel);
        else if (a === 'pay-add') openPay(st.sel);
        else if (a === 'refund-add')
          openPay(st.sel, null, {
            kind: 'refund',
            content: 'Hoàn thuế nộp thừa',
            amount: CM().totals(customsList().find((x) => x.id === st.sel) || {}).over || null,
          });
        else if (a === 'to-supp') HAK.UI.confirmClick(act, () => convertToSupp(st.sel), 'Chuyển?');
        return;
      }
      const ed = t.closest('[data-cs-edit]');
      if (ed) {
        openDecl(ed.dataset.csEdit);
        return;
      }
      const del = t.closest('[data-cs-del]');
      if (del) {
        HAK.UI.confirmClick(del, () => removeDecl(del.dataset.csDel), 'Xóa?');
        return;
      }
      const rs = t.closest('[data-cs-restore]');
      if (rs) {
        removeDecl(rs.dataset.csRestore, true);
        return;
      }
      const set = t.closest('[data-cs-set]');
      if (set) {
        setStatus(st.sel, set.dataset.csSet);
        return;
      }
      const ch = t.closest('[data-cs-child]');
      if (ch) {
        const kind = ch.dataset.csChild,
          id = ch.dataset.id;
        if (ch.dataset.act === 'edit') (kind === 'supp' ? openSupp : openPay)(st.sel, id);
        else HAK.UI.confirmClick(ch, () => removeChild(st.sel, kind, id), 'Xóa?');
        return;
      }
      if (t.closest('select, button, input, label, a')) return;
      const row = t.closest('[data-cs-sel]');
      if (row) {
        st.sel = row.dataset.csSel;
        draw();
      }
    });
    host.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'csImport') {
        const f = Array.from(t.files);
        t.value = '';
        importFiles(f).catch((x) => toast(x.message || String(x), 'error'));
      } else if (t.id === 'csOcrDecl') {
        const f = Array.from(t.files);
        t.value = '';
        ocrDecl(f);
      } else if (t.id === 'csOcrPay') {
        const f = Array.from(t.files);
        t.value = '';
        ocrReceipt(f);
      } else if (t.id === 'csImportSupp') {
        const f = Array.from(t.files);
        t.value = '';
        importSupp(st.sel, f);
      } else if (t.dataset && t.dataset.csStatus) setStatus(t.dataset.csStatus, t.value);
      else if (t.id === 'csDeleted') {
        st.showDeleted = t.checked;
        draw();
      }
    });
  }

  // Nhập Excel / OCR và duyệt giấy nộp tiền nằm ở customs-import.js / customs-receipt.js (nạp sau file này, gọi khi người dùng bấm nút)
  const importFiles = (...a) => HAK.CustomsImport.importFiles(...a),
    importSupp = (...a) => HAK.CustomsImport.importSupp(...a),
    ocrDecl = (...a) => HAK.CustomsImport.ocrDecl(...a),
    ocrReceipt = (...a) => HAK.CustomsImport.ocrReceipt(...a);
  /* ---------------- Móc vào biểu mẫu "Đợt thực hiện" của hợp đồng ---------------- */
  /** Ô chọn tờ khai + thông tin tờ khai (ngày mở, lần khai, thuế XK phải nộp) trong form chi tiết hợp đồng. */
  function execPicker(c, d) {
    const cur = customsList().find((x) => !x.deletedAt && x.detailId === d.id);
    const opts = decls().filter((x) => x.contractId === c.id || !x.contractId || (cur && x.id === cur.id));
    return (
      '<div class="col-md-6"><label class="form-label" for="cf-customsId">Tờ khai hải quan (từ tab 🛃 Tờ khai hải quan)</label><select class="form-select" id="cf-customsId"><option value="">— Chưa gắn tờ khai —</option>' +
      opts
        .map(
          (x) =>
            '<option value="' +
            esc(x.id) +
            '"' +
            (cur && cur.id === x.id ? ' selected' : '') +
            '>' +
            esc(x.no + ' · ' + (vnDate(x.openDate) || '?') + ' · lần ' + (x.round || 1) + ' · ' + CM().STATUS[x.status]) +
            '</option>'
        )
        .join('') +
      '</select>' +
      '<div class="form-text">Chọn tờ khai thì ô <b>Số TKHQ</b> tự lấy theo tờ khai. Chưa có tờ khai? Thêm ở tab Tờ khai hải quan.</div></div><div class="col-md-6" id="cf-customsInfo"></div>'
    );
  }
  function execInfo() {
    const id = ($('#cf-customsId') || {}).value,
      box = $('#cf-customsInfo');
    if (!box) return;
    const x = id ? customsList().find((k) => k.id === id) : null;
    const tk0 = $('#cf-tkhq');
    if (tk0) tk0.readOnly = !!x;
    if (!x) {
      box.innerHTML =
        '<div class="small muted pt-4">Chưa gắn tờ khai: ngày mở, lần khai và thuế xuất khẩu sẽ hiện ở đây. Gõ số tờ khai ở ô <b>Số tờ khai HQ</b> nếu muốn tạo tờ khai mới (app sẽ hỏi khi lưu).</div>';
      return;
    }
    const t = CM().totals(x);
    box.innerHTML =
      '<div class="border rounded p-2 small"><b>Ngày mở tờ khai:</b> ' +
      esc(vnDate(x.openDate) || '—') +
      ' · <b>Lần khai:</b> ' +
      esc(x.round || 1) +
      ' · ' +
      statusBadge(x.status) +
      '<br><b>Thuế xuất khẩu phải nộp:</b> ' +
      esc(money(t.payable) || '—') +
      ' đ · đã nộp ' +
      esc(money(t.paidTax)) +
      ' đ · còn ' +
      esc(money(t.remaining) || '—') +
      ' đ</div>';
    const tk = $('#cf-tkhq');
    if (tk) {
      tk.value = x.no;
      tk.readOnly = true;
      tk.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  const findByNo = (no) => customsList().find((x) => !x.deletedAt && x.no === CM().digits(no)) || null;
  function bindExec() {
    const s = $('#cf-customsId');
    if (s) {
      s.onchange = execInfo;
      execInfo();
    }
  }
  /** Sau khi lưu chi tiết hợp đồng: gắn (hoặc gỡ) tờ khai cho đợt đó. */
  async function link(l) {
    if (!l) return;
    const had = customsList().find((x) => x.detailId === l.detail);
    if (!l.customs && l.newNo) {
      await commit((next) => {
        next.customs = next.customs || [];
        const c = (next.contracts || []).find((x) => x.id === l.contract),
          d = detailOf(c, l.detail);
        next.customs.forEach((x) => {
          if (x.detailId === l.detail && x.no !== l.newNo) {
            delete x.detailId;
            x.revision = (x.revision || 0) + 1;
          }
        });
        let rec = next.customs.find((x) => !x.deletedAt && x.no === l.newNo);
        if (!rec) {
          rec = CM().newDecl({
            no: l.newNo,
            status: 'opened',
            ship: d ? d.ship || '' : '',
            certNo: d ? d.certNo || '' : '',
            note: 'Tạo từ chi tiết hợp đồng',
            source: 'detail',
          });
          next.customs.push(rec);
        }
        rec.contractId = l.contract;
        rec.detailId = l.detail;
        rec.revision = (rec.revision || 0) + 1;
        const err = CM().validate(rec, next);
        if (err) throw Error(err);
        syncDetail(next, rec);
      });
      draw();
      return;
    }
    if (!l.customs && !had) return;
    await commit((next) => {
      (next.customs || []).forEach((x) => {
        if (x.detailId === l.detail && x.id !== l.customs) {
          delete x.detailId;
          x.revision = (x.revision || 0) + 1;
        }
      });
      const rec = l.customs && next.customs.find((x) => x.id === l.customs);
      if (rec) {
        rec.contractId = l.contract;
        rec.detailId = l.detail;
        rec.revision = (rec.revision || 0) + 1;
        syncDetail(next, rec);
      }
    });
    draw();
  }

  function initReport() {
    const b = $('#repCsXls');
    if (b && !b.dataset.bound) {
      b.dataset.bound = '1';
      b.addEventListener('click', () => exportReport().catch((e) => toast(e.message || String(e), 'error')));
    }
    const c2 = $('#repCtXls');
    if (c2 && !c2.dataset.bound) {
      c2.dataset.bound = '1';
      c2.addEventListener('click', () => exportContractReport().catch((e) => toast(e.message || String(e), 'error')));
    }
    [
      ['#repCtPdf', 'ct'],
      ['#repCsPdf', 'cs'],
    ].forEach(([sel, which]) => {
      const b3 = $(sel);
      if (b3 && !b3.dataset.bound) {
        b3.dataset.bound = '1';
        b3.addEventListener('click', () => pdfReport(which).catch((e) => toast(e.message || String(e), 'error')));
      }
    });
    root.addEventListener('hak:catalog', () => {
      drawReport();
      drawContractReport();
    });
    root.addEventListener('hak:tripdetails', () => {
      drawReport();
      drawContractReport();
      const r = $('#customsRoot');
      if (r && r.offsetParent !== null) render();
    });
  }

  function render() {
    draw();
    const v = csView();
    if (v) v.refresh();
  }
  /** Gắn đợt giao hàng cần một chi tiết (tàu) của hợp đồng: Xuất bán / Trao đổi chưa có thì tự tạo chi tiết trống. Trả về mã chi tiết. */
  async function ensureDetail(contractId) {
    let id = '';
    await commit((next) => {
      const c = (next.contracts || []).find((x) => x.id === contractId);
      if (!c) throw Error('Không tìm thấy hợp đồng.');
      const rd = CM().readiness(c, next.customs || []);
      if (rd.need && !rd.ok)
        throw Error('Hợp đồng ' + (c.no || '') + ' cần nhập ' + rd.missing.join(' và ') + ' trước khi gắn đợt giao hàng.');
      if (rd.detailId) {
        id = rd.detailId;
        return;
      }
      const d = HAK.ContractModel.child(c.id, {});
      (c.details = c.details || []).push(d);
      c.revision = (c.revision || 0) + 1;
      id = d.id;
    });
    return id;
  }
  const activeDecls = () => decls();
  // Phần lõi dùng chung cho customs-import.js / customs-receipt.js (ghi dữ liệu qua commit, liên kết hợp đồng, màn hình)
  HAK.CustomsCore = { commit, openDecl, openSupp, upsertInto, suggestLink, draw, openModal, st };
  HAK.Customs = {
    ensureDetail,
    activeDecls,
    printReport,
    contractPdfSpec,
    customsPdfSpec,
    pdfReport,
    render,
    draw,
    contractBadge,
    detailCells,
    openModal,
    execPicker,
    bindExec,
    findByNo,
    link,
    drawReport,
    drawContractReport,
    exportContractReport,
    contractReportModel,
    initReport,
    exportReport,
    suggestLink,
    importFiles,
  };
})(window);
