const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function boot() {
  const data = new Map(),
    events = {},
    notes = [];
  let reloads = 0;
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    AbortController,
    localStorage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
      get length() {
        return data.size;
      },
      key: (i) => [...data.keys()][i],
    },
    addEventListener: (name, fn) => {
      events[name] = fn;
    },
    location: {
      reload: () => {
        reloads++;
      },
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
  });
  ctx.window = ctx;
  for (const file of ['config.js', 'storage.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js', file), 'utf8'), ctx);
  ctx.HAK.Storage.mode = 'sqlite';
  ctx.HAK.UI = { toast: (msg) => notes.push(msg) };
  const db = (ctx.HAK.DB = { usable: () => true, kvPut: async () => {}, kvDel: async () => {} });
  return { H: ctx.HAK, ctx, db, events, notes, reloads: () => reloads };
}
test('reload waits for the complete background Store write, including work before HTTP starts', async () => {
  const b = boot(),
    gate = deferred();
  b.db.kvPut = () => gate.promise;
  b.H.Store.set('hak.sf.presets', { q: 'mới' });
  const reloading = b.H.reloadAfterWrites(0, 200);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(b.reloads(), 0);
  gate.resolve();
  assert.equal(await reloading, true);
  assert.equal(b.reloads(), 1);
});
test('SQLite failure blocks reload even when localStorage cache was written successfully', async () => {
  const b = boot();
  b.db.kvPut = async () => {
    throw Error('disk full');
  };
  b.H.Store.set('hak.workingYear', 2026);
  assert.equal(await b.H.reloadAfterWrites(0, 200), false);
  assert.equal(b.reloads(), 0);
  assert.equal(b.H.Store.get('hak.workingYear'), 2026);
  assert.ok(b.notes.some((s) => /Chưa tải lại/.test(s)));
  b.db.kvPut = async () => {};
  b.H.Store.set('hak.workingYear', 2026);
  assert.equal(await b.H.reloadAfterWrites(0, 200), true);
});
test('timeout leaves the page open; finishing later does not unexpectedly reload it', async () => {
  const b = boot(),
    gate = deferred();
  b.db.kvPut = () => gate.promise;
  b.H.Store.set('hak.filter', 'pending');
  assert.equal(await b.H.reloadAfterWrites(0, 10), false);
  gate.resolve();
  await b.H.Store.flush();
  assert.equal(b.reloads(), 0);
});
test('delete is also awaited and browser close warns while a write is pending', async () => {
  const b = boot(),
    gate = deferred();
  b.db.kvDel = () => gate.promise;
  b.H.Store.remove('hak.old');
  let prevented = false;
  b.events.beforeunload({
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  const p = b.H.reloadAfterWrites(0, 200);
  gate.resolve();
  assert.equal(await p, true);
});
test('direct SQLite HTTP writes are awaited; UTF-8 byte length controls keepalive', async () => {
  const b = boot(),
    gate = deferred(),
    requests = [];
  b.ctx.fetch = async (_, opt) => {
    requests.push(opt);
    await gate.promise;
    return { ok: true, json: async () => ({}) };
  };
  const a = b.H.Storage.call('/db/tx', { text: 'đ'.repeat(40000) });
  const reload = b.H.reloadAfterWrites(0, 200);
  assert.equal(requests[0].keepalive, false);
  assert.equal(b.reloads(), 0);
  gate.resolve();
  await a;
  assert.equal(await reload, true);
  await b.H.Storage.call('/db/tx', { text: 'nhỏ' });
  assert.equal(requests[1].keepalive, true);
});
test('read requests are not counted as pending writes', async () => {
  const b = boot(),
    gate = deferred();
  b.ctx.fetch = async () => {
    await gate.promise;
    return { ok: true, json: async () => ({ rows: [] }) };
  };
  const p = b.H.Storage.call('/db/query', { table: 'kv' });
  assert.equal(b.H.Storage.pendingWrites(), 0);
  gate.resolve();
  await p;
});
