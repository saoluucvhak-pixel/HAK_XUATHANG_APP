/* Máy chủ HTTP tham chiếu của HAKDB: CÙNG hợp đồng với HAKDocs (C#) để kiểm thử app (Chromium Linux) và dùng làm chuẩn đối chiếu.
 *   node tools/hakdb/server.cjs --data-dir <thư mục> [--port 31880] [--token <32 hex>]
 * Bảo mật (giống HAKDocs): chỉ lắng nghe 127.0.0.1; Origin phải là "null" (trang file://) hoặc không có; bắt buộc X-HAK-Client: documents-v1 và X-HAK-Token;
 * giới hạn thân yêu cầu 36 MB; phiên (X-HAK-Session) mang phạm vi công ty do máy chủ giữ — client không tự gửi phạm vi cho từng yêu cầu;
 * tệp sao lưu chỉ ghi trong <data-dir>/backups với tên đã lọc; KHÔNG ghi token / nội dung yêu cầu vào log.
 * Điểm cuối: GET /db/status · POST /db/session · /db/session/close · /db/tx · /db/query · /db/backup · /db/check */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { HakDb, HakDbError } = require('./engine.cjs');

const MAX_BODY = 36 * 1024 * 1024;
const SESSION_TTL = 8 * 3600 * 1000;
const STATUS = { 'bad-request': 400, scope: 403, conflict: 409, fk: 409, unique: 409, io: 500 };

function createServer(opt) {
  const dataDir = path.resolve(opt.dataDir);
  const token = opt.token || crypto.randomBytes(16).toString('hex');
  const dbFile = path.join(dataDir, 'hak.db');
  const db = HakDb.open(dbFile);
  const sessions = new Map();
  const log = opt.log || (() => {});
  const tokenOk = (given) => {
    const a = Buffer.from(String(given || '')),
      b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const reply = (res, code, obj, cors) => {
    const body = Buffer.from(JSON.stringify(obj));
    res.writeHead(
      code,
      Object.assign(
        { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length },
        cors
          ? {
              'Access-Control-Allow-Origin': 'null',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, X-HAK-Client, X-HAK-Token, X-HAK-Session',
              'Access-Control-Allow-Private-Network': 'true',
            }
          : {}
      )
    );
    res.end(body);
  };
  const readBody = (req) =>
    new Promise((ok, no) => {
      const len = Number(req.headers['content-length']);
      if (!Number.isFinite(len) || len < 1 || len > MAX_BODY) {
        req.resume();
        return no(new HakDbError('too-large', 'Yêu cầu quá lớn (giới hạn 36 MB)'));
      }
      const chunks = [];
      let n = 0;
      req.on('data', (c) => {
        n += c.length;
        if (n > MAX_BODY) {
          req.destroy();
          no(new HakDbError('too-large', 'Yêu cầu quá lớn'));
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          ok(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          no(new HakDbError('bad-request', 'JSON không hợp lệ'));
        }
      });
      req.on('error', no);
    });
  const sessionOf = (req) => {
    const s = sessions.get(String(req.headers['x-hak-session'] || ''));
    if (!s || s.exp < Date.now()) throw new HakDbError('no-session', 'Chưa đăng nhập hoặc phiên đã hết hạn');
    return s;
  };
  const server = http.createServer(async (req, res) => {
    const t0 = Date.now();
    const origin = req.headers.origin || '';
    const cors = origin === 'null';
    let code = 200;
    try {
      if (origin !== 'null' && origin !== '') {
        code = 403;
        return reply(res, 403, { error: { code: 'origin', message: 'Chỉ ứng dụng HAK cục bộ được dùng cơ sở dữ liệu.' } }, false);
      }
      if (req.method === 'OPTIONS') return reply(res, 200, { ok: true }, cors);
      const url = req.url.split('?')[0];
      if (req.headers['x-hak-client'] !== 'documents-v1') {
        code = 403;
        req.resume();
        return reply(res, 403, { error: { code: 'client', message: 'Yêu cầu cục bộ không hợp lệ.' } }, cors);
      }
      if (!tokenOk(req.headers['x-hak-token'])) {
        code = 403;
        req.resume();
        return reply(
          res,
          403,
          { error: { code: 'token', message: 'Thiếu hoặc sai mã bảo vệ của app. Hãy mở app bằng lối tắt HAK.' } },
          cors
        );
      }
      if (req.method === 'GET' && url === '/db/status') {
        const st = fs.statSync(dbFile);
        return reply(
          res,
          200,
          {
            app: 'hak-db',
            backend: 'sqlite',
            active: db.meta('active_backend'),
            schema: db.schemaVersion(),
            file: dbFile,
            dataDir,
            size: st.size,
            counts: db.counts(),
          },
          cors
        );
      }
      if (req.method !== 'POST') {
        code = 405;
        return reply(res, 405, { error: { code: 'bad-request', message: 'Phương thức không hỗ trợ' } }, cors);
      }
      const body = await readBody(req);
      if (url === '/db/session') {
        const scope = body.scope === null ? null : Array.isArray(body.scope) ? body.scope.map(String) : [];
        const id = crypto.randomBytes(16).toString('hex');
        sessions.set(id, { user: String(body.user || ''), scope, exp: Date.now() + SESSION_TTL });
        return reply(res, 200, { session: id, scope }, cors);
      }
      if (url === '/db/session/close') {
        sessions.delete(String(req.headers['x-hak-session'] || ''));
        return reply(res, 200, { ok: true }, cors);
      }
      const s = sessionOf(req);
      const ctx = { scope: s.scope, user: s.user };
      if (url === '/db/tx') return reply(res, 200, { results: db.tx(body.ops, ctx) }, cors);
      if (url === '/db/query') return reply(res, 200, db.query(body, ctx), cors);
      if (url === '/db/check') return reply(res, 200, db.check(), cors);
      if (url === '/db/activate' || url === '/db/deactivate' || url === '/db/reset') {
        if (s.scope !== null) throw new HakDbError('scope', 'Chỉ tài khoản toàn quyền được đổi nguồn dữ liệu');
        return reply(
          res,
          200,
          url === '/db/activate' ? db.activate(body.expected) : url === '/db/deactivate' ? db.deactivate() : db.reset(),
          cors
        );
      }
      if (url === '/db/backup') {
        if (s.scope !== null) throw new HakDbError('scope', 'Chỉ tài khoản toàn quyền mới sao lưu toàn bộ cơ sở dữ liệu');
        const name = String(body.name || 'hak-' + new Date().toISOString().replace(/[:.]/g, '-'))
          .replace(/[^A-Za-z0-9._-]/g, '_')
          .replace(/\.{2,}/g, '_')
          .replace(/^\.+/, '')
          .slice(0, 80);
        return reply(res, 200, db.backup(path.join(dataDir, 'backups', name.endsWith('.db') ? name : name + '.db')), cors);
      }
      code = 404;
      return reply(res, 404, { error: { code: 'bad-request', message: 'Không có điểm cuối ' + url } }, cors);
    } catch (e) {
      const c = e && e.code ? e.code : 'io';
      code = c === 'too-large' ? 413 : c === 'no-session' ? 401 : STATUS[c] || 500;
      const err = { code: c, message: e.message };
      ['table', 'key', 'expected', 'actual', 'opIndex', 'diff'].forEach((k) => e[k] !== undefined && (err[k] = e[k]));
      reply(res, code, { error: err }, cors);
    } finally {
      log(req.method + ' ' + req.url.split('?')[0] + ' ' + code + ' ' + (Date.now() - t0) + 'ms'); // không ghi header / thân yêu cầu
    }
  });
  server.hakdb = db;
  server.hakToken = token;
  server.on('close', () => db.close());
  return server;
}
module.exports = { createServer };

if (require.main === module) {
  const a = process.argv.slice(2),
    get = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const dir = get('--data-dir');
  if (!dir) {
    console.error('Dùng: node tools/hakdb/server.cjs --data-dir <thư mục> [--port 31880] [--token <32 hex>]');
    process.exit(2);
  }
  const s = createServer({ dataDir: dir, token: get('--token'), log: (m) => console.log(m) });
  s.listen(Number(get('--port', 31880)), '127.0.0.1', () =>
    console.log('HAKDB tham chiếu: http://127.0.0.1:' + s.address().port + ' · dữ liệu ' + dir)
  );
}
