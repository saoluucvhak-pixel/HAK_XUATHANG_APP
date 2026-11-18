if (require('./helpers/needs-sqlite.cjs')()) return;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createServer } = require('../tools/hakdb/server.cjs');

const TOKEN = 'a'.repeat(32);
const opened = [];
test.after(() => Promise.all(opened.map((s) => new Promise((ok) => (s.listening ? s.close(ok) : ok())))));
async function boot(extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hakdb-srv-'));
  const logs = [];
  const srv = createServer(Object.assign({ dataDir: dir, token: TOKEN, log: (m) => logs.push(m) }, extra));
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  opened.push(srv);
  const port = srv.address().port;
  const call = (method, url, body, headers) =>
    new Promise((ok, no) => {
      const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const h = Object.assign({ Origin: 'null', 'X-HAK-Client': 'documents-v1', 'X-HAK-Token': TOKEN }, headers || {});
      if (data) h['Content-Length'] = data.length;
      const rq = http.request({ host: '127.0.0.1', port, method, path: url, headers: h }, (rs) => {
        const cs = [];
        rs.on('data', (c) => cs.push(c));
        rs.on('end', () => {
          const t = Buffer.concat(cs).toString();
          ok({ status: rs.statusCode, headers: rs.headers, body: t ? JSON.parse(t) : null });
        });
      });
      rq.on('error', no);
      if (data) rq.write(data);
      rq.end();
    });
  const session = async (scope, user) => (await call('POST', '/db/session', { scope, user })).body.session;
  return { srv, dir, logs, call, session, close: () => new Promise((ok) => srv.close(ok)) };
}

test('từ chối: Origin lạ, thiếu X-HAK-Client, sai / thiếu token — kể cả với GET /db/status', async () => {
  const s = await boot();
  assert.equal((await s.call('GET', '/db/status', undefined, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await s.call('GET', '/db/status', undefined, { 'X-HAK-Client': 'x' })).status, 403);
  assert.equal((await s.call('GET', '/db/status', undefined, { 'X-HAK-Token': 'b'.repeat(32) })).status, 403);
  assert.equal((await s.call('GET', '/db/status', undefined, { 'X-HAK-Token': '' })).status, 403);
  const ok = await s.call('GET', '/db/status');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.backend, 'sqlite');
  assert.equal(ok.body.schema, 1);
  assert.ok(ok.body.file.endsWith('hak.db'));
  await s.close();
});
test('đọc / ghi bắt buộc có phiên; phiên mang phạm vi công ty do máy chủ giữ', async () => {
  const s = await boot();
  assert.equal((await s.call('POST', '/db/query', { table: 'kv' })).status, 401);
  const admin = await s.session(null, 'admin');
  const hak = await s.session(['hak'], 'nv1');
  const put = (sess, id, company) =>
    s.call(
      'POST',
      '/db/tx',
      { ops: [{ op: 'put', table: 'archive_records', row: { id, company_id: company, meta: '{}' } }] },
      { 'X-HAK-Session': sess }
    );
  assert.equal((await put(admin, 'a', 'hak')).status, 200);
  assert.equal((await put(admin, 'b', 'dh')).status, 200);
  const r = await put(hak, 'c', 'dh');
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'scope');
  const list = await s.call('POST', '/db/query', { table: 'archive_records', order: [['id', 'asc']] }, { 'X-HAK-Session': hak });
  assert.deepEqual(
    list.body.rows.map((x) => x.id),
    ['a'],
    'tài khoản giới hạn chỉ thấy công ty của mình'
  );
  assert.equal((await s.call('POST', '/db/session/close', {}, { 'X-HAK-Session': hak })).status, 200);
  assert.equal((await s.call('POST', '/db/query', { table: 'kv' }, { 'X-HAK-Session': hak })).status, 401);
  await s.close();
});
test('mã lỗi HTTP: conflict/fk/unique 409, bad-request 400, thân quá lớn 413; lỗi mang table / key / opIndex', async () => {
  const s = await boot();
  const sess = await s.session(null, 'admin');
  const H = { 'X-HAK-Session': sess };
  const tx = (ops) => s.call('POST', '/db/tx', { ops }, H);
  assert.equal((await tx([{ op: 'put', table: 'contracts', row: { id: 'hd1', doc: '{}' }, ifRev: null }])).status, 200);
  const c = await tx([{ op: 'put', table: 'contracts', row: { id: 'hd1', doc: '{}' }, ifRev: 5 }]);
  assert.equal(c.status, 409);
  assert.deepEqual(
    [c.body.error.code, c.body.error.table, c.body.error.expected, c.body.error.actual, c.body.error.opIndex],
    ['conflict', 'contracts', 5, 1, 0]
  );
  assert.equal(
    (await tx([{ op: 'put', table: 'contract_details', row: { id: 'x', contract_id: 'khong', doc: '{}' } }])).body.error.code,
    'fk'
  );
  assert.equal((await tx([{ op: 'put', table: 'nope', row: { id: 1 } }])).status, 400);
  assert.equal((await s.call('POST', '/db/tx', '{khong phai json', H)).status, 400);
  const big = await s.call('POST', '/db/tx', Buffer.alloc(37 * 1024 * 1024, 32).toString(), H).catch((e) => ({ status: 'reset', e }));
  assert.ok(big.status === 413 || big.status === 'reset', 'thân > 36 MB bị từ chối');
  assert.equal((await s.call('GET', '/db/status')).status, 200, 'máy chủ vẫn sống sau yêu cầu quá lớn');
  await s.close();
});
test('log không chứa token, phiên hay nội dung yêu cầu', async () => {
  const s = await boot();
  const sess = await s.session(null, 'nguoi-dung-bi-mat');
  await s.call(
    'POST',
    '/db/tx',
    { ops: [{ op: 'put', table: 'kv', row: { key: 'hak.secret', val: 'MAT-KHAU-123', updated_at: 1 } }] },
    { 'X-HAK-Session': sess }
  );
  const all = s.logs.join('\n');
  assert.ok(all.includes('POST /db/tx 200'));
  for (const secret of [TOKEN, sess, 'MAT-KHAU-123', 'nguoi-dung-bi-mat']) assert.ok(!all.includes(secret), 'log lộ: ' + secret);
  await s.close();
});
test('sao lưu qua API: chỉ tài khoản toàn quyền; tên được lọc, tệp nằm trong backups; không ghi đè', async () => {
  const s = await boot();
  const admin = await s.session(null, 'admin'),
    hak = await s.session(['hak'], 'nv');
  await s.call('POST', '/db/tx', { ops: [{ op: 'put', table: 'contracts', row: { id: 'hd1', doc: '{}' } }] }, { 'X-HAK-Session': admin });
  assert.equal((await s.call('POST', '/db/backup', { name: 'x' }, { 'X-HAK-Session': hak })).status, 403);
  const r = await s.call('POST', '/db/backup', { name: '../../escape' }, { 'X-HAK-Session': admin });
  assert.equal(r.status, 200);
  assert.equal(path.dirname(r.body.path), path.join(s.dir, 'backups'));
  assert.ok(!r.body.path.includes('..'));
  assert.equal(r.body.sha256.length, 64);
  assert.equal((await s.call('POST', '/db/backup', { name: '../../escape' }, { 'X-HAK-Session': admin })).status, 400);
  const chk = await s.call('POST', '/db/check', {}, { 'X-HAK-Session': admin });
  assert.equal(chk.body.ok, true);
  await s.close();
});
test('đóng máy chủ rồi mở lại: dữ liệu còn nguyên (bền vững)', async () => {
  const s = await boot();
  const sess = await s.session(null, 'a');
  await s.call(
    'POST',
    '/db/tx',
    { ops: [{ op: 'put', table: 'contracts', row: { id: 'hd1', no: 'Đã lưu', doc: '{}' } }] },
    { 'X-HAK-Session': sess }
  );
  await s.close();
  const s2 = createServer({ dataDir: s.dir, token: TOKEN });
  assert.equal(s2.hakdb.query({ table: 'contracts' }).rows[0].no, 'Đã lưu');
  s2.hakdb.close();
});
