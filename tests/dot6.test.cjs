const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');

test('L-27: Chống tràn ngang trên màn hình hẹp 390px (overflow-wrap: anywhere / word-break: break-word)', () => {
  const css = fs.readFileSync('app/css/style.css', 'utf8');
  assert.ok(css.includes('.sum-list { list-style: none; padding: 0; margin: 0; overflow-wrap: anywhere; word-break: break-word; }'));
  assert.ok(
    css.includes(
      '.sum-list li b { text-align: right; font-variant-numeric: tabular-nums; min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }'
    )
  );
  const backupJs = fs.readFileSync('app/js/backup.js', 'utf8');
  assert.ok(backupJs.includes('style="overflow-wrap:anywhere;word-break:break-word;"'));
});

test('L-29: Tinh chỉnh bố cục ở 1366×768 và 768px (tiêu đề, nhãn bước, topbar, toast)', () => {
  const themeCss = fs.readFileSync('app/css/hak-enterprise-theme.css', 'utf8');
  assert.ok(themeCss.includes('.topbar {background:var(--card-bg);backdrop-filter:none;min-height:54px;'));
  const a11yCss = fs.readFileSync('app/css/hak-accessibility.css', 'utf8');
  assert.ok(a11yCss.includes('.topbar #pageTitle { flex: 1 1 auto; min-width: 0; white-space: normal; line-height: 1.25; }'));
  const styleCss = fs.readFileSync('app/css/style.css', 'utf8');
  assert.ok(
    styleCss.includes(
      '.step { display: flex; gap: 12px; align-items: flex-start; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }'
    )
  );
  assert.ok(styleCss.includes('.toast-container { z-index: 3100; pointer-events: none; max-width: calc(100vw - 32px); }'));
});

test('N-15: Thống nhất mô hình Lưu/Hủy cho tab Google Sheet trong Cài đặt', () => {
  const gsyncJs = fs.readFileSync('app/js/gsync.js', 'utf8');
  assert.ok(gsyncJs.includes('data-gsa="save"'));
  assert.ok(gsyncJs.includes('data-gsa="cancel"'));
  assert.ok(gsyncJs.includes("act === 'save'"));
  assert.ok(gsyncJs.includes("act === 'cancel'"));
  // Không còn tự động saveCfg trên mỗi sự kiện input nữa
  assert.ok(
    !gsyncJs.includes("body.addEventListener('input', (e) => {\n      const tr = rowOf(e.target);\n      if (tr) upd(tr);\n    });")
  );
});

test('N-16: Giữ lại bản nháp đã gõ khi báo xung đột 2 tab trong settings.js', () => {
  const settingsJs = fs.readFileSync('app/js/settings.js', 'utf8');
  assert.ok(settingsJs.includes('hak.draft.general'));
  assert.ok(settingsJs.includes('Bản nháp được giữ lại trên form này'));
  assert.ok(settingsJs.includes('Xung đột: tab khác đã lưu. Bản nháp đã được giữ lại'));
});
