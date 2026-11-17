/**
 * integrity-model.js — kiểm tra TOÀN VẸN dữ liệu danh mục (v2.17.0, theo quy trình hak-data-integrity / hak-parent-child-data-model).
 * Hàm thuần, KHÔNG sửa dữ liệu — chỉ báo cáo sai lệch để người dùng quyết định.
 *   audit(data, metas?) → [{ code, level:'error'|'warn', ref, msg }]
 * Bổ sung (rà soát v2.21.3): audit(data, metas, opts) nhận thêm opts.attachmentIds → báo tệp đính kèm thiếu; thêm các mã dup-customer-id, dup-child-id, party-missing,
 * decl-deleted-detail, decl-detail-shared, supplement-no-dup, addenda-qty-stale, close-state, attachment-missing, archive-deleted-detail, archive-cross-company; relations(data, metas) → bảng số lượng cha–con.
 * Kiểm tra: ID hợp đồng / chi tiết / tờ khai trùng; chi tiết sai khóa ngoại; tờ khai mồ côi (hợp đồng không tồn tại / đã ngừng dùng) hoặc gắn chi tiết không thuộc hợp đồng;
 * số tờ khai trùng; hồ sơ Lưu trữ gắn chi tiết không còn; khoản nộp tiền trùng khoản trong cùng tờ khai; KL gốc nghi ghi nhầm.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  function audit(data, metas, opts) {
    opts = opts || {};
    const out = [],
      d = data || {},
      contracts = d.contracts || [],
      customs = d.customs || [],
      add = (code, level, ref, msg) => out.push({ code, level, ref, msg });
    const cById = new Map(),
      detOwner = new Map(),
      seenC = new Set(),
      seenD = new Set();
    contracts.forEach((c) => {
      if (seenC.has(c.id)) add('dup-contract-id', 'error', c.id, 'ID hợp đồng bị trùng: ' + c.id);
      seenC.add(c.id);
      cById.set(c.id, c);
      (c.details || []).forEach((x) => {
        if (seenD.has(x.id)) add('dup-detail-id', 'error', x.id, 'ID chi tiết bị trùng: ' + x.id);
        seenD.add(x.id);
        if (x.contractId !== c.id)
          add(
            'detail-fk',
            'error',
            x.id,
            'Chi tiết ' + x.id + ' thuộc hợp đồng ' + (x.contractId || '(trống)') + ' nhưng nằm trong hợp đồng ' + c.id
          );
        detOwner.set(x.id, c.id);
      });
      const aud = HAK.ContractModel && HAK.ContractModel.auditOriginal ? HAK.ContractModel.auditOriginal(c) : '';
      if (aud) add('qty-orig-suspect', 'warn', c.id, 'Hợp đồng ' + (c.no || c.id) + ': ' + aud);
    });
    // ---- bổ sung: khóa trùng ở các bảng còn lại, bên liên quan, tệp đính kèm, KL phụ lục, trạng thái đóng ----
    const dupIn = (list, code, label) => {
      const seen = new Set();
      (list || []).forEach((x) => {
        if (!x) return;
        if (!x.id) add(code, 'error', '', label + ' thiếu mã định danh');
        else if (seen.has(x.id)) add(code, 'error', x.id, label + ' trùng mã ' + x.id);
        seen.add(x.id);
      });
    };
    dupIn(d.customers, 'dup-customer-id', 'Khách hàng');
    const custIds = new Set((d.customers || []).map((x) => x.id));
    const att = opts.attachmentIds ? new Set(opts.attachmentIds) : null;
    const fid = (x) => (typeof x === 'string' ? x : x && x.id) || '';
    contracts.forEach((c) => {
      dupIn(c.addenda, 'dup-child-id', 'Phụ lục của ' + (c.no || c.id));
      if (Array.isArray(d.customers))
        ['exporterId', 'principalId', 'buyerId'].forEach((k) => {
          if (c[k] && !custIds.has(c[k]))
            add('party-missing', 'error', c.id, 'Hợp đồng ' + (c.no || c.id) + ': ' + k + ' không có trong danh mục khách hàng');
        });
      if (c.closedAt && c.reopenedAt)
        add('close-state', 'warn', c.id, 'Hợp đồng ' + (c.no || c.id) + ' vừa có ngày đóng vừa có ngày mở lại');
      if (att) {
        (c.contractFiles || [])
          .map(fid)
          .filter(Boolean)
          .forEach(
            (f) =>
              !att.has(f) &&
              add('attachment-missing', 'warn', c.id, 'Hợp đồng ' + (c.no || c.id) + ' tham chiếu tệp ' + f + ' không có trong kho tệp')
          );
        (c.details || []).forEach((x) =>
          [x.sourcePdfId, ...(x.certificateFiles || []).map(fid)]
            .filter(Boolean)
            .forEach(
              (f) =>
                !att.has(f) &&
                add('attachment-missing', 'warn', x.id, 'Chi tiết ' + x.id + ' tham chiếu tệp ' + f + ' không có trong kho tệp')
            )
        );
      }
      if (HAK.ContractModel && HAK.ContractModel.applyAddenda && (c.addenda || []).length) {
        const probe = JSON.parse(JSON.stringify(c));
        HAK.ContractModel.applyAddenda(probe);
        const x = c.contractQty == null ? null : Number(c.contractQty),
          y = probe.contractQty == null ? null : Number(probe.contractQty);
        if (x !== y)
          add(
            'addenda-qty-stale',
            'error',
            c.id,
            'Hợp đồng ' + (c.no || c.id) + ': KL hiện hành ' + x + ' không khớp tính lại từ phụ lục (' + y + ')'
          );
      }
    });
    const detById = new Map();
    contracts.forEach((c) => (c.details || []).forEach((x) => detById.set(x.id, { c, x })));
    customs.forEach((t) => {
      dupIn(t.supplements, 'dup-child-id', 'Khai bổ sung của ' + (t.no || t.id));
      dupIn(t.payments, 'dup-child-id', 'Khoản nộp của ' + (t.no || t.id));
      const sn = new Map();
      (t.supplements || [])
        .filter((x) => x && !x.deletedAt && x.no)
        .forEach((x) => sn.set(String(x.no).replace(/\D/g, ''), (sn.get(String(x.no).replace(/\D/g, '')) || 0) + 1));
      sn.forEach(
        (n, k) =>
          n > 1 &&
          add(
            'supplement-no-dup',
            'warn',
            t.id,
            'Tờ khai ' + t.no + ': số tờ khai bổ sung ' + k + ' xuất hiện ' + n + ' lần (nghi nhập hai lần)'
          )
      );
    });
    dupIn(customs, 'dup-decl-id', 'Tờ khai');
    const perDetail = new Map();
    customs
      .filter((t) => !t.deletedAt && t.detailId)
      .forEach((t) => {
        const hit = detById.get(t.detailId);
        if (hit && hit.x.deletedAt)
          add('decl-deleted-detail', 'warn', t.id, 'Tờ khai ' + t.no + ' gắn chi tiết đã ngừng dùng (giữ liên kết lịch sử)');
        perDetail.set(t.detailId, (perDetail.get(t.detailId) || 0) + 1);
      });
    perDetail.forEach(
      (n, id) =>
        n > 1 &&
        add(
          'decl-detail-shared',
          'warn',
          id,
          'Chi tiết hợp đồng có ' + n + ' tờ khai đang dùng (quy tắc hiện hành: mỗi chi tiết một tờ khai)'
        )
    );
    const seenNo = new Map();
    customs
      .filter((t) => !t.deletedAt)
      .forEach((t) => {
        const c = cById.get(t.contractId);
        if (t.contractId && !c) add('decl-orphan', 'error', t.id, 'Tờ khai ' + t.no + ' gắn hợp đồng không tồn tại (' + t.contractId + ')');
        else if (c && c.deletedAt)
          add('decl-deleted-contract', 'warn', t.id, 'Tờ khai ' + t.no + ' gắn hợp đồng đã ngừng dùng ' + (c.no || c.id));
        if (t.detailId && detOwner.get(t.detailId) !== t.contractId)
          add('decl-detail-fk', 'error', t.id, 'Tờ khai ' + t.no + ' gắn chi tiết không thuộc hợp đồng của nó');
        if (t.no) {
          if (seenNo.has(t.no)) add('dup-decl-no', 'error', t.id, 'Số tờ khai ' + t.no + ' bị trùng');
          seenNo.set(t.no, t.id);
        }
        const pays = (t.payments || []).filter((p) => !p.deletedAt),
          CMo = HAK.CustomsModel;
        if (CMo && CMo.samePayment)
          pays.forEach((p, i) => {
            if (pays.slice(0, i).some((q) => CMo.samePayment(q, p)))
              add('dup-payment', 'warn', p.id, 'Tờ khai ' + t.no + ': khoản nộp ' + (p.receiptNo || p.refNo || '?') + ' có vẻ nhập trùng');
          });
      });
    const companyIds = (c) =>
      [c.exporterId, c.principalId, c.buyerId, c.sellerId, c.customerId, c.deliverId, ...(c.details || []).map((x) => x.deliverId)]
        .map((id) => (d.customers || []).find((k) => k.id === id))
        .filter(Boolean)
        .map((k) => k.companyId)
        .filter(Boolean);
    (metas || []).forEach((m) => {
      if (m.contract && !detOwner.has(m.contract))
        add('archive-link', 'warn', m.id, 'Hồ sơ Lưu trữ "' + (m.title || m.id) + '" gắn chi tiết hợp đồng không còn trong Danh mục');
      else if (m.contract) {
        const hit = detById.get(m.contract);
        if (hit && (hit.x.deletedAt || hit.c.deletedAt))
          add(
            'archive-deleted-detail',
            'warn',
            m.id,
            'Hồ sơ Lưu trữ "' + (m.title || m.id) + '" gắn chi tiết / hợp đồng đã ngừng dùng (giữ liên kết lịch sử)'
          );
        const cos = hit ? companyIds(hit.c) : [];
        if (m.cid && cos.length && cos.indexOf(m.cid) < 0)
          add(
            'archive-cross-company',
            'warn',
            m.id,
            'Hồ sơ "' + (m.title || m.id) + '" thuộc công ty ' + m.cid + ' nhưng gắn hợp đồng của công ty ' + cos.join(', ')
          );
      }
    });
    return out;
  }
  /** Bảng số lượng cha–con thực tế (khóa định danh → khóa liên kết) để đối chiếu / báo cáo. */
  function relations(data, metas) {
    const d = data || {},
      cs = d.contracts || [],
      tk = d.customs || [],
      cnt = (list, f) => {
        const ns = list.map((x) => f(x).length);
        return { parents: list.length, children: ns.reduce((a, b) => a + b, 0), max: ns.length ? Math.max(...ns) : 0 };
      };
    return {
      customers: (d.customers || []).length,
      contracts: cs.length,
      contractsStopped: cs.filter((c) => c.deletedAt).length,
      details: cnt(cs, (c) => c.details || []),
      addenda: cnt(cs, (c) => c.addenda || []),
      declarations: tk.length,
      supplements: cnt(tk, (t) => t.supplements || []),
      payments: cnt(tk, (t) => t.payments || []),
      refunds: tk.reduce((a, t) => a + (t.payments || []).filter((p) => !p.deletedAt && p.kind === 'refund').length, 0),
      archiveMetas: (metas || []).length,
      archiveLinked: (metas || []).filter((m) => m.contract).length,
    };
  }
  HAK.Integrity = { audit, relations };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Integrity;
})(typeof window !== 'undefined' ? window : globalThis);
