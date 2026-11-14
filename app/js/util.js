/**
 * util.js — hàm tiện ích dùng chung (v2.17.0), thay cho các bản sao giống hệt ở nhiều module. Nạp TRƯỚC các module khác (xem index.html).
 * Trong Node (kiểm thử) các module nạp qua require('./util.js') khi HAK.Util chưa có.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  /** Có phải số hữu hạn (không tính null / '' / undefined)? */
  const hasNum = (v) => v !== null && v !== undefined && v !== '' && isFinite(+v);
  /** 'yyyy-mm-dd…' → 'dd/mm/yyyy' ('' nếu không phải ngày ISO). */
  const vnDate = (iso) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  HAK.Util = { hasNum, vnDate };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Util;
})(typeof window !== 'undefined' ? window : globalThis);
