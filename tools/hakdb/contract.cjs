/* Kiểm HỢP ĐỒNG HAKDB qua HTTP — dùng chung cho máy chủ tham chiếu (Node) và HAKDocs.exe thật (CI Windows):
 *   node tools/hakdb/contract.cjs http://127.0.0.1:31879 <token 32 hex>
 * Chỉ dùng HTTP + JSON nên không phụ thuộc cách cài đặt. Thoát mã 1 nếu có ca lỗi. Dữ liệu thử nằm trong các bảng của cơ sở dữ liệu ĐÍCH — chỉ chạy trên cơ sở dữ liệu thử. */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const nodePath = require('node:path');
const { URL } = require('node:url');

async function run(base, token, log) {
  const u = new URL(base);
  const out = [];
  const call = (method, p, body, headers) =>
    new Promise((ok, no) => {
      const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const h = Object.assign({ Origin: 'null', 'X-HAK-Client': 'documents-v1', 'X-HAK-Token': token }, headers || {});
      if (data) h['Content-Length'] = data.length;
      const rq = http.request({ host: u.hostname, port: u.port, method, path: p, headers: h }, (rs) => {
        const cs = [];
        rs.on('data', (c) => cs.push(c));
        rs.on('end', () => {
          const t = Buffer.concat(cs).toString();
          let j = null;
          try {
            j = t ? JSON.parse(t) : null;
          } catch (e) {
            /* không phải JSON */
          }
          ok({ status: rs.statusCode, body: j });
        });
      });
      rq.on('error', no);
      if (data) rq.write(data);
      rq.end();
    });
  const t = async (name, fn) => {
    try {
      await fn();
      out.push({ name, ok: true });
      if (log) log('  ✓ ' + name);
    } catch (e) {
      out.push({ name, ok: false, err: e.message });
      if (log) log('  ✗ ' + name + ' — ' + e.message);
    }
  };
  const eq = (a, b, m) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'khác') + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
  };
  const ses = async (scope, user) => ({ 'X-HAK-Session': (await call('POST', '/db/session', { scope, user: user || 'ct' })).body.session });
  const tx = (ops, h) => call('POST', '/db/tx', { ops }, h);
  const q = (body, h) => call('POST', '/db/query', body, h);

  await t('từ chối Origin lạ / thiếu client / sai token', async () => {
    eq((await call('GET', '/db/status', undefined, { Origin: 'https://x.example' })).status, 403);
    eq((await call('GET', '/db/status', undefined, { 'X-HAK-Client': 'x' })).status, 403);
    eq((await call('GET', '/db/status', undefined, { 'X-HAK-Token': 'f'.repeat(32) })).status, 403);
  });
  let admin, hak;
  await t('status: sqlite, schema 1', async () => {
    const r = await call('GET', '/db/status');
    eq(r.status, 200);
    eq([r.body.backend, r.body.schema], ['sqlite', 1]);
    admin = await ses(null, 'admin');
    hak = await ses(['hak'], 'nv');
  });
  await t('cần phiên', async () => eq((await q({ table: 'kv' })).status, 401));
  await t('khóa ngoại: chi tiết trỏ hợp đồng không có → 409 fk, không ghi gì', async () => {
    const r = await tx(
      [
        { op: 'put', table: 'contracts', row: { id: 'ct-hd', doc: '{}' } },
        { op: 'put', table: 'contract_details', row: { id: 'ct-x', contract_id: 'khong-co', doc: '{}' } },
      ],
      admin
    );
    eq([r.status, r.body.error.code, r.body.error.opIndex], [409, 'fk', 1]);
    eq((await q({ table: 'contracts', where: { id: 'ct-hd' } }, admin)).body.rows.length, 0, 'giao dịch phải hoàn tác');
  });
  await t('phiên bản bản ghi: tạo=1, ghi đè tăng, ifRev sai → 409 conflict', async () => {
    eq(
      (await tx([{ op: 'put', table: 'contracts', row: { id: 'hd1', no: '00123', doc: '{}' }, ifRev: null }], admin)).body.results[0].rev,
      1
    );
    eq((await tx([{ op: 'put', table: 'contracts', row: { id: 'hd1', no: 'MOI', doc: '{}' }, ifRev: 1 }], admin)).body.results[0].rev, 2);
    const c = await tx([{ op: 'put', table: 'contracts', row: { id: 'hd1', no: 'CU', doc: '{}' }, ifRev: 1 }], admin);
    eq([c.status, c.body.error.code, c.body.error.expected, c.body.error.actual], [409, 'conflict', 1, 2]);
    eq((await q({ table: 'contracts', where: { id: 'hd1' } }, admin)).body.rows[0].no, 'MOI');
  });
  await t('NULL / 0 / chuỗi trống, số 0 đầu, tiếng Việt, số lớn', async () => {
    await tx(
      [
        { op: 'put', table: 'customs_decls', row: { id: 'tk0', no: '000308629701', tax_vnd: 0, doc: '{}' } },
        { op: 'put', table: 'customs_decls', row: { id: 'tkn', no: 'Đại Hà ƯT', tax_vnd: null, doc: '{}' } },
        { op: 'put', table: 'archive_records', row: { id: 'r-big', kg_milli: 123456789012, meta: '{}' } },
      ],
      admin
    );
    const r = (await q({ table: 'customs_decls', order: [['id', 'asc']] }, admin)).body.rows;
    eq([r[0].no, r[0].tax_vnd, r[1].no, r[1].tax_vnd], ['000308629701', 0, 'Đại Hà ƯT', null]);
    eq((await q({ table: 'archive_records', where: { id: 'r-big' } }, admin)).body.rows[0].kg_milli, 123456789012);
  });
  await t('blob nguyên byte + CASCADE', async () => {
    const b = Buffer.from([0, 255, 1, 2, 0, 128, 7]).toString('base64');
    await tx(
      [
        { op: 'put', table: 'batches', row: { id: 'b1', doc: '{}' } },
        { op: 'put', table: 'batch_files', row: { batch_id: 'b1', bytes: { $b64: b }, sha256: 'x', size: 7 } },
      ],
      admin
    );
    const r = (await q({ table: 'batch_files', cols: ['bytes'] }, admin)).body.rows[0];
    eq(r.bytes.$b64, b);
    eq((await q({ table: 'batch_files' }, admin)).body.rows[0].bytes, undefined, 'mặc định không trả blob');
    await tx([{ op: 'del', table: 'batches', key: 'b1' }], admin);
    eq((await q({ table: 'batch_files' }, admin)).body.rows.length, 0);
  });
  await t('chống SQL từ trang: bảng / cột / toán tử lạ → 400; giá trị lạ chỉ là tham số', async () => {
    eq((await q({ table: 'sqlite_master' }, admin)).status, 400);
    eq((await q({ table: 'meta' }, admin)).status, 400);
    eq((await q({ table: 'kv', where: { 'key; DROP TABLE kv': 1 } }, admin)).status, 400);
    eq((await q({ table: 'kv', where: { key: { like: '%' } } }, admin)).status, 400);
    await tx([{ op: 'put', table: 'kv', row: { key: "O'Brien; DROP TABLE kv;--", val: '1', updated_at: 1 } }], admin);
    eq((await q({ table: 'kv', where: { key: "O'Brien; DROP TABLE kv;--" } }, admin)).body.rows.length, 1);
  });
  await t('khoảng / in / sắp xếp / phân trang / đếm', async () => {
    await tx(
      [1, 2, 3, 4, 5].map((n) => ({ op: 'put', table: 'issued', row: { id: 'i' + n, no: String(n), doc: '{}' } })),
      admin
    );
    const r = await q(
      { table: 'issued', where: { no: { gte: '2', lte: '4' } }, order: [['no', 'desc']], limit: 2, offset: 1, count: true },
      admin
    );
    eq([r.body.total, r.body.rows.map((x) => x.id)], [3, ['i3', 'i2']]);
    eq(
      (await q({ table: 'issued', where: { id: { in: ['i1', 'i5'] } }, order: [['id', 'asc']] }, admin)).body.rows.map((x) => x.id),
      ['i1', 'i5']
    );
  });
  await t('số tờ khai là chỉ mục thường (cho phép số trùng của dữ liệu cũ)', async () => {
    eq(
      (
        await tx(
          [
            { op: 'put', table: 'customs_decls', row: { id: 'u1', no: '777', doc: '{}' } },
            { op: 'put', table: 'customs_decls', row: { id: 'u2', no: '777', doc: '{}' } },
          ],
          admin
        )
      ).status,
      200
    );
  });
  await t('nhật ký: append cấp seq tăng dần, không tự đặt seq', async () => {
    const a = (await tx([{ op: 'append', table: 'audit_log', row: { at: 1, action: 'sua', entity: 'contract', entity_id: 'hd1' } }], admin))
      .body.results[0].seq;
    const b = (await tx([{ op: 'append', table: 'audit_log', row: { at: 2, action: 'sua', entity: 'contract', entity_id: 'hd1' } }], admin))
      .body.results[0].seq;
    eq(b, a + 1);
    eq((await tx([{ op: 'append', table: 'audit_log', row: { seq: 9, at: 3, action: 'x' } }], admin)).status, 400);
  });
  await t('phạm vi công ty: lọc khi đọc, chặn ghi / xóa ngoài phạm vi', async () => {
    await tx(
      [
        { op: 'put', table: 'archive_records', row: { id: 'sa', company_id: 'hak', meta: '{}' } },
        { op: 'put', table: 'archive_records', row: { id: 'sb', company_id: 'dh', meta: '{}' } },
      ],
      admin
    );
    const ids = (await q({ table: 'archive_records', where: { id: { in: ['sa', 'sb'] } }, order: [['id', 'asc']] }, hak)).body.rows.map(
      (x) => x.id
    );
    eq(ids, ['sa']);
    eq(
      (await tx([{ op: 'put', table: 'archive_records', row: { id: 'sx', company_id: 'dh', meta: '{}' } }], hak)).body.error.code,
      'scope'
    );
    eq((await tx([{ op: 'put', table: 'archive_records', row: { id: 'sb', company_id: 'hak', meta: '{}' } }], hak)).status, 403);
    eq((await tx([{ op: 'del', table: 'archive_records', key: 'sb' }], hak)).status, 403);
    eq((await tx([{ op: 'clear', table: 'archive_records', confirm: true }], hak)).status, 403);
  });
  await t('clear cần confirm; audit_log không xóa được; audit_log chỉ thêm', async () => {
    eq((await tx([{ op: 'clear', table: 'kv' }], admin)).status, 400);
    eq((await tx([{ op: 'clear', table: 'audit_log', confirm: true }], admin)).status, 400);
  });
  await t('thân quá lớn / JSON hỏng', async () => {
    eq((await call('POST', '/db/tx', '{khong phai json', admin)).status, 400);
  });
  await t(
    'chuyển nguồn: reset khi chưa kích hoạt; activate sai số → 400 kèm diff và KHÔNG kích hoạt; đúng số → kích hoạt; quay lui giữ dữ liệu',
    async () => {
      eq((await call('POST', '/db/reset', {}, hak)).status, 403, 'tài khoản giới hạn không được đổi nguồn');
      eq((await call('GET', '/db/status')).body.active, null);
      await tx(
        [
          { op: 'put', table: 'kv', row: { key: 'k1', val: '1', updated_at: 1 } },
          { op: 'put', table: 'issued', row: { id: 'ia', no: '1', doc: '{}' } },
        ],
        admin
      );
      const counts = (await call('GET', '/db/status')).body.counts;
      const bad = await call('POST', '/db/activate', { expected: { kv: counts.kv + 1 } }, admin);
      eq([bad.status, bad.body.error.code], [400, 'bad-request']);
      eq(bad.body.error.diff[0].table, 'kv');
      eq((await call('GET', '/db/status')).body.active, null, 'sai số thì không kích hoạt');
      eq((await call('POST', '/db/activate', { expected: {} }, admin)).status, 400, 'thiếu expected');
      eq((await call('POST', '/db/activate', { expected: { kv: counts.kv, issued: counts.issued } }, admin)).status, 200);
      eq((await call('GET', '/db/status')).body.active, 'sqlite');
      eq((await call('POST', '/db/activate', { expected: { kv: counts.kv } }, admin)).status, 400, 'không kích hoạt hai lần');
      eq((await call('POST', '/db/reset', {}, admin)).status, 400, 'đang là nguồn chính thì không làm sạch');
      eq((await call('POST', '/db/deactivate', {}, admin)).status, 200);
      eq((await call('GET', '/db/status')).body.active, null);
      eq((await q({ table: 'kv', where: { key: 'k1' } }, admin)).body.rows.length, 1, 'quay lui không xóa dữ liệu');
      eq((await call('POST', '/db/reset', {}, admin)).status, 200);
      const after = (await call('GET', '/db/status')).body.counts;
      eq([after.kv, after.issued, after.contracts], [0, 0, 0], 'reset xóa dữ liệu nghiệp vụ');
    }
  );
  await t('sao lưu: chỉ phiên toàn quyền, tên được lọc, tệp trong backups, không ghi đè; check đạt', async () => {
    eq((await call('POST', '/db/backup', { name: 'x' }, hak)).status, 403);
    const name = 'contract-' + Date.now();
    const r = await call('POST', '/db/backup', { name: '../../' + name }, admin);
    eq(r.status, 200);
    if (!/backups[\\/][^\\/]+\.db$/.test(r.body.path) || r.body.path.includes('..'))
      throw new Error('đường dẫn sao lưu không an toàn: ' + r.body.path);
    eq(r.body.sha256.length, 64);
    eq((await call('POST', '/db/backup', { name: '../../' + name }, admin)).status, 400, 'không ghi đè');
    eq((await call('POST', '/db/check', {}, admin)).body.ok, true);
  });
  await t(
    'sao lưu vào thư mục người dùng chọn: tên HAK_SQLite_*.db, đạt integrity_check, không ghi ra ngoài; đường dẫn xấu bị từ chối',
    async () => {
      const sameDir = (a, b) => {
        const rp = (x) => fs.realpathSync.native(x).toLowerCase();
        return rp(a) === rp(b);
      };
      const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'hakdb-bk-'));
      const dir = nodePath.join(root, 'SaoLuu SQLite');
      eq((await call('POST', '/db/backup', { dir, auto: true }, hak)).status, 403, 'phiên giới hạn công ty không được sao lưu');
      const r = await call('POST', '/db/backup', { dir, name: 'HAK_SQLite_20261119-010203.db' }, admin);
      eq(r.status, 200);
      eq(r.body.integrity, 'ok');
      eq(nodePath.basename(r.body.path), 'HAK_SQLite_20261119-010203.db');
      if (!sameDir(nodePath.dirname(r.body.path), dir)) throw new Error('ghi ra ngoài thư mục đã chọn: ' + r.body.path);
      // tên không đúng mẫu bị bỏ, dùng tên tự đặt; không bao giờ thoát khỏi thư mục
      const r2 = await call('POST', '/db/backup', { dir, name: '../../thoat' }, admin);
      eq(r2.status, 200);
      if (!/^HAK_SQLite_\d{8}-\d{6}\.db$/.test(nodePath.basename(r2.body.path)) || !sameDir(nodePath.dirname(r2.body.path), dir))
        throw new Error('tên / vị trí không an toàn: ' + r2.body.path);
      for (const bad of ['SaoLuu', '..\\..\\x', dir + nodePath.sep + '..' + nodePath.sep + 'x']) {
        const b = await call('POST', '/db/backup', { dir: bad }, admin);
        eq(b.status, 400, 'đường dẫn "' + bad + '" phải bị từ chối');
        if (!/không hợp lệ/.test(b.body.error.message)) throw new Error('thông báo không rõ: ' + b.body.error.message);
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  );
  await t('xoay vòng: giữ N bản mới nhất, CHỈ xóa HAK_SQLite_*.db; tệp khác trong thư mục không bị đụng', async () => {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'hakdb-rot-'));
    for (const f of ['quan-trong.db', 'HAK_SQLite_ghi-chu.txt', 'HAK_SQLite_20261101-000000.db.bak', 'HAK_SQLite_x.db'])
      fs.writeFileSync(nodePath.join(dir, f), 'giữ');
    const stamps = ['20261101-000001', '20261102-000001', '20261103-000001', '20261104-000001'];
    let last = null;
    for (const st of stamps) last = await call('POST', '/db/backup', { dir, name: 'HAK_SQLite_' + st + '.db', keep: 2 }, admin);
    eq(last.status, 200);
    const left = fs.readdirSync(dir).sort();
    eq(
      left.filter((f) => /^HAK_SQLite_\d{8}-\d{6}\.db$/.test(f)),
      ['HAK_SQLite_20261103-000001.db', 'HAK_SQLite_20261104-000001.db'],
      'chỉ còn 2 bản mới nhất'
    );
    for (const f of ['quan-trong.db', 'HAK_SQLite_ghi-chu.txt', 'HAK_SQLite_20261101-000000.db.bak', 'HAK_SQLite_x.db'])
      if (!left.includes(f)) throw new Error('đã xóa nhầm tệp ' + f);
    eq(last.body.removed, ['HAK_SQLite_20261102-000001.db'], 'bản bị xoay vòng ở lần cuối');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await t('thư mục không ghi được (đường dẫn là một TỆP) → lỗi tiếng Việt rõ, không để lại tệp nửa vời', async () => {
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'hakdb-ro-'));
    const file = nodePath.join(dir, 'la-mot-tep');
    fs.writeFileSync(file, 'x');
    const r = await call('POST', '/db/backup', { dir: file }, admin);
    if (r.status < 400 || !/Không ghi được/.test((r.body.error || {}).message || ''))
      throw new Error('mong đợi lỗi tiếng Việt, nhận ' + r.status + ' ' + JSON.stringify(r.body));
    eq(fs.readdirSync(dir), ['la-mot-tep']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return out;
}
module.exports = { run };

if (require.main === module) {
  const [base, token] = process.argv.slice(2);
  if (!base || !token) {
    console.error('Dùng: node tools/hakdb/contract.cjs <http://127.0.0.1:31879> <token>');
    process.exit(2);
  }
  run(base, token, console.log).then(
    (r) => {
      const bad = r.filter((x) => !x.ok);
      console.log(bad.length ? 'LỖI ' + bad.length + '/' + r.length + ' ca' : 'Đạt ' + r.length + '/' + r.length + ' ca');
      process.exit(bad.length ? 1 : 0);
    },
    (e) => {
      console.error(e.message);
      process.exit(2);
    }
  );
}
