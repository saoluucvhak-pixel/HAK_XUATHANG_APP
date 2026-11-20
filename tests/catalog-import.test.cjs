/* Đợt 2 (N-04, N-05): nhập Excel danh mục — dòng bị bỏ không tạo khách hàng rác, nêu rõ dòng & lý do, hiệu năng O(N). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');

function bootCatalog() {
  const store = new Map();
  global.window = global;
  global.HAK = {};
  global.XLSX = require('../app/libs/xlsx.full.min.js');
  HAK.Util = require('../app/js/util.js');
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      store.set(k, JSON.stringify(v));
      return true;
    },
    remove: (k) => store.delete(k),
    keys: () => Array.from(store.keys()),
  };
  HAK.Config = { data: { companies: [{ id: 'hak', name: 'HAK', short: 'HAK' }], warehouses: [] } };
  HAK.Auth = { company: () => 'hak', scopeIds: () => null };
  HAK.UI = { esc: (s) => String(s == null ? '' : s), toast() {} };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  delete require.cache[require.resolve('../app/js/excel.js')];
  delete require.cache[require.resolve('../app/js/generator.js')];
  delete require.cache[require.resolve('../app/js/contract-model.js')];
  delete require.cache[require.resolve('../app/js/catalog.js')];
  require('../app/js/excel.js');
  require('../app/js/generator.js');
  require('../app/js/contract-model.js');
  require('../app/js/catalog.js');
}

function makeWb(aoa) {
  const wb = global.XLSX.utils.book_new();
  global.XLSX.utils.book_append_sheet(wb, global.XLSX.utils.aoa_to_sheet(aoa), 'NL_DH_XB');
  return wb;
}

test('N-04: dòng bị bỏ qua KHÔNG tạo khách hàng mới và báo rõ dòng + lý do', () => {
  bootCatalog();
  const wb = makeWb([
    ['SỐ TKHQ', 'TÀU', 'KHÁCH HÀNG', 'SỐ HĐ', 'ĐỘ KHÔ NHÀ MÁY', 'BDMT'],
    ['308629709001', 'TÀU A', 'Khách Tốt', 'HD-01', 0.48, '1200kg'],
    ['308629709002', 'TÀU B', 'Khách Rác Không Được Tạo', 'HD-02', 5, 500], // dryFactory=5 -> lỗi validateContract
  ]);
  const r = HAK.Catalog.importWorkbook(wb);
  assert.equal(r.skipped, 1);
  assert.ok(Array.isArray(r.skipReasons) && r.skipReasons.length === 1, 'phải có skipReasons');
  assert.equal(r.skipReasons[0].row, 3, 'phải nêu đúng dòng Excel số 3');
  assert.match(r.skipReasons[0].reason, /Độ khô/i);
  assert.equal(
    HAK.Catalog.customers().some((c) => c.name === 'Khách Rác Không Được Tạo'),
    false,
    'dòng bị bỏ không được tạo khách hàng'
  );
  assert.ok(Array.isArray(r.warnings) && r.warnings.length >= 1, 'phải có cảnh báo đơn vị "1200kg"');
});

test('N-05: nhập Excel danh mục 1.500 dòng hoàn thành nhanh (O(N) < 1500 ms)', () => {
  bootCatalog();
  const aoa = [['SỐ TKHQ', 'TÀU', 'KHÁCH HÀNG', 'SỐ HĐ', 'BDMT']];
  for (let i = 1; i <= 1500; i++) {
    aoa.push(['308600' + String(i).padStart(6, '0'), 'TÀU ' + i, 'Khách ' + (i % 50), 'HD-' + i, 1000]);
  }
  const wb = makeWb(aoa);
  const t0 = Date.now();
  const r = HAK.Catalog.importWorkbook(wb);
  const ms = Date.now() - t0;
  assert.equal(r.addedContracts, 1500);
  assert.ok(ms < 1500, 'nhập 1.500 dòng mất ' + ms + ' ms (kỳ vọng < 1500 ms)');
});
