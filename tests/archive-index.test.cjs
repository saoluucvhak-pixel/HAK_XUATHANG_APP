/* Kiểm tra mục lục (meta) ↔ nội dung (data) của hồ sơ Lưu trữ: số phiếu, tổng kg, phiếu KL ≤ 0 đã loại (danh sách giữ tối đa 50 dòng). */
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
require('../app/js/archive.js');
const { indexIssues } = global.HAK.Archive;
const rows = (n, kg) => Array.from({ length: n }, (_, i) => ({ idx: i + 1, net: kg }));
const meta = (extra) => Object.assign({ trips: 3, kg: 3000 }, extra || {});

test('hồ sơ khớp: không lỗi; số phiếu / kg lệch: báo', () => {
  assert.deepEqual(indexIssues(meta(), { rows: rows(3, 1000) }), []);
  assert.equal(indexIssues(meta({ trips: 4 }), { rows: rows(3, 1000) }).length, 1);
  assert.equal(indexIssues(meta({ kg: 3001 }), { rows: rows(3, 1000) }).length, 1);
  assert.equal(indexIssues(meta({ kg: 0.3 }), { rows: [{ net: 0.1 }, { net: 0.2 }] }).length, 1, 'ghi 3 phiếu nhưng có 2 phiếu (kg khớp)');
});
test('kg thập phân 0,1 + 0,2 không bị báo lệch do sai số dấu phẩy động', () => {
  assert.deepEqual(indexIssues({ trips: 2, kg: 0.3 }, { rows: [{ net: 0.1 }, { net: 0.2 }] }), []);
});
test('không đọc được dòng phiếu: báo', () => {
  assert.equal(indexIssues(meta(), null).length, 1);
  assert.equal(indexIssues(meta(), { rows: 'x' }).length, 1);
});
test('phiếu KL ≤ 0: số lượng và tổng khớp danh sách; dòng dương trong danh sách loại bị báo', () => {
  const ok = meta({ nonPosTrips: 2, nonPosKg: -500, nonPos: [{ kg: -300 }, { kg: -200 }] });
  assert.deepEqual(indexIssues(ok, { rows: rows(3, 1000) }), []);
  assert.equal(indexIssues(Object.assign({}, ok, { nonPosTrips: 3 }), { rows: rows(3, 1000) }).length, 1);
  assert.equal(indexIssues(Object.assign({}, ok, { nonPosKg: -100 }), { rows: rows(3, 1000) }).length, 1);
  assert.equal(
    indexIssues(Object.assign({}, ok, { nonPos: [{ kg: 300 }, { kg: -200 }], nonPosKg: 100 }), { rows: rows(3, 1000) }).length,
    1
  );
});
test('danh sách loại bị cắt ở 50 dòng: số phiếu lớn hơn danh sách là hợp lệ, nhỏ hơn thì báo', () => {
  const list = Array.from({ length: 50 }, () => ({ kg: -1 }));
  const m = meta({ nonPosTrips: 120, nonPosKg: -120, nonPos: list });
  assert.deepEqual(indexIssues(m, { rows: rows(3, 1000) }), []);
  assert.equal(indexIssues(Object.assign({}, m, { nonPosTrips: 49 }), { rows: rows(3, 1000) }).length, 1);
});
