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
require('../app/js/catalog-rows.js');
require('../app/js/db-sqlite.js');
HAK.ContractModel = require('../app/js/contract-model.js');
HAK.CustomsModel = require('../app/js/customs-model.js');
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

const catalogDoc = () => {
  const M = HAK.ContractModel,
    CM = HAK.CustomsModel;
  const c1 = M.parent({
    id: 'hd1',
    type: 'uythac',
    no: '000123/HĐ',
    contractQty: 5000,
    exporterId: 'k1',
    details: [
      { id: 'ct-a', ship: 'A', qty: 1000, bdmt: 4000.5 },
      { id: 'ct-b', ship: 'B', qty: 0 },
    ],
    addenda: [{ id: 'pl-1', no: 'PL1', date: '2026-01-01', qty: 4500 }],
  });
  return {
    v: 3,
    products: [],
    customers: [{ id: 'k1', name: 'HAK', companyId: 'hak' }],
    contracts: [c1],
    customs: [
      CM.newDecl({
        id: 'tk1',
        no: '308629701000',
        contractId: 'hd1',
        detailId: 'ct-a',
        taxVnd: 1000,
        payments: [{ id: 'p1', receiptNo: 'DN1', amount: 1000, kind: 'tax' }],
        supplements: [{ id: 'bs1', no: '2', taxVnd: 900 }],
      }),
    ],
  };
};
const projected = (srv) => {
  const rows = {};
  for (const t of HAK.CatalogRows.TABLES) rows[t] = srv.hakdb.query({ table: t }).rows;
  return rows;
};
test('Danh mục: lưu bằng kvCas ghi cả tài liệu và bảng quan hệ trong MỘT giao dịch; dựng lại từ bảng = tài liệu', async () => {
  const b = await boot(true);
  const doc = catalogDoc();
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  assert.deepEqual(await DB.kvGet('hak.catalog.v1'), doc);
  const rows = projected(b.srv);
  assert.equal(rows.contract_details.length, 2);
  assert.equal(rows.customs_payments[0].amount_vnd, 1000);
  assert.deepEqual(HAK.CatalogRows.assemble(rows, { v: 3, products: [] }), doc, 'bảng quan hệ khớp tài liệu');
  assert.ok(b.srv.hakdb.check().ok, 'khóa ngoại toàn vẹn');
  await b.close();
});
test('Danh mục: sửa chỉ ghi dòng đổi (rev các dòng khác giữ nguyên); ngừng dùng giữ dòng; xóa con rồi cha đúng thứ tự', async () => {
  const b = await boot(true);
  const doc = catalogDoc();
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  const rev0 = Object.fromEntries(projected(b.srv).contract_details.map((r) => [r.id, r.rev]));
  const d2 = JSON.parse(JSON.stringify(doc));
  d2.contracts[0].details[0].ship = 'A SỬA';
  d2.contracts[0].details[1].deletedAt = '2026-02-01'; // ngừng dùng: giữ dòng
  await DB.kvCas('hak.catalog.v1', () => null, d2);
  const r1 = Object.fromEntries(projected(b.srv).contract_details.map((r) => [r.id, r]));
  assert.equal(r1['ct-a'].rev, rev0['ct-a'] + 1);
  assert.equal(r1['ct-b'].deleted_at, '2026-02-01');
  const d3 = JSON.parse(JSON.stringify(d2));
  d3.customs = []; // bỏ tờ khai (con của hợp đồng + chi tiết)
  d3.contracts[0].details = d3.contracts[0].details.slice(1);
  await DB.kvCas('hak.catalog.v1', () => null, d3);
  const rows = projected(b.srv);
  assert.equal(rows.customs_decls.length, 0);
  assert.equal(rows.customs_payments.length, 0);
  assert.equal(rows.contract_details.length, 1);
  assert.deepEqual(HAK.CatalogRows.assemble(rows, { v: 3, products: [] }), d3);
  await b.close();
});
test('Danh mục: khôi phục qua kvPut (đường sao lưu) cũng cập nhật bảng quan hệ; xóa khóa Danh mục dọn sạch phần chiếu', async () => {
  const b = await boot(true);
  const doc = catalogDoc();
  await DB.kvPut('hak.catalog.v1', doc);
  assert.equal(projected(b.srv).contracts.length, 1);
  await DB.kvDel('hak.catalog.v1');
  const rows = projected(b.srv);
  assert.ok(
    HAK.CatalogRows.TABLES.every((t) => rows[t].length === 0),
    'phần chiếu sạch'
  );
  await b.close();
});
test('Danh mục: tờ khai mồ côi KHÔNG chặn lưu — FK = NULL, ghi vào quarantine kèm lý do, tài liệu giữ nguyên; sửa xong thì quarantine tự sạch', async () => {
  const b = await boot(true);
  const doc = catalogDoc();
  doc.customs[0].contractId = 'hd-khong-con';
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  assert.deepEqual(await DB.kvGet('hak.catalog.v1'), doc);
  const qs = b.srv.hakdb.query({ table: 'quarantine' }).rows;
  assert.equal(qs.length, 1);
  assert.match(qs[0].reason, /mồ côi: contractId trỏ tới hd-khong-con/);
  assert.equal(qs[0].record_id, 'tk1');
  assert.equal(projected(b.srv).customs_decls[0].contract_id, null);
  doc.customs[0].contractId = 'hd1';
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  assert.equal(b.srv.hakdb.query({ table: 'quarantine' }).rows.length, 0);
  await b.close();
});
test('Danh mục: hai tờ khai cùng số (dữ liệu cũ) vẫn lưu được; giá trị > 3 chữ số lẻ → quarantine cảnh báo, doc giữ nguyên', async () => {
  const b = await boot(true);
  const doc = catalogDoc();
  doc.customs.push(HAK.CustomsModel.newDecl({ id: 'tk2', no: '308629701000', contractId: 'hd1' }));
  doc.contracts[0].details[0].bdmt = 1.23456;
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  assert.equal(projected(b.srv).customs_decls.length, 2);
  assert.deepEqual(await DB.kvGet('hak.catalog.v1'), doc);
  assert.ok(b.srv.hakdb.query({ table: 'quarantine' }).rows.some((r) => /độ chính xác: bdmt/.test(r.reason)));
  await b.close();
});
test('Danh mục: kvCas xung đột thì cả tài liệu lẫn bảng quan hệ không đổi', async () => {
  const b = await boot(true);
  const doc = catalogDoc();
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  const d2 = JSON.parse(JSON.stringify(doc));
  d2.contracts[0].no = 'KHAC';
  const e = await rejects(
    DB.kvCas(
      'hak.catalog.v1',
      () => {
        b.srv.hakdb.tx([{ op: 'put', table: 'kv', row: { key: 'hak.catalog.v1', val: '{"v":3}', updated_at: 9 } }]);
        return null;
      },
      d2
    )
  );
  assert.equal(e.conflict, true);
  assert.equal(projected(b.srv).contracts[0].no, '000123/HĐ', 'phần chiếu không bị ghi dở');
  await b.close();
});

const auditRows = (srv) => srv.hakdb.query({ table: 'audit_log', order: [['seq', 'asc']] }).rows;
test('nhật ký thao tác: tạo / sửa trường quan trọng (trước, sau) / ngừng dùng / khôi phục / thay liên kết / xóa — cùng giao dịch, kèm người thực hiện', async () => {
  const b = await boot(true);
  HAK.Auth = { who: () => 'Nguyễn Văn A' };
  const doc = catalogDoc();
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  const created = auditRows(b.srv);
  assert.ok(created.length >= 6 && created.every((r) => r.action === 'tạo' && r.actor === 'Nguyễn Văn A'), 'tạo: mỗi bản ghi một dòng');
  const n0 = created.length;
  const d2 = JSON.parse(JSON.stringify(doc));
  d2.contracts[0].details[0].qty = 1200; // sửa số lượng
  d2.contracts[0].details[1].deletedAt = '2026-03-01'; // ngừng dùng
  d2.customs[0].detailId = 'ct-b'; // thay liên kết
  d2.customs[0].payments[0].amount = 900;
  await DB.kvCas('hak.catalog.v1', () => null, d2);
  const rows = auditRows(b.srv).slice(n0);
  const pick = (entity, field) => rows.find((r) => r.entity === entity && r.field === field);
  assert.deepEqual(
    [pick('contract_details', 'qty').action, pick('contract_details', 'qty').before, pick('contract_details', 'qty').after],
    ['sửa', '1000', '1200']
  );
  assert.equal(pick('contract_details', 'deletedAt').action, 'ngừng dùng');
  assert.deepEqual(
    [pick('customs_decls', 'detailId').action, pick('customs_decls', 'detailId').before, pick('customs_decls', 'detailId').after],
    ['thay liên kết', '"ct-a"', '"ct-b"']
  );
  assert.equal(pick('customs_payments', 'amount').after, '900');
  const d3 = JSON.parse(JSON.stringify(d2));
  delete d3.contracts[0].details[1].deletedAt; // khôi phục
  d3.customs = []; // xóa hẳn tờ khai
  await DB.kvCas('hak.catalog.v1', () => null, d3);
  const r3 = auditRows(b.srv).slice(n0 + rows.length);
  assert.ok(r3.some((r) => r.action === 'khôi phục' && r.entity === 'contract_details'));
  assert.ok(
    r3.some(
      (r) => r.action === 'xóa' && r.entity === 'customs_decls' && r.entity_id === 'tk1' && JSON.parse(r.before).no === '308629701000'
    ),
    'xóa hẳn: giữ nguyên bản ghi trước khi xóa'
  );
  const before = auditRows(b.srv).length;
  await DB.kvCas('hak.catalog.v1', () => null, d3); // lưu lại y hệt: không sinh dòng nhật ký
  assert.equal(auditRows(b.srv).length, before);
  assert.throws(() => b.srv.hakdb.db.prepare('DELETE FROM audit_log').run(), /chỉ được thêm/);
  delete HAK.Auth;
  await b.close();
});
test('nhật ký: giao dịch lỗi / xung đột thì không để lại dòng nhật ký nào', async () => {
  const b = await boot(true);
  const doc = catalogDoc();
  await DB.kvCas('hak.catalog.v1', () => null, doc);
  const n = auditRows(b.srv).length;
  const d2 = JSON.parse(JSON.stringify(doc));
  d2.contracts[0].no = 'KHAC';
  const e = await rejects(
    DB.kvCas(
      'hak.catalog.v1',
      () => {
        b.srv.hakdb.tx([{ op: 'put', table: 'kv', row: { key: 'hak.catalog.v1', val: '{"v":3}', updated_at: 9 } }]);
        return null;
      },
      d2
    )
  );
  assert.equal(e.conflict, true);
  assert.equal(auditRows(b.srv).length, n, 'không ghi nhật ký cho thao tác bị từ chối');
  await b.close();
});
