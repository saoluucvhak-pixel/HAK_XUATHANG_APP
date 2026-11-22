/* Đo lưu trữ hiện tại (IndexedDB) trên trình duyệt thật bằng dữ liệu mẫu tự sinh (không đụng dữ liệu thật):
 *   node tools/bench-storage.cjs <nhỏ|vừa|lớn|all> [file-ra.json]
 * Kích cỡ: nhỏ 50 hồ sơ × 40 phiếu · vừa 500 × 60 · lớn 1.500 (ngưỡng nhắc dọn SOFT_WARN) × 100.
 * Đo: lưu hồ sơ (Archive.save), lưu đợt Excel (Batches.save), mở hồ sơ (Archive.load), báo cáo theo kỳ (ensureStats + prepareTickets + compute),
 *      Sổ hồ sơ năm (một bản ghi lớn trong kho kv: commit khi thêm 1 hồ sơ), sao lưu toàn bộ (buildFull + zip), khôi phục (restoreFile), dung lượng.
 * Dùng launchPersistentContext (hồ sơ trình duyệt thật trên đĩa, không phải ẩn danh). HAK_APP_DIR / HAK_CHROMIUM / HAK_BROWSER_CHANNEL như tools/accept.cjs. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const SIZES = { nhỏ: [50, 40], vừa: [500, 60], lớn: [1500, 100] };
const arg = process.argv[2] || 'all';
const out = process.argv[3];
const APP_DIR = path.resolve(process.env.HAK_APP_DIR || path.join(__dirname, '../app'));
const APP = require('node:url').pathToFileURL(path.join(APP_DIR, 'index.html')).href;
async function login(p) {
  await p.goto(APP);
  await p.waitForSelector('#authForm', { timeout: 15000 });
  await p.fill('#auName', 'Test');
  await p.fill('#auUser', 'tester');
  await p.fill('#auPw', 'matkhau123');
  await p.fill('#auPw2', 'matkhau123');
  await p.click('#authForm button[type=submit]');
  await p.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) {
    const nb = await p.$('button:has-text("Tiếp tục")');
    if (!nb || !(await nb.isVisible())) break;
    const chk = await p.$('#auKept');
    if (chk && (await chk.isVisible())) await chk.check();
    await nb.click();
    await p.waitForTimeout(700);
  }
  const co = await p.$('[data-co="hak"]');
  if (co && (await co.isVisible())) {
    await co.click();
    await p.waitForTimeout(2000);
  }
}
async function runSize(name, N, K) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-bench-'));
  const exe = process.env.HAK_CHROMIUM || undefined,
    channel = process.env.HAK_BROWSER_CHANNEL || undefined;
  const ctx = await chromium.launchPersistentContext(
    dir,
    Object.assign(
      { acceptDownloads: true, viewport: { width: 1400, height: 900 } },
      exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {}
    )
  );
  const p = ctx.pages()[0] || (await ctx.newPage());
  p.on('dialog', (d) => d.accept());
  p.setDefaultTimeout(0);
  await login(p);
  const r = { size: name, records: N, ticketsPerRecord: K, tickets: N * K };
  r.env = await p.evaluate(() => ({ ua: navigator.userAgent, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory }));
  // ---- 1. Lưu hồ sơ Lưu trữ (Archive.save) ----
  r.archiveSave = await p.evaluate(
    async ([N, K]) => {
      const times = [];
      const t0 = performance.now();
      for (let i = 0; i < N; i++) {
        const month = 1 + (i % 12),
          day = 1 + (i % 27);
        const rows = Array.from({ length: K }, (_, j) => ({
          idx: j + 1,
          uid: 'u' + i + '_' + j,
          ticket: String(100000 + i * K + j).padStart(7, '0'),
          plate: '43C-' + String(10000 + ((i * 7 + j) % 90000)),
          dateStr: String(day).padStart(2, '0') + '/' + String(month).padStart(2, '0') + '/2026',
          time1: String(6 + (j % 14)).padStart(2, '0') + ':' + String((j * 7) % 60).padStart(2, '0'),
          ts1: Date.UTC(2026, month - 1, day, 6 + (j % 14), (j * 7) % 60),
          gross: 41000 + ((i + j) % 9000),
          tare: 16000 + (j % 300),
          net: 25000 + ((i * 31 + j * 17) % 6000),
          carrier: 'VT-' + (j % 7),
          driver: 'Tài xế ' + (j % 40),
          customer: 'Khách ' + (i % 25),
        }));
        const t = performance.now();
        await HAK.Archive.save(
          'uythac',
          { ship: 'TÀU ' + i, giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [] },
          { files: [{ name: 'HS-' + i + '.xlsx' }], excel: { fileName: 'HS-' + i + '.xlsx' }, summary: {} },
          { rows },
          'xlsx'
        );
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return {
        totalMs: Math.round(performance.now() - t0),
        medianMs: +times[times.length >> 1].toFixed(1),
        p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(1),
        maxMs: +times[times.length - 1].toFixed(1),
      };
    },
    [N, K]
  );
  // ---- 2. Lưu đợt Excel (Batches.save) — file gốc ~ 90 byte / phiếu ----
  r.batchSave = await p.evaluate(
    async ([N, K]) => {
      const B = Math.min(N, 200),
        times = [];
      for (let i = 0; i < B; i++) {
        const bytes = new Uint8Array(K * 90 + 4000).map((_, k) => (k * 31 + i) & 255).buffer;
        const t = performance.now();
        await HAK.Batches.save(
          'uythac',
          { fileName: 'dot-' + i + '.xlsx', size: bytes.byteLength, sheet: 'Can', mapping: {}, headerRow: 1, addedAt: Date.now() },
          bytes
        );
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return { batches: B, medianMs: +times[times.length >> 1].toFixed(1), maxMs: +times[times.length - 1].toFixed(1) };
    },
    [N, K]
  );
  // ---- 3. Mở hồ sơ (Archive.load) ----
  r.archiveOpen = await p.evaluate(async () => {
    const metas = await HAK.Archive.list(),
      times = [];
    for (let i = 0; i < 30; i++) {
      const id = metas[(i * 37) % metas.length].id,
        t = performance.now();
      await HAK.Archive.load(id);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const t2 = performance.now();
    const l = await HAK.Archive.list();
    return {
      medianMs: +times[times.length >> 1].toFixed(1),
      maxMs: +times[times.length - 1].toFixed(1),
      listMs: +(performance.now() - t2).toFixed(1),
      listed: l.length,
    };
  });
  // ---- 4. Báo cáo theo kỳ ----
  r.report = await p.evaluate(async () => {
    const t0 = performance.now();
    const metas = await HAK.Archive.ensureStats(await HAK.Archive.list());
    const tStats = performance.now() - t0;
    const t1 = performance.now();
    const cache = new Map();
    const tk = await HAK.Report.prepareTickets(metas, cache, true);
    const tPrep = performance.now() - t1;
    const t1b = performance.now();
    const tk2 = await HAK.Report.prepareTickets(metas, cache, true); // lần 2: có cache
    const tPrepCached = performance.now() - t1b;
    const t2 = performance.now();
    const m = HAK.Report.compute(metas, { tickets: tk, basis: 'weigh', from: '2026-03-01', to: '2026-03-31' });
    const tCompute = performance.now() - t2;
    const t3 = performance.now();
    const mStart = HAK.Report.compute(metas, { from: '2026-03-01', to: '2026-03-31' });
    const tComputeStart = performance.now() - t3;
    return {
      ensureStatsMs: Math.round(tStats),
      prepareTicketsColdMs: Math.round(tPrep),
      prepareTicketsCachedMs: Math.round(tPrepCached),
      computeWeighMs: Math.round(tCompute),
      computeStartMs: Math.round(tComputeStart),
      usedWeigh: m.used.length,
      kgWeigh: m.byType.uythac ? m.byType.uythac.kg : 0,
      usedStart: mStart.used.length,
      ticketMapSize: tk.size,
    };
  });
  // ---- 5. Sổ hồ sơ năm (một bản ghi lớn kho kv) ----
  r.yearbook = await p.evaluate(
    async ([N, K]) => {
      const mk = (i) => ({
        id: 'yb-' + i,
        type: 'uythac',
        year: 2026,
        revision: 1,
        updatedAt: Date.now(),
        params: { ship: 'TÀU ' + i, giaoId: 'hak' },
        rows: Array.from({ length: K }, (_, j) => ({
          idx: j + 1,
          uid: 'y' + i + '_' + j,
          ticket: String(i * K + j).padStart(7, '0'),
          plate: '43C-' + (10000 + j),
          dateStr: '01/03/2026',
          net: 25000 + j,
          carrier: 'VT-' + (j % 7),
        })),
      });
      const y0 = await HAK.Yearbook.read();
      const tBulk0 = performance.now();
      const bulk = await HAK.Yearbook.commit(y0.revision, (next) => {
        for (let i = 0; i < N; i++) next.records.push(mk(i));
        return next;
      });
      const tBulk = performance.now() - tBulk0;
      const times = [];
      let rev = bulk.revision;
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        const nx = await HAK.Yearbook.commit(rev, (next) => {
          next.records.push(mk(N + i));
          return next;
        });
        times.push(performance.now() - t);
        rev = nx.revision;
      }
      const t2 = performance.now();
      await HAK.Yearbook.read();
      const tRead = performance.now() - t2;
      times.sort((a, b) => a - b);
      return {
        bulkCommitMs: Math.round(tBulk),
        addOneMedianMs: +times[times.length >> 1].toFixed(1),
        addOneMaxMs: +times[times.length - 1].toFixed(1),
        readMs: +tRead.toFixed(1),
        jsonMB: +(JSON.stringify(bulk).length / 1048576).toFixed(2),
      };
    },
    [N, K]
  );
  // ---- 6. Dung lượng ----
  r.storage = await p.evaluate(async () => {
    const e = await navigator.storage.estimate();
    return { usageMB: +(e.usage / 1048576).toFixed(1), quotaGB: +(e.quota / 1073741824).toFixed(1) };
  });
  // ---- 7. Sao lưu toàn bộ + khôi phục ----
  r.backup = await p.evaluate(async () => {
    const t0 = performance.now();
    const f = await HAK.Backup.buildFull();
    const tBuild = performance.now() - t0;
    const rawMB = f.parts.reduce((a, s) => a + s.length, 0) / 1048576;
    const t1 = performance.now();
    const zip = await HAK.Backup.zipParts(f.parts);
    const tZip = performance.now() - t1;
    window.__zip = zip;
    return {
      buildMs: Math.round(tBuild),
      zipMs: Math.round(tZip),
      rawJsonMB: +rawMB.toFixed(1),
      zipMB: +(zip.size / 1048576).toFixed(1),
      archive: f.archive,
      batches: f.batches,
    };
  });
  r.restore = await p.evaluate(async () => {
    const file = new File([window.__zip], 'HAK_SaoLuu.zip', { type: 'application/zip' });
    const t0 = performance.now();
    const ins = await HAK.Backup.inspect(file);
    const tInspect = performance.now() - t0;
    const t1 = performance.now();
    const res = await HAK.Backup.restoreFile(file, { mode: 'merge', parsed: ins });
    return { inspectMs: Math.round(tInspect), restoreMergeMs: Math.round(performance.now() - t1), result: JSON.parse(JSON.stringify(res)) };
  });
  // ---- 8. Khôi phục vào máy TRỐNG (hồ sơ trình duyệt mới) ----
  const b64 = await p.evaluate(async () => {
    const buf = new Uint8Array(await window.__zip.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await ctx.close();
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-bench2-'));
  const ctx2 = await chromium.launchPersistentContext(
    dir2,
    Object.assign(
      { acceptDownloads: true, viewport: { width: 1400, height: 900 } },
      exe ? { executablePath: exe, args: ['--no-sandbox'] } : channel ? { channel } : {}
    )
  );
  const p2 = ctx2.pages()[0] || (await ctx2.newPage());
  p2.on('dialog', (d) => d.accept());
  p2.setDefaultTimeout(0);
  await login(p2);
  r.restoreEmpty = await p2.evaluate(async (b) => {
    const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'HAK_SaoLuu.zip', { type: 'application/zip' });
    const t0 = performance.now();
    const ins = await HAK.Backup.inspect(file);
    const tInspect = performance.now() - t0;
    const t1 = performance.now();
    const res = await HAK.Backup.restoreFile(file, { mode: 'merge', parsed: ins });
    const tRestore = performance.now() - t1;
    const l = await HAK.Archive.list();
    const e = await navigator.storage.estimate();
    return {
      inspectMs: Math.round(tInspect),
      restoreMs: Math.round(tRestore),
      archiveAdded: res.added,
      archiveNow: l.length,
      usageMB: +(e.usage / 1048576).toFixed(1),
    };
  }, b64);
  await ctx2.close();
  fs.rmSync(dir2, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}
(async () => {
  const names = arg === 'all' ? Object.keys(SIZES) : [arg];
  const res = [];
  for (const n of names) {
    if (!SIZES[n]) throw new Error('Kích cỡ không có: ' + n);
    console.log('== ' + n + ' ' + SIZES[n].join(' × '));
    const t = Date.now();
    const r = await runSize(n, SIZES[n][0], SIZES[n][1]);
    r.wallSeconds = Math.round((Date.now() - t) / 1000);
    console.log(JSON.stringify(r));
    res.push(r);
  }
  const host = {
    platform: os.platform(),
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    memGB: +(os.totalmem() / 1073741824).toFixed(1),
    node: process.version,
  };
  if (out) fs.writeFileSync(out, JSON.stringify({ host, results: res }, null, 1));
  console.log('host', JSON.stringify(host));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
