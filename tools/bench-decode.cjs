/* Phân rã thời gian đọc báo cáo kỳ (prepareTickets): đọc IDB / giải mã base64 / gunzip / JSON.parse, tuần tự so với song song. Dữ liệu mẫu 1.500 × 100. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const APP = require('node:url').pathToFileURL(path.resolve(__dirname, '../app/index.html')).href;
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-dec-'));
  const ctx = await chromium.launchPersistentContext(dir, {});
  const p = ctx.pages()[0] || (await ctx.newPage());
  p.setDefaultTimeout(0);
  await p.goto(APP);
  await p.waitForSelector('#authForm');
  await p.fill('#auName', 'T');
  await p.fill('#auUser', 't');
  await p.fill('#auPw', 'matkhau123');
  await p.fill('#auPw2', 'matkhau123');
  await p.click('#authForm button[type=submit]');
  await p.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) {
    const nb = await p.$('button:has-text("Tiếp tục")');
    if (!nb || !(await nb.isVisible())) break;
    const c = await p.$('#auKept');
    if (c && (await c.isVisible())) await c.check();
    await nb.click();
    await p.waitForTimeout(700);
  }
  const co = await p.$('[data-co="hak"]');
  if (co && (await co.isVisible())) {
    await co.click();
    await p.waitForTimeout(2000);
  }
  const N = +process.argv[2] || 1500,
    K = +process.argv[3] || 100;
  const r = await p.evaluate(
    async ([N, K]) => {
      for (let i = 0; i < N; i++) {
        const month = 1 + (i % 12),
          day = 1 + (i % 27);
        const rows = Array.from({ length: K }, (_, j) => ({
          idx: j + 1,
          uid: 'u' + i + '_' + j,
          ticket: String(100000 + i * K + j).padStart(7, '0'),
          plate: '43C-' + (10000 + ((i * 7 + j) % 90000)),
          dateStr: String(day).padStart(2, '0') + '/' + String(month).padStart(2, '0') + '/2026',
          time1: '08:00',
          ts1: Date.UTC(2026, month - 1, day),
          gross: 41000,
          tare: 16000,
          net: 25000 + ((i * 31 + j * 17) % 6000),
          carrier: 'VT-' + (j % 7),
          driver: 'Tài xế ' + (j % 40),
          customer: 'Khách ' + (i % 25),
        }));
        await HAK.Archive.save(
          'uythac',
          { ship: 'TÀU ' + i, giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [] },
          { files: [{ name: 'H' + i }], excel: { fileName: 'H' + i }, summary: {} },
          { rows },
          'xlsx'
        );
      }
      const metas = await HAK.Archive.ensureStats(await HAK.Archive.list());
      const out = {};
      let t = performance.now();
      const raw = await new Promise((ok) => {
        const rq = indexedDB.open('hak-archive');
        rq.onsuccess = () => {
          const db = rq.result;
          const g = db.transaction('data').objectStore('data').getAll();
          g.onsuccess = () => {
            db.close();
            ok(g.result);
          };
        };
      });
      out.rawGetAllMs = Math.round(performance.now() - t);
      out.rawMB = +(raw.reduce((a, s) => a + s.length, 0) / 1048576).toFixed(1);
      t = performance.now();
      const bytes = raw.map((s) => {
        const b = atob(s.slice(3));
        const u = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        return u;
      });
      out.base64DecodeMs = Math.round(performance.now() - t);
      t = performance.now();
      const texts = [];
      for (const u of bytes) texts.push(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
      out.gunzipSeqMs = Math.round(performance.now() - t);
      out.jsonMB = +(texts.reduce((a, s) => a + s.length, 0) / 1048576).toFixed(1);
      t = performance.now();
      const objs = texts.map((s) => JSON.parse(s));
      out.jsonParseMs = Math.round(performance.now() - t);
      t = performance.now();
      const par = [];
      for (let i = 0; i < bytes.length; i += 16)
        par.push(
          ...(await Promise.all(
            bytes.slice(i, i + 16).map((u) => new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text())
          ))
        );
      out.gunzipParallel16Ms = Math.round(performance.now() - t);
      t = performance.now();
      await HAK.Report.prepareTickets(metas, new Map(), true);
      out.prepareTicketsSeqMs = Math.round(performance.now() - t);
      // song song 8 (mô phỏng): tải theo lô rồi dựng phiếu như prepareTickets
      t = performance.now();
      const cache = new Map();
      for (let i = 0; i < metas.length; i += 8)
        await Promise.all(metas.slice(i, i + 8).map((m) => HAK.Archive.load(m.id).then((d) => cache.set(m.id, d.rows.length))));
      out.loadAllParallel8Ms = Math.round(performance.now() - t);
      t = performance.now();
      for (const m of metas) await HAK.Archive.load(m.id);
      out.loadAllSeqMs = Math.round(performance.now() - t);
      // lưu 1 hồ sơ: trim() đọc toàn bộ meta?
      const times = [];
      for (let k = 0; k < 20; k++) {
        const x = performance.now();
        await HAK.Archive.save(
          'uythac',
          { ship: 'Z' + k, giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [] },
          { files: [{ name: 'Z' + k }], excel: { fileName: 'Z' + k }, summary: {} },
          { rows: [{ idx: 1, uid: 'z' + k, ticket: '1', plate: 'P', dateStr: '01/03/2026', time1: '08:00', net: 1 }] },
          'xlsx'
        );
        times.push(performance.now() - x);
      }
      times.sort((a, b) => a - b);
      out.saveOneSmallRecordMedianMs = +times[10].toFixed(1);
      return out;
    },
    [N, K]
  );
  console.log(JSON.stringify({ N, K, ...r }));
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
})();
