const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/excel.js');
const N = require('../app/js/numfmt.js');
test('formatting then parsing returns the same number (no 1000x mistakes)', () => {
  for (const n of [0, 6500, 13010.81, 54.123, 0.123, 0.48, 1250000, 1250000.5, -6500, -0.123, 25400, 1234.5, 999, 1000, 12.345, 0.5])
    assert.equal(N.parse(N.txt(n, 'num'), 'num'), n, 'num ' + n);
  for (const n of [0.48, 49.981, 49.9818, 0.5, 12.5, 0.123]) assert.equal(N.parse(N.txt(n, 'dec'), 'dec'), n, 'dec ' + n);
});
test('display uses dot for thousands and comma for decimals', () => {
  assert.equal(N.txt(13010.81, 'num'), '13.010,81');
  assert.equal(N.txt(6500, 'num'), '6.500');
  assert.equal(N.txt(1250000, 'num'), '1.250.000');
  assert.equal(N.txt(54.123, 'num'), '54,1230', '3 decimals get a trailing 0 so 54,123 is not read as 54123');
  assert.equal(N.txt(0.123, 'num'), '0,123');
  assert.equal(N.txt('', ''), '');
  assert.equal(N.txt(null, 'num'), '');
  assert.equal(N.txt(NaN, 'num'), '');
});
test('"dec" mode treats a single , or . as the decimal separator (moisture, dry factor)', () => {
  assert.equal(N.parse('49,981', 'dec'), 49.981);
  assert.equal(N.parse('49.981', 'dec'), 49.981);
  assert.equal(N.parse('0,48', 'dec'), 0.48);
  assert.equal(N.parse('49,981', 'num'), 49981, 'num mode keeps the thousands reading for kg / money');
  assert.equal(N.parse('abc', 'dec'), null);
  assert.equal(N.parse('', 'num'), null);
});
