/* Đợt cân: file Excel gốc + thông số ghi / thay / xóa trong MỘT giao dịch IndexedDB; chỉ báo "đã lưu" khi hoàn tất; lỗi giữa chừng không để lại bản ghi nửa vời; sửa đồng thời ở 2 cửa sổ bị chặn. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
function fakeIdb(state) {
  // state.stores dùng chung giữa các lần "mở lại ứng dụng"; state.fail = 'abort' → giao dịch ghi kế tiếp hỏng
  const stores = state.stores;
  const db = {
    createObjectStore(n) {
      stores[n] = stores[n] || new Map();
    },
    transaction(names, mode) {
      const tx = { ops: [], aborted: false };
      tx.objectStore = (n) => ({
        get(k) {
          const rq = {};
          queueMicrotask(() => {
            rq.result = stores[n].get(k);
            rq.onsuccess && rq.onsuccess();
          });
          return rq;
        },
        getAll() {
          const rq = {};
          queueMicrotask(() => {
            rq.result = Array.from(stores[n].values());
            rq.onsuccess && rq.onsuccess();
          });
          return rq;
        },
        put(v, k) {
          tx.ops.push(() => stores[n].set(k !== undefined ? k : v.id, v));
        },
        delete(k) {
          tx.ops.push(() => stores[n].delete(k));
        },
      });
      tx.abort = () => {
        tx.aborted = true;
        setTimeout(() => tx.onabort && tx.onabort());
      };
      if (mode === 'readwrite')
        setTimeout(() => {
          if (tx.aborted) return;
          if (state.fail) {
            const f = state.fail;
            state.fail = null;
            tx.error = new Error(f);
            tx.onabort && tx.onabort();
            return;
          } // hỏng khi commit: KHÔNG áp dụng thao tác nào
          tx.ops.forEach((f) => f());
          tx.oncomplete && tx.oncomplete();
        }, 3);
      return tx;
    },
  };
  return {
    open() {
      const rq = {};
      setTimeout(() => {
        ['kv', 'batches', 'batchdata', 'issued', 'handles', 'attachments', 'bklsTemplates'].forEach((n) => {
          stores[n] = stores[n] || new Map();
        });
        rq.result = db;
        rq.onupgradeneeded && rq.onupgradeneeded({ oldVersion: 4 });
        rq.onsuccess && rq.onsuccess();
      });
      return rq;
    },
  };
}
const toasts = [];
function app(state) {
  // mỗi lần gọi = "mở lại ứng dụng" trên cùng kho IndexedDB
  global.window = global;
  global.HAK = { UI: { toast: (m, t) => toasts.push([t, m]) } };
  global.indexedDB = fakeIdb(state);
  global.navigator = global.navigator || {};
  for (const f of ['db.js', 'records.js']) {
    delete require.cache[require.resolve('../app/js/' + f)];
    require('../app/js/' + f);
  }
  return HAK;
}
const bytes = (n) => new Uint8Array(n).fill(7).buffer;
const batch = (name, extra) => Object.assign({ fileName: name, size: 10, sheet: 'S1', mapping: {}, headerRow: 1 }, extra);
const fresh = () => ({ stores: {}, fail: null });

test('lưu thành công: file gốc + thông số cùng có; mở lại ứng dụng vẫn khớp; chỉ khi xong mới đánh dấu đã lưu', async () => {
  const st = fresh(),
    H = app(st),
    b = batch('c1.xlsx');
  assert.equal(b.saved, undefined);
  assert.equal(await H.Batches.save('xuatkhau', b, bytes(10)), true);
  assert.equal(b.saved, true);
  assert.equal(b.rev, 1);
  assert.equal(st.stores.batches.size, 1);
  assert.equal(st.stores.batchdata.size, 1);
  const H2 = app(st),
    all = await H2.Batches.loadAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].meta.fileName, 'c1.xlsx');
  assert.equal(all[0].bytes.byteLength, 10);
});
test('lỗi giữa giao dịch: không ghi nửa vời (không file mồ côi), báo lỗi, giữ file gốc trong RAM để thử lại; thử lại thành công', async () => {
  const st = fresh(),
    H = app(st),
    b = batch('c2.xlsx');
  st.fail = 'QuotaExceededError';
  assert.equal(await H.Batches.save('xuatkhau', b, bytes(10)), false);
  assert.equal(b.saved, false);
  assert.match(b.saveError, /QuotaExceeded/);
  assert.ok(b.pendingBytes);
  assert.equal(st.stores.batches.size, 0);
  assert.equal(st.stores.batchdata.size, 0, 'không để lại file gốc mà thiếu thông số');
  assert.equal(await H.Batches.retry('xuatkhau', b), true);
  assert.equal(b.saved, true);
  assert.equal(b.pendingBytes, null);
  assert.equal(st.stores.batchdata.size, 1);
});
test('thay đợt cùng tên bị lỗi: đợt cũ còn nguyên (cả file lẫn thông số)', async () => {
  const st = fresh(),
    H = app(st),
    b = batch('c3.xlsx');
  await H.Batches.save('xuatkhau', b, bytes(10));
  const nb = batch('c3.xlsx', { sheet: 'S2', rev: b.rev });
  st.fail = 'disk';
  assert.equal(await H.Batches.save('xuatkhau', nb, bytes(20)), false);
  const all = await app(st).Batches.loadAll();
  assert.equal(all[0].meta.sheet, 'S1');
  assert.equal(all[0].bytes.byteLength, 10, 'file cũ + thông số cũ khớp nhau');
  assert.equal(await H.Batches.save('xuatkhau', nb, bytes(20)), true);
  const after = await app(st).Batches.loadAll();
  assert.equal(after[0].meta.sheet, 'S2');
  assert.equal(after[0].bytes.byteLength, 20);
  assert.equal(after[0].meta.rev, 2);
});
test('xóa đợt: file + thông số cùng bị xóa; lỗi → cả hai còn nguyên; cho phép xóa lại', async () => {
  const st = fresh(),
    H = app(st),
    b = batch('c4.xlsx');
  await H.Batches.save('xuatkhau', b, bytes(10));
  st.fail = 'blocked';
  const r1 = await H.Batches.remove('xuatkhau', 'c4.xlsx', b.rev);
  assert.equal(r1.ok, false);
  assert.equal(st.stores.batches.size, 1);
  assert.equal(st.stores.batchdata.size, 1);
  const r2 = await H.Batches.remove('xuatkhau', 'c4.xlsx', b.rev);
  assert.equal(r2.ok, true);
  assert.equal(st.stores.batches.size, 0);
  assert.equal(st.stores.batchdata.size, 0);
});
test('hai cửa sổ: cửa sổ B giữ bản cũ nên không ghi đè / xóa được bản mới do cửa sổ A lưu', async () => {
  const st = fresh(),
    A = app(st),
    a = batch('c5.xlsx');
  await A.Batches.save('xuatkhau', a, bytes(10));
  const B = app(st),
    b = batch('c5.xlsx', { rev: a.rev }); // B đã tải đợt ở phiên bản 1
  const a2 = batch('c5.xlsx', { rev: a.rev, sheet: 'A-moi' });
  assert.equal(await A.Batches.save('xuatkhau', a2, bytes(30)), true); // A thay → phiên bản 2
  assert.equal(await B.Batches.save('xuatkhau', Object.assign(b, { sheet: 'B-cu' }), bytes(40)), false);
  assert.match(b.saveError, /cửa sổ khác/);
  const rm = await B.Batches.remove('xuatkhau', 'c5.xlsx', 1);
  assert.equal(rm.ok, false);
  assert.equal(rm.conflict, true);
  const all = await app(st).Batches.loadAll();
  assert.equal(all[0].meta.sheet, 'A-moi');
  assert.equal(all[0].bytes.byteLength, 30);
  const dup = batch('c5.xlsx');
  assert.equal(
    await app(st).Batches.save('xuatkhau', dup, bytes(1)),
    false,
    'đợt cùng tên đã có ở cửa sổ khác: không tự ghi đè khi chưa biết phiên bản'
  );
});
test('cập nhật thông số (sheet / ánh xạ) tăng phiên bản; lỗi ghi được báo (không im lặng)', async () => {
  const st = fresh(),
    H = app(st),
    b = batch('c6.xlsx');
  await H.Batches.save('xuatkhau', b, bytes(5));
  b.sheet = 'S9';
  assert.equal(await H.Batches.saveMeta('xuatkhau', b), true);
  assert.equal(b.rev, 2);
  b.sheet = 'S10';
  st.fail = 'x';
  toasts.length = 0;
  assert.equal(await H.Batches.saveMeta('xuatkhau', b), false);
  assert.ok(toasts.some((t) => /Không cập nhật được thông số/.test(t[1])));
});
