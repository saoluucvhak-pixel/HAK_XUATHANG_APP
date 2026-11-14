/**
 * integrity-model.js — kiểm tra TOÀN VẸN dữ liệu danh mục (v2.17.0, theo quy trình hak-data-integrity / hak-parent-child-data-model).
 * Hàm thuần, KHÔNG sửa dữ liệu — chỉ báo cáo sai lệch để người dùng quyết định.
 *   audit(data, metas?) → [{ code, level:'error'|'warn', ref, msg }]
 * Kiểm tra: ID hợp đồng / chi tiết / tờ khai trùng; chi tiết sai khóa ngoại; tờ khai mồ côi (hợp đồng không tồn tại / đã ngừng dùng) hoặc gắn chi tiết không thuộc hợp đồng;
 * số tờ khai trùng; hồ sơ Lưu trữ gắn chi tiết không còn; khoản nộp tiền trùng khoản trong cùng tờ khai; KL gốc nghi ghi nhầm.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  function audit(data, metas) {
    const out = [], d = data || {}, contracts = d.contracts || [], customs = d.customs || [], add = (code, level, ref, msg) => out.push({ code, level, ref, msg });
    const cById = new Map(), detOwner = new Map(), seenC = new Set(), seenD = new Set();
    contracts.forEach((c) => {
      if (seenC.has(c.id)) add('dup-contract-id', 'error', c.id, 'ID hợp đồng bị trùng: ' + c.id); seenC.add(c.id); cById.set(c.id, c);
      (c.details || []).forEach((x) => {
        if (seenD.has(x.id)) add('dup-detail-id', 'error', x.id, 'ID chi tiết bị trùng: ' + x.id); seenD.add(x.id);
        if (x.contractId !== c.id) add('detail-fk', 'error', x.id, 'Chi tiết ' + x.id + ' thuộc hợp đồng ' + (x.contractId || '(trống)') + ' nhưng nằm trong hợp đồng ' + c.id);
        detOwner.set(x.id, c.id);
      });
      const aud = HAK.ContractModel && HAK.ContractModel.auditOriginal ? HAK.ContractModel.auditOriginal(c) : '';
      if (aud) add('qty-orig-suspect', 'warn', c.id, 'Hợp đồng ' + (c.no || c.id) + ': ' + aud);
    });
    const seenNo = new Map();
    customs.filter((t) => !t.deletedAt).forEach((t) => {
      const c = cById.get(t.contractId);
      if (t.contractId && !c) add('decl-orphan', 'error', t.id, 'Tờ khai ' + t.no + ' gắn hợp đồng không tồn tại (' + t.contractId + ')');
      else if (c && c.deletedAt) add('decl-deleted-contract', 'warn', t.id, 'Tờ khai ' + t.no + ' gắn hợp đồng đã ngừng dùng ' + (c.no || c.id));
      if (t.detailId && detOwner.get(t.detailId) !== t.contractId) add('decl-detail-fk', 'error', t.id, 'Tờ khai ' + t.no + ' gắn chi tiết không thuộc hợp đồng của nó');
      if (t.no) { if (seenNo.has(t.no)) add('dup-decl-no', 'error', t.id, 'Số tờ khai ' + t.no + ' bị trùng'); seenNo.set(t.no, t.id); }
      const pays = (t.payments || []).filter((p) => !p.deletedAt), CMo = HAK.CustomsModel;
      if (CMo && CMo.samePayment) pays.forEach((p, i) => { if (pays.slice(0, i).some((q) => CMo.samePayment(q, p))) add('dup-payment', 'warn', p.id, 'Tờ khai ' + t.no + ': khoản nộp ' + (p.receiptNo || p.refNo || '?') + ' có vẻ nhập trùng'); });
    });
    (metas || []).forEach((m) => { if (m.contract && !detOwner.has(m.contract)) add('archive-link', 'warn', m.id, 'Hồ sơ Lưu trữ "' + (m.title || m.id) + '" gắn chi tiết hợp đồng không còn trong Danh mục'); });
    return out;
  }
  HAK.Integrity = { audit };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Integrity;
})(typeof window !== 'undefined' ? window : globalThis);
