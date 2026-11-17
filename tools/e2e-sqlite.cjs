/* Chạy MỘT script e2e hiện có (e2e-flow, e2e-carrier, e2e-reports, e2e-customs, accept, smoke…) với backend SQLite:
 *   node tools/e2e-sqlite.cjs tools/e2e-reports.cjs [--keep]
 * Khởi động máy chủ HAKDB tham chiếu ở cổng 31879 (cổng của HAKDocs) trên thư mục dữ liệu tạm, ĐÃ KÍCH HOẠT SQLite, chặn native/hakdocs-token.js để trang dùng đúng mã bảo vệ,
 * rồi nạp script đích. Mọi trang trong script đều chạy trên SQLite (localStorage được nạp lại từ SQLite mỗi lần mở trang). Sau khi chạy xong in số bản ghi để đối chiếu.
 * Thoát với mã của script đích. HAK_DB_PORT đổi cổng (mặc định 31879 — app tìm HAKDocs ở cổng này). */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { createServer } = require('./hakdb/server.cjs');

const target = process.argv[2];
if (!target) {
  console.error('Dùng: node tools/e2e-sqlite.cjs <script e2e> [tham số…]');
  process.exit(2);
}
const TOKEN = require('node:crypto').randomBytes(16).toString('hex');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2e-sqlite-'));
const srv = createServer({ dataDir: dir, token: TOKEN });
srv.hakdb.setMeta('active_backend', 'sqlite');
const port = Number(process.env.HAK_DB_PORT || 31879);

// Chèn mã bảo vệ vào MỌI ngữ cảnh trình duyệt do script đích tạo (chặn tệp token trong thư mục app).
const origLoad = Module._load;
Module._load = function (request) {
  const m = origLoad.apply(this, arguments);
  if (request === 'playwright' && m.chromium && !m.chromium.__hakSqlite) {
    m.chromium.__hakSqlite = true;
    const launch = m.chromium.launch.bind(m.chromium);
    m.chromium.launch = async (...a) => {
      const b = await launch(...a);
      const newContext = b.newContext.bind(b);
      b.newContext = async (...x) => {
        const c = await newContext(...x);
        await c.route('**/native/hakdocs-token.js', (r) =>
          r.fulfill({ contentType: 'application/javascript', body: "window.HAK_DOCS_TOKEN='" + TOKEN + "';" })
        );
        return c;
      };
      return b;
    };
  }
  return m;
};

srv.listen(port, '127.0.0.1', () => {
  console.log('[e2e-sqlite] SQLite tham chiếu ' + 'http://127.0.0.1:' + port + ' · dữ liệu ' + dir);
  const t = path.resolve(target);
  process.argv = [process.argv[0], t].concat(process.argv.slice(3).filter((x) => x !== '--keep'));
  process.on('exit', (code) => {
    try {
      const c = srv.hakdb.counts();
      console.log(
        '[e2e-sqlite] bản ghi trong SQLite: ' +
          Object.entries(c)
            .filter(([, n]) => n)
            .map(([k, n]) => k + '=' + n)
            .join(' ') +
          ' · mã thoát ' +
          code
      );
      const chk = srv.hakdb.check();
      console.log('[e2e-sqlite] kiểm tra toàn vẹn: ' + (chk.ok ? 'đạt' : 'LỖI ' + JSON.stringify(chk)));
      if (!chk.ok) process.exitCode = 1;
    } catch (e) {
      /* đã đóng */
    }
  });
  require(t);
});
srv.on('error', (e) => {
  console.error('[e2e-sqlite] không mở được cổng ' + port + ': ' + e.message);
  process.exit(2);
});
