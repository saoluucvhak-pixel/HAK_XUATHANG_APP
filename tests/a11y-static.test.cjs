/* Trợ năng (UI-3/6/7, v2.25.12): kiểm tra tĩnh trên mã nguồn giao diện — Chromium thật được kiểm ở e2e / ui-audit. */
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8');
const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
test('nút menu di động có aria-expanded; Esc đóng menu', () => {
  assert.match(read('index.html'), /id="btnMenu"[^>]*aria-expanded="false"/);
  const m = read('js/main.js');
  assert.match(m, /setAttribute\('aria-expanded'/);
  assert.match(m, /e\.key === 'Escape' && \$\('#sidebar'\)\.classList\.contains\('open'\)/);
});
test('ô chọn có tên cho trình đọc màn hình (Chọn Sheet, Ánh xạ cột)', () => {
  assert.match(read('index.html'), /<label class="form-label" for="sheetSelect">/);
  assert.match(read('js/main.js'), /aria-label="Cột nguồn cho /);
});
test('chữ nhỏ của huy hiệu .zs / .hl-badge đạt tương phản ≥ 4,5:1 trên nền sáng (nền trắng + tint 14–18%)', () => {
  const css = read('css/style.css');
  const colorOf = (re) => (css.match(re) || [])[1];
  const ok = colorOf(/\.zone-tab \.zs\.ok \{[^}]*color: (#[0-9a-f]{6})/i),
    bad = colorOf(/\.zone-tab \.zs\.bad \{[^}]*color: (#[0-9a-f]{6})/i),
    warn = colorOf(/\.zone-tab \.zs\.warn \{[^}]*color: (#[0-9a-f]{6})/i);
  for (const [n, c] of [
    ['ok', ok],
    ['bad', bad],
    ['warn', warn],
  ]) {
    assert.ok(c, 'thiếu màu ' + n);
    // nền thực tế ≈ trắng pha 14–18% màu → dùng #f2f2f2 làm cận xấu
    assert.ok(ratio(c, '#f2f2f2') >= 4.5, n + ' ' + c + ' = ' + ratio(c, '#f2f2f2').toFixed(2));
  }
});
