/* HAK.DB ở chế độ SQLite: chạy db.js + storage.js + db-sqlite.js THẬT trên máy chủ HAKDB tham chiếu (cùng hợp đồng với HAKDocs). */
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
const TOKEN = 'c'.repeat(32);
global.HAK_DOCS_TOKEN = TOKEN;
const { createServer } = require('../tools/hakdb/server.cjs');
require('../app/js/storage.js');
require('../app/js/db.js');
require('../app/js/db-sqlite.js');
const S = HAK.Storage,
  DB = HAK.DB;

const opened = [];
test.after(() => Promise.all(opened.map((s) => new Promise((ok) => (s.listening ? s.close(ok) : ok())))));
async function boot(active) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-dbsq-'));
  const srv = createServer({ dataDir: dir, token: TOKEN });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  opened.push(srv);
  global.HAK_DB_URL = 'http://127.0.0.1:' + srv.address().port;
  if (active) srv.hakdb.setMeta('active_backend', 'sqlite');
  ls.clear();
  S._reset();
  await S.start();
  return { srv, dir, close: () => new Promise((ok) => srv.close(ok)) };
}
const rejects = async (p, test) => {
  try {
    await p;
  } catch (e) {
    return test ? assert.ok(test(e), 'lỗi: ' + e.code + ' ' + e.message) : e;
  }
  assert.fail('phải bị từ chối');
};

test('chưa kích hoạt SQLite: chế độ IndexedDB nhưng báo HAKDocs-SQLite có sẵn (cho màn di trú); không gợi ý nhớ', async () => {
  const b = await boot(false);
  assert.equal(S.mode, 'idb');
  assert.equal(S.available, true);
  assert.notEqual(S.describe().backend, 'SQLite (HAKDocs)');
  assert.equal(S.hint.get(), null);
  await b.close();
});
test('đã kích hoạt: chế độ sqlite, nạp localStorage TỪ SQLite (khóa cũ bị xóa, không đẩy ngược lên)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-dbsq-'));
  const pre = createServer({ dataDir: dir, token: TOKEN });
  pre.hakdb.tx([
    { op: 'put', table: 'kv', row: { key: 'hak.config.v1', val: JSON.stringify({ ten: 'Đại Hà' }), updated_at: 1 } },
    { op: 'put', table: 'kv', row: { key: 'hak.auth.v1', val: '{"users":[]}', updated_at: 1 } },
  ]);
  pre.hakdb.setMeta('active_backend', 'sqlite');
  await new Promise((ok) => pre.listen(0, '127.0.0.1', ok));
  opened.push(pre);
  global.HAK_DB_URL = 'http://127.0.0.1:' + pre.address().port;
  ls.clear();
  ls.set('hak.stale.cache', '"cu"'); // bản đệm cũ còn sót trong trình duyệt
  ls.set('khac.khong-phai-hak', '1');
  S._reset();
  await S.start();
  assert.equal(S.mode, 'sqlite');
  assert.equal(S.hint.get(), 'sqlite');
  assert.equal(ls.has('hak.stale.cache'), false, 'khóa hak.* không có trong SQLite bị xóa khỏi bản đệm');
  assert.equal(ls.get('khac.khong-phai-hak'), '1', 'khóa ngoài tiền tố hak. không đụng tới');
  assert.deepEqual(JSON.parse(ls.get('hak.config.v1')), { ten: 'Đại Hà' });
  assert.equal(DB.backend, 'sqlite');
  assert.equal(DB.usable(), true);
  assert.equal(pre.hakdb.query({ table: 'kv', where: { key: 'hak.stale.cache' } }).rows.length, 0, 'không đẩy bản đệm cũ ngược lên SQLite');
  const st = await DB.status();
  assert.equal(st.backend, 'sqlite');
  assert.ok(st.file.endsWith('hak.db'));
  await new Promise((ok) => pre.close(ok));
});
test('kv: ghi / đọc / xóa / kvAll giữ nguyên giá trị (null, 0, chuỗi trống, tiếng Việt, số 0 đầu)', async () => {
  const b = await boot(true);
  const vals = { a: null, b: 0, c: '', d: 'Đại Hà 00123', e: { x: [1, 2, { y: null }] } };
  for (const [k, v] of Object.entries(vals)) await DB.kvPut('hak.t.' + k, v, true);
  for (const [k, v] of Object.entries(vals)) assert.deepEqual(await DB.kvGet('hak.t.' + k), v, k);
  const all = Object.fromEntries((await DB.kvAll()).map((r) => [r.key, r]));
  assert.strictEqual(all['hak.t.b'].val, 0);
  assert.strictEqual(all['hak.t.c'].val, '');
  assert.strictEqual(all['hak.t.a'].val, null);
  assert.strictEqual(all['hak.t.d'].ls, true);
  await DB.kvDel('hak.t.d');
  assert.equal(await DB.kvGet('hak.t.d'), undefined);
  await DB.kvClear();
  assert.equal((await DB.kvAll()).length, 0);
  await b.close();
});
test('kvCas: ghi khi đúng; cửa sổ khác ghi chen vào giữa → conflict và không ghi đè', async () => {
  const b = await boot(true);
  await DB.kvPut('hak.catalog.v1', { v: 3, n: 1 });
  await DB.kvCas('hak.catalog.v1', (cur) => (cur.n === 1 ? null : 'sai'), { v: 3, n: 2 });
  assert.deepEqual(await DB.kvGet('hak.catalog.v1'), { v: 3, n: 2 });
  const e = await rejects(
    DB.kvCas(
      'hak.catalog.v1',
      (cur) => {
        // cửa sổ khác ghi chen NGAY sau khi đọc, trước lúc ghi của ta
        b.srv.hakdb.tx([{ op: 'put', table: 'kv', row: { key: 'hak.catalog.v1', val: '{"v":3,"n":99}', updated_at: 5 } }]);
        return null;
      },
      { v: 3, n: 3 }
    )
  );
  assert.equal(e.conflict, true);
  assert.deepEqual(await DB.kvGet('hak.catalog.v1'), { v: 3, n: 99 }, 'bản của cửa sổ kia được giữ');
  const e2 = await rejects(DB.kvCas('hak.catalog.v1', () => 'Danh mục đã thay đổi', { n: 0 }));
  assert.equal(e2.conflict, true);
  assert.equal(e2.message, 'Danh mục đã thay đổi');
  await b.close();
});
test('guarded: đợt Excel = thông số + tệp gốc trong MỘT giao dịch; thứ tự ghi con trước cha vẫn đúng; nhị phân nguyên vẹn', async () => {
  const b = await boot(true);
  const bytes = new Uint8Array([0, 1, 2, 255, 0, 128]).buffer;
  const meta = { id: 'xuatkhau|Tàu A.xlsx', type: 'xuatkhau', fileName: 'Tàu A.xlsx', rev: 1, addedAt: 1 };
  await DB.guarded(
    ['batches', 'batchdata'],
    'batches',
    meta.id,
    (cur) => (cur ? 'đã có' : null),
    (tx) => {
      tx.objectStore('batchdata').put(bytes, meta.id); // con ghi TRƯỚC cha — client phải sắp lại
      tx.objectStore('batches').put(meta);
    }
  );
  assert.deepEqual(await DB.get('batches', meta.id), meta);
  assert.deepEqual(new Uint8Array(await DB.get('batchdata', meta.id)), new Uint8Array(bytes));
  const row = b.srv.hakdb.query({ table: 'batch_files', cols: ['sha256', 'size'] }).rows[0];
  assert.equal(row.size, 6);
  assert.equal(row.sha256.length, 64);
  // lưu lần hai với phiên bản cũ: check của chỗ gọi từ chối
  const e = await rejects(
    DB.guarded(
      ['batches', 'batchdata'],
      'batches',
      meta.id,
      (cur) => (cur.rev !== 0 ? 'Đợt đã được lưu / thay ở cửa sổ khác.' : null),
      () => assert.fail('không được ghi')
    )
  );
  assert.equal(e.conflict, true);
  // cửa sổ khác thay đợt giữa check và ghi → máy chủ từ chối (khóa lạc quan)
  const e2 = await rejects(
    DB.guarded(
      ['batches', 'batchdata'],
      'batches',
      meta.id,
      () => null,
      (tx) => {
        b.srv.hakdb.tx([{ op: 'put', table: 'batches', row: { id: meta.id, doc: JSON.stringify(Object.assign({}, meta, { rev: 7 })) } }]);
        tx.objectStore('batches').put(Object.assign({}, meta, { rev: 2 }));
        tx.objectStore('batchdata').put(new Uint8Array([9]).buffer, meta.id);
      }
    )
  );
  assert.equal(e2.conflict, true);
  assert.equal((await DB.get('batches', meta.id)).rev, 7);
  assert.deepEqual(new Uint8Array(await DB.get('batchdata', meta.id)), new Uint8Array(bytes), 'tệp gốc không bị ghi dở');
  // xóa: con trước cha
  await DB.guarded(
    ['batches', 'batchdata'],
    'batches',
    meta.id,
    () => null,
    (tx) => {
      tx.objectStore('batches').delete(meta.id);
      tx.objectStore('batchdata').delete(meta.id);
    }
  );
  assert.equal(await DB.get('batches', meta.id), undefined);
  assert.equal(b.srv.hakdb.counts().batch_files, 0);
  await b.close();
});
test('nhật ký chứng từ, mẫu BKLS, tệp đính kèm: ghi / đọc đủ trường; PDF base64 chuẩn tách BLOB, chuỗi lạ giữ nguyên', async () => {
  const b = await boot(true);
  const iss = {
    id: 'i1',
    at: 5,
    no: '000045',
    kind: 'pxk',
    cid: 'hak',
    period: '2026-02',
    by: 'Nguyễn Văn A',
    extra: { n: [1, null, ''] },
  };
  await DB.put('issued', iss);
  assert.deepEqual(await DB.get('issued', 'i1'), iss);
  assert.strictEqual((await DB.getAll('issued'))[0].no, '000045', 'số chứng từ giữ số 0 đầu');
  assert.equal(b.srv.hakdb.query({ table: 'issued' }).rows[0].company_id, 'hak');
  const tpl = { id: 't1', name: 'Mẫu.docx', kind: 'bkls', base64: 'UEsDBA==' };
  await DB.put('bklsTemplates', tpl);
  assert.deepEqual(await DB.get('bklsTemplates', 't1'), tpl);
  const pdf64 = Buffer.from('%PDF-1.4 tiếng Việt').toString('base64');
  const att = { id: 'sha1', name: 'HĐ.pdf', base64: pdf64, size: 12 };
  await DB.put('attachments', att);
  assert.deepEqual(await DB.get('attachments', 'sha1'), att);
  const r = b.srv.hakdb.query({ table: 'attachments', cols: ['size', 'bytes', 'doc'] }).rows[0];
  assert.ok(r.bytes && !r.doc.includes(pdf64), 'PDF nằm ở BLOB, không lặp trong doc');
  const odd = { id: 'odd', name: 'x.pdf', base64: 'QQ' }; // base64 không chuẩn (thiếu padding): phải giữ nguyên chuỗi
  await DB.put('attachments', odd);
  assert.deepEqual(await DB.get('attachments', 'odd'), odd);
  await DB.del('issued', 'i1');
  assert.equal((await DB.getAll('issued')).length, 0);
  await b.close();
});
test('mất kết nối sau khi đã dùng SQLite: BỊ CHẶN, không lặng lẽ quay về IndexedDB; có thông báo nêu rõ', async () => {
  const b = await boot(true);
  assert.equal(S.mode, 'sqlite');
  const port = b.srv.address().port;
  await b.close();
  global.HAK_DB_URL = 'http://127.0.0.1:' + port; // máy chủ đã tắt
  S._reset();
  await S.start();
  assert.equal(S.mode, 'blocked');
  assert.match(S.error, /không kết nối được/);
  assert.equal(S.describe().backend, 'Bị chặn');
  const e = await rejects(DB.kvPut('hak.x', 1));
  assert.equal(e.code, 'blocked');
  await rejects(DB.getAll('batches'), (x) => x.code === 'blocked');
  assert.equal(DB.usable(), false);
});
test('đã dùng SQLite nhưng cơ sở dữ liệu bị thay bằng tệp chưa kích hoạt: BỊ CHẶN', async () => {
  const b = await boot(true);
  b.srv.hakdb.db.prepare("DELETE FROM meta WHERE key='active_backend'").run();
  S._reset();
  await S.start();
  assert.equal(S.mode, 'blocked');
  assert.match(S.error, /chưa được kích hoạt/);
  await b.close();
  S.hint.set(null);
});
test('phiên có phạm vi công ty: tài khoản giới hạn không ghi được bản ghi công ty khác qua HAK.DB', async () => {
  const b = await boot(true);
  await S.openSession(['hak'], 'nv1');
  await DB.put('issued', { id: 'ok1', cid: 'hak', no: '1' });
  await rejects(DB.put('issued', { id: 'bad1', cid: 'dh', no: '2' }), (e) => e.code === 'scope');
  assert.deepEqual(
    (await DB.getAll('issued')).map((x) => x.id),
    ['ok1']
  );
  await b.close();
});
