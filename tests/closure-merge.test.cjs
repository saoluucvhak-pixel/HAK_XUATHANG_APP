/* Đóng / mở lại hợp đồng thủ công + gộp bản sao lưu: bản mở lại (closeRev cao hơn) thắng bản đóng cũ; nhập lại bản đóng cũ giữ trạng thái mở; nhập lặp lại ổn định; tương thích bản đã phát hành (chưa có closeRev). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const M = require('../app/js/contract-model.js');
const cat = (mut) => {
  const c = M.parent({ id: 'hd1', type: 'xuatban', no: 'HD1', contractQty: 100, details: [], revision: 1 });
  if (mut) mut(c);
  return { v: 3, customers: [], products: [], contracts: [c] };
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const closed1 = () =>
  cat((c) => {
    c.closedAt = '2026-10-01';
  }); // dạng ĐÃ PHÁT HÀNH (v2.16.2): chỉ có closedAt, chưa có closeRev
const reopened = () => {
  const x = closed1();
  M.reopenContract(x.contracts[0], '2026-10-05');
  x.contracts[0].revision = 2;
  return x;
};
const state = (d) => ({ closedAt: d.contracts[0].closedAt, rev: M.closeRevOf(d.contracts[0]) });

test('tái hiện lỗi cũ: bản mở lại + bản đóng cũ không còn cho kết quả "đã đóng" (cả hai chiều gộp)', () => {
  assert.equal(state(M.mergeCatalog(closed1(), reopened())).closedAt, undefined, 'đóng (phiên bản 1) + mở lại (phiên bản 2) → đang mở');
  assert.equal(state(M.mergeCatalog(reopened(), closed1())).closedAt, undefined, 'nhập lại bản đóng cũ vào máy đã mở lại → vẫn mở');
});
test('nhập lặp lại cùng một bản cho cùng kết quả (idempotent)', () => {
  const once = M.mergeCatalog(closed1(), reopened()),
    twice = M.mergeCatalog(once, reopened()),
    thrice = M.mergeCatalog(twice, closed1());
  assert.deepEqual(state(twice), state(once));
  assert.deepEqual(state(thrice), state(once));
  assert.equal(state(once).rev, 2);
  const c = M.mergeCatalog(closed1(), closed1());
  assert.equal(state(c).closedAt, '2026-10-01');
  assert.equal(state(c).rev, 1);
});
test('dữ liệu cũ thiếu trường: máy chưa đóng nhận bản đóng cũ → đóng; đóng rồi mở lại rồi đóng lại (phiên bản 3) thắng bản mở lại (2)', () => {
  assert.equal(
    state(M.mergeCatalog(cat(), closed1())).closedAt,
    '2026-10-01',
    'bản phát hành cũ chưa có closeRev: có closedAt = phiên bản 1 > 0'
  );
  const again = reopened();
  M.closeContract(again.contracts[0], '2026-10-09');
  assert.deepEqual(state(M.mergeCatalog(reopened(), again)), { closedAt: '2026-10-09', rev: 3 });
  assert.deepEqual(state(M.mergeCatalog(again, reopened())), { closedAt: '2026-10-09', rev: 3 });
});
test('xung đột (cùng phiên bản, khác trạng thái): lấy bản có mốc ngày muộn hơn; hòa thì giữ bản trên máy này', () => {
  const a = cat((c) => {
      M.closeContract(c, '2026-10-02');
      c.closeRev = 2;
    }),
    b = cat((c) => {
      c.closeRev = 2;
      c.reopenedAt = '2026-10-08';
    });
  assert.equal(state(M.mergeCatalog(a, b)).closedAt, undefined, 'mở lại ngày 08 muộn hơn đóng ngày 02');
  assert.equal(state(M.mergeCatalog(b, a)).closedAt, undefined);
  const tie = cat((c) => {
    c.closeRev = 2;
    c.reopenedAt = '2026-10-02';
  });
  assert.equal(state(M.mergeCatalog(a, tie)).closedAt, '2026-10-02', 'hòa → giữ máy này (đang đóng)');
});
test('đóng / mở lại qua thao tác của form: tăng phiên bản, mở lại xóa closedAt và ghi ngày mở lại', () => {
  const c = cat().contracts[0];
  M.closeContract(c, '2026-10-01');
  assert.deepEqual([c.closedAt, c.closeRev], ['2026-10-01', 1]);
  M.reopenContract(c, '2026-10-05');
  assert.deepEqual([c.closedAt, c.closeRev, c.reopenedAt], [undefined, 2, '2026-10-05']);
  M.closeContract(c, '2026-10-09');
  assert.deepEqual([c.closedAt, c.closeRev, c.reopenedAt], ['2026-10-09', 3, undefined]);
});
test('luồng phục hồi thực tế: Gói cấu hình (packApply) vào máy đã mở lại không làm hợp đồng đóng lại; bản sao lưu cũ nhập lại vẫn giữ mở', async () => {
  const store = new Map();
  global.HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      store.set(k, JSON.stringify(v));
    },
    keys: () => Array.from(store.keys()),
  };
  global.HAK.ContractModel = M;
  global.HAK.Auth = { packIn: () => null };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  global.navigator = global.navigator || {};
  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');
  const pack = (catalog) => ({ app: 'hak-bienban-pack', config: { companies: [], warehouses: [] }, catalog, tpl: {}, gsync: {}, auth: {} });
  store.set('hak.catalog.v1', JSON.stringify(closed1())); // máy này: đang đóng (bản cũ)
  await HAK.Backup.packApply(pack(reopened())); // gói mới có bản mở lại
  assert.equal(HAK.Store.get('hak.catalog.v1').contracts[0].closedAt, undefined, 'sau khi nhập gói mở lại → đang mở');
  await HAK.Backup.packApply(pack(closed1()));
  await HAK.Backup.packApply(pack(closed1())); // nhập lại gói cũ (bản đóng) hai lần
  const after = HAK.Store.get('hak.catalog.v1').contracts[0];
  assert.equal(after.closedAt, undefined, 'giữ trạng thái đang mở');
  assert.equal(M.closeRevOf(after), 2);
  await HAK.Backup.packApply(pack(reopened()));
  assert.equal(HAK.Store.get('hak.catalog.v1').contracts[0].closedAt, undefined, 'nhập lặp lại bản mở lại → vẫn mở');
});
