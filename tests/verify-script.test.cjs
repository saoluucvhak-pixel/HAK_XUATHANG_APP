/* U-10: một lệnh `npm run verify` chạy đủ cổng cơ bản (check, format:check, lint, test, smoke); môi trường kiểm tra tái lập được:
 * package-lock.json khóa công cụ, pdfjs-dist (cho e2e:export-parity / accept:release) nằm ở devDependencies và có trong package-lock. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

test('có script verify và nó chạy đủ check, format:check, lint, test, smoke theo thứ tự rẻ → đắt, dừng ngay khi một bước lỗi', () => {
  const v = pkg.scripts.verify;
  assert.equal(typeof v, 'string', 'thiếu script verify');
  const steps = v.split('&&').map((s) => s.trim());
  assert.deepEqual(steps, ['npm run check', 'npm run format:check', 'npm run lint', 'npm test', 'npm run smoke']);
});
test('mọi bước của verify là script có thật trong package.json', () => {
  for (const s of pkg.scripts.verify.split('&&').map((x) => x.trim())) {
    const name = s === 'npm test' ? 'test' : s.replace(/^npm run /, '');
    assert.ok(pkg.scripts[name], 'script không tồn tại: ' + name);
  }
});
test('môi trường tái lập: pdfjs-dist ở devDependencies đúng phiên bản khóa trong package-lock; eslint / globals / prettier cũng có trong lock', () => {
  assert.ok(pkg.devDependencies['pdfjs-dist'], 'pdfjs-dist phải là devDependency');
  const locked = lock.packages['node_modules/pdfjs-dist'];
  assert.ok(locked, 'package-lock thiếu pdfjs-dist');
  assert.equal(locked.version, pkg.devDependencies['pdfjs-dist']);
  for (const n of ['eslint', 'globals', 'prettier']) assert.ok(lock.packages['node_modules/' + n], 'package-lock thiếu ' + n);
});
