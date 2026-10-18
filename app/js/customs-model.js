/**
 * customs-model.js — Tờ khai hải quan (v2.14.0). Hàm thuần, không DOM → kiểm thử trong Node.
 *  - Bảng CHA: tờ khai hải quan (data.customs[]). Bảng CON: khai bổ sung (supplements[]) và giấy nộp tiền (payments[]).
 *  - Trạng thái tờ khai: opened (Đã mở tờ khai) → waiting (Chờ thông quan) → cleared (Đã thông quan).
 *  - Hợp đồng "Đang thực hiện" tự chuyển "Đã hoàn thành" khi mọi tờ khai đang dùng của hợp đồng đã thông quan.
 *  - Thuế xuất khẩu phải nộp = thuế của khai bổ sung mới nhất (nếu có), ngược lại là thuế của tờ khai gốc.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const STATUS = { opened: 'Đã mở tờ khai', waiting: 'Chờ thông quan', cleared: 'Đã thông quan' };
  const STATUS_ORDER = ['opened', 'waiting', 'cleared'];
  const PAY_KIND = { tax: 'Thuế xuất khẩu', fee: 'Lệ phí / khác' };
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const uid = (p) => p + (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const numOrNull = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
  const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
  const NUM = ['qtyBdmt', 'qtyTon', 'invoiceUsd', 'exchangeRate', 'taxableVnd', 'taxRate', 'taxVnd', 'round'];
  const DECL = ['no', 'openDate', 'round', 'type', 'office', 'status', 'statusLog', 'contractId', 'detailId', 'ship', 'bill', 'goods', 'hs', 'qtyBdmt', 'qtyTon', 'invoiceNo', 'invoiceUsd', 'exchangeRate', 'taxableVnd', 'taxRate', 'taxVnd', 'exporter', 'importer', 'certNo', 'relatedNo', 'changedAt', 'note', 'source'];

  function newDecl(v) {
    v = v || {};
    const d = { id: v.id || uid('tk-'), revision: v.revision || 0, supplements: [], payments: [] };
    DECL.forEach((k) => { if (v[k] !== undefined) d[k] = copy(v[k]); });
    NUM.forEach((k) => { d[k] = numOrNull(d[k]); });
    d.no = digits(d.no);
    if (!d.round || d.round < 1) d.round = 1;
    if (!STATUS[d.status]) d.status = 'opened';
    if (!Array.isArray(d.statusLog)) d.statusLog = [{ status: d.status, at: d.openDate || '' }];
    if (Array.isArray(v.supplements)) d.supplements = v.supplements.map(newSupp);
    if (Array.isArray(v.payments)) d.payments = v.payments.map(newPay);
    if (v.deletedAt) d.deletedAt = v.deletedAt;
    return d;
  }
  /** Khai bổ sung (bảng con): thuế xuất khẩu SAU bổ sung thay cho thuế của tờ khai gốc. */
  function newSupp(v) {
    v = v || {};
    const s = { id: v.id || uid('bs-'), no: digits(v.no), date: v.date || '', round: numOrNull(v.round) || 2, reason: v.reason || '', taxVnd: numOrNull(v.taxVnd), qtyBdmt: numOrNull(v.qtyBdmt), note: v.note || '' };
    if (v.deletedAt) s.deletedAt = v.deletedAt;
    return s;
  }
  /** Giấy nộp tiền vào NSNN (bảng con): mỗi dòng nộp cho 1 tờ khai. kind: tax | fee. */
  function newPay(v) {
    v = v || {};
    const p = { id: v.id || uid('nt-'), receiptNo: String(v.receiptNo || '').trim(), date: v.date || '', amount: numOrNull(v.amount), kind: v.kind === 'fee' ? 'fee' : 'tax', content: v.content || '', note: v.note || '', formCode: v.formCode || '', refNo: digits(v.refNo), periodDate: v.periodDate || '', chapter: String(v.chapter || ''), ndkt: String(v.ndkt || ''), dbhc: String(v.dbhc || ''), payer: v.payer || '' };
    if (v.deletedAt) p.deletedAt = v.deletedAt;
    return p;
  }
  const act = (list) => (list || []).filter((x) => !x.deletedAt);
  const sum = (list, key) => act(list).reduce((a, x) => a + (Number(x[key]) || 0), 0);

  /** Thuế phải nộp / đã nộp / còn lại của 1 tờ khai. */
  function totals(d) {
    const supp = act(d.supplements).filter((s) => s.taxVnd != null).sort((a, b) => (a.round - b.round) || String(a.date).localeCompare(String(b.date)));
    const last = supp[supp.length - 1] || null;
    const base = d.taxVnd == null ? null : Number(d.taxVnd);
    const payable = last ? Number(last.taxVnd) : base;
    const paidTax = act(d.payments).filter((p) => p.kind === 'tax').reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const paidFee = act(d.payments).filter((p) => p.kind === 'fee').reduce((a, p) => a + (Number(p.amount) || 0), 0);
    return { base, payable, extra: last && base != null ? Number(last.taxVnd) - base : null, paidTax, paidFee, remaining: payable == null ? null : payable - paidTax, lastSupplement: last };
  }
  function setStatus(d, status, at, by) {
    if (!STATUS[status]) throw Error('Trạng thái tờ khai không hợp lệ.');
    if (d.status === status) return d;
    d.status = status;
    d.statusLog = (d.statusLog || []).concat([{ status, at: at || new Date().toISOString().slice(0, 10), by: by || '' }]);
    d.revision = (d.revision || 0) + 1;
    return d;
  }
  const statusDate = (d, status) => { const hit = (d.statusLog || []).filter((x) => x.status === status).pop(); return hit ? hit.at : ''; };

  /** Hợp đồng: running (Đang thực hiện) → done (Đã hoàn thành) khi có tờ khai và tất cả đã thông quan. */
  function contractStatus(customs, contractId) {
    const list = act(customs).filter((d) => d.contractId === contractId);
    const cleared = list.filter((d) => d.status === 'cleared').length;
    const done = list.length > 0 && cleared === list.length;
    return { code: done ? 'done' : 'running', label: done ? 'Đã hoàn thành' : 'Đang thực hiện', total: list.length, cleared };
  }
  function validate(d, data) {
    if (!d.no) return 'Chưa nhập số tờ khai.';
    if (d.no.length < 8) return 'Số tờ khai phải là dãy số (thường 12 chữ số).';
    if (!d.deletedAt && (data.customs || []).some((x) => !x.deletedAt && x.id !== d.id && x.no === d.no)) return 'Số tờ khai ' + d.no + ' đã có trong danh sách.';
    return '';
  }
  function upsert(data, value) {
    const next = copy(data); next.customs = Array.isArray(next.customs) ? next.customs : [];
    const d = newDecl(value), err = validate(d, next); if (err) return { error: err };
    const at = next.customs.findIndex((x) => x.id === d.id);
    if (at >= 0) { d.revision = (next.customs[at].revision || 0) + 1; next.customs[at] = d; } else next.customs.push(d);
    return { data: next, rec: d };
  }
  /** Gộp danh sách tờ khai khi nhập bản sao lưu: theo id, ô trống không ghi đè; bảng con gộp theo id. */
  function merge(local, incoming) {
    const out = copy(local || []);
    const keep = (old, v) => { const r = Object.assign({}, old); Object.keys(v).forEach((k) => { const x = v[k]; if (x !== null && x !== undefined && x !== '' && !Array.isArray(x)) r[k] = copy(x); }); return r; };
    const byId = (a, b) => { const r = a.slice(); (b || []).forEach((x) => { const i = r.findIndex((y) => y.id === x.id); if (i < 0) r.push(copy(x)); else r[i] = keep(r[i], x); }); return r; };
    (incoming || []).forEach((d) => {
      const i = out.findIndex((x) => x.id === d.id || (x.no && x.no === d.no && !x.deletedAt && !d.deletedAt));
      if (i < 0) { out.push(copy(d)); return; }
      const old = out[i], m = keep(old, d);
      m.supplements = byId(old.supplements || [], d.supplements);
      m.payments = byId(old.payments || [], d.payments);
      m.statusLog = (old.statusLog || []).length >= (d.statusLog || []).length ? old.statusLog : d.statusLog;
      out[i] = m;
    });
    return out;
  }
  /**
   * Điều kiện gắn đợt giao hàng (hồ sơ cân) vào hợp đồng:
   *  - Xuất khẩu / Ủy thác XK: phải nhập TÀU và TỜ KHAI hải quan trước (chưa có tờ khai thì chưa thực hiện được hợp đồng).
   *  - Xuất bán / Trao đổi: không cần tờ khai và tàu.
   * Trả về {need, ok, missing[], detailId}: detailId = chi tiết (tàu) sẽ nhận hồ sơ.
   */
  function readiness(contract, customs) {
    const c = contract || {}, need = c.type === 'xuatkhau' || c.type === 'uythac';
    const details = (c.details || []).filter((d) => !d.deletedAt);
    if (!need) return { need: false, ok: true, missing: [], detailId: details[0] ? details[0].id : '' };
    const decls = act(customs).filter((d) => d.contractId === c.id);
    const withShip = details.filter((d) => String(d.ship || '').trim());
    const ready = withShip.find((d) => decls.some((x) => !x.detailId || x.detailId === d.id)) || null, pick = ready || withShip[0] || null;
    const missing = [];
    if (!withShip.length) missing.push('tàu'); if (!decls.length) missing.push('tờ khai hải quan');
    return { need: true, ok: !!ready, missing, detailId: pick ? pick.id : '' };
  }
  /** Một chi tiết (tàu) đã đủ điều kiện nhận đợt giao hàng chưa → {ok, missing[]} (xem readiness). */
  function detailReady(contract, detail, customs) {
    const c = contract || {}, d = detail || {};
    if (!(c.type === 'xuatkhau' || c.type === 'uythac')) return { ok: true, missing: [] };
    const missing = [];
    if (!String(d.ship || '').trim()) missing.push('tàu');
    if (!act(customs).some((x) => x.contractId === c.id && (!x.detailId || x.detailId === d.id))) missing.push('tờ khai hải quan');
    return { ok: !missing.length, missing };
  }
  HAK.CustomsModel = { detailReady, readiness, STATUS, STATUS_ORDER, PAY_KIND, newDecl, newSupp, newPay, active: act, sum, totals, setStatus, statusDate, contractStatus, validate, upsert, merge, copy, digits };
  if (typeof module === 'object' && module.exports) module.exports = HAK.CustomsModel;
})(typeof window !== 'undefined' ? window : globalThis);
