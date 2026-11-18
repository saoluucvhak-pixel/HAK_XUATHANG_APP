(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {}),
    allowed = ['luxe', 'classic', 'neutral', 'champagne'];
  function set(name) {
    if (!allowed.includes(name)) return;
    document.documentElement.dataset.hakTheme = name;
    try {
      if (HAK.Store) HAK.Store.set('hak.design.theme', name); // qua HAK.Store: vào kv của SQLite / IndexedDB (không bị hydrate xóa)
    } catch (e) {}
    const select = document.getElementById('hakDesignTheme');
    if (select) select.value = name;
  }
  function init() {
    const select = document.getElementById('hakDesignTheme');
    if (select) {
      select.value = document.documentElement.dataset.hakTheme || 'luxe';
      select.addEventListener('change', (e) => set(e.target.value));
    }
  }
  HAK.Theme = { set, init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
