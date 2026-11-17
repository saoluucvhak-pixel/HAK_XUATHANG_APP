const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const version = require('../app/js/version.js');
test('app version matches the installer and is shown in the sidebar', () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.match(fs.readFileSync('installer/setup.nsi', 'utf8'), new RegExp('!define VERSION "' + version.replace(/\./g, '\\.') + '"'));
  const html = fs.readFileSync('app/index.html', 'utf8');
  assert.ok(html.includes('data-hak-version'));
  assert.ok(html.indexOf('js/version.js') < html.indexOf('js/db.js'));
});
