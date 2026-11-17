/* Số liệu chứng thư: kiểm tra âm / BDMT > MT / độ ẩm / công thức; bản chụp + điều chỉnh riêng; chứng từ cũ không đổi khi Danh mục đổi. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const C = require('../app/js/cert-model.js');
test('parse số kiểu Việt: 49,9818 luôn là thập phân; 13.010,81; 6.500', () => {
  assert.equal(C.num('49,9818'), 49.9818);
  assert.equal(C.num('13.010,81'), 13010.81);
  assert.equal(C.num('6.500'), 6500);
  assert.equal(C.num(''), null);
  assert.equal(C.num('abc'), null);
});
test('lỗi chặn: số âm, độ ẩm ≥ 100, BDMT > MT', () => {
  assert.ok(C.check({ mt: -1 }).errors.length);
  assert.ok(C.check({ moisture: 100 }).errors.length);
  assert.ok(C.check({ moisture: -2 }).errors.length);
  assert.ok(C.check({ mt: 100, bdmt: 120, moisture: 10 }).errors.some((e) => /BDMT.*lớn hơn MT/.test(e)));
  assert.deepEqual(C.check({ mt: 100, bdmt: 100, moisture: 0 }).errors, []);
});
test('công thức BDMT ≈ MT × (1 − độ ẩm): đúng quy tắc làm tròn thì khớp; lệch thật thì cảnh báo kèm chênh lệch, không chặn', () => {
  const mt = 13010.81,
    m = 49.9818,
    bdmt = Math.round(mt * (1 - m / 100) * 100) / 100; // đúng cách generator.js tự tính
  const ok = C.check({ mt, bdmt, moisture: m });
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.diff, 0);
  const bad = C.check({ mt, bdmt: bdmt + 3.5, moisture: m });
  assert.deepEqual(bad.errors, []);
  assert.equal(bad.warnings.length, 1);
  assert.match(bad.warnings[0], /lệch \+3\.5/);
  assert.equal(bad.expectedBdmt, bdmt);
  const part = C.check({ mt: 100, bdmt: 50 });
  assert.deepEqual(part.warnings, []);
  assert.ok(
    part.notes.some((w) => /Chưa đủ MT \/ độ ẩm/.test(w)),
    'thiếu độ ẩm → ghi chú thiếu số liệu đối chiếu, không bắt xác nhận'
  );
});
test('bản chụp: không sửa → nguồn Danh mục; sửa riêng → liệt kê ô, giá trị Danh mục / dùng, lý do', () => {
  const det = { id: 'd1', certNo: 'CT-01', certDate: '2026-10-01', mt: 13010.81, bdmt: 6508.07, moisture: 49.9818 };
  const same = C.snapshot(
    det,
    { certNo: 'CT-01', certDate: '2026-10-01', certWet: '13.010,81', certDry: '6.508,07', moisture: '49,9818' },
    '',
    1
  );
  assert.equal(same.source, 'catalog');
  assert.deepEqual(same.overrides, []);
  assert.equal(C.describe(same), '');
  const adj = C.snapshot(
    det,
    { certNo: 'CT-01', certDate: '2026-10-01', certWet: '13.010,81', certDry: '6.500', moisture: '50,1' },
    'Theo chứng thư bổ sung',
    2
  );
  assert.equal(adj.source, 'catalog+adjusted');
  assert.deepEqual(
    adj.overrides.map((o) => o.id),
    ['certDry', 'moisture']
  );
  assert.equal(adj.overrides[0].catalog, 6508.07);
  assert.equal(adj.overrides[0].used, 6500);
  assert.match(C.describe(adj), /Lý do: Theo chứng thư bổ sung/);
  assert.match(C.describe(C.snapshot(det, { certNo: 'X' }, '', 3)), /CHƯA ghi lý do/);
});
test('chứng từ cũ không đổi khi Danh mục đổi sau đó (bản chụp độc lập với chi tiết)', () => {
  const det = { id: 'd1', certNo: 'CT-01', mt: 100, bdmt: 50, moisture: 50 },
    snap = C.snapshot(det, { certNo: 'CT-01', certWet: '100', certDry: '50', moisture: '50' }, '', 1),
    before = JSON.stringify(snap);
  det.bdmt = 60;
  det.certNo = 'CT-02'; // sửa Danh mục
  assert.equal(JSON.stringify(snap), before);
  assert.equal(snap.used.certDry, '50');
  assert.equal(C.overrides(snap.catalog, snap.used).length, 0); // mở lại: so với chính bản chụp → không có điều chỉnh giả
});
