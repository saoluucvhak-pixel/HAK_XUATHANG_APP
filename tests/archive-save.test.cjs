/* Lưu hồ sơ vào Lưu trữ: thông số + dòng phiếu cân (file Excel cân) ghi CÙNG MỘT giao dịch IndexedDB; chỉ báo đã lưu sau khi giao dịch hoàn tất; ghi lỗi thì báo lỗi, không treo. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
function fakeIdb(mode) {
  // mode: 'ok' | 'abort' | 'throw'
  const stores = { meta: new Map(), data: new Map() },
    txs = [];
  const db = {
    createObjectStore() {},
    transaction(names, access) {
      if (mode === 'throw' && access === 'readwrite') throw new DOMException('database connection is closing', 'InvalidStateError');
      const tx = { names: [].concat(names), access, ops: [] };
      txs.push(tx);
      tx.abort = () => {
        tx.aborted = true;
        tx.pending = [];
        tx.error = new Error('AbortError');
        setTimeout(() => tx.onabort && tx.onabort());
      };
      tx.objectStore = (n) => ({
        put(v, k) {
          if (mode === 'put2' && access === 'readwrite' && tx.ops.length === 1)
            throw new DOMException('Mô phỏng hết dung lượng', 'QuotaExceededError'); // lần ghi thứ 2 (data) ném lỗi ĐỒNG BỘ sau khi meta đã put
          tx.ops.push(['put', n]);
          tx.pending = (tx.pending || []).concat(() => stores[n].set(k !== undefined ? k : v.id, v));
        },
        delete(k) {
          tx.pending = (tx.pending || []).concat(() => stores[n].delete(k));
        },
        clear() {
          tx.pending = (tx.pending || []).concat(() => stores[n].clear());
        },
        get(k) {
          const rq = {};
          setTimeout(() => {
            rq.result = stores[n].get(k);
            rq.onsuccess && rq.onsuccess();
          });
          return rq;
        },
        getAll() {
          const rq = {};
          setTimeout(() => {
            rq.result = Array.from(stores[n].values());
            rq.onsuccess && rq.onsuccess();
          });
          return rq;
        },
      });
      if (access === 'readwrite')
        setTimeout(() => {
          if (tx.aborted) return;
          if (mode === 'abort') {
            tx.error = new Error('QuotaExceededError');
            tx.onabort && tx.onabort();
            return;
          } // không ghi gì khi giao dịch hỏng
          (tx.pending || []).forEach((f) => f());
          tx.oncomplete && tx.oncomplete();
        });
      return tx;
    },
  };
  return {
    stores,
    txs,
    indexedDB: {
      open() {
        const rq = {};
        setTimeout(() => {
          rq.result = db;
          rq.onupgradeneeded && rq.onupgradeneeded();
          rq.onsuccess && rq.onsuccess();
        });
        return rq;
      },
    },
  };
}
function load(mode) {
  const f = fakeIdb(mode);
  global.window = global;
  global.indexedDB = f.indexedDB;
  if (typeof navigator === 'undefined') Object.defineProperty(global, 'navigator', { value: {}, configurable: true }); // Node < 21 chưa có navigator (trình duyệt luôn có)
  global.HAK = {
    Config: { company: () => ({ short: 'HAK' }) },
    Generator: {
      filterRows: (r) => r,
      retKey: (r) => r.idx,
      summarize: (r) => ({
        trips: r.length,
        kg: r.reduce((a, x) => a + x.net, 0),
        vehicles: r.length,
        from: '01/10/2026',
        to: '01/10/2026',
      }),
    },
    UI: { toast() {} },
  };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  delete require.cache[require.resolve('../app/js/archive.js')];
  require('../app/js/archive.js');
  return { f, A: global.HAK.Archive };
}
const args = () => [
  'xuatkhau',
  { ship: 'ĐẠI DƯƠNG', giaoId: 'hak', contractId: 'd1', filter: {} },
  { files: [{ name: 'BB.docx' }], summary: {} },
  {
    rows: [
      { idx: 1, net: 1000 },
      { idx: 2, net: 2500 },
    ],
  },
  'word',
];
test('ghi thành công: thông số + dòng phiếu cân cùng một giao dịch, trả true sau khi hoàn tất', async () => {
  const { f, A } = load('ok');
  assert.equal(await A.save(...args()), true);
  assert.equal(A.lastError, '');
  const w = f.txs.filter((t) => t.access === 'readwrite');
  assert.equal(w.length, 1, 'đúng một giao dịch ghi');
  assert.deepEqual(w[0].names.sort(), ['data', 'meta'], 'meta và data trong cùng giao dịch');
  assert.equal(f.stores.meta.size, 1);
  assert.equal(f.stores.data.size, 1);
  const d = await A.load(Array.from(f.stores.meta.keys())[0]);
  assert.equal(d.rows.length, 2);
  assert.equal(d.params.ship, 'ĐẠI DƯƠNG');
});
test('giao dịch bị hủy (đầy bộ nhớ…): trả false + lý do, không có bản ghi nửa vời', async () => {
  const { f, A } = load('abort');
  assert.equal(await A.save(...args()), false);
  assert.match(A.lastError, /QuotaExceeded/);
  assert.equal(f.stores.meta.size, 0);
  assert.equal(f.stores.data.size, 0);
});
test('lỗi đồng bộ khi mở giao dịch: báo lỗi chứ không treo', async () => {
  const { A } = load('throw');
  const r = await Promise.race([A.save(...args()), new Promise((ok) => setTimeout(() => ok('TREO'), 1500))]);
  assert.equal(r, false);
  assert.match(A.lastError, /closing/);
});

test('lỗi ĐỒNG BỘ ở lần ghi thứ 2 (meta đã put, data chưa): hủy giao dịch, không để lại meta mồ côi; lưu lại được', async () => {
  const { f, A } = load('put2');
  assert.equal(await A.save(...args()), false);
  assert.match(A.lastError, /hết dung lượng|QuotaExceeded/i);
  assert.equal(f.stores.meta.size, 0, 'không có meta mồ côi');
  assert.equal(f.stores.data.size, 0);
  assert.ok(
    f.txs.filter((t) => t.access === 'readwrite').every((t) => t.aborted),
    'giao dịch ghi đã bị hủy'
  );
});

test('L-23: lưu lại hồ sơ với params thay đổi (docDate/contractId) cập nhật data.params trong kho', async () => {
  const { f, A } = load('ok');
  assert.equal(await A.save(...args()), true);
  const id = Array.from(f.stores.meta.keys())[0];
  const d1 = await A.load(id);
  assert.equal(d1.params.docDate, undefined);

  // Lưu lại cùng hồ sơ (id giữ nguyên do cùng rows/type) nhưng params đổi docDate và contractId
  const p2 = { ship: 'ĐẠI DƯƠNG', giaoId: 'hak', contractId: 'd2', docDate: '20/01/2026', filter: {} };
  assert.equal(
    await A.save(
      'xuatkhau',
      p2,
      { files: [{ name: 'BB.docx' }], summary: {} },
      {
        rows: [
          { idx: 1, net: 1000 },
          { idx: 2, net: 2500 },
        ],
      },
      'word'
    ),
    true
  );

  const d2 = await A.load(id);
  assert.equal(d2.params.docDate, '20/01/2026', 'params.docDate phải được cập nhật mới');
  assert.equal(d2.params.contractId, 'd2', 'params.contractId phải được cập nhật mới');
});
