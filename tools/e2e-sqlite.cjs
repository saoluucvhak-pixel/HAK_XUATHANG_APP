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
const EXTERNAL = !!process.env.HAK_DB_EXTERNAL_TOKEN; // máy chủ ngoài (HAKDocs.exe thật, đã kích hoạt SQLite): không tự dựng máy chủ tham chiếu
const TOKEN = EXTERNAL ? process.env.HAK_DB_EXTERNAL_TOKEN : require('node:crypto').randomBytes(16).toString('hex');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-e2e-sqlite-'));
process.env.HAK_E2E_DATA_DIR = EXTERNAL && process.env.HAK_DATA_DIR ? process.env.HAK_DATA_DIR : dir;
const srv = EXTERNAL ? null : createServer({ dataDir: dir, token: TOKEN });
if (srv) srv.hakdb.setMeta('active_backend', 'sqlite');
const port = Number(process.env.HAK_DB_PORT || 31879);

// Xóa mọi dữ liệu nghiệp vụ (giữ meta, nhật ký chỉ-thêm).
const CLEAR_ORDER = [
  'customs_payments',
  'customs_supplements',
  'customs_decls',
  'contract_addenda',
  'contract_details',
  'contracts',
  'customers',
  'archive_tickets',
  'archive_data',
  'archive_records',
  'batch_files',
  'batches',
  'issued',
  'attachments',
  'bkls_templates',
  'record_versions',
  'kv',
];
async function resetData() {
  if (!EXTERNAL) {
    const db = srv.hakdb.db,
      keep = new Set(['meta', 'audit_log', 'sqlite_sequence']);
    db.exec('PRAGMA foreign_keys=OFF');
    for (const t of srv.hakdb.tables.keys()) if (!keep.has(t)) db.exec('DELETE FROM ' + t);
    db.exec('PRAGMA foreign_keys=ON');
    return;
  }
  const base = process.env.HAK_DB_URL || 'http://127.0.0.1:' + Number(process.env.HAK_DB_PORT || 31879);
  const h = { 'Content-Type': 'application/json', 'X-HAK-Client': 'documents-v1', 'X-HAK-Token': TOKEN };
  const s = await (
    await fetch(base + '/db/session', { method: 'POST', headers: h, body: JSON.stringify({ scope: null, user: 'e2e-reset' }) })
  ).json();
  const r = await fetch(base + '/db/tx', {
    method: 'POST',
    headers: Object.assign({ 'X-HAK-Session': s.session }, h),
    body: JSON.stringify({ ops: CLEAR_ORDER.map((table) => ({ op: 'clear', table, confirm: true })) }),
  });
  if (!r.ok) throw new Error('Không xóa được dữ liệu thử: ' + (await r.text()));
}

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
        await resetData(); // ngữ cảnh trình duyệt mới = hồ sơ trống: dữ liệu SQLite cũng phải trống (như IndexedDB của hồ sơ mới)
        const c = await newContext(...x);
        await c.addInitScript(
          (url) => {
            window.HAK_DB_URL = url;
          },
          process.env.HAK_DB_URL || 'http://127.0.0.1:' + port
        );
        await c.route('**/native/hakdocs-token.js', (r) =>
          r.fulfill({ contentType: 'application/javascript', body: "window.HAK_DOCS_TOKEN='" + TOKEN + "';" })
        );
        // Chẩn đoán khi lỗi: lỗi console, yêu cầu /db/ bị từ chối hoặc chậm > 3 giây (để biết lỗi nằm ở máy chủ hay ở trang).
        // HAKDocs thật mở hộp Lưu của Windows cho /save-download (không ai bấm trên CI → treo). Bộ thử trả lỗi để app tự rơi về tải qua trình duyệt
        // (đường dự phòng có sẵn của word.js). Hộp Lưu thật chỉ kiểm bằng tay (docs/NGHIEM_THU_SQLITE.md).
        await c.route('**/save-download', (r) =>
          r.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
            body: JSON.stringify({ error: 'bộ thử tự động không mở hộp Lưu của Windows' }),
          })
        );
        c.on('page', (pg) => {
          pg.on('console', (m) => {
            if (m.type() === 'error' || m.type() === 'warning')
              console.log('[e2e-sqlite] console.' + m.type() + ': ' + m.text().slice(0, 300));
          });
          pg.on('pageerror', (e) => console.log('[e2e-sqlite] pageerror: ' + String(e.message).slice(0, 300)));
          pg.on('requestfailed', (r) =>
            console.log('[e2e-sqlite] request lỗi: ' + r.method() + ' ' + r.url().slice(0, 120) + ' ' + (r.failure() || {}).errorText)
          );
          pg.on('requestfinished', (r) => {
            if (!/\/db\//.test(r.url())) return;
            stats.n++;
            const t = r.timing(),
              ms = t.responseEnd >= 0 ? Math.round(t.responseEnd) : 0;
            stats.ms += ms;
            if (ms > 1500) console.log('[e2e-sqlite] chậm ' + ms + ' ms: ' + r.url().replace(/^.*\/db\//, '/db/'));
          });
          pg.on('response', async (r) => {
            if (!/\/db\//.test(r.url())) return;
            if (r.status() >= 400) {
              let b = '';
              try {
                b = (await r.text()).slice(0, 300);
              } catch (e) {
                /* đã đóng */
              }
              console.log('[e2e-sqlite] ' + r.status() + ' ' + r.request().method() + ' ' + r.url().replace(/^.*\/db\//, '/db/') + ' ' + b);
            }
          });
        });
        return c;
      };
      return b;
    };
  }
  return m;
};

const stats = { n: 0, ms: 0 };
function runTarget() {
  const t = path.resolve(target);
  process.argv = [process.argv[0], t].concat(process.argv.slice(3).filter((x) => x !== '--keep'));
  process.on('exit', (code) => {
    console.log('[e2e-sqlite] yêu cầu /db/: ' + stats.n + ', tổng thời gian ' + stats.ms + ' ms');
    if (!srv) return console.log('[e2e-sqlite] (máy chủ ngoài) mã thoát ' + code);
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
}
if (EXTERNAL) {
  console.log('[e2e-sqlite] dùng máy chủ ngoài (HAKDocs) — cổng ' + port);
  runTarget();
} else {
  srv.listen(port, '127.0.0.1', () => {
    srv.unref(); // không giữ tiến trình sống sau khi script đích xong
    console.log('[e2e-sqlite] SQLite tham chiếu http://127.0.0.1:' + port + ' · dữ liệu ' + dir);
    runTarget();
  });
  srv.on('error', (e) => {
    console.error('[e2e-sqlite] không mở được cổng ' + port + ': ' + e.message);
    process.exit(2);
  });
}
