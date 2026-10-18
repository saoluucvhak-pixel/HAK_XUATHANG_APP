/**
 * version.js — số phiên bản app (một nguồn duy nhất cho giao diện).
 * Đổi cùng lúc với installer/setup.nsi (VERSION) — tests/version.test.cjs kiểm tra hai nơi khớp nhau.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  HAK.VERSION = '2.13.0';
  function paint() {
    if (!root.document) return;
    root.document.querySelectorAll('[data-hak-version]').forEach((el) => { el.textContent = 'v' + HAK.VERSION; });
  }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', paint); else paint();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = HAK.VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
