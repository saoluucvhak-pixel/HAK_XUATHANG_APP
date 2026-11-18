/* A1 — khóa hak.* PHẢI đi qua HAK.Store (hoặc adapter ghi kv): ghi thẳng localStorage không vào bảng kv của SQLite, nên
 * HAK.Storage.hydrate() xóa khi mở app (mất bộ lọc đã lưu, Năm làm việc, giao diện). Test tĩnh cấm mọi lệnh ghi/xóa localStorage
 * ngoài config.js (HAK.Store) và storage.js (nạp lại từ kv) — trừ ngoại lệ có lý do bên dưới. */
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const DIR = path.join(__dirname, '../app/js');
const ALLOWED_FILES = new Set(['config.js', 'storage.js']);
// ngoại lệ: [tệp, mẫu, lý do]
const EXCEPTIONS = [
  ['hak-filters.js', /root\.localStorage\.getItem/, 'adapter presetStorage chỉ ĐỌC nguyên văn (ghi qua HAK.Store)'],
  [
    'catalog.js',
    /root\.localStorage\.setItem\(backupKey/,
    'nhánh dự phòng khi KHÔNG có IndexedDB/SQLite (HAK.DB không dùng được); kiểm tra quota nguyên văn (test catalog-parent-child)',
  ],
  [
    'pages.js',
    /root\.localStorage\.setItem\(ZONE_KEY/,
    "khóa 'hakui.zone' KHÔNG mang tiền tố hak. — tiện lợi giao diện trên máy này, không phải dữ liệu nghiệp vụ",
  ],
];
const WRITE = /localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/g;
test('không có lệnh ghi/xóa localStorage ngoài config.js / storage.js (trừ ngoại lệ có lý do)', () => {
  const bad = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js') && !ALLOWED_FILES.has(x))) {
    const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
      WRITE.lastIndex = 0;
      if (!WRITE.test(ln)) return;
      if (EXCEPTIONS.some(([file, re]) => file === f && re.test(ln))) return;
      bad.push(f + ':' + (i + 1) + ' ' + ln.trim());
    });
  }
  assert.deepEqual(bad, [], 'Ghi thẳng localStorage: dùng HAK.Store.set / remove');
});
test('mọi ngoại lệ vẫn còn đúng chỗ (không để danh sách ngoại lệ lỗi thời)', () => {
  for (const [f, re] of EXCEPTIONS) assert.match(fs.readFileSync(path.join(DIR, f), 'utf8'), re, f);
});
test('bộ lọc đã lưu, Năm làm việc, giao diện ghi qua HAK.Store', () => {
  assert.match(fs.readFileSync(path.join(DIR, 'hak-filters.js'), 'utf8'), /HAK\.Store\.set\(k, val\)/);
  assert.match(fs.readFileSync(path.join(DIR, 'yearbook.js'), 'utf8'), /Store\.set\('hak\.workingYear'/);
  assert.match(fs.readFileSync(path.join(DIR, 'hak-theme.js'), 'utf8'), /Store\.set\('hak\.design\.theme'/);
});
