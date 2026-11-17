/* Thứ tự nạp script: mỗi file chỉ đọc HAK.<Tên> ở mức nạp (đầu IIFE) khi tên đó đã được file nạp TRƯỚC gán. */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const APP = path.join(__dirname, '../app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script[^>]*\ssrc="(js\/[^"]+)"/g)].map((m) => m[1]);
const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const defined = (s) => new Set([...s.matchAll(/(?:^|[^\w.])(?:root\.)?HAK\.(\w+)\s*=[^=]/gm)].map((m) => m[1]));
// Đọc ở mức nạp: dòng thụt đúng 2 khoảng trắng (thân IIFE) dạng const/let/var ... = HAK.Tên
const loadReads = (s) => [...s.matchAll(/^ {2}(?:const|let|var)\s+[\w${}, :]+=\s*\(?HAK\.(\w+)\b/gm)].map((m) => m[1]);
test('index.html: mọi file js tồn tại, không nạp trùng', () => {
  assert.ok(order.length > 30);
  order.forEach((f) => assert.ok(fs.existsSync(path.join(APP, f)), 'thiếu ' + f));
  assert.equal(new Set(order).size, order.length, 'nạp trùng script');
});
test('mỗi file chỉ đọc HAK.<Tên> lúc nạp khi tên đã được gán bởi file nạp trước', () => {
  const seen = new Set(), bad = [];
  order.forEach((f) => {
    const s = src(f), own = defined(s);
    loadReads(s).forEach((n) => { if (!seen.has(n) && !own.has(n)) bad.push(f + ' đọc HAK.' + n + ' trước khi được gán'); });
    own.forEach((n) => seen.add(n));
  });
  assert.deepEqual(bad, []);
});
test('pages-modals.js nạp trước pages.js', () => {
  assert.ok(order.indexOf('js/pages-modals.js') >= 0 && order.indexOf('js/pages-modals.js') < order.indexOf('js/pages.js'));
});
