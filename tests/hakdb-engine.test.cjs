const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { HakDb, sha256File } = require('../tools/hakdb/engine.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hakdb-'));
const open = (d) => HakDb.open(path.join(d || tmp(), 'hak.db'));
const contract = (id, extra) => Object.assign({ id, no: 'HD-' + id, type: 'xuatkhau', qty_milli: 5000000, doc: '{}' }, extra);
const throwsCode = (fn, code) => {
  try {
    fn();
  } catch (e) {
    assert.equal(e.code, code, 'mã lỗi: ' + e.code + ' – ' + e.message);
    return e;
  }
  assert.fail('phải ném lỗi ' + code);
};

test('mở lần đầu tạo schema v1; mở lại không đổi; meta có phiên bản', () => {
  const d = tmp();
  let db = open(d);
  assert.equal(db.schemaVersion(), 1);
  assert.ok(db.tables.has('contracts') && db.tables.has('audit_log'));
  const created = db.query({ table: 'kv' }).rows;
  db.close();
  db = open(d);
  assert.equal(db.schemaVersion(), 1);
  assert.deepEqual(db.query({ table: 'kv' }).rows, created);
  assert.ok(db.check().ok);
  db.close();
});
test('từ chối cơ sở dữ liệu thuộc phiên bản mới hơn', () => {
  const d = tmp();
  const db = open(d);
  db.db.prepare("UPDATE meta SET value='99' WHERE key='schema_version'").run();
  db.close();
  throwsCode(() => open(d), 'bad-request');
});
test('khóa ngoại bật trên từng kết nối: chi tiết trỏ hợp đồng không tồn tại bị chặn; xóa cha còn con bị chặn', () => {
  const d = tmp();
  const a = open(d),
    b = open(d); // hai kết nối
  for (const db of [a, b]) {
    const e = throwsCode(
      () => db.tx([{ op: 'put', table: 'contract_details', row: { id: 'ct-x', contract_id: 'khong-co', doc: '{}' } }]),
      'fk'
    );
    assert.equal(e.opIndex, 0);
  }
  a.tx([
    { op: 'put', table: 'contracts', row: contract('hd1') },
    { op: 'put', table: 'contract_details', row: { id: 'ct1', contract_id: 'hd1', doc: '{}' } },
  ]);
  throwsCode(() => b.tx([{ op: 'del', table: 'contracts', key: 'hd1' }]), 'fk');
  assert.equal(a.query({ table: 'contract_details' }).rows.length, 1);
  a.close();
  b.close();
});
test('phiên bản bản ghi: tạo =1, ghi đè tăng, ifRev sai → conflict, ifRev null khi đã có → conflict', () => {
  const db = open();
  assert.equal(db.tx([{ op: 'put', table: 'contracts', row: contract('hd1'), ifRev: null }])[0].rev, 1);
  assert.equal(db.tx([{ op: 'put', table: 'contracts', row: contract('hd1', { no: 'MOI' }), ifRev: 1 }])[0].rev, 2);
  const e = throwsCode(() => db.tx([{ op: 'put', table: 'contracts', row: contract('hd1', { no: 'CU' }), ifRev: 1 }]), 'conflict');
  assert.equal(e.actual, 2);
  assert.equal(e.expected, 1);
  throwsCode(() => db.tx([{ op: 'put', table: 'contracts', row: contract('hd1'), ifRev: null }]), 'conflict');
  assert.equal(db.query({ table: 'contracts', where: { id: 'hd1' } }).rows[0].no, 'MOI', 'bản cũ không ghi đè bản mới');
  assert.equal(db.tx([{ op: 'put', table: 'contracts', row: contract('hd1', { no: 'KHONGDIEUKIEN' }) }])[0].rev, 3);
  db.close();
});
test('giao dịch nguyên tử: một thao tác lỗi thì không ghi gì', () => {
  const db = open();
  throwsCode(
    () =>
      db.tx([
        { op: 'put', table: 'contracts', row: contract('hd1') },
        { op: 'put', table: 'contracts', row: contract('hd2') },
        { op: 'put', table: 'contract_details', row: { id: 'ct1', contract_id: 'khong-co', doc: '{}' } },
      ]),
    'fk'
  );
  assert.equal(db.query({ table: 'contracts' }).rows.length, 0);
  db.close();
});
test('guard: kiểm phiên bản của bản ghi chốt cùng giao dịch (mẫu records.js)', () => {
  const db = open();
  db.tx([{ op: 'put', table: 'batches', row: { id: 'b1', type: 'xuatkhau', filename: 'a.xlsx', doc: '{}' } }]);
  db.tx([
    { op: 'guard', table: 'batches', key: 'b1', ifRev: 1 },
    { op: 'put', table: 'batches', row: { id: 'b1', doc: '{"n":2}' } },
  ]);
  throwsCode(
    () =>
      db.tx([
        { op: 'guard', table: 'batches', key: 'b1', ifRev: 1 },
        { op: 'put', table: 'batches', row: { id: 'b1', doc: '{"n":3}' } },
      ]),
    'conflict'
  );
  assert.equal(db.query({ table: 'batches' }).rows[0].doc, '{"n":2}');
  db.close();
});
test('NULL, 0 và chuỗi trống khác nhau; số 0 đầu của mã được giữ; tiếng Việt nguyên vẹn', () => {
  const db = open();
  db.tx([
    { op: 'put', table: 'contracts', row: contract('hd0', { qty_milli: 0, no: '00123/HĐ-ƯT' }) },
    { op: 'put', table: 'contracts', row: contract('hdn', { qty_milli: null, no: '' }) },
    {
      op: 'put',
      table: 'customs_decls',
      row: { id: 'tk1', no: '000308629701', contract_id: 'hd0', tax_vnd: 0, doc: '{"taxVnd":0,"note":""}' },
    },
    {
      op: 'put',
      table: 'customs_decls',
      row: { id: 'tk2', no: '308629701001', contract_id: 'hd0', tax_vnd: null, doc: '{"taxVnd":null}' },
    },
  ]);
  const c = Object.fromEntries(db.query({ table: 'contracts' }).rows.map((r) => [r.id, r]));
  assert.strictEqual(c.hd0.qty_milli, 0);
  assert.strictEqual(c.hdn.qty_milli, null);
  assert.strictEqual(c.hd0.no, '00123/HĐ-ƯT');
  assert.strictEqual(c.hdn.no, '');
  const t = Object.fromEntries(db.query({ table: 'customs_decls' }).rows.map((r) => [r.id, r]));
  assert.strictEqual(t.tk1.no, '000308629701');
  assert.strictEqual(t.tk1.tax_vnd, 0);
  assert.strictEqual(t.tk2.tax_vnd, null);
  assert.strictEqual(db.query({ table: 'customs_decls', where: { tax_vnd: null } }).rows.length, 1);
  assert.strictEqual(db.query({ table: 'customs_decls', where: { tax_vnd: 0 } }).rows.length, 1);
  db.close();
});
test('độ chính xác: kg theo 1/1000 và tiền là số nguyên ghi/đọc đúng, kể cả số lớn', () => {
  const db = open();
  const cases = [0, 1, 21050500, 123456789012, 9007199254740, -1500];
  db.tx(cases.map((n, i) => ({ op: 'put', table: 'archive_records', row: { id: 'r' + i, kg_milli: n, meta: '{}' } })));
  const got = db.query({ table: 'archive_records', order: [['id', 'asc']] }).rows.map((r) => r.kg_milli);
  assert.deepEqual(got, cases);
  const sum = db.db.prepare('SELECT SUM(kg_milli) s FROM archive_records').get().s;
  assert.equal(
    Number(sum),
    cases.reduce((a, b) => a + b, 0)
  );
  throwsCode(() => db.tx([{ op: 'put', table: 'archive_records', row: { id: 'x', kg_milli: NaN, meta: '{}' } }]), 'bad-request');
  db.close();
});
test('truy vấn: bảng / cột lạ bị từ chối (chống SQL từ trang), tham số hóa, in / khoảng / sắp xếp / phân trang', () => {
  const db = open();
  db.tx(
    [1, 2, 3, 4, 5].map((n) => ({
      op: 'put',
      table: 'archive_records',
      row: { id: 'r' + n, from_ts: n * 100, kg_milli: n, meta: '{}', title: "O'Brien; DROP TABLE kv;--" },
    }))
  );
  throwsCode(() => db.query({ table: 'sqlite_master' }), 'bad-request');
  throwsCode(() => db.query({ table: 'meta' }), 'bad-request');
  throwsCode(() => db.query({ table: 'archive_records', where: { 'id; DROP TABLE kv': 1 } }), 'bad-request');
  throwsCode(() => db.query({ table: 'archive_records', cols: ['id', '(select 1)'] }), 'bad-request');
  throwsCode(() => db.query({ table: 'archive_records', where: { id: { like: '%' } } }), 'bad-request');
  assert.equal(
    db.query({ table: 'archive_records', where: { title: "O'Brien; DROP TABLE kv;--" } }).rows.length,
    5,
    'giá trị lạ chỉ là tham số'
  );
  assert.ok(db.tables.has('kv'));
  const r = db.query({
    table: 'archive_records',
    where: { from_ts: { gte: 200, lte: 400 } },
    order: [['from_ts', 'desc']],
    limit: 2,
    offset: 1,
    count: true,
  });
  assert.equal(r.total, 3);
  assert.deepEqual(
    r.rows.map((x) => x.id),
    ['r3', 'r2']
  );
  assert.deepEqual(
    db.query({ table: 'archive_records', where: { id: { in: ['r1', 'r5'] } }, order: [['id', 'asc']] }).rows.map((x) => x.id),
    ['r1', 'r5']
  );
  db.close();
});
test('blob: ghi / đọc nguyên byte; mặc định không trả cột blob; khóa ngoại + CASCADE của tệp đợt Excel', () => {
  const db = open();
  const bytes = Buffer.from([0, 255, 1, 2, 0, 128, 7]);
  db.tx([
    { op: 'put', table: 'batches', row: { id: 'b1', type: 'xuatkhau', filename: 'Tàu Đại Hà.xlsx', doc: '{}' } },
    {
      op: 'put',
      table: 'batch_files',
      row: { batch_id: 'b1', bytes: { $b64: bytes.toString('base64') }, sha256: 'x', size: bytes.length },
    },
  ]);
  assert.equal(db.query({ table: 'batch_files' }).rows[0].bytes, undefined);
  const r = db.query({ table: 'batch_files', cols: ['bytes'] }).rows[0];
  assert.deepEqual(Buffer.from(r.bytes.$b64, 'base64'), bytes);
  throwsCode(
    () => db.tx([{ op: 'put', table: 'batch_files', row: { batch_id: 'b-khong-co', bytes: { $b64: 'AA==' }, sha256: 'x', size: 1 } }]),
    'fk'
  );
  db.tx([{ op: 'del', table: 'batches', key: 'b1' }]);
  assert.equal(db.query({ table: 'batch_files' }).rows.length, 0, 'xóa đợt thì xóa tệp gốc đi kèm');
  db.close();
});
test('số tờ khai duy nhất trong các tờ khai đang dùng; ngừng dùng thì được lập lại số đó', () => {
  const db = open();
  db.tx([{ op: 'put', table: 'customs_decls', row: { id: 'tk1', no: '111', doc: '{}' } }]);
  throwsCode(() => db.tx([{ op: 'put', table: 'customs_decls', row: { id: 'tk2', no: '111', doc: '{}' } }]), 'unique');
  db.tx([
    { op: 'put', table: 'customs_decls', row: { id: 'tk1', deleted_at: '2026-01-01' } },
    { op: 'put', table: 'customs_decls', row: { id: 'tk2', no: '111', doc: '{}' } },
  ]);
  assert.equal(db.query({ table: 'customs_decls', where: { no: '111' } }).rows.length, 2);
  db.close();
});
test('phạm vi công ty: bảng có company_id lọc khi đọc, chặn ghi / xóa ngoài phạm vi', () => {
  const db = open();
  const all = null;
  db.tx(
    [
      { op: 'put', table: 'archive_records', row: { id: 'a', company_id: 'hak', meta: '{}' } },
      { op: 'put', table: 'archive_records', row: { id: 'b', company_id: 'dh', meta: '{}' } },
      { op: 'put', table: 'archive_records', row: { id: 'c', company_id: null, meta: '{}' } },
    ],
    { scope: all }
  );
  const ctx = { scope: ['hak'] };
  assert.deepEqual(
    db.query({ table: 'archive_records', order: [['id', 'asc']] }, ctx).rows.map((r) => r.id),
    ['a', 'c']
  );
  throwsCode(() => db.tx([{ op: 'put', table: 'archive_records', row: { id: 'x', company_id: 'dh', meta: '{}' } }], ctx), 'scope');
  throwsCode(() => db.tx([{ op: 'put', table: 'archive_records', row: { id: 'b', company_id: 'hak', meta: '{}' } }], ctx), 'scope'); // chiếm bản ghi của công ty khác
  throwsCode(() => db.tx([{ op: 'del', table: 'archive_records', key: 'b' }], ctx), 'scope');
  assert.equal(db.query({ table: 'archive_records' }).rows.length, 3, 'không bản nào bị đổi');
  assert.deepEqual(
    db.query({ table: 'archive_records' }, { scope: [] }).rows.map((r) => r.id),
    ['c'],
    'phạm vi rỗng chỉ thấy bản ghi chung'
  );
  db.close();
});
test('nhật ký thao tác chỉ thêm: sửa / xóa bị chặn', () => {
  const db = open();
  db.tx([
    {
      op: 'put',
      table: 'audit_log',
      row: { seq: 1, at: 1, action: 'sua', entity: 'contract', entity_id: 'hd1', field: 'qty', before: '1', after: '2' },
    },
  ]);
  assert.throws(() => db.db.prepare("UPDATE audit_log SET after='9'").run(), /chỉ được thêm/);
  assert.throws(() => db.db.prepare('DELETE FROM audit_log').run(), /chỉ được thêm/);
  assert.equal(db.query({ table: 'audit_log' }).rows[0].after, '2');
  db.close();
});
test('hai kết nối cùng sửa một bản ghi: kết nối đọc bản cũ bị từ chối khi ghi', () => {
  const d = tmp();
  const a = open(d),
    b = open(d);
  a.tx([{ op: 'put', table: 'kv', row: { key: 'hak.catalog.v1', val: '{"n":1}', updated_at: 1 } }]);
  const revA = a.query({ table: 'kv', where: { key: 'hak.catalog.v1' } }).rows[0].rev;
  const revB = b.query({ table: 'kv', where: { key: 'hak.catalog.v1' } }).rows[0].rev;
  assert.equal(revA, revB);
  b.tx([{ op: 'put', table: 'kv', row: { key: 'hak.catalog.v1', val: '{"n":2}', updated_at: 2 }, ifRev: revB }]);
  const e = throwsCode(
    () => a.tx([{ op: 'put', table: 'kv', row: { key: 'hak.catalog.v1', val: '{"n":3}', updated_at: 3 }, ifRev: revA }]),
    'conflict'
  );
  assert.equal(e.actual, 2);
  assert.equal(a.query({ table: 'kv' }).rows[0].val, '{"n":2}');
  a.close();
  b.close();
});
test('sao lưu VACUUM INTO: bản sao nhất quán, mở lại được, băm khớp, không ghi đè tệp có sẵn', () => {
  const d = tmp();
  const db = open(d);
  db.tx([
    { op: 'put', table: 'contracts', row: contract('hd1') },
    { op: 'put', table: 'contract_details', row: { id: 'ct1', contract_id: 'hd1', doc: '{}' } },
  ]);
  const dest = path.join(d, 'backup', 'hak-1.db');
  const r = db.backup(dest);
  assert.equal(r.sha256, sha256File(dest));
  assert.equal(r.schema, 1);
  throwsCode(() => db.backup(dest), 'bad-request');
  db.tx([{ op: 'put', table: 'contracts', row: contract('hd2') }]); // ghi tiếp sau sao lưu không ảnh hưởng bản sao
  const copy = HakDb.open(dest);
  assert.deepEqual(copy.counts().contracts, 1);
  assert.ok(copy.check().ok);
  copy.close();
  assert.equal(db.counts().contracts, 2);
  assert.ok(!fs.existsSync(dest + '.part'));
  db.close();
});
test('mất tiến trình giữa giao dịch (SIGKILL): không còn dữ liệu dở dang, tệp vẫn toàn vẹn', async () => {
  const d = tmp();
  open(d).close();
  const child = spawn(
    process.execPath,
    [
      '--no-warnings',
      '-e',
      `const {HakDb}=require(${JSON.stringify(path.join(__dirname, '..', 'tools', 'hakdb', 'engine.cjs'))});
       const db=HakDb.open(${JSON.stringify(path.join(d, 'hak.db'))});
       db.db.exec('BEGIN IMMEDIATE');
       for(let i=0;i<20000;i++) db.db.prepare("INSERT INTO contracts(id,doc) VALUES(?,'{}')").run('c'+i);
       console.log('ready'); setInterval(()=>{},1000);`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  await new Promise((ok) => child.stdout.on('data', (b) => String(b).includes('ready') && ok()));
  child.kill('SIGKILL');
  await new Promise((ok) => child.on('exit', ok));
  const db = open(d);
  assert.equal(db.counts().contracts, 0);
  assert.ok(db.check().ok);
  db.tx([{ op: 'put', table: 'contracts', row: contract('sau') }]);
  assert.equal(db.counts().contracts, 1);
  db.close();
});

test('clear: cần confirm; bảng nhật ký không xóa được; tài khoản giới hạn công ty bị chặn; khóa ngoại vẫn áp dụng', () => {
  const db = open();
  db.tx([
    { op: 'put', table: 'kv', row: { key: 'a', val: '1', updated_at: 1 } },
    { op: 'put', table: 'kv', row: { key: 'b', val: '2', updated_at: 1 } },
  ]);
  throwsCode(() => db.tx([{ op: 'clear', table: 'kv' }]), 'bad-request');
  throwsCode(() => db.tx([{ op: 'clear', table: 'audit_log', confirm: true }]), 'bad-request');
  throwsCode(() => db.tx([{ op: 'clear', table: 'archive_records', confirm: true }], { scope: ['hak'] }), 'scope');
  assert.equal(db.tx([{ op: 'clear', table: 'kv', confirm: true }])[0].deleted, 2);
  db.tx([
    { op: 'put', table: 'contracts', row: contract('hd1') },
    { op: 'put', table: 'contract_details', row: { id: 'ct1', contract_id: 'hd1', doc: '{}' } },
  ]);
  throwsCode(() => db.tx([{ op: 'clear', table: 'contracts', confirm: true }]), 'fk');
  assert.equal(db.counts().contracts, 1, 'xóa toàn bảng hỏng thì không mất gì');
  db.close();
});
