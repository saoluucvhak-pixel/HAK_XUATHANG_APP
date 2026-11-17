const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
test('release excludes recovery/reset tools but preserves runtime assets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-release-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'app/js'), { recursive: true });
    for (const f of ['index.html', 'MoKhoa_1Lan_1.html', 'XoaSach_DuLieu_HAK.html', 'js/main.js'])
      fs.writeFileSync(path.join(dir, 'app', f), 'test');
    execFileSync(process.execPath, [path.resolve('tools/build-release.cjs')], { cwd: dir });
    assert.ok(fs.existsSync(path.join(dir, 'dist/app/index.html')));
    assert.ok(fs.existsSync(path.join(dir, 'dist/app/js/main.js')));
    assert.ok(!fs.existsSync(path.join(dir, 'dist/app/MoKhoa_1Lan_1.html')));
    assert.ok(!fs.existsSync(path.join(dir, 'dist/app/XoaSach_DuLieu_HAK.html')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
