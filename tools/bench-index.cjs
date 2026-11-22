/* Mô phỏng phương án "chỉ mục phiếu" trong IndexedDB: mỗi hồ sơ có 1 bản ghi phiếu rút gọn (không nén) để đọc báo cáo kỳ mà không phải gunzip. Dữ liệu mẫu 1.500 × 100. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const APP = require('node:url').pathToFileURL(path.resolve(__dirname, '../app/index.html')).href;
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-idx-'));
  const ctx = await chromium.launchPersistentContext(dir, {});
  const p = ctx.pages()[0] || (await ctx.newPage());
  await p.goto(APP);
  const N = +process.argv[2] || 1500,
    K = +process.argv[3] || 100;
  const r = await p.evaluate(
    async ([N, K]) => {
      const db = await new Promise((ok) => {
        const rq = indexedDB.open('proto-index', 1);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          const s = d.createObjectStore('tickets', { keyPath: 'id' });
          s.createIndex('byDate', 'minTs');
        };
        rq.onsuccess = () => ok(rq.result);
      });
      const mk = (i) => ({
        id: 'a' + i,
        u: 1,
        minTs: Date.UTC(2026, i % 12, 1),
        maxTs: Date.UTC(2026, i % 12, 28),
        t: Array.from({ length: K }, (_, j) => ({
          i: j,
          id: 'T|hak|' + String(100000 + i * K + j).padStart(7, '0') + '|01/03/2026|43C-' + (10000 + j) + '#1',
          ticket: String(100000 + i * K + j).padStart(7, '0'),
          date: '01/03/2026',
          plate: '43C-' + (10000 + j),
          net: 25000 + j,
          carrier: 'VT-' + (j % 7),
          uid: 'u' + i + '_' + j,
          ret: false,
          link: 'c|ship',
        })),
      });
      const out = {};
      let t = performance.now();
      await new Promise((ok) => {
        const tx = db.transaction('tickets', 'readwrite');
        const s = tx.objectStore('tickets');
        for (let i = 0; i < N; i++) s.put(mk(i));
        tx.oncomplete = ok;
      });
      out.writeAllMs = Math.round(performance.now() - t);
      t = performance.now();
      const all = await new Promise((ok) => {
        const g = db.transaction('tickets').objectStore('tickets').getAll();
        g.onsuccess = () => ok(g.result);
      });
      out.getAllColdMs = Math.round(performance.now() - t);
      out.records = all.length;
      // chỉ mục theo ngày: hồ sơ có phiếu trong tháng 3/2026
      t = performance.now();
      const month = await new Promise((ok) => {
        const g = db
          .transaction('tickets')
          .objectStore('tickets')
          .index('byDate')
          .getAll(IDBKeyRange.bound(Date.UTC(2026, 2, 1), Date.UTC(2026, 3, 1)));
        g.onsuccess = () => ok(g.result);
      });
      out.indexedMonthMs = Math.round(performance.now() - t);
      out.monthRecords = month.length;
      t = performance.now();
      const one = [];
      for (let k = 0; k < 20; k++) {
        const x = performance.now();
        await new Promise((ok) => {
          const tx = db.transaction('tickets', 'readwrite');
          tx.objectStore('tickets').put(mk(N + k));
          tx.oncomplete = ok;
        });
        one.push(performance.now() - x);
      }
      one.sort((a, b) => a - b);
      out.addOneMedianMs = +one[10].toFixed(1);
      out.estMB = +(JSON.stringify(all).length / 1048576).toFixed(1);
      return out;
    },
    [N, K]
  );
  console.log(JSON.stringify({ N, K, ...r }));
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
})();
