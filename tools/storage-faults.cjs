/* Mô phỏng LỖI GHI GIỮA CHỪNG và HAI CỬA SỔ cập nhật cùng bản ghi trên IndexedDB hiện tại (dữ liệu mẫu, hồ sơ trình duyệt tạm):
 *   node tools/storage-faults.cjs [file-ra.json]
 * Lỗi được tiêm ở IDBObjectStore.prototype.put (ném QuotaExceededError ở lần put thứ n) và bằng giới hạn dung lượng CDP (nếu hỗ trợ).
 * Kết luận từng ca: "nguyên tử" = không còn dữ liệu nửa chừng; "có báo" = người dùng thấy lỗi rõ ràng; "chạy lại được" = thử lại đủ, không nhân đôi. */
const { chromium } = require('playwright');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const APP_DIR = path.resolve(process.env.HAK_APP_DIR || path.join(__dirname, '../app'));
const APP = require('node:url').pathToFileURL(path.join(APP_DIR, 'index.html')).href;
const out = process.argv[2];
const res = [];
const rec = (id, ca, expect, got, ok) => {
  console.log((ok === null ? '  ? ' : ok ? '  ✓ ' : '  ✗ ') + id + ' ' + ca + '  | mong đợi: ' + expect + ' | thực tế: ' + got);
  res.push({ id, ca, expect, got, ok });
};
async function login(p) {
  await p.goto(APP);
  await p.waitForSelector('#authForm', { timeout: 15000 }).catch(() => {});
  if (await p.$('#authForm')) {
    const two = await p.$('#auPw2');
    await p.fill('#auName', 'Test').catch(() => {});
    await p.fill('#auUser', 'tester');
    await p.fill('#auPw', 'matkhau123');
    if (two && (await two.isVisible())) await p.fill('#auPw2', 'matkhau123');
    await p.click('#authForm button[type=submit]');
    await p.waitForTimeout(1500);
  }
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
  await p.waitForFunction(() => window.HAK && HAK.Archive && HAK.Yearbook && HAK.Batches, null, { timeout: 20000 });
}
/** Tiêm lỗi ở lần put thứ n. mode 'throw' = lỗi ĐỒNG BỘ ngay trong lúc dựng giao dịch; 'abort' = giao dịch bị hủy sau put (như hết dung lượng lúc ghi / commit). */
const FAIL = `(n, mode) => { const orig = IDBObjectStore.prototype.put; let c = 0; IDBObjectStore.prototype.put = function () { c++; if (c === n) { if (mode === 'throw') throw new DOMException('Mô phỏng hết dung lượng', 'QuotaExceededError'); const r = orig.apply(this, arguments); try { this.transaction.abort(); } catch (e) {} return r; } return orig.apply(this, arguments); }; window.__unfail = () => { IDBObjectStore.prototype.put = orig; }; }`;
const launch = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hak-faults-'));
  const ctx = await chromium.launchPersistentContext(dir, { acceptDownloads: true, viewport: { width: 1300, height: 900 } });
  const A = ctx.pages()[0] || (await ctx.newPage());
  A.on('dialog', (d) => d.accept());
  await login(A);
  await A.evaluate(() => {
    window.__rows = (n, tag) =>
      Array.from({ length: n }, (_, j) => ({
        idx: j + 1,
        uid: tag + j,
        ticket: String(1000 + j).padStart(6, '0'),
        plate: '43C-' + (10000 + j),
        dateStr: '03/02/2026',
        time1: '08:00',
        net: 20000 + j,
        carrier: 'VT',
      }));
    window.__save = (ship, n) =>
      HAK.Archive.save(
        'uythac',
        { ship, giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [] },
        { files: [{ name: ship + '.xlsx' }], excel: { fileName: ship + '.xlsx' }, summary: {} },
        { rows: window.__rows(n, ship) },
        'xlsx'
      );
    window.__batch = async (name, fill, b) => {
      b = b || { fileName: name, size: 10, sheet: 'S', mapping: {}, headerRow: 1 };
      const ok = await HAK.Batches.save('uythac', b, new Uint8Array(10).fill(fill).buffer);
      return ok ? 'ok' : 'lỗi: ' + b.saveError;
    };
  });
  return { ctx, A, dir };
};
const done = async (c) => {
  await c.ctx.close();
  fs.rmSync(c.dir, { recursive: true, force: true });
};
(async () => {
  const keysOf = (A) =>
    A.evaluate(
      () =>
        new Promise((ok) => {
          const rq = indexedDB.open('hak-archive');
          rq.onsuccess = () => {
            const db = rq.result,
              tx = db.transaction(['meta', 'data'], 'readonly'),
              m = tx.objectStore('meta').getAllKeys(),
              d = tx.objectStore('data').getAllKeys();
            tx.oncomplete = () => {
              db.close();
              ok({ meta: m.result.length, data: d.result.length });
            };
          };
        })
    );
  const batchState = (A) =>
    A.evaluate(async () => ({ meta: (await HAK.DB.getAll('batches')).length, data: (await HAK.DB.getAll('batchdata')).length }));

  console.log('F1) Lưu hồ sơ Lưu trữ (Archive.save): lỗi ở lần ghi thứ 2 trong một giao dịch');
  for (const mode of ['abort', 'throw']) {
    const c = await launch(),
      A = c.A;
    await A.evaluate(() => window.__save('BASE', 5));
    const before = await keysOf(A);
    await A.evaluate(`(${FAIL})(2, '${mode}')`);
    const r = await A.evaluate(() => window.__save('F1', 5));
    await A.evaluate(() => window.__unfail());
    const after = await keysOf(A);
    const retry = await A.evaluate(() => window.__save('F1', 5));
    const fin = await keysOf(A);
    rec(
      'F1-' + mode,
      'Archive.save lỗi (' + (mode === 'abort' ? 'giao dịch bị hủy lúc ghi' : 'lỗi đồng bộ khi dựng giao dịch') + ')',
      'trả false, không có meta mồ côi (meta = data); chạy lại thành công, không nhân đôi',
      JSON.stringify({ trả: r, trước: before, sau: after, chạyLại: retry, cuối: fin }),
      r === false &&
        after.meta === after.data &&
        after.meta === before.meta &&
        retry === true &&
        fin.meta === before.meta + 1 &&
        fin.data === fin.meta
    );
    await done(c);
  }

  console.log('F2) Lưu đợt Excel (Batches.save, giao dịch có kiểm tra phiên bản)');
  for (const mode of ['abort', 'throw']) {
    const c = await launch(),
      A = c.A;
    await A.evaluate(`(${FAIL})(2, '${mode}')`);
    const r = await A.evaluate(() => window.__batch('f2.xlsx', 1));
    await A.evaluate(() => window.__unfail());
    const st = await batchState(A);
    const r2 = await A.evaluate(() => window.__batch('f2.xlsx', 1));
    const st2 = await batchState(A);
    rec(
      'F2-' + mode,
      'Batches.save lỗi (' + mode + ')',
      'báo lỗi, không còn thông số mồ côi; chạy lại ghi đủ 1 đợt',
      JSON.stringify({ lần1: r, sau: st, lần2: r2, cuối: st2 }),
      /lỗi/.test(r) && st.meta === 0 && st.data === 0 && r2 === 'ok' && st2.meta === 1 && st2.data === 1
    );
    await done(c);
  }

  console.log('F3) Sổ hồ sơ năm (một bản ghi lớn): lỗi ghi');
  for (const mode of ['abort', 'throw']) {
    const c = await launch(),
      A = c.A;
    const y0 = await A.evaluate(async () => (await HAK.Yearbook.read()).revision);
    await A.evaluate(`(${FAIL})(1, '${mode}')`);
    const yErr = await A.evaluate(async () => {
      try {
        const y = await HAK.Yearbook.read();
        await HAK.Yearbook.commit(y.revision, (n) => {
          n.records.push({ id: 'yf1', type: 'uythac', year: 2026, revision: 1, updatedAt: Date.now(), params: {}, rows: [{ net: 1 }] });
          return n;
        });
        return 'ok';
      } catch (e) {
        return 'lỗi: ' + (e.message || e);
      }
    });
    await A.evaluate(() => window.__unfail());
    const y1 = await A.evaluate(async () => {
      const y = await HAK.Yearbook.read();
      return { rev: y.revision, n: y.records.length };
    });
    rec(
      'F3-' + mode,
      'Yearbook.commit lỗi (' + mode + ')',
      'ném lỗi; phiên bản và số hồ sơ không đổi',
      JSON.stringify({ yErr, y0, y1 }),
      /lỗi/.test(yErr) && y1.rev === y0 && y1.n === 0
    );
    await done(c);
  }

  console.log('F4) Danh mục (hợp đồng, kho kv + localStorage): lỗi ghi');
  for (const mode of ['abort', 'throw']) {
    const c = await launch(),
      A = c.A;
    const cat0 = await A.evaluate(() => JSON.stringify(HAK.Store.get('hak.catalog.v1', null)));
    await A.evaluate(`(${FAIL})(1, '${mode}')`);
    const cErr = await A.evaluate(async () => {
      try {
        const d = HAK.Catalog.core.get();
        d.customers = (d.customers || []).concat([{ id: 'k-x', companyId: 'hak', name: 'X' }]);
        await HAK.Catalog.persist();
        return 'ok';
      } catch (e) {
        return 'lỗi: ' + (e.message || e);
      }
    });
    await A.evaluate(() => window.__unfail());
    const cat1 = await A.evaluate(() => JSON.stringify(HAK.Store.get('hak.catalog.v1', null)));
    rec(
      'F4-' + mode,
      'Catalog.persist lỗi (' + mode + ')',
      'ném lỗi; bản lưu giữ nguyên',
      JSON.stringify({ cErr, giữNguyên: cat0 === cat1 }),
      /lỗi/.test(cErr) && cat0 === cat1
    );
    await done(c);
  }

  console.log('F5) Khôi phục nhiều kho vào máy trống: lỗi giữa chừng rồi chạy lại');
  {
    const c1 = await launch();
    for (let i = 0; i < 6; i++) await c1.A.evaluate((i) => window.__save('R' + i, 8), i);
    for (let i = 0; i < 3; i++) await c1.A.evaluate((i) => window.__batch('r' + i + '.xlsx', i), i);
    const b64 = await c1.A.evaluate(async () => {
      const f = await HAK.Backup.buildFull();
      const z = await HAK.Backup.zipParts(f.parts);
      const buf = new Uint8Array(await z.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    });
    await done(c1);
    for (const mode of ['abort', 'throw']) {
      const c = await launch(),
        A = c.A;
      await A.evaluate((b) => {
        window.__zip = new File([Uint8Array.from(atob(b), (x) => x.charCodeAt(0))], 'bk.zip');
      }, b64);
      await A.evaluate(`(${FAIL})(8, '${mode}')`);
      const r1 = await A.evaluate(async () => {
        try {
          const x = await HAK.Backup.restoreFile(window.__zip, { mode: 'merge' });
          return { ok: true, report: x.report.map((s) => s.id + ':' + s.status) };
        } catch (e) {
          return { ok: false, err: String(e.message || e).slice(0, 160) };
        }
      });
      await A.evaluate(() => window.__unfail());
      const mid = { arch: await keysOf(A), bat: await batchState(A) };
      const r2 = await A.evaluate(async () => {
        const x = await HAK.Backup.restoreFile(window.__zip, { mode: 'merge' });
        return x.report.map((s) => s.id + ':' + s.status);
      });
      const fin = { arch: await keysOf(A), bat: await batchState(A) };
      const r3 = await A.evaluate(async () => {
        const x = await HAK.Backup.restoreFile(window.__zip, { mode: 'merge' });
        return { added: x.added, skipped: x.skipped };
      });
      const fin2 = { arch: await keysOf(A), bat: await batchState(A) };
      rec(
        'F5-' + mode,
        'Khôi phục lỗi giữa chừng (' + mode + ')',
        'báo DỪNG GIỮA CHỪNG nêu kho đã nhập / chưa chạy; chạy lại đủ 6 hồ sơ + 3 đợt; chạy lần 3 không đổi',
        JSON.stringify({ lần1: r1, giữa: mid, lần2: r2.join(' '), cuối: fin, lần3: r3, cuối3: fin2 }),
        r1.ok === false &&
          /DỪNG GIỮA CHỪNG/.test(r1.err || '') &&
          fin.arch.meta === 6 &&
          fin.arch.data === 6 &&
          fin.bat.meta === 3 &&
          fin.bat.data === 3 &&
          fin2.arch.meta === 6 &&
          fin2.bat.meta === 3
      );
      await done(c);
    }
  }

  console.log('F6) Hai cửa sổ cùng ghi một bản ghi');
  {
    const c = await launch(),
      A = c.A;
    const B = await c.ctx.newPage();
    B.on('dialog', (d) => d.accept());
    await login(B);
    await B.evaluate(() => {
      window.__rows = (n, tag) =>
        Array.from({ length: n }, (_, j) => ({
          idx: j + 1,
          uid: tag + j,
          ticket: String(1000 + j).padStart(6, '0'),
          plate: '43C-' + (10000 + j),
          dateStr: '03/02/2026',
          time1: '08:00',
          net: 20000 + j,
          carrier: 'VT',
        }));
      window.__save = (ship, n) =>
        HAK.Archive.save(
          'uythac',
          { ship, giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [] },
          { files: [{ name: ship + '.xlsx' }], excel: { fileName: ship + '.xlsx' }, summary: {} },
          { rows: window.__rows(n, ship) },
          'xlsx'
        );
      window.__batch = async (name, fill, b) => {
        b = b || { fileName: name, size: 10, sheet: 'S', mapping: {}, headerRow: 1 };
        const ok = await HAK.Batches.save('uythac', b, new Uint8Array(10).fill(fill).buffer);
        return ok ? 'ok' : 'lỗi: ' + b.saveError;
      };
    });
    const ra = await A.evaluate(async () => (await HAK.Yearbook.read()).revision),
      rb = await B.evaluate(async () => (await HAK.Yearbook.read()).revision);
    const mkY = (id) =>
      `async (rev) => { try { await HAK.Yearbook.commit(rev, (n) => { n.records.push({ id: '${id}', type: 'uythac', year: 2026, revision: 1, updatedAt: Date.now(), params: {}, rows: [{ net: 1 }] }); return n; }); return 'ok'; } catch (e) { return 'lỗi: ' + (e.message || e); } }`;
    const ya = await A.evaluate(`(${mkY('wa')})(${ra})`),
      yb = await B.evaluate(`(${mkY('wb')})(${rb})`);
    const yEnd = await A.evaluate(async () => (await HAK.Yearbook.read()).records.map((r) => r.id).sort());
    rec(
      'F6a',
      'Sổ hồ sơ năm: hai cửa sổ cùng phiên bản cũ',
      'cửa sổ thứ hai bị từ chối có thông báo, không ghi đè',
      JSON.stringify({ ya, yb, yEnd }),
      ya === 'ok' && /lỗi.*cửa sổ khác/.test(yb) && yEnd.includes('wa') && !yEnd.includes('wb')
    );
    const catEdit = (name) =>
      `async () => { try { const d = HAK.Catalog.core.get(); d.customers = (d.customers || []).concat([{ id: 'k-${name}', companyId: 'hak', name: '${name}' }]); await HAK.Catalog.persist(); return 'ok'; } catch (e) { return 'lỗi: ' + (e.message || e); } }`;
    const ca = await A.evaluate(`(${catEdit('ca')})()`),
      cb = await B.evaluate(`(${catEdit('cb')})()`);
    rec(
      'F6b',
      'Danh mục: hai cửa sổ cùng sửa',
      'cửa sổ thứ hai bị từ chối ("Danh mục đã thay đổi")',
      JSON.stringify({ ca, cb }),
      ca === 'ok' && /lỗi.*Danh mục đã thay đổi/.test(cb)
    );
    // Đợt Excel: cùng đối tượng b có rev; A lưu (rev 1), B nạp cùng đợt rev 0 (cũ) rồi lưu
    await A.evaluate(() => {
      window.__bA = { fileName: 'same.xlsx', size: 10, sheet: 'S', mapping: {}, headerRow: 1 };
    });
    await B.evaluate(() => {
      window.__bB = { fileName: 'same.xlsx', size: 10, sheet: 'S', mapping: {}, headerRow: 1 };
    });
    const ba = await A.evaluate(() => window.__batch('same.xlsx', 1, window.__bA));
    const bb = await B.evaluate(() => window.__batch('same.xlsx', 2, window.__bB));
    const bState = await A.evaluate(async () => (await HAK.DB.getAll('batchdata')).map((x) => Array.from(new Uint8Array(x))[0]));
    rec(
      'F6c',
      'Đợt Excel cùng tên: hai cửa sổ',
      'cửa sổ thứ hai (phiên bản cũ) bị từ chối, không ghi đè bản mới',
      JSON.stringify({ ba, bb, bytes: bState }),
      ba === 'ok' && /lỗi/.test(bb) && bState.length === 1 && bState[0] === 1
    );
    const sv = (n) =>
      `() => HAK.Archive.save('uythac', { ship: 'SAME', giao: 'HAK', nhan: 'ĐN', giaoId: 'hak', returned: [] }, { files: [{ name: 's.xlsx' }], excel: { fileName: 's.xlsx' }, summary: {} }, { rows: window.__rows(${n}, 'S') }, 'xlsx')`;
    const [sa, sb] = await Promise.all([A.evaluate(`(${sv(5)})()`), B.evaluate(`(${sv(5)})()`)]);
    const same = await A.evaluate(async () => (await HAK.Archive.list()).filter((m) => m.ship === 'SAME').length);
    rec(
      'F6d',
      'Lưu trữ cùng nội dung từ hai cửa sổ đồng thời',
      'đúng 1 hồ sơ (mã theo nội dung), không nhân đôi',
      JSON.stringify({ sa, sb, same }),
      same === 1
    );
    // Cùng hồ sơ, nội dung SỬA khác nhau → mã khác → hai hồ sơ (không ghi đè nhau)
    const [s1, s2] = await Promise.all([A.evaluate(`(${sv(5)})()`), B.evaluate(`(${sv(6)})()`)]);
    const two = await A.evaluate(async () => (await HAK.Archive.list()).filter((m) => m.ship === 'SAME').length);
    rec(
      'F6e',
      'Lưu trữ: hai cửa sổ lưu nội dung KHÁC nhau của cùng tàu',
      'không mất bản nào (2 hồ sơ, mã theo nội dung)',
      JSON.stringify({ s1, s2, two }),
      two === 2
    );
    await done(c);
  }

  console.log('F7) Hết dung lượng thật (CDP Storage.overrideQuotaForOrigin)');
  {
    const c = await launch(),
      A = c.A;
    let note = '';
    try {
      const cdp = await c.ctx.newCDPSession(A);
      const origin = await A.evaluate(() => location.origin);
      const o = origin === 'null' ? 'file://' : origin;
      await cdp.send('Storage.overrideQuotaForOrigin', { origin: o, quotaSize: 20 * 1024 });
      const results = [];
      for (let i = 0; i < 12; i++) results.push(await A.evaluate((i) => window.__save('Q' + i, 400), i));
      const keys = await keysOf(A);
      note = JSON.stringify({ origin: o, trả: results.map((x) => (x ? 1 : 0)).join(''), keys });
      const induced = results.includes(false);
      rec(
        'F7',
        'Hết dung lượng (giới hạn 20 KB)',
        'khi hết chỗ: save trả false (có báo) và meta = data',
        note + (induced ? '' : ' — CHƯA XÁC MINH: trình duyệt không áp giới hạn dung lượng nên không gây được lỗi thật'),
        induced ? keys.meta === keys.data : null
      );
    } catch (e) {
      rec('F7', 'Hết dung lượng (CDP)', 'giả lập được', 'không giả lập được: ' + String(e.message || e).slice(0, 140), false);
    }
    await done(c);
  }
  const bad = res.filter((x) => x.ok === false).length,
    unk = res.filter((x) => x.ok === null).length;
  console.log('\nTổng: ' + res.length + ' ca; đạt ' + (res.length - bad - unk) + '; không đạt ' + bad + '; chưa xác minh ' + unk);
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
