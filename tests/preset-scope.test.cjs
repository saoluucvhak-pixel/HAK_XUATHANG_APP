// v2.25.0 (mục 32): bộ lọc đã lưu tách theo TÀI KHOẢN + CÔNG TY (HAK.Filters.presetStorage bọc HAK.Store).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(user, co) {
  const store = new Map(),
    ls = new Map();
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/libs/hak-smart-filter/core.js'), 'utf8'), ctx);
  ctx.HAKSmartFilter = { core: ctx.HAKCore.sf };
  ctx.HAK = {
    Store: {
      get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
      set: (k, v) => {
        store.set(k, JSON.stringify(v));
        ls.set(k, JSON.stringify(v));
        return true;
      },
    },
    Auth: { current: () => user, company: () => co, isAdmin: () => !!user && user.role === 'admin' },
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/js/hak-filters.js'), 'utf8'), ctx);
  const F = ctx.HAK.Filters;
  return { F, ctx, store, presets: () => ctx.HAKSmartFilter.core.presets(F.presetStorage) };
}
const LEGACY = { schema: 1, screens: { archive: { 'BL-CU': { state: { q: 'CU' }, savedAt: '2026-01-01' } } } };

test('presetKey: khóa riêng theo tài khoản + công ty, giữ đuôi bản sao; chưa đăng nhập → khóa chung', () => {
  const { F } = load(null, '');
  assert.equal(F.presetKey('hak.sf.presets', 'u1', 'hak'), 'hak.sf.presets@u1@hak');
  assert.equal(F.presetKey('hak.sf.presets.bak.2026-11-19T00:00:00Z', 'u1', 'dh'), 'hak.sf.presets@u1@dh.bak.2026-11-19T00:00:00Z');
  assert.equal(F.presetKey('hak.sf.presets', '', 'hak'), 'hak.sf.presets');
  assert.equal(F.presetKey('hak.khac', 'u1', 'hak'), 'hak.khac');
});

test('nhân viên KHÔNG thấy kho dùng chung cũ (tên / điều kiện bộ lọc của người khác); quản trị nhận bản sao một lần', () => {
  const nv = load({ id: 'nv1', role: 'staff' }, 'hak');
  nv.store.set('hak.sf.presets', JSON.stringify(LEGACY));
  assert.deepEqual(Array.from(nv.presets().list('archive')), []);
  const qt = load({ id: 'qt1', role: 'admin' }, 'hak');
  qt.store.set('hak.sf.presets', JSON.stringify(LEGACY));
  assert.deepEqual(Array.from(qt.presets().list('archive')), ['BL-CU']);
  assert.ok(qt.store.has('hak.sf.presets@qt1@hak'), 'đã chép vào khóa riêng của quản trị');
  assert.equal(qt.store.get('hak.sf.presets'), JSON.stringify(LEGACY), 'kho chung cũ giữ nguyên');
});

test('lưu ở công ty / tài khoản này không hiện ở công ty / tài khoản khác', () => {
  const a = load({ id: 'nv1', role: 'staff' }, 'hak');
  assert.equal(a.presets().save('archive', 'BL-A', { q: 'X' }).ok, true);
  assert.deepEqual(Array.from(a.presets().list('archive')), ['BL-A']);
  // cùng kho dữ liệu, đổi công ty
  a.ctx.HAK.Auth.company = () => 'dh';
  assert.deepEqual(Array.from(a.presets().list('archive')), []);
  // cùng công ty, tài khoản khác
  a.ctx.HAK.Auth.company = () => 'hak';
  a.ctx.HAK.Auth.current = () => ({ id: 'nv2', role: 'staff' });
  assert.deepEqual(Array.from(a.presets().list('archive')), []);
  a.ctx.HAK.Auth.current = () => ({ id: 'nv1', role: 'staff' });
  assert.deepEqual(Array.from(a.presets().list('archive')), ['BL-A']);
  assert.ok(!a.store.has('hak.sf.presets'), 'không ghi vào khóa chung');
});
