/**
 * audit.js — HAK.Audit: nhật ký thao tác (người thực hiện, thời điểm, thao tác, thực thể, trường, giá trị trước / sau, lý do). Chỉ thêm, không sửa / xóa.
 *   SQLite  : bảng audit_log (trigger chặn sửa / xóa); Danh mục tự ghi trong db-sqlite.js cùng giao dịch với lần lưu.
 *   IndexedDB / portable: khóa cấu hình hak.auditlog.v1 (mảng, giữ tối đa MAX dòng mới nhất) → đi theo sao lưu và được di trú sang SQLite như mọi khóa hak.*.
 *   log(e)  → ghi một dòng (không bao giờ ném lỗi ra ngoài thao tác chính: lỗi ghi nhật ký chỉ cảnh báo)
 *   list(o) → các dòng gần nhất (cả hai nguồn, mới → cũ); o.entity, o.id, o.limit
 * Cờ dùng chung: HAK.Audit.suppress (nhập hàng loạt như di trú không ghi từng dòng), HAK.Audit.reason (lý do đang áp dụng cho thao tác kế tiếp).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.auditlog.v1',
    MAX = 5000;
  const A = (HAK.Audit = HAK.Audit || {});
  const who = () => (HAK.Auth && HAK.Auth.who && HAK.Auth.who()) || '';
  const sqlite = () => HAK.Storage && HAK.Storage.mode === 'sqlite';
  const norm = (e) => ({
    at: e.at || Date.now(),
    actor: e.actor !== undefined ? e.actor : who() || null,
    company_id: e.company || e.company_id || null,
    action: String(e.action || ''),
    entity: e.entity || null,
    entity_id: e.id == null ? (e.entity_id == null ? null : String(e.entity_id)) : String(e.id),
    field: e.field || null,
    before: e.before == null ? null : String(e.before),
    after: e.after == null ? null : String(e.after),
    reason: e.reason || A.reason || null,
  });
  A.log = async function (e) {
    if (A.suppress) return false;
    const row = norm(e);
    if (!row.action) return false;
    try {
      if (sqlite()) {
        await HAK.Storage.call('/db/tx', { ops: [{ op: 'append', table: 'audit_log', row }] });
      } else {
        const list = HAK.Store.get(KEY, []) || [];
        list.push(row);
        HAK.Store.set(KEY, list.length > MAX ? list.slice(list.length - MAX) : list);
      }
      return true;
    } catch (err) {
      console.warn('Không ghi được nhật ký thao tác:', err);
      return false;
    }
  };
  A.list = async function (o) {
    o = o || {};
    const limit = o.limit || 200;
    let rows = (HAK.Store && HAK.Store.get(KEY, [])) || []; // nhật ký ghi ở chế độ trình duyệt (cũng nằm trong SQLite sau di trú vì là khóa kv)
    if (sqlite()) {
      const where = {};
      if (o.entity) where.entity = o.entity;
      if (o.id) where.entity_id = o.id;
      const r = await HAK.Storage.call('/db/query', { table: 'audit_log', where, order: [['seq', 'desc']], limit });
      rows = rows.concat(r.rows);
    }
    return rows
      .filter((x) => (!o.entity || x.entity === o.entity) && (!o.id || x.entity_id === o.id))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  };
  A.KEY = KEY;
  if (typeof module === 'object' && module.exports) module.exports = A;
})(typeof window !== 'undefined' ? window : globalThis);
