/**
 * backup-month.js — chọn dữ liệu cho BẢN SAO LƯU THEO THÁNG (quy tắc 33–35). Hàm thuần (không đụng DB / DOM): nhận kết quả của HAK.Backup.collect()
 * (cùng mã sao lưu toàn bộ — KHÔNG có bộ sao lưu thứ hai) rồi lọc ra phần thuộc một tháng:
 *   · hồ sơ Lưu trữ có NGÀY CÂN ĐẦU TIÊN (meta.from) trong tháng — hồ sơ kéo dài 2 tháng thuộc tháng đầu;
 *   · chứng từ đã lập (nhật ký Issued) có ngày đầu trong tháng;
 *   · đợt Excel mà các hồ sơ / chứng từ đó dùng (theo tên file);
 *   · hợp đồng + chi tiết + phụ lục, tờ khai, khách hàng mà các hồ sơ đó gắn tới (kèm tệp đính kèm của chúng).
 * Khôi phục bản tháng CHỈ nhập bổ sung (backup.js ép mode 'merge').
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const CAT = 'hak.catalog.v1';
  /** "05/02/2026" → "2026-02"; không đọc được → "". */
  function monthKey(dmy) {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(dmy || ''));
    if (!m || +m[2] < 1 || +m[2] > 12) return '';
    return m[3] + '-' + String(+m[2]).padStart(2, '0');
  }
  /** Mọi mã tệp trong các mảng tên kết thúc bằng "Files" (contractFiles, certificateFiles…) của một đối tượng. */
  function fileIds(obj, out) {
    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) {
      obj.forEach((x) => fileIds(x, out));
      return out;
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (/Files$/.test(k) && Array.isArray(v)) v.forEach((x) => typeof x === 'string' && out.add(x));
      else if (v && typeof v === 'object') fileIds(v, out);
    }
    return out;
  }
  /** Các tháng có dữ liệu (hồ sơ hoặc chứng từ) → [{month:'2026-02', archive:n, issued:n}] mới → cũ, kèm số hồ sơ không có ngày cân. */
  function months(coll) {
    const by = new Map();
    let undated = 0;
    const bump = (ym, k) => {
      if (!by.has(ym)) by.set(ym, { month: ym, archive: 0, issued: 0 });
      by.get(ym)[k]++;
    };
    (coll.items || []).forEach((it) => {
      const ym = monthKey(it.meta && it.meta.from);
      if (ym) bump(ym, 'archive');
      else undated++;
    });
    (coll.issued || []).forEach((r) => {
      const ym = monthKey(r && r.from);
      if (ym) bump(ym, 'issued');
    });
    return { list: Array.from(by.values()).sort((a, b) => (a.month < b.month ? 1 : -1)), undated };
  }
  /**
   * Lọc coll theo tháng ym ("2026-02").
   * deps.decode(data) → { params, rows } (HAK.Archive.decode) để biết hồ sơ dùng đợt Excel nào. Trả về coll cùng hình dạng + scope.
   */
  async function select(coll, ym, deps) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym))) throw new Error('Tháng không hợp lệ (cần dạng 2026-02).');
    const decode = (deps && deps.decode) || (async () => null);
    const items = (coll.items || []).filter((it) => monthKey(it.meta && it.meta.from) === ym);
    const issued = (coll.issued || []).filter((r) => monthKey(r && r.from) === ym);
    // đợt Excel mà hồ sơ / chứng từ của tháng dùng
    const names = new Set();
    issued.forEach((r) => r && r.batch && names.add(String(r.batch)));
    const detailIds = new Set();
    for (const it of items) {
      if (it.meta && it.meta.contract) detailIds.add(String(it.meta.contract));
      try {
        const d = await decode(it.data);
        const p = (d && d.params) || {};
        ((p.filter && p.filter.files) || []).forEach((n) => names.add(String(n)));
        if (p.contractId) detailIds.add(String(p.contractId));
      } catch (e) {
        /* hồ sơ không giải nén được: bỏ qua phần đợt Excel của hồ sơ này */
      }
    }
    const batches = (coll.batches || []).filter((b) => b && b.meta && names.has(String(b.meta.fileName)));
    // danh mục: chỉ phần hợp đồng / tờ khai / khách hàng mà hồ sơ của tháng gắn tới
    const keys = {};
    const src = (coll.keys || {})[CAT];
    const attach = new Set();
    let linked = { contracts: 0, customs: 0, customers: 0 };
    if (src && Array.isArray(src.contracts)) {
      const contracts = src.contracts.filter(
        (c) => c && ((c.details || []).some((d) => detailIds.has(String(d.id))) || detailIds.has(String(c.id)))
      );
      const cids = new Set(contracts.map((c) => c.id));
      const customs = (src.customs || []).filter((x) => x && cids.has(x.contractId));
      const custIds = new Set();
      const collectCust = (o) => {
        Object.keys(o || {}).forEach((k) => {
          if (/Id$/.test(k) && typeof o[k] === 'string') custIds.add(o[k]);
        });
      };
      contracts.forEach(collectCust);
      customs.forEach(collectCust);
      const customers = (src.customers || []).filter((c) => c && custIds.has(c.id));
      fileIds(contracts, attach);
      fileIds(customs, attach);
      keys[CAT] = Object.assign({}, src, { contracts, customs, customers });
      linked = { contracts: contracts.length, customs: customs.length, customers: customers.length };
    }
    const attachments = (coll.attachments || []).filter((a) => a && attach.has(a.id));
    return {
      yearbook: null,
      keys,
      items,
      batches,
      issued,
      attachments,
      bklsTemplates: [],
      scope: {
        kind: 'month',
        month: ym,
        basis: 'ngày cân đầu tiên của hồ sơ',
        counts: { archive: items.length, batches: batches.length, issued: issued.length, attachments: attachments.length, ...linked },
      },
    };
  }
  HAK.BackupMonth = { monthKey, months, select, fileIds };
  if (typeof module === 'object' && module.exports) module.exports = HAK.BackupMonth;
})(typeof window !== 'undefined' ? window : globalThis);
