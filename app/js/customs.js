/**
 * customs.js — tab "🛃 Tờ khai hải quan" trong Danh mục + báo cáo "Tình hình khai hải quan và nộp thuế" (v2.14.0).
 *  - Bảng cha: tờ khai hải quan. Bảng con: khai bổ sung, giấy nộp tiền. Trạng thái: Đã mở tờ khai → Chờ thông quan → Đã thông quan.
 *  - Nhập tờ khai từ file .xls/.xlsx (bản xác nhận nội dung tờ khai VNACCS) hoặc OCR bản in / ảnh; OCR giấy nộp tiền (mẫu C1-02/NS).
 *  - Dữ liệu nằm trong cùng snapshot Danh mục (data.customs) → đi theo Sao lưu, Lưu trữ năm, đồng bộ như hợp đồng.
 *  - Hợp đồng: Đang thực hiện → Đã hoàn thành khi mọi tờ khai của hợp đồng đã thông quan (contractBadge).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const CM = () => HAK.CustomsModel, CP = () => HAK.CustomsParser;
  const core = () => HAK.Catalog.core;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);
  const st = { sel: '', q: '', status: '', showDeleted: false, modal: null };
  const NF = () => HAK.NumFmt;
  const money = (n) => (n === null || n === undefined || n === '' || !isFinite(+n) ? '' : NF().txt(+n, 'num'));
  const vnDate = (iso) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const shipKey = (s) => fold(s).replace(/^m\s*\/?\s*v\.?\s*/, '').replace(/[^a-z0-9]/g, '');
  const data = () => core().get();
  const customsList = () => (data().customs || []);
  const decls = (all) => customsList().filter((d) => all || !d.deletedAt);
  const contracts = () => (data().contracts || []).filter((c) => !c.deletedAt);
  const contractOf = (id) => (data().contracts || []).find((c) => c.id === id) || null;
  const custName = (id) => { const c = core().customers().find((x) => x.id === id); return c ? c.name : ''; };
  const contractLabel = (c) => (c ? (c.no || c.id) + (custName(c.buyerId) ? ' · ' + custName(c.buyerId) : '') : '');
  const detailOf = (c, id) => (c && (c.details || []).find((d) => d.id === id)) || null;

  /* ---------------- Ghi dữ liệu ---------------- */
  /** fn nhận bản sao của dữ liệu Danh mục, sửa tại chỗ hoặc trả về dữ liệu mới. Lỗi → khôi phục và ném lại. */
  async function commit(fn) {
    const before = core().get(), base = CM().copy(before);
    try { const out = fn(base) || base; core().set(out); await core().persist(); core().changed(); }
    catch (e) { core().set(before); throw e; }
  }
  /** Gắn tờ khai với đợt thực hiện: 1 đợt ↔ 1 tờ khai; số TKHQ của đợt lấy theo tờ khai. */
  function syncDetail(next, rec) {
    (next.customs || []).forEach((x) => { if (x.id !== rec.id && rec.detailId && x.detailId === rec.detailId) delete x.detailId; });
    if (!rec.contractId || !rec.detailId) return;
    const c = (next.contracts || []).find((x) => x.id === rec.contractId), d = detailOf(c, rec.detailId);
    if (c && d && d.tkhq !== rec.no) { d.tkhq = rec.no; d.revision = (d.revision || 0) + 1; c.revision = (c.revision || 0) + 1; }
  }
  const upsertInto = (next, rec) => { const r = CM().upsert(next, rec); if (r.error) throw Error(r.error); syncDetail(r.data, r.rec); return r; };

  /* ---------------- Gợi ý hợp đồng / đợt thực hiện từ tờ khai ---------------- */
  function suggestLink(rec) {
    const key = shipKey(rec.ship);
    for (const c of contracts()) for (const d of (c.details || []).filter((x) => !x.deletedAt)) {
      if ((d.tkhq && CM().digits(d.tkhq) === rec.no) || (key && shipKey(d.ship) === key)) return { contractId: c.id, detailId: d.id };
    }
    return {};
  }

  /* ---------------- Biểu mẫu (hộp thoại dùng chung) ---------------- */
  const FIELD_COL = { text: 6, num: 4, date: 4, select: 6, textarea: 12 };
  function fieldHtml(f, v) {
    const id = 'cs-f-' + f.id, col = f.col || FIELD_COL[f.type || 'text'] || 6, lbl = '<label class="form-label" for="' + id + '">' + f.label + '</label>';
    const help = f.help ? '<div class="form-text">' + f.help + '</div>' : '';
    let ctl;
    if (f.type === 'select') ctl = '<select class="form-select" id="' + id + '">' + (f.options || []).map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v == null ? '' : v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    else if (f.type === 'textarea') ctl = '<textarea class="form-control" rows="2" id="' + id + '">' + esc(v == null ? '' : v) + '</textarea>';
    else if (f.type === 'num') ctl = '<input class="form-control" id="' + id + '" type="text" inputmode="decimal" data-numfmt="num" autocomplete="off" value="' + esc(v === null || v === undefined || v === '' ? '' : NF().txt(+v, 'num')) + '"' + (f.ro ? ' readonly' : '') + '>';
    else ctl = '<input class="form-control" id="' + id + '" type="' + (f.type === 'date' ? 'date' : 'text') + '" autocomplete="off" value="' + esc(v == null ? '' : v) + '"' + (f.ro ? ' readonly' : '') + '>';
    return '<div class="col-md-' + col + '">' + lbl + ctl + help + '</div>';
  }
  function readFields(fields) {
    const out = {};
    fields.forEach((f) => {
      const el = $('#cs-f-' + f.id); if (!el) return;
      const text = String(el.value || '').trim();
      if (f.type === 'num') { if (text === '') { out[f.id] = null; return; } const n = NF().parse(text, 'num'); if (n === null) throw Error('Ô "' + f.label.replace(/<[^>]+>/g, '') + '": "' + text + '" không phải là số'); out[f.id] = n; }
      else out[f.id] = text;
    });
    return out;
  }
  function ensureModal() {
    let m = $('#csModal'); if (m) return m;
    m = document.createElement('div'); m.className = 'modal fade'; m.id = 'csModal'; m.tabIndex = -1;
    m.innerHTML = '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="csTitle"></h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
      '<div class="modal-body"><div id="csNote"></div><div class="row g-2" id="csForm"></div></div>' +
      '<div class="modal-footer"><div class="me-auto text-danger small" id="csErr" role="alert"></div><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button><button type="button" class="btn btn-primary" id="csSave">Lưu</button></div></div></div>';
    document.body.append(m); NF().attach($('#csForm'));
    return m;
  }
  /** spec: {title, fields, values, notice(html), extraHtml, onOpen(), onSave(values) → Promise, saveLabel} */
  function openModal(spec) {
    const m = ensureModal(), vals = spec.values || {};
    $('#csTitle').textContent = spec.title; $('#csErr').textContent = ''; $('#csNote').innerHTML = spec.notice || '';
    $('#csForm').innerHTML = (spec.fields || []).map((f) => (f.section ? '<div class="col-12"><div class="sec-title mt-2 mb-0">' + f.section + '</div></div>' : fieldHtml(f, vals[f.id]))).join('') + (spec.extraHtml || '');
    const save = $('#csSave'); save.textContent = spec.saveLabel || 'Lưu'; save.disabled = false;
    save.onclick = async () => {
      save.disabled = true; $('#csErr').textContent = '';
      try { await spec.onSave(readFields((spec.fields || []).filter((f) => !f.section))); bootstrap.Modal.getOrCreateInstance(m).hide(); }
      catch (e) { $('#csErr').textContent = 'Chưa lưu: ' + (e.message || e); }
      finally { save.disabled = false; }
    };
    if (spec.onOpen) spec.onOpen();
    bootstrap.Modal.getOrCreateInstance(m).show();
  }

  /* ---------------- Tờ khai (bảng cha) ---------------- */
  const statusOpts = () => Object.keys(CM().STATUS).map((k) => [k, CM().STATUS[k]]);
  const contractOpts = () => [['', '— Chưa gắn hợp đồng —']].concat(contracts().map((c) => [c.id, contractLabel(c)]));
  const detailOpts = (cid) => [['', '— Chưa gắn đợt thực hiện —']].concat(((contractOf(cid) || {}).details || []).filter((d) => !d.deletedAt).map((d) => [d.id, [d.ship, d.tkhq && 'TKHQ ' + d.tkhq, d.product].filter(Boolean).join(' · ') || d.id]));
  function declFields() {
    return [
      { section: 'Tờ khai' },
      { id: 'no', label: 'Số tờ khai', type: 'text', col: 4, help: 'Dãy số, thường 12 chữ số' }, { id: 'openDate', label: 'Ngày mở tờ khai (ngày đăng ký)', type: 'date', col: 4 }, { id: 'round', label: 'Lần khai', type: 'num', col: 2, help: '1 = tờ khai gốc' }, { id: 'type', label: 'Loại hình', type: 'text', col: 2 },
      { id: 'status', label: 'Trạng thái', type: 'select', options: statusOpts(), col: 4 }, { id: 'statusAt', label: 'Ngày của trạng thái', type: 'date', col: 4 }, { id: 'office', label: 'Chi cục hải quan', type: 'text', col: 4 },
      { section: 'Hợp đồng và đợt thực hiện' },
      { id: 'contractId', label: 'Hợp đồng', type: 'select', options: contractOpts(), col: 6 }, { id: 'detailId', label: 'Đợt thực hiện (chứng thư)', type: 'select', options: [['', '—']], col: 6 },
      { section: 'Hàng hóa' },
      { id: 'ship', label: 'Tàu / chuyến', type: 'text', col: 6 }, { id: 'bill', label: 'Số vận đơn', type: 'text', col: 3 }, { id: 'certNo', label: 'Số chứng thư', type: 'text', col: 3 },
      { id: 'goods', label: 'Mô tả hàng hóa', type: 'text', col: 9 }, { id: 'hs', label: 'Mã HS', type: 'text', col: 3 },
      { id: 'qtyBdmt', label: 'KL (BDMT)', type: 'num', col: 3 }, { id: 'qtyTon', label: 'KL (tấn)', type: 'num', col: 3 }, { id: 'invoiceNo', label: 'Số hóa đơn', type: 'text', col: 3 }, { id: 'invoiceUsd', label: 'Trị giá hóa đơn (USD)', type: 'num', col: 3 },
      { section: 'Thuế xuất khẩu' },
      { id: 'exchangeRate', label: 'Tỷ giá tính thuế (VNĐ/USD)', type: 'num', col: 3 }, { id: 'taxableVnd', label: 'Trị giá tính thuế (VNĐ)', type: 'num', col: 3 }, { id: 'taxRate', label: 'Thuế suất (%)', type: 'num', col: 2 }, { id: 'taxVnd', label: 'Thuế xuất khẩu phải nộp (VNĐ)', type: 'num', col: 4, help: 'Nếu có khai bổ sung, số phải nộp lấy theo lần bổ sung mới nhất.' },
      { section: 'Các bên' },
      { id: 'exporter', label: 'Người xuất khẩu', type: 'text', col: 6 }, { id: 'importer', label: 'Người nhập khẩu', type: 'text', col: 6 },
      { id: 'note', label: 'Ghi chú', type: 'textarea', col: 12 }
    ];
  }
  function openDecl(id, prefill, opts) {
    opts = opts || {};
    const cur = id ? customsList().find((d) => d.id === id) : null;
    const base = cur ? Object.assign({}, cur) : Object.assign({ status: 'opened', round: 1 }, prefill || {});
    base.statusAt = cur ? CM().statusDate(cur, cur.status) || today() : today();
    const fields = declFields();
    const hl = prefill && !cur ? Object.keys(prefill).filter((k) => prefill[k] !== null && prefill[k] !== '' && prefill[k] !== undefined) : [];
    openModal({
      title: cur ? 'Sửa tờ khai ' + cur.no : 'Thêm tờ khai hải quan', fields, values: base,
      notice: (opts.warnings && opts.warnings.length ? '<div class="alert alert-warning py-2 small">' + opts.warnings.map((w) => '⚠ ' + esc(w)).join('<br>') + '</div>' : '') + (opts.ocrText ? '<details class="mb-2"><summary class="small">Xem chữ OCR</summary><pre class="small text-wrap">' + esc(opts.ocrText) + '</pre></details>' : '') + (hl.length ? '<div class="small text-success mb-1">Các ô tô vàng do ' + (opts.fromOcr ? 'OCR' : 'file') + ' điền — đối chiếu với bản gốc rồi mới Lưu.</div>' : ''),
      onOpen() {
        const cSel = $('#cs-f-contractId'), dSel = $('#cs-f-detailId');
        const fillDetails = (keep) => { dSel.innerHTML = detailOpts(cSel.value).map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === keep ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join(''); };
        cSel.value = base.contractId || ''; fillDetails(base.detailId || ''); cSel.onchange = () => fillDetails('');
        hl.forEach((k) => { const el = $('#cs-f-' + k); if (el) el.classList.add('ocr-filled'); });
      },
      async onSave(v) {
        const rec = Object.assign({}, cur || {}, prefill && !cur ? prefill : {}, v);
        delete rec.statusAt;
        if (cur) rec.statusLog = (cur.statusLog || []).slice(); else rec.statusLog = [];
        let saved;
        await commit((next) => {
          const r = upsertInto(next, Object.assign({}, rec, { id: cur ? cur.id : undefined, statusLog: rec.statusLog, supplements: cur ? cur.supplements : [], payments: cur ? cur.payments : [] }));
          const d = r.data.customs.find((x) => x.id === r.rec.id);
          const log = d.statusLog || (d.statusLog = []), last = log[log.length - 1];
          if (!last) log.push({ status: d.status, at: v.statusAt || today() }); else if (last.status !== d.status) log.push({ status: d.status, at: v.statusAt || today() }); else if (v.statusAt && last.at !== v.statusAt) last.at = v.statusAt;
          saved = d; return r.data;
        });
        st.sel = saved.id; draw(); toast('Đã lưu tờ khai ' + saved.no + '.', 'success'); notifyContract(saved);
      }
    });
  }
  const toast = (m, t) => HAK.UI.toast(m, t || 'info');
  function notifyContract(d) {
    if (!d || !d.contractId || d.status !== 'cleared') return;
    const s = CM().contractStatus(customsList(), d.contractId);
    if (s.code === 'done') toast('Hợp đồng ' + ((contractOf(d.contractId) || {}).no || '') + ' đã hoàn thành (mọi tờ khai đã thông quan).', 'success');
  }
  async function setStatus(id, status) {
    const d = customsList().find((x) => x.id === id); if (!d || d.status === status) return;
    try { await commit((next) => { CM().setStatus(next.customs.find((x) => x.id === id), status, today(), HAK.Auth && HAK.Auth.who ? HAK.Auth.who() : ''); }); draw(); core().render(); toast('Tờ khai ' + d.no + ': ' + CM().STATUS[status] + '.', 'success'); notifyContract(customsList().find((x) => x.id === id)); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }
  async function removeDecl(id, restore) {
    try { await commit((next) => { const d = next.customs.find((x) => x.id === id); if (!d) throw Error('Không tìm thấy tờ khai.'); if (restore) delete d.deletedAt; else { d.deletedAt = new Date().toISOString(); delete d.detailId; } d.revision = (d.revision || 0) + 1; }); draw(); core().render(); toast(restore ? 'Đã khôi phục tờ khai.' : 'Đã xóa tờ khai (có thể khôi phục ở "Xem tờ khai đã xóa").', 'info'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }

  /* ---------------- Khai bổ sung / giấy nộp tiền (bảng con) ---------------- */
  function openSupp(declId, id, prefill) {
    const d = customsList().find((x) => x.id === declId); if (!d) return;
    const cur = id ? (d.supplements || []).find((x) => x.id === id) : null;
    const nextRound = Math.max(1, ...(d.supplements || []).filter((x) => !x.deletedAt).map((x) => x.round || 1)) + 1;
    const vals = cur ? cur : Object.assign({ round: nextRound, date: today() }, prefill || {});
    openModal({
      title: (cur ? 'Sửa' : 'Thêm') + ' khai bổ sung — tờ khai ' + d.no,
      fields: [{ id: 'no', label: 'Số tờ khai bổ sung', col: 4, help: 'Để trống nếu bổ sung trên chính tờ khai gốc' }, { id: 'date', label: 'Ngày khai bổ sung', type: 'date', col: 4 }, { id: 'round', label: 'Lần khai', type: 'num', col: 4 },
        { id: 'reason', label: 'Lý do / nội dung bổ sung', col: 12 }, { id: 'qtyBdmt', label: 'KL (BDMT) sau bổ sung', type: 'num', col: 4 }, { id: 'taxVnd', label: 'Thuế xuất khẩu phải nộp sau bổ sung (VNĐ)', type: 'num', col: 8, help: 'Tổng thuế của tờ khai sau khi bổ sung (không phải số chênh lệch). Số phải nộp của tờ khai lấy theo lần bổ sung mới nhất.' }, { id: 'note', label: 'Ghi chú', type: 'textarea', col: 12 }],
      values: vals,
      async onSave(v) {
        await commit((next) => {
          const dd = next.customs.find((x) => x.id === declId), s = CM().newSupp(Object.assign({}, cur || {}, v, { id: cur ? cur.id : undefined }));
          const at = (dd.supplements || []).findIndex((x) => x.id === s.id); if (at >= 0) dd.supplements[at] = s; else (dd.supplements = dd.supplements || []).push(s);
          dd.revision = (dd.revision || 0) + 1;
        });
        draw(); toast('Đã lưu khai bổ sung.', 'success');
      }
    });
  }
  function openPay(declId, id, prefill) {
    const d = customsList().find((x) => x.id === declId); if (!d) return;
    const cur = id ? (d.payments || []).find((x) => x.id === id) : null;
    openModal({
      title: (cur ? 'Sửa' : 'Thêm') + ' giấy nộp tiền — tờ khai ' + d.no,
      fields: [{ id: 'receiptNo', label: 'Số giấy nộp tiền', col: 3, help: 'Vd 6753554 hoặc DN0206/26' }, { id: 'formCode', label: 'Mã hiệu', col: 3, help: 'Vd 262021301A' }, { id: 'refNo', label: 'Số tham chiếu', col: 6 },
        { id: 'date', label: 'Ngày nộp', type: 'date', col: 3 }, { id: 'periodDate', label: 'Kỳ thuế / ngày quyết định', type: 'date', col: 3 }, { id: 'kind', label: 'Loại khoản nộp', type: 'select', options: Object.keys(CM().PAY_KIND).map((k) => [k, CM().PAY_KIND[k]]), col: 3 }, { id: 'amount', label: 'Số tiền VND', type: 'num', col: 3 },
        { id: 'content', label: 'Nội dung khoản nộp', col: 6 }, { id: 'chapter', label: 'Mã chương', col: 2 }, { id: 'ndkt', label: 'Mã NDKT / tiểu mục', col: 2 }, { id: 'dbhc', label: 'Mã ĐBHC', col: 2 },
        { id: 'payer', label: 'Người nộp thuế', col: 12 }, { id: 'note', label: 'Ghi chú', type: 'textarea', col: 12 }],
      values: cur || Object.assign({ date: today(), kind: 'tax', content: 'Thuế xuất khẩu' }, prefill || {}),
      async onSave(v) {
        await commit((next) => {
          const dd = next.customs.find((x) => x.id === declId), p = CM().newPay(Object.assign({}, cur || {}, v, { id: cur ? cur.id : undefined }));
          const at = (dd.payments || []).findIndex((x) => x.id === p.id); if (at >= 0) dd.payments[at] = p; else (dd.payments = dd.payments || []).push(p);
          dd.revision = (dd.revision || 0) + 1;
        });
        draw(); toast('Đã lưu giấy nộp tiền.', 'success');
      }
    });
  }
  async function removeChild(declId, kind, id) {
    try { await commit((next) => { const d = next.customs.find((x) => x.id === declId), list = d && d[kind === 'supp' ? 'supplements' : 'payments']; const x = list && list.find((y) => y.id === id); if (!x) throw Error('Không tìm thấy dòng.'); x.deletedAt = new Date().toISOString(); d.revision = (d.revision || 0) + 1; }); draw(); toast('Đã xóa dòng.', 'info'); }
    catch (e) { toast(e.message || String(e), 'error'); }
  }

  /** Tờ khai khác cùng số vận đơn nhưng số nhỏ hơn → có thể tờ khai này là khai bổ sung của nó. */
  function parentCandidate(d) {
    if (!d || !d.bill || d.deletedAt || CM().active(d.supplements).length) return null;
    return decls().filter((x) => x.id !== d.id && x.bill === d.bill && x.no < d.no).sort((a, b) => a.no.localeCompare(b.no))[0] || null;
  }
  /** Chuyển tờ khai thành khai bổ sung (bảng con) của tờ khai gốc; giấy nộp tiền đã gắn chuyển sang tờ khai gốc, tờ khai độc lập bị xóa (khôi phục được). */
  async function convertToSupp(id) {
    const child = customsList().find((x) => x.id === id), parent = parentCandidate(child); if (!child || !parent) return;
    try {
      await commit((next) => {
        const p = next.customs.find((x) => x.id === parent.id), c = next.customs.find((x) => x.id === id);
        const round = Math.max(1, ...CM().active(p.supplements).map((x) => x.round || 1)) + 1;
        (p.supplements = p.supplements || []).push(CM().newSupp({ no: c.no, date: c.changedAt || c.openDate || today(), round, reason: 'Khai bổ sung theo tờ khai ' + c.no, taxVnd: c.taxVnd, qtyBdmt: c.qtyBdmt }));
        CM().active(c.payments).forEach((x) => p.payments.push(x));
        c.payments = []; c.deletedAt = new Date().toISOString(); delete c.detailId; c.revision = (c.revision || 0) + 1; p.revision = (p.revision || 0) + 1;
      });
      st.sel = parent.id; draw(); core().render(); toast('Tờ khai ' + child.no + ' đã chuyển thành khai bổ sung của tờ khai ' + parent.no + '.', 'success');
    } catch (e) { toast(e.message || String(e), 'error'); }
  }

  /* ---------------- Nhập file .xls / OCR ---------------- */
  async function sheetRows(file) {
    if (!root.XLSX) throw Error('Thư viện đọc Excel chưa nạp.');
    const wb = root.XLSX.read(await file.arrayBuffer(), { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
    return root.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  }
  const PICK = ['no', 'openDate', 'type', 'office', 'ship', 'bill', 'goods', 'hs', 'qtyBdmt', 'qtyTon', 'invoiceNo', 'invoiceUsd', 'exchangeRate', 'taxableVnd', 'taxRate', 'taxVnd', 'exporter', 'importer', 'certNo', 'relatedNo', 'changedAt', 'note', 'round'];
  function toDecl(p, source) { const rec = { status: 'opened', source: source || '' }; PICK.forEach((k) => { if (p[k] !== undefined && p[k] !== '' && p[k] !== null) rec[k] = p[k]; }); return rec; }
  async function importFiles(files) {
    if (!files.length) return;
    const { Loading } = HAK.UI, added = [], skipped = [];
    Loading.show('Đang đọc tờ khai…');
    try {
      const recs = [];
      for (const f of files) {
        try { const p = CP().parseDeclarationRows(await sheetRows(f)); if (!p.no) { skipped.push(f.name + ': không thấy SỐ TỜ KHAI — không phải "Bản xác nhận nội dung tờ khai"?'); continue; } recs.push({ rec: toDecl(p, f.name), p, name: f.name }); }
        catch (e) { skipped.push(f.name + ': ' + (e.message || e)); }
      }
      if (recs.length) await commit((next) => {
        let cur = next;
        recs.forEach((x) => {
          if ((cur.customs || []).some((d) => !d.deletedAt && d.no === x.rec.no)) { skipped.push(x.name + ': tờ khai ' + x.rec.no + ' đã có.'); return; }
          const link = suggestLink(x.rec); if (link.detailId && (cur.customs || []).some((d) => !d.deletedAt && d.detailId === link.detailId)) delete link.detailId;   // đợt đã có tờ khai khác → chỉ gắn hợp đồng
          Object.assign(x.rec, link);
          try { cur = upsertInto(cur, x.rec).data; added.push(x); } catch (e) { skipped.push(x.name + ': ' + e.message); }
        });
        return cur;
      });
      if (added.length) st.sel = customsList().find((d) => d.no === added[added.length - 1].rec.no).id;
      draw(); core().render();
      const linked = added.filter((x) => x.rec.contractId).length;
      toast((added.length ? 'Đã nhập ' + added.length + ' tờ khai' + (linked ? ' (' + linked + ' tờ khai tự gắn hợp đồng / đợt theo tàu hoặc số TKHQ)' : '') + '. ' : '') + (skipped.length ? 'Bỏ qua: ' + skipped.join(' · ') : ''), skipped.length && !added.length ? 'warning' : 'success');
    } finally { Loading.hide(); }
  }
  async function importSupp(declId, files) {
    const d = customsList().find((x) => x.id === declId); if (!d || !files.length) return;
    const { Loading } = HAK.UI; Loading.show('Đang đọc tờ khai bổ sung…');
    try {
      const p = CP().parseDeclarationRows(await sheetRows(files[0]));
      if (!p.no) throw Error('Không thấy SỐ TỜ KHAI trong file.');
      if (p.no === d.no) throw Error('File này chính là tờ khai gốc ' + d.no + '.');
      Loading.hide();
      openSupp(declId, null, { no: p.no, date: p.changedAt || p.openDate || today(), taxVnd: p.taxVnd, qtyBdmt: p.qtyBdmt, reason: 'Khai bổ sung theo tờ khai ' + p.no });
    } catch (e) { toast(e.message || String(e), 'error'); } finally { Loading.hide(); }
  }
  const toBase64 = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(Error('Không đọc được file.')); r.readAsDataURL(file); });
  let lastPlain = '';
  async function ocrFile(file) {
    if (file.size > 26 * 1024 * 1024) throw Error('File quá lớn (tối đa 26 MB). Chụp lại ở độ phân giải thấp hơn.');
    const out = await HAK.Documents.ocr(await toBase64(file), 'document');
    lastPlain = out.pages.map((p) => p.text || '').join('\n');
    return out.pages.map((p) => (p.rowsText || p.text) + '\n' + (p.supplementalText || '')).join('\n');
  }
  const ocrHelp = (e) => (/fetch|network|load failed/i.test(e.message || '') ? 'Chưa kết nối OCR Windows. Mở app bằng lối tắt native\\HAKDocs.exe (bản setup có sẵn) rồi thử lại.' : e.message || String(e));
  async function ocrDecl(files) {
    if (!files.length) return; const { Loading } = HAK.UI; Loading.show('Đang đọc tờ khai bằng Windows OCR…');
    try {
      const text = await ocrFile(files[0]), p = CP().parseDeclarationText(text);
      Loading.hide();
      const rec = toDecl(p, files[0].name); Object.assign(rec, suggestLink(rec));
      openDecl(null, rec, { warnings: p.warnings, ocrText: text, fromOcr: true });
    } catch (e) { toast(ocrHelp(e), 'error'); } finally { Loading.hide(); }
  }
  const diff = (a, b) => { if (a.length !== b.length) return 99; let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
  async function ocrReceipt(files) {
    if (!files.length) return; const { Loading } = HAK.UI; Loading.show('Đang đọc giấy nộp tiền bằng Windows OCR…');
    try {
      const text = await ocrFile(files[0]), p = CP().parseReceiptText(text, lastPlain);
      Loading.hide(); openReceiptReview(p, text);
    } catch (e) { toast(ocrHelp(e), 'error'); } finally { Loading.hide(); }
  }
  function openReceiptReview(p, text) {
    const list = decls(), cur = customsList().find((d) => d.id === st.sel && !d.deletedAt);
    const lines = p.lines.length ? p.lines : [{ no: '', amount: null, kind: 'tax', content: 'Thuế xuất khẩu', periodDate: '', chapter: '', ndkt: '', dbhc: '' }];
    lines.forEach((ln) => {
      const exact = ln.no && list.find((d) => d.no === ln.no), near = !exact && ln.no && list.find((d) => diff(d.no, ln.no) <= 2);
      ln.target = exact ? exact.id : near ? near.id : (!ln.no && cur ? cur.id : ''); ln.near = !!near; ln.guess = !ln.no && !!cur;
    });
    const opt = (ln, sel) => '<option value="">— chọn tờ khai —</option>' + list.map((d) => '<option value="' + esc(d.id) + '"' + (d.id === sel ? ' selected' : '') + '>' + esc(d.no + (d.ship ? ' · ' + d.ship : '')) + '</option>').join('') + '<option value="__new">＋ Tạo tờ khai mới theo số đã nhập</option>';
    const inp = (id, v, w, cls) => '<input class="form-control form-control-sm ' + (cls || '') + '" id="' + id + '" style="min-width:' + w + '" value="' + esc(v || '') + '">';
    const table = '<div class="col-12"><div class="sec-title mt-2 mb-1">Các dòng nộp đọc được</div><div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th></th><th>Số tờ khai trên giấy</th><th>Gắn vào tờ khai</th><th>Loại</th><th>Nội dung</th><th>Kỳ thuế</th><th>Chương</th><th>NDKT</th><th>ĐBHC</th><th class="num">Số tiền VND</th></tr></thead><tbody>' +
      lines.map((ln, i) => '<tr><td><input class="form-check-input" type="checkbox" id="cs-ln-on-' + i + '"' + (ln.target && ln.amount !== null ? ' checked' : '') + '></td><td><input class="form-control form-control-sm mono' + (ln.no ? ' ocr-filled' : '') + '" id="cs-ln-no-' + i + '" style="min-width:9.5rem" inputmode="numeric" placeholder="gõ số tờ khai" value="' + esc(ln.no || '') + '">' + (ln.noFuzzy ? '<div class="small text-warning" style="font-family:inherit">số đọc được thiếu/thừa chữ số — kiểm tra</div>' : '') + (ln.near ? '<div class="small text-warning">gần khớp — kiểm tra</div>' : '') + (ln.guess ? '<div class="small text-warning" style="font-family:inherit;min-width:9rem">giấy không ghi số tờ khai — tự chọn tờ khai đang mở</div>' : '') + '</td><td><select class="form-select form-select-sm" id="cs-ln-t-' + i + '" style="min-width:12rem">' + opt(ln, ln.target) + '</select></td>' +
        '<td><select class="form-select form-select-sm" style="min-width:8.5rem" id="cs-ln-k-' + i + '"><option value="tax"' + (ln.kind === 'tax' ? ' selected' : '') + '>Thuế XK</option><option value="fee"' + (ln.kind === 'fee' ? ' selected' : '') + '>Lệ phí / khác</option></select></td>' +
        '<td>' + inp('cs-ln-c-' + i, ln.content, '9rem') + '</td><td><input type="date" class="form-control form-control-sm" id="cs-ln-d-' + i + '" value="' + esc(ln.periodDate || '') + '"></td><td>' + inp('cs-ln-h-' + i, ln.chapter, '4rem') + '</td><td>' + inp('cs-ln-n-' + i, ln.ndkt, '4.5rem') + '</td><td>' + inp('cs-ln-b-' + i, ln.dbhc, '5rem') + '</td>' +
        '<td><input class="form-control form-control-sm text-end" id="cs-ln-a-' + i + '" data-numfmt="num" style="min-width:8rem" value="' + esc(money(ln.amount)) + '"></td></tr>').join('') + '</tbody></table></div></div>';
    openModal({
      title: 'Giấy nộp tiền vào NSNN — kiểm tra kết quả OCR', saveLabel: 'Lưu các dòng đã tick',
      fields: [{ id: 'receiptNo', label: 'Số giấy nộp tiền', col: 3 }, { id: 'formCode', label: 'Mã hiệu', col: 3 }, { id: 'refNo', label: 'Số tham chiếu', col: 6 }, { id: 'date', label: 'Ngày nộp', type: 'date', col: 3 }, { id: 'payer', label: 'Người nộp thuế', col: 9 }],
      values: { receiptNo: p.receiptNo, formCode: p.formCode, refNo: p.refNo, date: p.date, payer: p.payer + (p.agent ? ' — nộp thay: ' + p.agent : '') }, extraHtml: table,
      notice: (p.warnings.length ? '<div class="alert alert-warning py-2 small">' + p.warnings.map((w) => '⚠ ' + esc(w)).join('<br>') + '</div>' : '') + '<details class="mb-2"><summary class="small">Xem chữ OCR</summary><pre class="small text-wrap">' + esc(text) + '</pre></details><div class="small text-muted mb-1">Ảnh chụp nghiêng, mờ hoặc có dấu mộc đè dễ bị đọc sai số — đối chiếu với giấy gốc trước khi lưu. Ô nào OCR không đọc được thì để trống, nhập tay theo giấy gốc. App chỉ lưu số liệu, không lưu ảnh.</div>',
      onOpen() {
        ['receiptNo', 'formCode', 'refNo', 'date', 'payer'].forEach((k) => { const el = $('#cs-f-' + k); if (el && el.value) el.classList.add('ocr-filled'); });
        lines.forEach((ln, i) => {   // gõ / sửa số tờ khai → tự chọn tờ khai trùng số
          $('#cs-ln-no-' + i).addEventListener('input', (e) => { const no = CM().digits(e.target.value), hit = no && list.find((d) => d.no === no); if (hit) { $('#cs-ln-t-' + i).value = hit.id; $('#cs-ln-on-' + i).checked = true; } });
        });
      },
      async onSave(v) {
        const picked = [];
        lines.forEach((ln, i) => {
          if (!$('#cs-ln-on-' + i).checked) return;
          const t = $('#cs-ln-t-' + i).value; if (!t) throw Error('Dòng ' + (i + 1) + ': chưa chọn tờ khai để gắn.');
          if (t === '__new' && CM().digits($('#cs-ln-no-' + i).value).length < 8) throw Error('Dòng ' + (i + 1) + ': gõ số tờ khai để tạo tờ khai mới.');
          const amount = NF().parse($('#cs-ln-a-' + i).value, 'num'); if (amount === null) throw Error('Dòng ' + (i + 1) + ': số tiền không hợp lệ.');
          picked.push({ no: CM().digits($('#cs-ln-no-' + i).value) || ln.no, declDate: ln.declDate, declType: ln.declType, target: t, amount, kind: $('#cs-ln-k-' + i).value, content: $('#cs-ln-c-' + i).value.trim(), periodDate: $('#cs-ln-d-' + i).value, chapter: $('#cs-ln-h-' + i).value.trim(), ndkt: $('#cs-ln-n-' + i).value.trim(), dbhc: $('#cs-ln-b-' + i).value.trim() });
        });
        if (!picked.length) throw Error('Chưa tick dòng nào để lưu.');
        let n = 0;
        await commit((next) => {
          next.customs = next.customs || [];
          picked.forEach((x) => {
            let d = x.target === '__new' ? null : next.customs.find((y) => y.id === x.target);
            if (!d) { d = CM().newDecl({ no: x.no, openDate: x.declDate || '', type: x.declType || '', status: 'opened', note: 'Tạo từ giấy nộp tiền ' + (v.receiptNo || ''), supplements: [], payments: [] }); next.customs.push(d); }
            const same = (y) => !y.deletedAt && ((y.refNo && v.refNo && y.refNo === CM().digits(v.refNo) && y.amount === x.amount) || (y.receiptNo && y.receiptNo === v.receiptNo && y.amount === x.amount && y.kind === x.kind));
            if ((d.payments || []).some(same)) return;   // nhập lại cùng giấy → không nhân đôi
            (d.payments = d.payments || []).push(CM().newPay({ receiptNo: v.receiptNo, formCode: v.formCode, refNo: v.refNo, date: v.date, payer: v.payer, kind: x.kind, content: x.content, amount: x.amount, periodDate: x.periodDate, chapter: x.chapter, ndkt: x.ndkt, dbhc: x.dbhc }));
            d.revision = (d.revision || 0) + 1; n++;
          });
        });
        if (picked[0]) { const d = customsList().find((y) => y.id === picked[0].target) || customsList().find((y) => y.no === picked[0].no); if (d) st.sel = d.id; }
        draw(); toast('Đã lưu ' + n + ' dòng nộp tiền' + (n < picked.length ? ' (bỏ ' + (picked.length - n) + ' dòng đã có)' : '') + '.', 'success');
      }
    });
  }

  /* ---------------- Giao diện tab ---------------- */
  const badgeCls = { opened: 'text-bg-secondary', waiting: 'text-bg-warning', cleared: 'text-bg-success' };
  const statusBadge = (s) => '<span class="badge ' + (badgeCls[s] || 'text-bg-secondary') + '">' + esc(CM().STATUS[s] || s) + '</span>';
  /** Nhãn trạng thái hợp đồng (cột "Trạng thái" ở bảng hợp đồng). */
  function contractBadge(contractId) {
    const s = CM().contractStatus(customsList(), contractId);
    return '<span class="badge ' + (s.code === 'done' ? 'text-bg-success' : 'text-bg-primary') + '" title="' + (s.total ? s.cleared + '/' + s.total + ' tờ khai đã thông quan' : 'Chưa có tờ khai hải quan') + '">' + s.label + '</span>';
  }
  /** 4 ô cho bảng "Các đợt thực hiện": ngày mở tờ khai · lần khai · thuế XK phải nộp · trạng thái. */
  function detailCells(c, d) {
    const x = customsList().find((k) => !k.deletedAt && k.detailId === d.id);
    if (!x) return '<td class="muted">—</td><td class="num muted">—</td><td class="num muted">—</td><td class="muted">—</td>';
    const t = CM().totals(x);
    return '<td>' + esc(vnDate(x.openDate)) + '</td><td class="num">' + esc(x.round || 1) + '</td><td class="num">' + esc(money(t.payable)) + '</td><td>' + statusBadge(x.status) + '</td>';
  }
  const SKELETON = '<div class="d-flex flex-wrap gap-2 mb-2"><button class="btn btn-primary" type="button" data-cs="add">＋ Thêm tờ khai</button>' +
    '<label class="btn btn-outline-secondary mb-0" title="File .xls/.xlsx &quot;Bản xác nhận nội dung tờ khai&quot; (chọn được nhiều file)">⬆ Nhập tờ khai từ file<input type="file" id="csImport" accept=".xls,.xlsx,.xlsm" multiple hidden></label>' +
    '<label class="btn btn-outline-primary mb-0" title="Bản in tờ khai (PDF hoặc ảnh chụp) — đọc bằng Windows OCR">🔎 Đọc tờ khai bằng OCR<input type="file" id="csOcrDecl" accept=".pdf,.jpg,.jpeg,.png,.bmp" hidden></label>' +
    '<label class="btn btn-outline-primary mb-0" title="Giấy nộp tiền vào ngân sách nhà nước (PDF hoặc ảnh chụp) — đọc bằng Windows OCR">🧾 Đọc giấy nộp tiền (OCR)<input type="file" id="csOcrPay" accept=".pdf,.jpg,.jpeg,.png,.bmp" hidden></label></div>' +
    '<div class="row g-2 mb-2"><div class="col-md-5"><input class="form-control" id="csQ" placeholder="Tìm số tờ khai, tàu, hợp đồng, hàng hóa…"></div><div class="col-md-3"><select class="form-select" id="csStatus"><option value="">Mọi trạng thái</option></select></div>' +
    '<div class="col-auto d-flex align-items-center"><label class="form-check mb-0"><input class="form-check-input" type="checkbox" id="csDeleted"> Xem tờ khai đã xóa</label></div></div>' +
    '<div id="csCards" class="row g-2 mb-2"></div><div class="tbl-wrap"><table class="table table-hover align-middle mb-0"><thead><tr><th>Số tờ khai</th><th>Ngày mở</th><th class="num">Lần</th><th>Loại hình</th><th>Hợp đồng</th><th>Tàu</th><th>Trạng thái</th><th class="num">Thuế XK phải nộp</th><th class="num">Đã nộp</th><th class="num">Còn phải nộp</th><th></th></tr></thead><tbody id="csBody"></tbody></table></div>' +
    '<div class="text-center muted py-4 d-none" id="csEmpty"></div><div id="csDetail" class="mt-3"></div>' +
    '<div class="form-text mt-2">Tờ khai là bảng cha; <b>khai bổ sung</b> và <b>giấy nộp tiền</b> là bảng con của tờ khai. Trạng thái: Đã mở tờ khai → Chờ thông quan → Đã thông quan. Khi <b>mọi tờ khai</b> của một hợp đồng đã thông quan, hợp đồng tự chuyển từ <b>Đang thực hiện</b> sang <b>Đã hoàn thành</b>. Số liệu nằm trong <b>Sao lưu toàn bộ</b>.</div>';
  function filtered() {
    const q = fold(st.q).trim();
    return decls(st.showDeleted)
      .filter((d) => (!st.status || d.status === st.status) && (!q || fold([d.no, d.ship, d.goods, d.bill, d.certNo, d.importer, contractLabel(contractOf(d.contractId))].join(' ')).includes(q)))
      .sort((a, b) => String(b.openDate || '').localeCompare(String(a.openDate || '')) || String(b.no).localeCompare(String(a.no)));
  }
  const card = (label, value, sub) => '<div class="col-6 col-md-3"><div class="border rounded p-2"><div class="small muted">' + label + '</div><div class="fw-semibold fs-5">' + value + '</div>' + (sub ? '<div class="small muted">' + sub + '</div>' : '') + '</div></div>';
  function sums(list) {
    return list.reduce((a, d) => { const t = CM().totals(d); a.payable += t.payable || 0; a.paid += t.paidTax; a.fee += t.paidFee; a.remaining += t.remaining || 0; a[d.status]++; return a; }, { payable: 0, paid: 0, fee: 0, remaining: 0, opened: 0, waiting: 0, cleared: 0 });
  }
  function draw() {
    const host = $('#customsRoot'); if (!host) return;
    if (!host.dataset.built) { host.innerHTML = SKELETON; host.dataset.built = '1'; bind(host); const sel = $('#csStatus'); sel.innerHTML = '<option value="">Mọi trạng thái</option>' + statusOpts().map((o) => '<option value="' + o[0] + '">' + o[1] + '</option>').join(''); }
    const list = filtered(), s = sums(decls());
    $('#csCards').innerHTML = card('Tờ khai', decls().length, s.opened + ' đã mở · ' + s.waiting + ' chờ thông quan · ' + s.cleared + ' đã thông quan') + card('Thuế XK phải nộp', money(s.payable) + ' đ') + card('Đã nộp thuế', money(s.paid) + ' đ', 'Lệ phí đã nộp: ' + money(s.fee) + ' đ') + card('Còn phải nộp', '<span class="' + (s.remaining > 0 ? 'text-danger' : 'text-success') + '">' + money(s.remaining) + ' đ</span>');
    if (!list.some((d) => d.id === st.sel)) st.sel = list[0] ? list[0].id : '';
    $('#csBody').innerHTML = list.map((d) => {
      const t = CM().totals(d), c = contractOf(d.contractId);
      return '<tr data-cs-sel="' + esc(d.id) + '" class="' + (st.sel === d.id ? 'table-active' : '') + (d.deletedAt ? ' opacity-50' : '') + '" style="cursor:pointer"><td class="mono fw-semibold">' + esc(d.no) + '</td><td>' + esc(vnDate(d.openDate)) + '</td><td class="num">' + esc(d.round || 1) + '</td><td>' + esc(d.type || '') + '</td><td>' + esc(c ? c.no || '' : '') + '</td><td>' + esc(d.ship || '') + '</td>' +
        '<td>' + (d.deletedAt ? '<span class="badge text-bg-dark">Đã xóa</span>' : '<select class="form-select form-select-sm" style="min-width:10.5rem" data-cs-status="' + esc(d.id) + '" aria-label="Trạng thái tờ khai">' + statusOpts().map((o) => '<option value="' + o[0] + '"' + (o[0] === d.status ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>') + '</td>' +
        '<td class="num">' + esc(money(t.payable)) + '</td><td class="num">' + esc(money(t.paidTax)) + '</td><td class="num ' + (t.remaining > 0 ? 'text-danger' : '') + '">' + esc(money(t.remaining)) + '</td>' +
        '<td class="text-end text-nowrap"><div class="btn-group btn-group-sm">' + (d.deletedAt ? '<button class="btn btn-outline-primary" data-cs-restore="' + esc(d.id) + '" type="button">Khôi phục</button>' : '<button class="btn btn-outline-primary" data-cs-edit="' + esc(d.id) + '" type="button">Sửa</button><button class="btn btn-outline-danger" data-cs-del="' + esc(d.id) + '" type="button" aria-label="Xóa tờ khai">🗑</button>') + '</div></td></tr>';
    }).join('');
    $('#csEmpty').innerHTML = decls().length ? 'Không có tờ khai khớp bộ lọc.' : 'Chưa có tờ khai hải quan. Bấm <b>＋ Thêm tờ khai</b>, <b>⬆ Nhập tờ khai từ file</b> (file .xls "Bản xác nhận nội dung tờ khai") hoặc <b>🔎 Đọc tờ khai bằng OCR</b>.';
    $('#csEmpty').classList.toggle('d-none', list.length > 0);
    drawDetail();
  }
  function drawDetail() {
    const box = $('#csDetail'), d = customsList().find((x) => x.id === st.sel); if (!box) return;
    if (!d) { box.innerHTML = ''; return; }
    const t = CM().totals(d), c = contractOf(d.contractId), det = detailOf(c, d.detailId), off = !!d.deletedAt;
    const info = (l, v) => v === '' || v == null ? '' : '<div class="col-6 col-md-3"><div class="small muted">' + l + '</div><div>' + esc(v) + '</div></div>';
    const flow = CM().STATUS_ORDER.map((k) => { const at = CM().statusDate(d, k); return '<span class="me-3 ' + (d.status === k ? 'fw-bold' : at ? '' : 'muted') + '">' + (at || d.status === k ? '●' : '○') + ' ' + CM().STATUS[k] + (at ? ' (' + esc(vnDate(at)) + ')' : '') + '</span>'; }).join('');
    const supp = (d.supplements || []).filter((x) => !x.deletedAt).sort((a, b) => (a.round || 0) - (b.round || 0)), pays = (d.payments || []).filter((x) => !x.deletedAt);
    box.innerHTML = '<div class="border rounded p-3"><div class="d-flex flex-wrap gap-2 align-items-center mb-2"><h6 class="mb-0">Tờ khai ' + esc(d.no) + '</h6>' + statusBadge(d.status) + (c ? contractBadge(c.id) : '') +
      '<div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Đổi trạng thái">' + statusOpts().map((o) => '<button type="button" class="btn ' + (d.status === o[0] ? 'btn-primary' : 'btn-outline-primary') + '" data-cs-set="' + o[0] + '"' + (off ? ' disabled' : '') + '>' + o[1] + '</button>').join('') + '</div></div>' +
      (parentCandidate(d) ? '<div class="alert alert-info py-2 small d-flex flex-wrap align-items-center gap-2">Tờ khai này cùng số vận đơn với tờ khai <b>' + esc(parentCandidate(d).no) + '</b> — có thể là <b>khai bổ sung</b> của tờ khai đó.<button type="button" class="btn btn-sm btn-outline-primary ms-auto" data-cs="to-supp">Chuyển thành khai bổ sung của ' + esc(parentCandidate(d).no) + '</button></div>' : '') +
      '<div class="small mb-2">' + flow + '</div><div class="row g-2 mb-3">' + info('Hợp đồng', c ? contractLabel(c) : '') + info('Đợt thực hiện', det ? [det.ship, det.product].filter(Boolean).join(' · ') : '') + info('Tàu / chuyến', d.ship) + info('Hàng hóa', d.goods) + info('KL (BDMT)', d.qtyBdmt != null ? money(d.qtyBdmt) : '') + info('Trị giá hóa đơn (USD)', d.invoiceUsd != null ? money(d.invoiceUsd) : '') + info('Tỷ giá', d.exchangeRate != null ? money(d.exchangeRate) : '') + info('Thuế suất', d.taxRate != null ? d.taxRate + '%' : '') + info('Số chứng thư', d.certNo) + info('Người nhập khẩu', d.importer) + info('Số vận đơn', d.bill) + info('Ghi chú', d.note) + '</div>' +
      '<div class="d-flex flex-wrap gap-2 align-items-center mb-1"><h6 class="mb-0">Khai bổ sung</h6><span class="small muted">(bảng con)</span><span class="ms-auto d-flex gap-2"><label class="btn btn-sm btn-outline-secondary mb-0">⬆ Nhập khai bổ sung từ file<input type="file" id="csImportSupp" accept=".xls,.xlsx,.xlsm" hidden' + (off ? ' disabled' : '') + '></label><button class="btn btn-sm btn-primary" type="button" data-cs="supp-add"' + (off ? ' disabled' : '') + '>＋ Thêm khai bổ sung</button></span></div>' +
      '<div class="tbl-wrap mb-3"><table class="table table-sm align-middle"><thead><tr><th>Số tờ khai bổ sung</th><th>Ngày</th><th class="num">Lần</th><th>Lý do</th><th class="num">KL (BDMT)</th><th class="num">Thuế XK sau bổ sung</th><th class="num">Chênh lệch</th><th></th></tr></thead><tbody>' +
      (supp.length ? supp.map((x) => '<tr><td class="mono">' + esc(x.no || '(trên tờ khai gốc)') + '</td><td>' + esc(vnDate(x.date)) + '</td><td class="num">' + esc(x.round) + '</td><td>' + esc(x.reason) + '</td><td class="num">' + esc(money(x.qtyBdmt)) + '</td><td class="num">' + esc(money(x.taxVnd)) + '</td><td class="num">' + (x.taxVnd != null && d.taxVnd != null ? esc((x.taxVnd - d.taxVnd > 0 ? '+' : '') + money(x.taxVnd - d.taxVnd)) : '') + '</td><td class="text-end text-nowrap"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" data-cs-child="supp" data-id="' + esc(x.id) + '" data-act="edit" type="button"' + (off ? ' disabled' : '') + '>Sửa</button><button class="btn btn-outline-danger" data-cs-child="supp" data-id="' + esc(x.id) + '" data-act="del" type="button" aria-label="Xóa"' + (off ? ' disabled' : '') + '>🗑</button></div></td></tr>').join('') : '<tr><td colspan="8" class="muted">Chưa có khai bổ sung.</td></tr>') + '</tbody></table></div>' +
      '<div class="d-flex flex-wrap gap-2 align-items-center mb-1"><h6 class="mb-0">Giấy nộp tiền</h6><span class="small muted">(bảng con)</span><span class="ms-auto"><button class="btn btn-sm btn-primary" type="button" data-cs="pay-add"' + (off ? ' disabled' : '') + '>＋ Thêm giấy nộp tiền</button></span></div>' +
      '<div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th>Số giấy nộp tiền</th><th>Mã hiệu</th><th>Số tham chiếu</th><th>Ngày nộp</th><th>Kỳ thuế</th><th>Loại</th><th>Nội dung</th><th>Chương</th><th>NDKT</th><th class="num">Số tiền</th><th></th></tr></thead><tbody>' +
      (pays.length ? pays.map((x) => '<tr><td class="mono">' + esc(x.receiptNo) + '</td><td class="mono">' + esc(x.formCode) + '</td><td class="mono small">' + esc(x.refNo) + '</td><td>' + esc(vnDate(x.date)) + '</td><td>' + esc(vnDate(x.periodDate)) + '</td><td>' + esc(CM().PAY_KIND[x.kind] || '') + '</td><td>' + esc(x.content) + '</td><td>' + esc(x.chapter) + '</td><td>' + esc(x.ndkt) + '</td><td class="num">' + esc(money(x.amount)) + '</td><td class="text-end text-nowrap"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" data-cs-child="pay" data-id="' + esc(x.id) + '" data-act="edit" type="button"' + (off ? ' disabled' : '') + '>Sửa</button><button class="btn btn-outline-danger" data-cs-child="pay" data-id="' + esc(x.id) + '" data-act="del" type="button" aria-label="Xóa"' + (off ? ' disabled' : '') + '>🗑</button></div></td></tr>').join('') : '<tr><td colspan="11" class="muted">Chưa có giấy nộp tiền.</td></tr>') + '</tbody>' +
      '<tfoot><tr><th colspan="8">Thuế XK phải nộp ' + esc(money(t.payable)) + ' đ · đã nộp thuế ' + esc(money(t.paidTax)) + ' đ · lệ phí đã nộp ' + esc(money(t.paidFee)) + ' đ</th><th colspan="2" class="num ' + (t.remaining > 0 ? 'text-danger' : 'text-success') + '">Còn ' + esc(money(t.remaining)) + '</th><th></th></tr></tfoot></table></div></div>';
  }
  function bind(host) {
    host.addEventListener('click', (e) => {
      const t = e.target;
      const act = t.closest('[data-cs]');
      if (act) { const a = act.dataset.cs; if (a === 'add') openDecl(null); else if (a === 'supp-add') openSupp(st.sel); else if (a === 'pay-add') openPay(st.sel); else if (a === 'to-supp') HAK.UI.confirmClick(act, () => convertToSupp(st.sel), 'Chuyển?'); return; }
      const ed = t.closest('[data-cs-edit]'); if (ed) { openDecl(ed.dataset.csEdit); return; }
      const del = t.closest('[data-cs-del]'); if (del) { HAK.UI.confirmClick(del, () => removeDecl(del.dataset.csDel), 'Xóa?'); return; }
      const rs = t.closest('[data-cs-restore]'); if (rs) { removeDecl(rs.dataset.csRestore, true); return; }
      const set = t.closest('[data-cs-set]'); if (set) { setStatus(st.sel, set.dataset.csSet); return; }
      const ch = t.closest('[data-cs-child]');
      if (ch) { const kind = ch.dataset.csChild, id = ch.dataset.id; if (ch.dataset.act === 'edit') (kind === 'supp' ? openSupp : openPay)(st.sel, id); else HAK.UI.confirmClick(ch, () => removeChild(st.sel, kind, id), 'Xóa?'); return; }
      if (t.closest('select, button, input, label, a')) return;
      const row = t.closest('[data-cs-sel]'); if (row) { st.sel = row.dataset.csSel; draw(); }
    });
    host.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'csImport') { const f = Array.from(t.files); t.value = ''; importFiles(f).catch((x) => toast(x.message || String(x), 'error')); }
      else if (t.id === 'csOcrDecl') { const f = Array.from(t.files); t.value = ''; ocrDecl(f); }
      else if (t.id === 'csOcrPay') { const f = Array.from(t.files); t.value = ''; ocrReceipt(f); }
      else if (t.id === 'csImportSupp') { const f = Array.from(t.files); t.value = ''; importSupp(st.sel, f); }
      else if (t.dataset && t.dataset.csStatus) setStatus(t.dataset.csStatus, t.value);
      else if (t.id === 'csStatus') { st.status = t.value; draw(); }
      else if (t.id === 'csDeleted') { st.showDeleted = t.checked; draw(); }
    });
    host.addEventListener('input', HAK.UI.debounce((e) => { if (e.target.id === 'csQ') { st.q = e.target.value; draw(); } }, 150));
  }

  /* ---------------- Móc vào biểu mẫu "Đợt thực hiện" của hợp đồng ---------------- */
  /** Ô chọn tờ khai + thông tin tờ khai (ngày mở, lần khai, thuế XK phải nộp) trong form đợt thực hiện. */
  function execPicker(c, d) {
    const cur = customsList().find((x) => !x.deletedAt && x.detailId === d.id);
    const opts = decls().filter((x) => x.contractId === c.id || !x.contractId || (cur && x.id === cur.id));
    return '<div class="col-md-6"><label class="form-label" for="cf-customsId">Tờ khai hải quan (từ tab 🛃 Tờ khai hải quan)</label><select class="form-select" id="cf-customsId"><option value="">— Chưa gắn tờ khai —</option>' +
      opts.map((x) => '<option value="' + esc(x.id) + '"' + (cur && cur.id === x.id ? ' selected' : '') + '>' + esc(x.no + ' · ' + (vnDate(x.openDate) || '?') + ' · lần ' + (x.round || 1) + ' · ' + CM().STATUS[x.status]) + '</option>').join('') + '</select>' +
      '<div class="form-text">Chọn tờ khai thì ô <b>Số TKHQ</b> tự lấy theo tờ khai. Chưa có tờ khai? Thêm ở tab Tờ khai hải quan.</div></div><div class="col-md-6" id="cf-customsInfo"></div>';
  }
  function execInfo() {
    const id = ($('#cf-customsId') || {}).value, box = $('#cf-customsInfo'); if (!box) return;
    const x = id ? customsList().find((k) => k.id === id) : null;
    if (!x) { box.innerHTML = '<div class="small muted pt-4">Chưa gắn tờ khai: ngày mở, lần khai và thuế xuất khẩu sẽ hiện ở đây.</div>'; return; }
    const t = CM().totals(x);
    box.innerHTML = '<div class="border rounded p-2 small"><b>Ngày mở tờ khai:</b> ' + esc(vnDate(x.openDate) || '—') + ' · <b>Lần khai:</b> ' + esc(x.round || 1) + ' · ' + statusBadge(x.status) + '<br><b>Thuế xuất khẩu phải nộp:</b> ' + esc(money(t.payable) || '—') + ' đ · đã nộp ' + esc(money(t.paidTax)) + ' đ · còn ' + esc(money(t.remaining) || '—') + ' đ</div>';
    const tk = $('#cf-tkhq'); if (tk) { tk.value = x.no; tk.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  function bindExec() { const s = $('#cf-customsId'); if (s) { s.onchange = execInfo; execInfo(); } }
  /** Sau khi lưu đợt thực hiện: gắn (hoặc gỡ) tờ khai cho đợt đó. */
  async function link(l) {
    if (!l) return;
    const had = customsList().find((x) => x.detailId === l.detail);
    if (!l.customs && !had) return;
    await commit((next) => {
      (next.customs || []).forEach((x) => { if (x.detailId === l.detail && x.id !== l.customs) { delete x.detailId; x.revision = (x.revision || 0) + 1; } });
      const rec = l.customs && next.customs.find((x) => x.id === l.customs);
      if (rec) { rec.contractId = l.contract; rec.detailId = l.detail; rec.revision = (rec.revision || 0) + 1; syncDetail(next, rec); }
    });
    draw();
  }

  /* ---------------- Báo cáo "Tình hình khai hải quan và nộp thuế" ---------------- */
  function reportRows(from, to) {
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    return decls().filter((d) => (!from || !d.openDate || d.openDate >= from) && (!to || !d.openDate || d.openDate <= to))
      .filter((d) => { const c = contractOf(d.contractId); return !scope || !c || !HAK.Catalog.relatedTo || HAK.Catalog.relatedTo(c, scope); })
      .sort((a, b) => String(a.openDate || '').localeCompare(String(b.openDate || '')) || String(a.no).localeCompare(String(b.no)));
  }
  function drawReport() {
    const host = $('#repCsBody'); if (!host || !root.HAK.Catalog || !HAK.Catalog.core) return;
    const from = ($('#repFrom') || {}).value || '', to = ($('#repTo') || {}).value || '', rows = reportRows(from, to), s = sums(rows);
    const cc = (d) => { const c = contractOf(d.contractId); return c ? CM().contractStatus(customsList(), c.id).label : ''; };
    host.innerHTML = '<div class="row g-2 mb-2">' + card('Tờ khai', rows.length, s.opened + ' đã mở · ' + s.waiting + ' chờ thông quan · ' + s.cleared + ' đã thông quan') + card('Thuế XK phải nộp', money(s.payable) + ' đ') + card('Đã nộp thuế', money(s.paid) + ' đ', 'Lệ phí đã nộp: ' + money(s.fee) + ' đ') + card('Còn phải nộp', '<span class="' + (s.remaining > 0 ? 'text-danger' : 'text-success') + '">' + money(s.remaining) + ' đ</span>') + '</div>' +
      '<div class="tbl-wrap"><table class="table table-sm"><thead><tr><th>Số tờ khai</th><th>Ngày mở</th><th class="num">Lần</th><th>Hợp đồng</th><th>Tàu</th><th>Trạng thái</th><th>Ngày thông quan</th><th class="num">Thuế phải nộp</th><th class="num">Đã nộp thuế</th><th class="num">Còn phải nộp</th><th class="num">Khai bổ sung</th><th>Hợp đồng</th></tr></thead><tbody>' +
      (rows.length ? rows.map((d) => { const t = CM().totals(d), c = contractOf(d.contractId); return '<tr><td class="mono">' + esc(d.no) + '</td><td>' + esc(vnDate(d.openDate)) + '</td><td class="num">' + esc(d.round || 1) + '</td><td>' + esc(c ? c.no : '') + '</td><td>' + esc(d.ship || '') + '</td><td>' + statusBadge(d.status) + '</td><td>' + esc(vnDate(CM().statusDate(d, 'cleared'))) + '</td><td class="num">' + esc(money(t.payable)) + '</td><td class="num">' + esc(money(t.paidTax)) + '</td><td class="num ' + (t.remaining > 0 ? 'text-danger' : '') + '">' + esc(money(t.remaining)) + '</td><td class="num">' + CM().active(d.supplements).length + '</td><td>' + esc(cc(d)) + '</td></tr>'; }).join('') : '<tr><td colspan="12" class="muted text-center">Chưa có tờ khai hải quan trong khoảng đã chọn. Thêm ở Danh mục → 🛃 Tờ khai hải quan.</td></tr>') + '</tbody></table></div>';
    const b = $('#repCsXls'); if (b) b.disabled = !rows.length;
  }
  async function exportReport() {
    const from = ($('#repFrom') || {}).value || '', to = ($('#repTo') || {}).value || '', rows = reportRows(from, to);
    if (!rows.length) { toast('Chưa có tờ khai để xuất.', 'warning'); return; }
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report, wb = R.newWorkbook(), NI = '#,##0', ND = '#,##0.##';
    const sub = 'Nguồn: tab Tờ khai hải quan trong Danh mục' + (from || to ? ' · ngày mở tờ khai ' + (vnDate(from) || '…') + ' → ' + (vnDate(to) || '…') : '') + '. Thuế phải nộp lấy theo lần khai bổ sung mới nhất (nếu có).';
    R.buildSheet(wb, 'Tờ khai', 'TÌNH HÌNH KHAI HẢI QUAN VÀ NỘP THUẾ', sub,
      [{ h: 'Số tờ khai', w: 16 }, { h: 'Ngày mở', w: 12 }, { h: 'Lần khai', w: 8, n: NI }, { h: 'Loại hình', w: 9 }, { h: 'Hợp đồng', w: 20 }, { h: 'Trạng thái hợp đồng', w: 16 }, { h: 'Tàu', w: 24 }, { h: 'Hàng hóa', w: 28 }, { h: 'KL (BDMT)', w: 12, n: ND }, { h: 'Trạng thái tờ khai', w: 16 }, { h: 'Ngày thông quan', w: 14 }, { h: 'Thuế XK phải nộp (đ)', w: 18, n: NI }, { h: 'Đã nộp thuế (đ)', w: 16, n: NI }, { h: 'Còn phải nộp (đ)', w: 16, n: NI }, { h: 'Lệ phí đã nộp (đ)', w: 16, n: NI }],
      rows.map((d) => { const t = CM().totals(d), c = contractOf(d.contractId); return [d.no, vnDate(d.openDate), d.round || 1, d.type || '', c ? c.no : '', c ? CM().contractStatus(customsList(), c.id).label : '', d.ship || '', d.goods || '', d.qtyBdmt, CM().STATUS[d.status], vnDate(CM().statusDate(d, 'cleared')), t.payable, t.paidTax, t.remaining, t.paidFee]; }), { total: true });
    R.buildSheet(wb, 'Khai bổ sung', 'KHAI BỔ SUNG', sub, [{ h: 'Tờ khai gốc', w: 16 }, { h: 'Số tờ khai bổ sung', w: 18 }, { h: 'Ngày', w: 12 }, { h: 'Lần', w: 8, n: NI }, { h: 'Lý do', w: 40 }, { h: 'KL (BDMT)', w: 12, n: ND }, { h: 'Thuế XK sau bổ sung (đ)', w: 20, n: NI }],
      rows.flatMap((d) => CM().active(d.supplements).map((x) => [d.no, x.no, vnDate(x.date), x.round, x.reason, x.qtyBdmt, x.taxVnd])));
    R.buildSheet(wb, 'Giấy nộp tiền', 'GIẤY NỘP TIỀN VÀO NGÂN SÁCH NHÀ NƯỚC', sub, [{ h: 'Tờ khai', w: 16 }, { h: 'Số giấy nộp tiền', w: 16 }, { h: 'Mã hiệu', w: 14 }, { h: 'Số tham chiếu', w: 24 }, { h: 'Ngày nộp', w: 12 }, { h: 'Kỳ thuế / ngày quyết định', w: 14 }, { h: 'Loại', w: 16 }, { h: 'Nội dung', w: 30 }, { h: 'Mã chương', w: 10 }, { h: 'Mã NDKT', w: 10 }, { h: 'Mã ĐBHC', w: 10 }, { h: 'Số tiền VND', w: 16, n: NI }],
      rows.flatMap((d) => CM().active(d.payments).map((x) => [d.no, x.receiptNo, x.formCode, x.refNo, vnDate(x.date), vnDate(x.periodDate), CM().PAY_KIND[x.kind], x.content, x.chapter, x.ndkt, x.dbhc, x.amount])), { total: true });
    const name = 'TinhHinhKhaiHaiQuan_' + (from || to ? (from || '').slice(0, 4) || (to || '').slice(0, 4) : 'TatCa') + '.xlsx';
    if (!await HAK.Word.Files.saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)) return;
    toast('Đã xuất: ' + name, 'success');
  }
  function initReport() {
    const b = $('#repCsXls'); if (b && !b.dataset.bound) { b.dataset.bound = '1'; b.addEventListener('click', () => exportReport().catch((e) => toast(e.message || String(e), 'error'))); }
    root.addEventListener('hak:catalog', () => drawReport());
  }

  function render() { draw(); }
  HAK.Customs = { render, draw, contractBadge, detailCells, execPicker, bindExec, link, drawReport, initReport, exportReport, suggestLink, importFiles };
})(window);
