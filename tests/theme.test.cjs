const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs');
test('design theme changes preserve business data and the independent light/dark skin', () => {
  const store = { 'hak.catalog.v1': 'synthetic contracts', 'hak.auth.v1': 'synthetic accounts', 'hak.theme': '"dark"' };
  const before = { ...store };
  const doc = { documentElement: { dataset: { hakTheme: 'luxe', bsTheme: 'dark' } }, getElementById: () => null, readyState: 'complete' };
  const win = {};
  vm.runInNewContext(fs.readFileSync('app/js/hak-theme.js', 'utf8'), {
    window: win,
    document: doc,
    localStorage: {
      setItem: (k, v) => {
        store[k] = v;
      },
    },
  });
  for (const theme of ['luxe', 'classic', 'neutral', 'champagne']) {
    win.HAK.Theme.set(theme);
    assert.equal(doc.documentElement.dataset.hakTheme, theme);
    assert.equal(doc.documentElement.dataset.bsTheme, 'dark');
    for (const k of Object.keys(before)) assert.equal(store[k], before[k]);
  }
  win.HAK.Theme.set('unknown');
  assert.equal(doc.documentElement.dataset.hakTheme, 'champagne');
});
