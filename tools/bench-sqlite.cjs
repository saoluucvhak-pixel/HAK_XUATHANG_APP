/* Đo SQLite với CÙNG bộ dữ liệu mẫu như tools/bench-storage.cjs (không đụng dữ liệu thật):
 *   node tools/bench-sqlite.cjs <nhỏ|vừa|lớn|all> [file-ra.json]
 *  (a) SQLite gốc qua node:sqlite (≈ phương án HAKDocs giữ cơ sở dữ liệu SQLite trên đĩa; cùng engine SQLite, chưa tính chi phí HTTP localhost / .NET);
 *  (b) SQLite WASM (sql.js 1.12) chạy trong Chromium (≈ phương án "SQLite trong trình duyệt"); đo cả chi phí lưu bền: xuất toàn bộ file → ghi IndexedDB, và nạp lại.
 * Cần: npm i sql.js@1.12.0 trong thư mục SQLJS (mặc định ../sqljs) — chỉ để đo, không thêm vào dependencies của repo. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const SIZES = { nhỏ: [50, 40], vừa: [500, 60], lớn: [1500, 100] };
const arg = process.argv[2] || 'all',
  out = process.argv[3];
const SQLJS = path.resolve(process.env.SQLJS || path.join(__dirname, '../../sqljs/node_modules/sql.js/dist'));
const { DatabaseSync } = require('node:sqlite');
const ms = (t) => +(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1);
const tk = () => process.hrtime.bigint();
// cùng công thức sinh dữ liệu với bench-storage
const genRow = (i, j, K) => {
  const month = 1 + (i % 12),
    day = 1 + (i % 27);
  return {
    uid: 'u' + i + '_' + j,
    ticket: String(100000 + i * K + j).padStart(7, '0'),
    plate: '43C-' + String(10000 + ((i * 7 + j) % 90000)),
    date: Date.UTC(2026, month - 1, day, 6 + (j % 14), (j * 7) % 60),
    net: 25000 + ((i * 31 + j * 17) % 6000),
    carrier: 'VT-' + (j % 7),
    driver: 'Tài xế ' + (j % 40),
  };
};
const SCHEMA = `
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE record(id TEXT PRIMARY KEY, type TEXT NOT NULL, ship TEXT, company TEXT NOT NULL, year INTEGER NOT NULL, from_ts INTEGER, to_ts INTEGER,
  trips INTEGER NOT NULL, kg INTEGER NOT NULL, ret_kg INTEGER NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, params TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE ticket(record_id TEXT NOT NULL REFERENCES record(id) ON DELETE CASCADE, idx INTEGER NOT NULL, uid TEXT, ticket TEXT NOT NULL, plate TEXT,
  weigh_ts INTEGER, kg INTEGER NOT NULL, returned INTEGER NOT NULL DEFAULT 0, carrier TEXT, driver TEXT, PRIMARY KEY(record_id, idx)) WITHOUT ROWID;
CREATE INDEX ix_ticket_ts ON ticket(weigh_ts); CREATE INDEX ix_ticket_no ON ticket(ticket); CREATE INDEX ix_record_co_year ON record(company, year);
`;
function native(N, K) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-sqlite-'));
  const file = path.join(dir, 'hak.db');
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const r = {};
  let t = tk();
  db.exec('BEGIN');
  const ir = db.prepare('INSERT INTO record VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    it = db.prepare('INSERT INTO ticket VALUES(?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < N; i++) {
    let kg = 0;
    const rows = Array.from({ length: K }, (_, j) => genRow(i, j, K));
    rows.forEach((x) => (kg += x.net));
    ir.run('a' + i, 'uythac', 'TÀU ' + i, 'hak', 2026, rows[0].date, rows[K - 1].date, K, kg, 0, 1, Date.now(), '{}');
    rows.forEach((x, j) => it.run('a' + i, j + 1, x.uid, x.ticket, x.plate, x.date, x.net, 0, x.carrier, x.driver));
  }
  db.exec('COMMIT');
  r.bulkInsertMs = ms(t);
  // thêm 1 hồ sơ (giao dịch nhỏ) — độ trễ lưu một hồ sơ
  const times = [];
  for (let k = 0; k < 20; k++) {
    t = tk();
    db.exec('BEGIN');
    const i = N + k;
    ir.run('b' + k, 'uythac', 'TÀU ' + i, 'hak', 2026, 0, 0, K, 0, 0, 1, Date.now(), '{}');
    for (let j = 0; j < K; j++) {
      const x = genRow(i, j, K);
      it.run('b' + k, j + 1, x.uid, x.ticket, x.plate, x.date, x.net, 0, x.carrier, x.driver);
    }
    db.exec('COMMIT');
    times.push(ms(t));
  }
  times.sort((a, b) => a - b);
  r.addOneRecordMedianMs = times[10];
  // mở hồ sơ
  const open = [];
  for (let k = 0; k < 30; k++) {
    t = tk();
    db.prepare('SELECT * FROM record WHERE id=?').get('a' + ((k * 37) % N));
    db.prepare('SELECT * FROM ticket WHERE record_id=? ORDER BY idx').all('a' + ((k * 37) % N));
    open.push(ms(t));
  }
  open.sort((a, b) => a - b);
  r.openRecordMedianMs = open[15];
  // báo cáo theo kỳ (tháng 03/2026): lọc phiếu theo ngày cân + tổng; và lấy toàn bộ phiếu của kỳ về JS
  const from = Date.UTC(2026, 2, 1),
    to = Date.UTC(2026, 3, 1);
  t = tk();
  const agg = db.prepare('SELECT count(*) n, sum(kg) kg FROM ticket WHERE weigh_ts>=? AND weigh_ts<?').get(from, to);
  r.reportAggregateMs = ms(t);
  t = tk();
  const rows = db
    .prepare(
      'SELECT t.record_id, t.ticket, t.kg, t.returned, t.carrier, r.type FROM ticket t JOIN record r ON r.id=t.record_id WHERE t.weigh_ts>=? AND t.weigh_ts<?'
    )
    .all(from, to);
  r.reportFetchRowsMs = ms(t);
  r.reportRows = rows.length;
  t = tk();
  const dup = db.prepare('SELECT ticket, count(*) c FROM ticket GROUP BY ticket HAVING c>1').all();
  r.dupScanMs = ms(t);
  r.dupFound = dup.length;
  // sao lưu (VACUUM INTO) và kích thước
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  r.fileMB = +(fs.statSync(file).size / 1048576).toFixed(2);
  t = tk();
  db.exec("VACUUM INTO '" + path.join(dir, 'bk.db') + "'");
  r.backupVacuumMs = ms(t);
  t = tk();
  const db2 = new DatabaseSync(path.join(dir, 'bk.db'));
  r.restoreOpenMs = ms(t);
  r.restoreCount = db2.prepare('SELECT count(*) c FROM ticket').get().c;
  db2.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}
async function wasm(N, K) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-sqlw-'));
  const ctx = await chromium.launchPersistentContext(dir, {});
  const p = ctx.pages()[0] || (await ctx.newPage());
  p.setDefaultTimeout(0);
  await p.goto(require('node:url').pathToFileURL(path.resolve(__dirname, '../app/index.html')).href);
  await p.addScriptTag({ content: fs.readFileSync(path.join(SQLJS, 'sql-wasm.js'), 'utf8') });
  const wasmB64 = fs.readFileSync(path.join(SQLJS, 'sql-wasm.wasm')).toString('base64');
  const r = await p.evaluate(
    async ([N, K, wasmB64, SCHEMA, genSrc]) => {
      const genRow = eval('(' + genSrc + ')');
      const r = {};
      let t = performance.now();
      const SQL = await initSqlJs({ wasmBinary: Uint8Array.from(atob(wasmB64), (c) => c.charCodeAt(0)) });
      r.initWasmMs = +(performance.now() - t).toFixed(1);
      const db = new SQL.Database();
      db.exec(SCHEMA.replace('PRAGMA journal_mode=WAL;', ''));
      t = performance.now();
      db.exec('BEGIN');
      const ir = db.prepare('INSERT INTO record VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'),
        it = db.prepare('INSERT INTO ticket VALUES(?,?,?,?,?,?,?,?,?,?)');
      for (let i = 0; i < N; i++) {
        let kg = 0;
        const rows = Array.from({ length: K }, (_, j) => genRow(i, j, K));
        rows.forEach((x) => (kg += x.net));
        ir.run(['a' + i, 'uythac', 'TÀU ' + i, 'hak', 2026, rows[0].date, rows[K - 1].date, K, kg, 0, 1, Date.now(), '{}']);
        rows.forEach((x, j) => it.run(['a' + i, j + 1, x.uid, x.ticket, x.plate, x.date, x.net, 0, x.carrier, x.driver]));
      }
      db.exec('COMMIT');
      r.bulkInsertMs = +(performance.now() - t).toFixed(1);
      const q = (sql, args) => {
        const st = db.prepare(sql);
        st.bind(args || []);
        const o = [];
        while (st.step()) o.push(st.getAsObject());
        st.free();
        return o;
      };
      const open = [];
      for (let k = 0; k < 30; k++) {
        t = performance.now();
        q('SELECT * FROM record WHERE id=?', ['a' + ((k * 37) % N)]);
        q('SELECT * FROM ticket WHERE record_id=? ORDER BY idx', ['a' + ((k * 37) % N)]);
        open.push(performance.now() - t);
      }
      open.sort((a, b) => a - b);
      r.openRecordMedianMs = +open[15].toFixed(2);
      const from = Date.UTC(2026, 2, 1),
        to = Date.UTC(2026, 3, 1);
      t = performance.now();
      q('SELECT count(*) n, sum(kg) kg FROM ticket WHERE weigh_ts>=? AND weigh_ts<?', [from, to]);
      r.reportAggregateMs = +(performance.now() - t).toFixed(1);
      t = performance.now();
      const rows = q(
        'SELECT t.record_id, t.ticket, t.kg, t.returned, t.carrier, r.type FROM ticket t JOIN record r ON r.id=t.record_id WHERE t.weigh_ts>=? AND t.weigh_ts<?',
        [from, to]
      );
      r.reportFetchRowsMs = +(performance.now() - t).toFixed(1);
      r.reportRows = rows.length;
      // Lưu bền: xuất toàn bộ file → ghi IndexedDB (mỗi lần thay đổi phải ghi lại CẢ file với sql.js)
      const idb = await new Promise((ok, no) => {
        const rq = indexedDB.open('sqlbench', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('f');
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = () => no(rq.error);
      });
      const put = (bytes) =>
        new Promise((ok, no) => {
          const tx = idb.transaction('f', 'readwrite');
          tx.objectStore('f').put(bytes, 'db');
          tx.oncomplete = ok;
          tx.onerror = tx.onabort = () => no(tx.error);
        });
      const times = [];
      let bytes;
      for (let k = 0; k < 5; k++) {
        db.exec("INSERT INTO record VALUES('c" + k + "','uythac','X','hak',2026,0,0,1,1,0,1,1,'{}')");
        t = performance.now();
        bytes = db.export();
        const tExport = performance.now() - t;
        t = performance.now();
        await put(bytes);
        times.push([tExport, performance.now() - t]);
      }
      r.persistExportMs = +times[2][0].toFixed(1);
      r.persistIdbPutMs = +times[2][1].toFixed(1);
      r.fileMB = +(bytes.length / 1048576).toFixed(2);
      t = performance.now();
      const got = await new Promise((ok, no) => {
        const rq = idb.transaction('f').objectStore('f').get('db');
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = () => no(rq.error);
      });
      const tLoad = performance.now() - t;
      t = performance.now();
      const db2 = new SQL.Database(got);
      r.reloadIdbReadMs = +tLoad.toFixed(1);
      r.reloadOpenMs = +(performance.now() - t).toFixed(1);
      r.heapMB = performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null;
      db2.close();
      db.close();
      return r;
    },
    [N, K, wasmB64, SCHEMA, genRow.toString()]
  );
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}
(async () => {
  const names = arg === 'all' ? Object.keys(SIZES) : [arg],
    res = [];
  for (const n of names) {
    const [N, K] = SIZES[n];
    console.log('== ' + n + ' ' + N + ' × ' + K);
    const row = { size: n, records: N, tickets: N * K, native: native(N, K), wasm: await wasm(N, K) };
    console.log(JSON.stringify(row));
    res.push(row);
  }
  if (out)
    fs.writeFileSync(out, JSON.stringify({ node: process.version, sqlite: '3.53.4 (node:sqlite) / sql.js 1.12.0', results: res }, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
