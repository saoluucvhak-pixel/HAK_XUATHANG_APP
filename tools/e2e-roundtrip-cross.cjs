/* A5: sao lưu ở backend NÀY → khôi phục ở backend KIA (máy khác): đủ 4 hướng IndexedDB↔SQLite. Mỗi hướng: dựng dữ liệu + sao lưu ở nguồn (HAK_RT_EXPORT),
 * rồi trên máy trống ở đích khôi phục (thay thế), mở lại, khôi phục lặp + nhập bổ sung: hồ sơ (gồm nonPos), số dòng phiếu, danh mục, TripDetails trước = sau; không nhân đôi.
 * Chạy: node tools/e2e-roundtrip-cross.cjs  (cần Node 22 cho SQLite; dùng máy chủ tham chiếu tools/hakdb). */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-cross-'));
const run = (backend, env) => {
  const args = backend === 'sqlite' ? ['tools/e2e-sqlite.cjs', 'tools/e2e-roundtrip.cjs'] : ['tools/e2e-roundtrip.cjs'];
  const r = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, '..'),
    env: Object.assign({}, process.env, env),
    encoding: 'utf8',
    timeout: 280000,
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const fails = [];
for (const [from, to] of [
  ['idb', 'idb'],
  ['idb', 'sqlite'],
  ['sqlite', 'idb'],
  ['sqlite', 'sqlite'],
]) {
  const f = path.join(tmp, from + '.json');
  console.log('Sao lưu ở ' + from.toUpperCase() + ' → khôi phục ở ' + to.toUpperCase());
  const a = run(from, { HAK_RT_EXPORT: f });
  if (a.code !== 0 || !fs.existsSync(f)) {
    console.log('  ✗ không dựng được sao lưu ở ' + from + '\n' + a.out.split('\n').slice(-12).join('\n'));
    fails.push(from + '→' + to + ' (xuất)');
    continue;
  }
  const b = run(to, { HAK_RT_IMPORT: f });
  const bad = b.out.split('\n').filter((l) => /✗/.test(l));
  if (b.code !== 0 || bad.length) {
    console.log('  ✗ khôi phục ở ' + to + ' lỗi:\n' + (bad.length ? bad.join('\n') : b.out.split('\n').slice(-12).join('\n')));
    fails.push(from + '→' + to);
  } else console.log('  ✓ đạt (' + (b.out.match(/✓/g) || []).length + ' kiểm tra)');
}
if (fails.length) {
  console.error('\n✗ Lỗi: ' + fails.join(', '));
  process.exit(1);
}
console.log('\n✓ Đạt toàn bộ 4 hướng');
