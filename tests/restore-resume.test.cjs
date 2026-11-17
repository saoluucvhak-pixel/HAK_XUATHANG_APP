/* Khôi phục nhiều kho bị gián đoạn rồi thử lại (luồng restoreFile() thật, các kho mô phỏng ghi theo mã bản ghi như kho thật): đối chiếu số bản ghi, phiên bản hợp đồng và trạng thái từng bước. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
function boot(over) {
  const store = new Map();
  global.window = global;
  global.HAK = {};
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      store.set(k, JSON.stringify(v));
      return true;
    },
    keys: () => Array.from(store.keys()),
    remove: (k) => store.delete(k),
  };
  const calls = [];
  HAK.Archive = {
    importItems: async (x) => {
      calls.push('archive');
      return { added: x.length, updated: 0, skipped: 0 };
    },
    collectItems: async () => [],
  };
  const idb = { attachments: new Map(), bklsTemplates: new Map() };
  HAK.DB = {
    put: async (st, v) => {
      calls.push('put:' + st);
      idb[st].set(v.id, v);
    },
    get: async (st, id) => (idb[st] || new Map()).get(id),
    getAll: async () => [],
  };
  HAK.UI = { toast() {}, esc: (x) => String(x) };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  global.HAK.CustomsModel = require('../app/js/customs-model.js');
  global.HAK.ContractModel = require('../app/js/contract-model.js');
  Object.assign(HAK, (over && over(calls)) || {});
  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');
  return { store, calls, idb };
}
const det = (id, extra) => Object.assign({ id, contractId: 'hd1', ship: 'TÀU ' + id, mt: 100, bdmt: 50, revision: 1 }, extra || {});
const cat = (c) => ({
  v: 3,
  customers: [],
  products: [],
  contracts: [Object.assign({ id: 'hd1', type: 'xuatban', no: 'HD1', contractQty: 700, details: [det('d1')], revision: 4 }, c || {})],
  customs: [],
});
const fileOf = (obj) => {
  const b = Buffer.from(JSON.stringify(obj));
  return {
    slice: () => ({ arrayBuffer: async () => b.subarray(0, 2).buffer.slice(b.byteOffset, b.byteOffset + 2) }),
    text: async () => b.toString('utf8'),
  };
};
const backupOf = (keys, extra) => Object.assign({ app: 'hak-bienban-backup', v: 1, keys, archive: [] }, extra || {});
const local = () => HAK.Store.get('hak.catalog.v1').contracts[0];

/** Các kho mô phỏng: ghi theo mã (nhập lại cùng mã không nhân đôi, bản cũ hơn không đè bản mới) và có thể được bật lỗi theo từng kho. */
function stores() {
  const st = { archive: new Map(), batches: new Map(), issued: new Map(), yearbook: new Map(), failing: null, log: [] };
  const maybeFail = (id) => {
    if (st.failing === id) throw new Error('Lỗi mô phỏng ở ' + id);
  };
  const over = () => ({
    Archive: {
      importItems: async (items) => {
        maybeFail('archive');
        let added = 0,
          skipped = 0;
        for (const x of items) {
          if (st.archive.has(x.meta.id)) skipped++;
          else {
            st.archive.set(x.meta.id, x);
            added++;
          }
        }
        st.log.push('archive');
        return { added, updated: 0, skipped };
      },
      collectItems: async () => [],
    },
    Batches: {
      importAll: async (items, opts) => {
        maybeFail('batches');
        let n = 0;
        for (const x of items) {
          const cur = st.batches.get(x.meta.id);
          if (!cur || (opts && opts.keepNewer ? (x.meta.rev || 0) > (cur.meta.rev || 0) : true)) {
            st.batches.set(x.meta.id, x);
            n++;
          }
        }
        st.log.push('batches');
        return n;
      },
    },
    Issued: {
      importAll: async (items) => {
        maybeFail('issued');
        let n = 0;
        for (const x of items) if (!st.issued.has(x.id)) (st.issued.set(x.id, x), n++);
        st.log.push('issued');
        return n;
      },
    },
    Yearbook: {
      validateBundle: () => {},
      read: async () => ({ records: Array.from(st.yearbook.values()) }),
      importState: async (records) => {
        maybeFail('yearbook');
        for (const r of records) st.yearbook.set(r.id, r);
        st.log.push('yearbook');
      },
    },
  });
  return { st, over };
}
const FULL = () =>
  fileOf(
    backupOf(
      { 'hak.catalog.v1': cat({ contractQty: 900, revision: 6 }) },
      {
        yearbook: { records: [{ id: 'y1' }, { id: 'y2' }] },
        archive: [
          { meta: { id: 'a1' }, data: 'x' },
          { meta: { id: 'a2' }, data: 'y' },
        ],
        batches: [
          { meta: { id: 'b|1', rev: 2 }, b64: '' },
          { meta: { id: 'b|2', rev: 1 }, b64: '' },
        ],
        issued: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }],
      }
    )
  );
const STEP_ORDER = ['keys', 'yearbook', 'archive', 'attachments', 'bklsTemplates', 'batches', 'issued'];
const sizes = (st) => ({ archive: st.archive.size, batches: st.batches.size, issued: st.issued.size, yearbook: st.yearbook.size });
const FULL_SIZES = { archive: 2, batches: 2, issued: 3, yearbook: 2 };

test('khôi phục nhiều kho gián đoạn ở từng kho rồi thử lại: trạng thái từng bước đúng, thử lại đủ số bản ghi, không nhân đôi, phiên bản hợp đồng không đội thêm khi thử lại', async () => {
  for (const failAt of ['yearbook', 'archive', 'batches', 'issued']) {
    const S = stores();
    boot(S.over);
    HAK.Store.set('hak.catalog.v1', cat()); // máy đang có hợp đồng 700 BDMT, phiên bản 4
    S.st.failing = failAt;
    let err;
    try {
      await HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' });
    } catch (e) {
      err = e;
    }
    assert.ok(err && err.report, failAt + ': lỗi kèm báo cáo từng kho');
    const st = Object.fromEntries(err.report.map((x) => [x.id, x.status])),
      k = STEP_ORDER.indexOf(failAt);
    STEP_ORDER.forEach((id, i) => {
      if (id in st) assert.equal(st[id], i < k ? 'done' : i === k ? 'failed' : 'pending', failAt + ' / bước ' + id);
    });
    assert.match(err.message, /DỪNG GIỮA CHỪNG/);
    assert.equal(local().contractQty, 900, failAt + ': bước cài đặt & danh mục đã ghi (bản 900 / v6 mới hơn)');
    assert.equal(local().revision, 7, 'gộp bản sao mới hơn (v6) vào máy (v4) tạo đúng một phiên bản mới = lớn nhất + 1');
    // thử lại cùng file sau khi sự cố hết
    S.st.failing = null;
    const out = await HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' });
    assert.ok(
      out.report.every((x) => x.status === 'done'),
      failAt + ': mọi bước hoàn tất sau khi thử lại'
    );
    assert.deepEqual(sizes(S.st), FULL_SIZES, failAt + ': đủ bản ghi sau khi thử lại');
    assert.equal(local().revision, 7, failAt + ': thử lại KHÔNG đội thêm phiên bản hợp đồng');
    assert.equal(local().contractQty, 900);
    // chạy lần thứ ba: không đổi gì
    await HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' });
    assert.deepEqual(sizes(S.st), FULL_SIZES, failAt + ': nhập lặp không nhân đôi');
    assert.equal(local().revision, 7, failAt + ': nhập lặp giữ nguyên phiên bản');
  }
});
test('lỗi ở bước đầu (không ghi được danh mục): các kho sau chưa chạy; thử lại đủ và phiên bản hợp đồng chỉ tăng đúng một lần', async () => {
  const S = stores();
  boot(S.over);
  HAK.Store.set('hak.catalog.v1', cat());
  const realSet = HAK.Store.set;
  HAK.Store.set = (k, v) => (k === 'hak.catalog.v1' && S.st.failing === 'keys' ? false : realSet(k, v));
  S.st.failing = 'keys';
  let err;
  try {
    await HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' });
  } catch (e) {
    err = e;
  }
  const st = Object.fromEntries(err.report.map((x) => [x.id, x.status]));
  assert.equal(st.keys, 'failed');
  assert.ok(
    ['yearbook', 'archive', 'batches', 'issued'].every((id) => st[id] === 'pending'),
    'các kho sau chưa chạy'
  );
  assert.deepEqual(sizes(S.st), { archive: 0, batches: 0, issued: 0, yearbook: 0 }, 'chưa ghi gì vào kho nào');
  assert.equal(local().revision, 4, 'hợp đồng trên máy giữ nguyên');
  S.st.failing = null;
  const out = await HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' });
  assert.ok(out.report.every((x) => x.status === 'done'));
  assert.deepEqual(sizes(S.st), FULL_SIZES);
  assert.equal(local().revision, 7, 'v6 gộp vào v4 → v7, một lần duy nhất');
  assert.equal(local().contractQty, 900);
});
test('bản trên máy mới hơn bản sao: thử lại sau gián đoạn không bao giờ hạ phiên bản hợp đồng', async () => {
  const S = stores();
  boot(S.over);
  HAK.Store.set('hak.catalog.v1', cat({ contractQty: 1200, revision: 9 })); // máy mới hơn bản sao (v6)
  S.st.failing = 'batches';
  await assert.rejects(HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' }));
  assert.equal(local().revision, 9);
  S.st.failing = null;
  await HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' });
  assert.equal(local().revision, 9);
  assert.equal(local().contractQty, 1200, 'bản mới hơn trên máy được giữ');
  assert.deepEqual(sizes(S.st), FULL_SIZES);
});
test('đợt Excel: bản trên máy có phiên bản mới hơn không bị bản sao cũ đè khi thử lại; bản sao mới hơn thì thay', async () => {
  const S = stores();
  boot(S.over);
  HAK.Store.set('hak.catalog.v1', cat());
  S.st.batches.set('b|1', { meta: { id: 'b|1', rev: 5 }, b64: 'local' }); // máy đã có b|1 phiên bản 5
  S.st.failing = 'issued';
  await assert.rejects(HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' }));
  S.st.failing = null;
  await HAK.Backup.restoreFile(FULL(), { keepAuth: false, mode: 'merge' });
  assert.equal(S.st.batches.get('b|1').b64, 'local', 'phiên bản 5 trên máy > 2 trong bản sao → giữ');
  assert.equal(S.st.batches.size, 2, 'b|2 (chỉ có trong bản sao) được thêm');
  assert.equal(S.st.issued.size, 3);
});
