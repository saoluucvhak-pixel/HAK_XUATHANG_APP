if (require('./helpers/needs-sqlite.cjs')()) return;
// BK-1: xoay vòng SQLite xóa chính bản vừa ghi khi có bản cũ mang mtime ở tương lai (đồng hồ chỉnh lùi / sao chép từ máy khác)
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  http = require('node:http');
const { createServer } = require(require('node:path').join(__dirname, '..', 'tools/hakdb/server.cjs'));
test('xoay vòng không được xóa bản vừa ghi', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-d-')),
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-b-'));
  const TOKEN = 'a'.repeat(32);
  const srv = createServer({ dataDir: data, token: TOKEN });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  const call = (p, body, h) =>
    new Promise((ok, no) => {
      const d = Buffer.from(JSON.stringify(body || {}));
      const r = http.request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: p,
          headers: Object.assign(
            { Origin: 'null', 'X-HAK-Client': 'documents-v1', 'X-HAK-Token': TOKEN, 'Content-Length': d.length },
            h || {}
          ),
        },
        (rs) => {
          const c = [];
          rs.on('data', (x) => c.push(x));
          rs.on('end', () => ok({ status: rs.statusCode, body: JSON.parse(Buffer.concat(c).toString() || 'null') }));
        }
      );
      r.on('error', no);
      r.write(d);
      r.end();
    });
  const s = (await call('/db/session', { scope: null, user: 't' })).body.session;
  const old = path.join(dir, 'HAK_SQLite_20260101-000000.db');
  fs.writeFileSync(old, 'x');
  const fut = new Date(Date.now() + 30 * 864e5);
  fs.utimesSync(old, fut, fut); // đồng hồ máy từng chạy lệch +30 ngày
  const r = await call('/db/backup', { dir, keep: 1 }, { 'X-HAK-Session': s });
  console.log('status', r.status, 'path', r.body.path, 'removed', r.body.removed, 'còn lại', fs.readdirSync(dir));
  assert.ok(fs.existsSync(r.body.path), 'bản vừa ghi phải còn tồn tại');
  srv.closeAllConnections && srv.closeAllConnections();
  srv.close();
});
