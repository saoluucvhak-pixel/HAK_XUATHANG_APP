/* Di trú IndexedDB → SQLite: nhập có đối chiếu, chạy lặp, dừng giữa chừng, dữ liệu hỏng, phát hiện sai lệch đến mã nguồn, kích hoạt có điều kiện, quay lui. */
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
const TOKEN = 'f'.repeat(32);
global.HAK_DOCS_TOKEN = TOKEN;
const { createServer } = require('../tools/hakdb/server.cjs');
require('../app/js/storage.js');
require('../app/js/db.js');
HAK.ContractModel = require('../app/js/contract-model.js');
HAK.CustomsModel = require('../app/js/customs-model.js');
require('../app/js/catalog-rows.js');
require('../app/js/db-sqlite.js');
require('../app/js/migrate.js');
const { buildSample } = require('../tools/data-audit-core.cjs');
const S = HAK.Storage,
  Mg = HAK.Migrate,
  D = HAK.DBSqlite;

const opened = [];
test.after(() => Promise.all(opened.map((s) => new Promise((ok) => (s.listening ? s.close(ok) : ok())))));
async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-mig-'));
  const srv = createServer({ dataDir: dir, token: TOKEN });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  opened.push(srv);
  global.HAK_DB_URL = 'http://127.0.0.1:' + srv.address().port;
  ls.clear();
  S._reset();
  await S.start();
  assert.equal(S.mode, 'idb', 'chưa kích hoạt: app vẫn dùng IndexedDB');
  return srv;
}
// ảnh chụp nguồn đủ nhóm (cùng dạng HAK.Backup.collect)
function snapshot() {
  const s = buildSample();
  const cat = HAK.ContractModel.migrate(s.keys['hak.catalog.v1']).data;
  const b64 = (a) => Buffer.from(a).toString('base64');
  return {
    keys: {
      'hak.catalog.v1': cat,
      'hak.config.v1': { cong_ty: 'Đại Hà', ma: '000123', trong: '', khong: 0, nul: null },
      'hak.auth.v1': { users: [{ u: 'admin', role: 'admin' }] },
      'hak.theme': 'dark',
    },
    items: s.archive.filter((a) => a.meta.id !== 'r-E').map((a) => ({ meta: a.meta, data: a.data })), // r-E cố ý hỏng ở bộ mẫu: bỏ để có nguồn hợp lệ
    batches: [
      {
        meta: { id: 'xuatkhau|Tàu A.xlsx', type: 'xuatkhau', fileName: 'Tàu A.xlsx', rev: 2, addedAt: 5 },
        b64: b64([0, 1, 2, 255, 0, 128, 9]),
      },
      { meta: { id: 'uythac|B.xlsx', type: 'uythac', fileName: 'B.xlsx', rev: 1, addedAt: 6 }, b64: b64(Buffer.alloc(70000, 7)) },
    ],
    issued: [
      { id: 'i1', at: 1, no: '000045', kind: 'pxk', cid: 'hak' },
      { id: 'i2', at: 2, no: '7', kind: 'bkls', cid: 'dh' },
    ],
    attachments: [{ id: 'sha-a', name: 'HĐ.pdf', base64: b64('%PDF-1.4 abc') }],
    bklsTemplates: [{ id: 'tpl1', name: 'Mẫu.docx', base64: 'UEsDBA==' }],
    yearbook: {
      v: 1,
      revision: 3,
      records: [{ id: 'yb1', type: 'xuatkhau', year: 2026, revision: 1, params: {}, rows: [{ net: 1234.567 }] }],
    },
  };
}

test('di trú trọn vẹn: nhập → đối chiếu đạt → kích hoạt; app chuyển sang SQLite và đọc lại đủ dữ liệu; nguồn không bị sửa', async () => {
  const srv = await boot();
  const snap = snapshot(),
    before = JSON.stringify(snap);
  const steps = [];
  const r = await Mg.run(snap, { onStep: (s) => steps.push(s.step) });
  assert.equal(r.ok, true, JSON.stringify(r.mismatches));
  assert.deepEqual(r.mismatches, []);
  assert.ok(
    ['reset', 'kv', 'archive', 'batches', 'issued', 'attachments', 'bklsTemplates', 'yearbook', 'verify'].every((x) => steps.includes(x))
  );
  assert.equal(S.mode, 'idb', 'nhập xong CHƯA kích hoạt: vẫn dùng nguồn cũ');
  const a = await Mg.activate(snap);
  assert.equal(a.activated, true, JSON.stringify(a));
  assert.ok(fs.existsSync(a.backup.path), 'có bản sao SQLite trước kích hoạt');
  assert.equal(S.hint.get(), 'sqlite');
  assert.ok(
    srv.hakdb.query({ table: 'audit_log' }).rows.some((r) => r.action === 'di trú' && r.entity === 'storage'),
    'có dòng nhật ký di trú'
  );
  S._reset();
  await S.start();
  assert.equal(S.mode, 'sqlite');
  assert.equal(JSON.stringify(snap), before, 'nguồn không bị đổi');
  const DB = HAK.DB;
  assert.deepEqual(await DB.kvGet('hak.config.v1'), snap.keys['hak.config.v1']);
  assert.deepEqual(await DB.kvGet('hak.yearbook.v1'), snap.yearbook);
  assert.equal(srv.hakdb.counts().archive_records, snap.items.length);
  assert.equal((await DB.getAll('issued')).length, 2);
  assert.equal(JSON.parse(ls.get('hak.config.v1')).ma, '000123', 'bản đệm localStorage nạp từ SQLite');
});
test('chạy lặp (cả khi đã nhập rồi): không nhân đôi, không đổi kết quả; chế độ resume không làm sạch vẫn đạt', async () => {
  const srv = await boot();
  const snap = snapshot();
  const r1 = await Mg.run(snap);
  const c1 = JSON.stringify(srv.hakdb.counts());
  const r2 = await Mg.run(snap);
  const r3 = await Mg.run(snap, { resume: true });
  assert.ok(r1.ok && r2.ok && r3.ok, JSON.stringify([r2.mismatches, r3.mismatches]));
  assert.equal(JSON.stringify(srv.hakdb.counts()), c1);
  assert.equal(srv.hakdb.counts().audit_log, 0, 'nhập hàng loạt không sinh dòng nhật ký thao tác');
});
test('dừng giữa chừng (hết dung lượng): báo bước và mã bản ghi; chưa kích hoạt; chạy lại (resume) hoàn tất và đạt', async () => {
  const srv = await boot();
  const snap = snapshot();
  const orig = S.call;
  let n = 0;
  S.call = async (...a) => {
    if (a[0] === '/db/tx' && ++n === 6) throw Object.assign(new Error('Ổ đĩa đầy (mô phỏng)'), { code: 'io' });
    return orig.apply(S, a);
  };
  const r = await Mg.run(snap);
  S.call = orig;
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'import');
  assert.match(r.error, /Ổ đĩa đầy/);
  assert.ok(r.at && r.at.id, 'nêu mã bản ghi đang nhập: ' + JSON.stringify(r.at));
  assert.equal(srv.hakdb.meta('active_backend'), null, 'không kích hoạt');
  assert.equal(S.mode, 'idb');
  const ok = await Mg.run(snap, { resume: true });
  assert.equal(ok.ok, true, JSON.stringify(ok.mismatches));
  const again = await Mg.run(snap);
  assert.equal(again.ok, true);
});
test('dữ liệu nguồn hỏng: dừng TRƯỚC khi ghi bất cứ gì, nêu từng mã bản ghi', async () => {
  const srv = await boot();
  const snap = snapshot();
  const bad = Object.assign({}, snap, {
    items: snap.items.concat([{ meta: { id: 'r-E', title: 'TÀU LỖI' } }, { meta: { id: 'r-A', title: 'trùng' }, data: 'raw:{}' }]),
    batches: snap.batches.concat([{ meta: { id: 'hong|x.xlsx' }, b64: '@@không-phải-base64@@' }]),
    issued: snap.issued.concat([{ at: 1 }]),
  });
  const r = await Mg.run(bad);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'validate');
  const keyOf = (p) => p.store + ':' + p.id;
  const got = r.problems.map(keyOf);
  assert.ok(got.includes('archive:r-E'), 'thiếu dữ liệu phiếu');
  assert.ok(got.includes('archive:r-A'), 'trùng mã');
  assert.ok(got.includes('batches:hong|x.xlsx'), 'tệp gốc hỏng');
  assert.ok(
    got.some((x) => x.startsWith('issued:')),
    'thiếu mã'
  );
  assert.deepEqual(
    Object.entries(srv.hakdb.counts()).filter(([k, n]) => k !== 'meta' && n), // bảng meta luôn có phiên bản schema
    [],
    'chưa ghi gì vào SQLite'
  );
});
test('đối chiếu phát hiện sửa / xóa / thừa dữ liệu SAU khi nhập, báo đúng mã nguồn; kích hoạt bị từ chối', async () => {
  const srv = await boot();
  const snap = snapshot();
  assert.equal((await Mg.run(snap)).ok, true);
  const first = snap.items[0].meta.id;
  srv.hakdb.tx([{ op: 'put', table: 'archive_data', row: { record_id: first, payload: 'raw:{"rows":[]}' } }]); // đổi dữ liệu phiếu
  srv.hakdb.tx([{ op: 'put', table: 'kv', row: { key: 'hak.config.v1', val: '{"cong_ty":"KHÁC"}', updated_at: 1 } }]);
  srv.hakdb.tx([{ op: 'del', table: 'issued', key: 'i2' }]);
  srv.hakdb.tx([{ op: 'put', table: 'issued', row: { id: 'i-thua', no: '9', doc: '{"id":"i-thua"}' } }]);
  srv.hakdb.tx([
    {
      op: 'put',
      table: 'batch_files',
      row: { batch_id: 'uythac|B.xlsx', bytes: { $b64: Buffer.alloc(70000, 8).toString('base64') }, sha256: 'x', size: 70000 },
    },
  ]);
  const v = await Mg.verify(snap);
  assert.equal(v.ok, false);
  const has = (store, id, re) => v.mismatches.some((m) => m.store === store && m.id === id && re.test(m.problem));
  assert.ok(has('archive', first, /dữ liệu phiếu cân khác nguồn/), JSON.stringify(v.mismatches));
  assert.ok(has('kv', 'hak.config.v1', /nội dung khác/));
  assert.ok(has('issued', 'i2', /thiếu/));
  assert.ok(has('issued', 'i-thua', /thừa/));
  assert.ok(has('batches', 'uythac|B.xlsx', /SHA-256/));
  const a = await Mg.activate(snap);
  assert.equal(a.activated, false);
  assert.equal(srv.hakdb.meta('active_backend'), null);
});
test('máy chủ từ chối kích hoạt khi số bản ghi không khớp (lớp bảo vệ thứ hai, kể cả khi bên gọi bỏ qua đối chiếu)', async () => {
  const srv = await boot();
  const snap = snapshot();
  await Mg.run(snap);
  srv.hakdb.tx([{ op: 'put', table: 'kv', row: { key: 'hak.xxx', val: '1', updated_at: 1 } }]);
  await S.openSession(null, 'x');
  await assert.rejects(
    S.call('/db/activate', { expected: Mg.plan(snap).expected }),
    (e) => e.code === 'bad-request' && e.detail.diff.some((d) => d.table === 'kv')
  );
  assert.equal(srv.hakdb.meta('active_backend'), null);
});
test('quay lui: tắt nguồn SQLite, app dùng lại IndexedDB, dữ liệu SQLite còn nguyên để xuất', async () => {
  const srv = await boot();
  const snap = snapshot();
  await Mg.run(snap);
  await Mg.activate(snap);
  S._reset();
  await S.start();
  assert.equal(S.mode, 'sqlite');
  await Mg.rollback();
  assert.equal(S.hint.get(), null);
  assert.ok(
    srv.hakdb.query({ table: 'audit_log' }).rows.some((r) => r.action === 'quay lui'),
    'có dòng nhật ký quay lui'
  );
  S._reset();
  await S.start();
  assert.equal(S.mode, 'idb');
  assert.equal(srv.hakdb.counts().archive_records, snap.items.length, 'dữ liệu SQLite không bị xóa khi quay lui');
});
test('mồ côi trong Danh mục nguồn: di trú vẫn đạt, nêu trong quarantine kèm mã tờ khai; tờ khai không bị bỏ', async () => {
  const srv = await boot();
  const snap = snapshot(); // bộ mẫu có tk3 trỏ hợp đồng không tồn tại
  const r = await Mg.run(snap);
  assert.equal(r.ok, true, JSON.stringify(r.mismatches));
  assert.ok(r.quarantine.some((q) => q.record === 'tk3' && /mồ côi: contractId/.test(q.reason)));
  assert.equal(srv.hakdb.query({ table: 'customs_decls' }).rows.length, snap.keys['hak.catalog.v1'].customs.length);
});
test('chụp nhất quán: dữ liệu đổi giữa hai lần chụp thì chụp lại; đổi mãi thì báo lỗi', async () => {
  await boot();
  let n = 0;
  const stable3 = await Mg.consistentSnapshot(async () => {
    n++;
    const s = snapshot();
    if (n <= 3)
      s.keys['hak.theme'] = 'v' + n; // lần 1-3 khác nhau, lần 4-5 giống nhau
    else s.keys['hak.theme'] = 'ổn định';
    return s;
  }, 3);
  assert.equal(stable3.snap.keys['hak.theme'], 'ổn định');
  assert.equal(stable3.attempts, 3);
  let k = 0;
  await assert.rejects(
    Mg.consistentSnapshot(async () => {
      const s = snapshot();
      s.keys['hak.theme'] = 'đổi ' + ++k;
      return s;
    }, 3),
    (e) => e.code === 'unstable' && /đang thay đổi/.test(e.message)
  );
});
test('giữ số 0 đầu, NULL / 0 / chuỗi trống và tiếng Việt qua di trú', async () => {
  const srv = await boot();
  const snap = snapshot();
  assert.equal((await Mg.run(snap)).ok, true);
  const v = JSON.parse(srv.hakdb.query({ table: 'kv', where: { key: 'hak.config.v1' } }).rows[0].val);
  assert.deepEqual(v, { cong_ty: 'Đại Hà', ma: '000123', trong: '', khong: 0, nul: null });
  assert.equal(srv.hakdb.query({ table: 'issued', where: { id: 'i1' } }).rows[0].no, '000045');
});
