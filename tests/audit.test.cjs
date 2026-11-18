/* HAK.Audit: nhật ký thao tác ở chế độ trình duyệt (khóa hak.auditlog.v1) và ở SQLite (audit_log chỉ-thêm); cờ suppress; trần số dòng; gộp khi liệt kê. */
if (require('./helpers/needs-sqlite.cjs')()) return;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ls = new Map();
global.window = global;
global.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  get length() {
    return ls.size;
  },
  key: (i) => Array.from(ls.keys())[i],
};
const TOKEN = '9'.repeat(32);
global.HAK_DOCS_TOKEN = TOKEN;
const { createServer } = require('../tools/hakdb/server.cjs');
require('../app/js/storage.js');
const mem = {};
HAK.Store = {
  get: (k, d) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : d),
  set: (k, v) => ((mem[k] = JSON.parse(JSON.stringify(v))), true),
};
HAK.Auth = { who: () => 'Trần Thị B' };
const A = require('../app/js/audit.js');
const S = HAK.Storage;

const opened = [];
test.after(() => Promise.all(opened.map((s) => new Promise((ok) => (s.listening ? s.close(ok) : ok())))));
test('chế độ trình duyệt: ghi vào khóa cấu hình, có người thực hiện và lý do; suppress tắt ghi; trần số dòng', async () => {
  S._reset();
  global.HAK_DOCS_TOKEN = '';
  await S.start();
  assert.equal(S.mode, 'idb');
  assert.equal(
    await A.log({ action: 'sửa', entity: 'contracts', id: 'hd1', field: 'qty', before: 1, after: 2, reason: 'đính chính' }),
    true
  );
  const r = await A.list();
  assert.deepEqual(
    [r[0].actor, r[0].action, r[0].entity_id, r[0].before, r[0].after, r[0].reason],
    ['Trần Thị B', 'sửa', 'hd1', '1', '2', 'đính chính']
  );
  A.suppress = true;
  assert.equal(await A.log({ action: 'tạo' }), false);
  A.suppress = false;
  assert.equal(await A.log({ action: '' }), false, 'thiếu thao tác thì bỏ qua');
  A.reason = 'lý do chung';
  await A.log({ action: 'ngừng dùng', entity: 'contracts', id: 'hd2' });
  A.reason = null;
  assert.equal((await A.list({ id: 'hd2' }))[0].reason, 'lý do chung');
  mem['hak.auditlog.v1'] = Array.from({ length: 5000 }, (_, i) => ({ at: i, action: 'x' + i }));
  await A.log({ action: 'mới' });
  assert.equal(mem['hak.auditlog.v1'].length, 5000, 'giữ tối đa 5000 dòng mới nhất');
  assert.equal(mem['hak.auditlog.v1'][4999].action, 'mới');
  assert.equal(mem['hak.auditlog.v1'][0].action, 'x1');
  delete mem['hak.auditlog.v1'];
});
test('chế độ SQLite: ghi vào audit_log (chỉ-thêm) kèm seq; liệt kê gộp nhật ký cũ của chế độ trình duyệt; không sửa / xóa được', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-aud-'));
  const srv = createServer({ dataDir: dir, token: TOKEN });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  opened.push(srv);
  srv.hakdb.setMeta('active_backend', 'sqlite');
  global.HAK_DB_URL = 'http://127.0.0.1:' + srv.address().port;
  global.HAK_DOCS_TOKEN = TOKEN;
  mem['hak.auditlog.v1'] = [{ at: 1, actor: 'cũ', action: 'sửa', entity: 'contracts', entity_id: 'hd1', before: '0', after: '1' }];
  S._reset();
  await S.start();
  assert.equal(S.mode, 'sqlite');
  await A.log({
    action: 'sửa hồ sơ đã xuất',
    entity: 'yearbook',
    id: 'y1',
    field: 'revision',
    before: 1,
    after: 2,
    reason: 'bổ sung',
    company: 'hak',
  });
  const rows = srv.hakdb.query({ table: 'audit_log' }).rows;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].actor, rows[0].company_id, rows[0].reason, typeof rows[0].seq], ['Trần Thị B', 'hak', 'bổ sung', 'number']);
  const all = await A.list({ limit: 10 });
  assert.equal(all.length, 2);
  assert.ok(all.some((x) => x.actor === 'cũ') && all.some((x) => x.entity === 'yearbook'));
  assert.deepEqual(
    (await A.list({ entity: 'yearbook' })).map((x) => x.entity_id),
    ['y1']
  );
  assert.throws(() => srv.hakdb.db.prepare("UPDATE audit_log SET reason='sửa lén'").run(), /chỉ được thêm/);
  // lỗi máy chủ: không ném ra ngoài thao tác chính
  await new Promise((ok) => srv.close(ok));
  assert.equal(await A.log({ action: 'sửa', entity: 'x', id: '1' }), false);
});
