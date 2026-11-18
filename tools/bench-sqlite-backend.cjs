/* Đo backend SQLite của app (client db-sqlite.js THẬT + máy chủ HAKDB tham chiếu qua HTTP localhost) với dữ liệu đại diện.
 *   node tools/bench-sqlite-backend.cjs [nhỏ|vừa|lớn|all] [ketqua.json]
 * Mức (như đợt đo IndexedDB trước): nhỏ 50 hồ sơ × 40 phiếu · vừa 500 × 60 · lớn 1.500 × 100. Đo ở Node trên Linux — KHÔNG phải Edge / Windows / ổ đĩa của người dùng. */
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  { performance } = require('node:perf_hooks');
global.window = global;
const ls = new Map();
global.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  get length() {
    return ls.size;
  },
  key: (i) => Array.from(ls.keys())[i],
};
const TOKEN = 'b'.repeat(32);
global.HAK_DOCS_TOKEN = TOKEN;
const { createServer } = require('./hakdb/server.cjs');
require('../app/js/storage.js');
HAK.ContractModel = require('../app/js/contract-model.js');
HAK.CustomsModel = require('../app/js/customs-model.js');
require('../app/js/catalog-rows.js');
require('../app/js/db-sqlite.js');
require('../app/js/migrate.js');
const S = HAK.Storage,
  D = HAK.DBSqlite,
  Mg = HAK.Migrate;

const LEVELS = { nhỏ: [50, 40], vừa: [500, 60], lớn: [1500, 100] };
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function time(fn, n) {
  const t = [];
  for (let i = 0; i < n; i++) {
    const s = performance.now();
    await fn(i);
    t.push(performance.now() - s);
  }
  return +median(t).toFixed(2);
}
const rowsOf = (r, per) =>
  Array.from({ length: per }, (_, i) => ({
    idx: i,
    uid: 'u' + r + '-' + i,
    ticket: 'P' + String(r * 1000 + i).padStart(7, '0'),
    dateStr: '05/02/2026',
    plate: '43C-' + (10000 + ((r * 7 + i) % 9000)),
    time1: '08:' + String(i % 60).padStart(2, '0'),
    net: 20000 + ((r * 31 + i * 17) % 5000),
    carrier: 'VT-' + (i % 5),
  }));
const pack = (rows) => 'gz:' + zlib.gzipSync(JSON.stringify({ params: { returned: [] }, rows })).toString('base64');
const metaOf = (r, per) => ({
  id: 'a' + r,
  type: 'xuatkhau',
  title: 'TÀU ' + r,
  ship: 'TÀU ' + r,
  cid: r % 2 ? 'hak' : 'dh',
  from: '05/02/2026',
  to: '05/02/2026',
  trips: per,
  kg: per * 22000,
  updatedAt: 1000 + r,
  createdAt: 1000 + r,
  contract: '',
});

async function level(name) {
  const [n, per] = LEVELS[name];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-bench-'));
  const srv = createServer({ dataDir: dir, token: TOKEN });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  global.HAK_DB_URL = 'http://127.0.0.1:' + srv.address().port;
  S._reset();
  await S.start();
  await S.openSession(null, 'bench');
  const items = Array.from({ length: n }, (_, r) => ({ meta: metaOf(r, per), data: pack(rowsOf(r, per)) }));
  const snap = {
    keys: { 'hak.config.v1': { x: 1 }, 'hak.catalog.v1': { v: 3, customers: [], products: [], contracts: [], customs: [] } },
    items,
    batches: Array.from({ length: Math.min(n, 100) }, (_, i) => ({
      meta: { id: 'xuatkhau|f' + i + '.xlsx', type: 'xuatkhau', fileName: 'f' + i + '.xlsx', rev: 1, addedAt: i },
      b64: Buffer.alloc(per * 90, i).toString('base64'),
    })),
    issued: [],
    attachments: [],
    bklsTemplates: [],
    yearbook: null,
  };
  const out = { mức: name, hồ_sơ: n, phiếu_mỗi_hồ_sơ: per, tổng_phiếu: n * per };
  let t = performance.now();
  const r = await Mg.run(snap);
  out.di_trú_nhập_và_đối_chiếu_ms = Math.round(performance.now() - t);
  out.đối_chiếu_đạt = r.ok;
  t = performance.now();
  await Mg.verify(snap);
  out.đối_chiếu_riêng_ms = Math.round(performance.now() - t);
  const st = fs.statSync(path.join(dir, 'hak.db'));
  out.dung_lượng_db_MB = +(st.size / 1048576).toFixed(2);
  out.lưu_1_hồ_sơ_ms = await time((i) => D.archive.put(metaOf(n + i, per), pack(rowsOf(n + i, per))), 20);
  out.mở_1_hồ_sơ_ms = await time((i) => D.archive.data('a' + ((i * 37) % n)), 30);
  out.danh_sách_hồ_sơ_ms = await time(() => D.archive.metas(), 5);
  t = performance.now();
  let total = 0;
  for (let i = 0; i < n; i += 50) {
    const rs = (
      await S.call('/db/query', {
        table: 'archive_data',
        cols: ['record_id', 'payload'],
        order: [['record_id', 'asc']],
        limit: 50,
        offset: i,
      })
    ).rows;
    rs.forEach((x) => (total += zlib.gunzipSync(Buffer.from(x.payload.slice(3), 'base64')).length));
  }
  out.đọc_và_giải_nén_mọi_hồ_sơ_ms = Math.round(performance.now() - t);
  t = performance.now();
  const b = srv.hakdb.backup(path.join(dir, 'backups', 'b.db'));
  out.sao_lưu_VACUUM_INTO_ms = Math.round(performance.now() - t);
  out.sao_lưu_MB = +(b.size / 1048576).toFixed(2);
  t = performance.now();
  const chk = srv.hakdb.check();
  out.kiểm_tra_toàn_vẹn_ms = Math.round(performance.now() - t);
  out.toàn_vẹn_đạt = chk.ok;
  await new Promise((ok) => srv.close(ok));
  return out;
}
(async () => {
  const arg = process.argv[2] || 'all';
  const names = arg === 'all' ? Object.keys(LEVELS) : [arg];
  const res = [];
  for (const nm of names) {
    const o = await level(nm);
    res.push(o);
    console.log(JSON.stringify(o));
  }
  if (process.argv[3])
    fs.writeFileSync(
      process.argv[3],
      JSON.stringify(
        {
          môi_trường: {
            os: os.platform() + ' ' + os.release(),
            cpu: os.cpus()[0].model,
            nhân: os.cpus().length,
            ram_GB: +(os.totalmem() / 1073741824).toFixed(1),
            node: process.version,
            ghi_chú: 'Node + HTTP localhost, KHÔNG phải trình duyệt / Edge / Windows',
          },
          kết_quả: res,
        },
        null,
        1
      )
    );
})();
