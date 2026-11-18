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

test('bộ cài NSIS loại đúng các file khôi phục / cấu hình dev như bản portable (không đóng .hakquality.json vào bộ cài)', () => {
  const nsi = fs.readFileSync(path.resolve('installer/setup.nsi'), 'utf8'),
    line = nsi.split(/\r?\n/).find((l) => /File \/r/.test(l)) || '';
  for (const pat of ['MoKhoa_1Lan*.html', 'XoaSach_DuLieu*.html', '.hakquality.json'])
    assert.ok(line.includes('/x "' + pat + '"'), 'setup.nsi phải loại ' + pat + ' — dòng: ' + line);
});

test('workflow bộ cài không ghi đè Release đã đăng cùng số phiên bản (file cài / SHA-256 / ghi chú không đổi sau khi công bố)', () => {
  const y = fs.readFileSync(path.resolve('.github/workflows/build-setup.yml'), 'utf8');
  assert.match(y, /gh release view "v\$env:VERSION"/, 'phải kiểm tra Release đã tồn tại');
  const publish = y.slice(y.indexOf('- name: Publish release'));
  assert.match(publish, /if: steps\.rel\.outputs\.EXISTS != 'true'/, 'bước đăng Release chỉ chạy khi chưa có Release cùng phiên bản');
});

test('bộ cài chỉ dừng HAKDocs của thư mục cài (không dừng theo tên tiến trình làm ảnh hưởng bản cài / portable khác)', () => {
  const nsi = fs.readFileSync(path.resolve('installer/setup.nsi'), 'utf8'),
    ps = fs.readFileSync(path.resolve('installer/stop-hakdocs.ps1'), 'utf8');
  assert.ok(!/taskkill[^\n]*\/IM\s+HAKDocs/i.test(nsi.replace(/^;.*$/gm, '')), 'không được taskkill theo tên HAKDocs.exe');
  assert.match(nsi, /StopHakDocs "\$PLUGINSDIR\\stop-hakdocs\.ps1"/, 'cài / nâng cấp dùng stop-hakdocs.ps1');
  assert.match(nsi, /StopHakDocs "\$INSTDIR\\stop-hakdocs\.ps1"/, 'gỡ cài đặt dùng bản sao trong thư mục cài');
  assert.match(
    ps,
    /StartsWith\(\$native, \[System\.StringComparison\]::OrdinalIgnoreCase\)/,
    'lọc theo đường dẫn, không phân biệt hoa thường'
  );
  assert.ok(ps.includes("TrimEnd('\\') + '\\'"), 'có dấu \\ cuối để hak-a không khớp hak-a2');
  assert.ok(!/Get-Process[^\n]*\|\s*Stop-Process/.test(ps), 'phải lọc theo đường dẫn trước khi dừng');
});

test('bộ cài không bao giờ xóa dữ liệu SQLite: thư mục dữ liệu nằm ngoài thư mục cài và lời nhắn khi gỡ nêu đường dẫn', () => {
  const nsi = fs.readFileSync(path.join(__dirname, '..', 'installer', 'setup.nsi'), 'utf8');
  const code = nsi
    .split('\n')
    .filter((l) => !/^\s*;/.test(l))
    .join('\n');
  assert.ok(
    !/HAK_XUATHANG/i.test(code.replace(/MessageBox[^\n]*/g, '')),
    'không lệnh nào (Delete / RMDir) đụng thư mục dữ liệu HAK_XUATHANG'
  );
  assert.ok(/InstallDir "\$LOCALAPPDATA\\HAK\\QuanLyXuatHang"/.test(nsi), 'thư mục cài khác thư mục dữ liệu');
  assert.ok(/MessageBox[^\n]*HAK_XUATHANG\\data/.test(nsi), 'lời nhắn khi gỡ nêu nơi giữ dữ liệu');
  assert.ok(/IfSilent \+2/.test(nsi), 'gỡ im lặng không hiện hộp thoại');
  assert.ok(!/RMDir \/r "\$INSTDIR"/.test(nsi), 'không xóa cả thư mục cài theo kiểu đệ quy (chỉ xóa từng thư mục con của app)');
  const hdocs = fs.readFileSync(path.join(__dirname, '..', 'installer', 'native', 'HAKDocs.cs'), 'utf8');
  assert.ok(
    /HAK_XUATHANG[\s\S]{0,40}data/.test(hdocs) || /\"HAK_XUATHANG\",\"data\"/.test(hdocs),
    'HAKDocs đặt cơ sở dữ liệu trong %LOCALAPPDATA%\\HAK_XUATHANG\\data'
  );
});
