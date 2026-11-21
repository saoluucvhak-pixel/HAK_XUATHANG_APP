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

const AUTO_NAME = /^HAK_SQLite_\d{8}-\d{6}\.db$/;
const pad2 = (n) => String(n).padStart(2, '0');
const localStamp = (d) =>
  d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
/**
 * Sao lưu vào THƯ MỤC NGƯỜI DÙNG CHỌN (Thư mục sao lưu SQLite): dir phải là đường dẫn tuyệt đối, không có "..", không ghi ra ngoài dir.
 * Tên tệp luôn là HAK_SQLite_<yyyymmdd-HHMMSS>.db (body.name chỉ được dùng nếu ĐÚNG mẫu đó). Ghi xong mở lại tệp chạy integrity_check (không đạt → xóa bản vừa ghi, báo lỗi).
 * body.keep (số nguyên ≥ 1): xoay vòng — chỉ XÓA tệp khớp mẫu HAK_SQLite_<yyyymmdd-HHMMSS>.db trong dir, giữ keep bản mới nhất; tệp khác không bao giờ bị đụng.
 */
/** Lý do tiếng Việt cho lỗi hệ thống tệp (không đưa mã / thông báo tiếng Anh của hệ điều hành cho người dùng). */
function fsReason(e) {
  const c = e && e.code;
  if (c === 'EACCES' || c === 'EPERM' || c === 'EROFS') return 'không đủ quyền ghi';
  if (c === 'ENOSPC') return 'ổ đĩa đầy';
  if (c === 'ENOENT') return 'ổ đĩa hoặc thư mục cha không tồn tại';
  if (c === 'EEXIST' || c === 'ENOTDIR') return 'đường dẫn này là một tệp, không phải thư mục';
  if (c === 'ENAMETOOLONG') return 'đường dẫn quá dài';
  return 'lỗi hệ thống tệp';
}
function backupToDir(db, body, clean) {
  const dir = String(body.dir);
  if (dir.indexOf('\0') >= 0 || !path.isAbsolute(dir) || dir.split(/[\\/]+/).includes('..'))
    throw new HakDbError('bad-request', 'Thư mục sao lưu không hợp lệ: cần đường dẫn đầy đủ (ví dụ D:\\SaoLuu\\HAK), không chứa "..".');
  const root = path.resolve(dir);
  const name = body.name && AUTO_NAME.test(String(body.name)) ? String(body.name) : 'HAK_SQLite_' + localStamp(new Date()) + '.db';
  const dest = path.join(root, clean(name));
  if (path.dirname(dest) !== root) throw new HakDbError('bad-request', 'Tên tệp sao lưu không hợp lệ.');
  try {
    fs.mkdirSync(root, { recursive: true });
    fs.accessSync(root, fs.constants.W_OK);
  } catch (e) {
    throw new HakDbError('io', 'Không ghi được vào thư mục sao lưu đã chọn (' + fsReason(e) + '). Chọn thư mục khác.');
  }
  let r;
  try {
    r = db.backup(dest);
  } catch (e) {
    if (e instanceof HakDbError && e.code === 'bad-request') throw e;
    const full = e && /ENOSPC|disk|full/i.test(String(e.message));
    throw new HakDbError(
      'io',
      full
        ? 'Ổ đĩa đầy, không ghi được bản sao lưu. Giải phóng dung lượng hoặc chọn ổ khác.'
        : 'Không ghi được bản sao lưu (' + fsReason(e) + ').'
    );
  }
  const integrity = HakDb.integrityOfFile(dest);
  if (integrity !== 'ok') {
    try {
      fs.rmSync(dest, { force: true });
    } catch (e) {
      /* bỏ qua */
    }
    throw new HakDbError(
      'io',
      'Bản sao lưu vừa ghi không đạt kiểm tra toàn vẹn (' + integrity + '), đã xóa bản đó. Dữ liệu gốc không bị ảnh hưởng.'
    );
  }
  const removed = [];
  const keep = Number.isInteger(body.keep) && body.keep >= 1 ? body.keep : 0;
  if (keep) {
    // L-25: xoay vòng theo thời điểm ghi (mới nhất giữ lại), không theo tên; trùng thời điểm thì so tên — giống HAKDocs.cs
    const mine = fs
      .readdirSync(root)
      .filter((f) => AUTO_NAME.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(root, f)).mtimeMs }))
      .sort((x, y) => y.t - x.t || (x.f < y.f ? 1 : x.f > y.f ? -1 : 0))
      .map((x) => x.f);
    for (const f of mine.slice(keep)) {
      try {
        fs.rmSync(path.join(root, f), { force: true });
        removed.push(f);
      } catch (e) {
        /* không xóa được thì thôi — không làm hỏng việc sao lưu */
      }
    }
  }
  return Object.assign({}, r, { integrity, removed, dir: root, keep });
}

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
        const clean = (raw) =>
          String(raw)
            .replace(/[^A-Za-z0-9._-]/g, '_')
            .replace(/\.{2,}/g, '_')
            .replace(/^\.+/, '')
            .slice(0, 80);
        if (body.dir === undefined || body.dir === null || body.dir === '') {
          // như trước: tệp trong <data-dir>/backups với tên đã lọc
          const name = clean(body.name || 'hak-' + new Date().toISOString().replace(/[:.]/g, '-'));
          return reply(res, 200, db.backup(path.join(dataDir, 'backups', name.endsWith('.db') ? name : name + '.db')), cors);
        }
        return reply(res, 200, backupToDir(db, body, clean), cors);
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
