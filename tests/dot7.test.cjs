/**
 * tests/dot7.test.cjs — Bộ kiểm thử Đợt 7 (v2.25.8)
 * Nâng cấp cấu trúc (U-xx, không đổi hành vi nghiệp vụ):
 * - U-03: Hằng số hệ thống & Khóa Storage tập trung (HAK.Constants, HAK.Config.KEYS)
 * - U-04: Module HAK.Identity dùng chung (chuẩn hóa biển số, mã phiếu, hợp đồng, công ty)
 * - U-05: Khung kiểm tra form mức ô (HAK.Validation, HAK.UI.validateCell, validateForm)
 * - U-08: Đóng gói createReportEngine độc lập, có thể tái sử dụng
 * - U-10: Tra cứu O(1) với createLookupMap, indexBy, groupBy trong HAK.Util
 * - U-11: Đối chiếu chéo 3 chiều (HAK.Integrity.reconcileThreeWay / HAK.Reconciliation)
 * - U-13..U-15: Helper dùng chung (deepClone, escapeHtml, compareVersions, formatNumber)
 */
const { test } = require('node:test'),
  assert = require('node:assert/strict');

function bootEnv() {
  const store = new Map();
  global.window = global;
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store.keys())[i] || null,
  };
  global.HAK = {};
  delete require.cache[require.resolve('../app/js/util.js')];
  require('../app/js/util.js');
  delete require.cache[require.resolve('../app/js/config.js')];
  require('../app/js/config.js');
  delete require.cache[require.resolve('../app/js/vehicles.js')];
  require('../app/js/vehicles.js');
  delete require.cache[require.resolve('../app/js/pages-modals.js')];
  require('../app/js/pages-modals.js');
  delete require.cache[require.resolve('../app/js/ui.js')];
  require('../app/js/ui.js');
  delete require.cache[require.resolve('../app/js/integrity-model.js')];
  require('../app/js/integrity-model.js');
  delete require.cache[require.resolve('../app/js/report.js')];
  require('../app/js/report.js');
  return { store };
}

test('U-03: HAK.Constants và HAK.Config.KEYS chứa đầy đủ khóa hệ thống và được đóng băng', () => {
  bootEnv();
  assert.ok(HAK.Constants && HAK.Constants.KEYS, 'HAK.Constants.KEYS phải tồn tại');
  assert.ok(HAK.Config && HAK.Config.KEYS, 'HAK.Config.KEYS phải tồn tại');
  assert.ok(Object.isFrozen(HAK.Constants.KEYS), 'KEYS phải được đóng băng Object.freeze');

  assert.equal(HAK.Config.KEYS.CONFIG, 'hak.config.v1');
  assert.equal(HAK.Config.KEYS.CATALOG, 'hak.catalog.v1');
  assert.equal(HAK.Config.KEYS.YEARBOOK, 'hak.yearbook.v1');
  assert.equal(HAK.Config.KEYS.AUTH, 'hak.auth.v1');
  assert.equal(HAK.Config.KEYS.DRAFT_GENERAL, 'hak.draft.general');
  assert.equal(HAK.Config.KEYS.RESTORE_UNDO, 'hak.restore.undo.v1');
  assert.equal(HAK.Constants.STORAGE_PREFIX, 'hak.');
});

test('U-04: Module HAK.Identity chuẩn hóa biển số, mã phiếu, hợp đồng, công ty nhất quán', () => {
  bootEnv();
  const Id = HAK.Identity;
  assert.ok(Id, 'HAK.Identity phải tồn tại');

  // Chuẩn hóa biển số xe (loại bỏ ký tự phân cách, viết hoa, Đ/đ -> D)
  assert.equal(Id.normPlate('43h-010.68'), '43H01068');
  assert.equal(Id.normPlate('29đ-123.45'), '29D12345');
  assert.equal(Id.normPlate('  51A 99999  '), '51A99999');

  // Chuẩn hóa token phiếu cân (bỏ ngoặc kép, khoảng trắng thừa)
  assert.equal(Id.normTicket('"P001"'), 'P001');
  assert.equal(Id.normTicketToken('“P-123”'), 'P-123');

  // Tách chuỗi danh sách mã phiếu
  const tokens = Id.parseTicketTokens('P01, "P02", P03;  P04\nP05');
  assert.deepEqual(tokens, ['P01', 'P02', 'P03', 'P04', 'P05']);

  // Tra cứu phiếu cân resolveTicket
  const rows = [
    { ticket: 'P-001', kg: 1000 },
    { ticket: 'P-002', kg: 2000 },
    { ticket: 'ABC/P-003', kg: 3000 },
  ];
  const r1 = Id.resolveTicket(rows, 'p-001');
  assert.equal(r1.kind, 'one');
  assert.equal(r1.hits[0].ticket, 'P-001');

  const r2 = Id.resolveTicket(rows, 'P-003');
  assert.equal(r2.kind, 'one');
  assert.equal(r2.hits[0].ticket, 'ABC/P-003');

  const r3 = Id.resolveTicket(rows, 'UNKNOWN');
  assert.equal(r3.kind, 'none');

  // Chuẩn hóa mã hợp đồng & công ty
  assert.equal(Id.normContractId(' HD-2026-01 '), 'hd-2026-01');
  assert.equal(Id.normCompanyId(' HAK_QN '), 'hak_qn');
});

test('U-05: Khung kiểm tra form mức ô HAK.Validation hoạt động chính xác', () => {
  bootEnv();
  const V = HAK.Validation;
  assert.ok(V, 'HAK.Validation phải tồn tại');

  // Kiểm tra required
  assert.equal(V.validateCell('', 'required', 'Họ tên').valid, false);
  assert.match(V.validateCell('', 'required', 'Họ tên').error, /không được để trống/);
  assert.equal(V.validateCell('Nguyễn Văn A', 'required', 'Họ tên').valid, true);

  // Kiểm tra number và khoảng giá trị
  assert.equal(V.validateCell('abc', 'number', 'Số lượng').valid, false);
  assert.equal(V.validateCell('150', { number: true, min: 10, max: 100 }, 'Số lượng').valid, false);
  assert.equal(V.validateCell('50', { number: true, min: 10, max: 100 }, 'Số lượng').valid, true);

  // Kiểm tra maxlength và regex
  assert.equal(V.validateCell('Quá dài', { maxlength: 5 }, 'Ghi chú').valid, false);
  assert.equal(V.validateCell('1234', { regex: /^\d+$/ }, 'Mã số').valid, true);
  assert.equal(V.validateCell('12a4', { regex: /^\d+$/ }, 'Mã số').valid, false);

  // Kiểm tra custom validation function
  assert.equal(
    V.validateCell('user@domain.com', {
      custom: (val) => val.includes('@'),
      message: 'Email không đúng định dạng',
    }).valid,
    true
  );
  assert.equal(
    V.validateCell('userdomain.com', {
      custom: (val) => val.includes('@'),
      message: 'Email không đúng định dạng',
    }).valid,
    false
  );
});

test('U-08: HAK.createReportEngine đóng gói instance engine độc lập với cache riêng', () => {
  bootEnv();
  assert.equal(typeof HAK.createReportEngine, 'function', 'HAK.createReportEngine phải là function');
  assert.equal(typeof HAK.Report.createReportEngine, 'function', 'HAK.Report.createReportEngine phải là function');

  const engine1 = HAK.createReportEngine();
  const engine2 = HAK.createReportEngine();

  assert.notEqual(engine1.ticketCache, engine2.ticketCache, 'Mỗi engine instance phải sở hữu ticketCache độc lập');
  assert.equal(typeof engine1.compute, 'function');
  assert.equal(typeof engine1.xhLots, 'function');
  assert.equal(typeof engine1.checkGsyncScope, 'function');
  assert.ok(Array.isArray(engine1.TYPES));

  // Kiểm tra helper ngày tháng trên engine
  assert.equal(engine1.monthOf('15/08/2026'), '2026-08');
  assert.equal(engine1.monthOf('invalid'), engine1.UNKNOWN_DATE);
});

test('U-10: Tra cứu O(1) với createLookupMap, indexBy, groupBy trong HAK.Util', () => {
  bootEnv();
  const { createLookupMap, indexBy, groupBy } = HAK.Util;

  const items = [
    { id: 'c1', type: 'contract', val: 100 },
    { id: 'c2', type: 'contract', val: 200 },
    { id: 't1', type: 'ticket', val: 300 },
  ];

  // createLookupMap
  const map = createLookupMap(items, 'id');
  assert.equal(map.get('c1').val, 100);
  assert.equal(map.get('c2').val, 200);
  assert.equal(map.get('t1').val, 300);
  assert.equal(map.get('non-existent'), undefined);

  // indexBy
  const dict = indexBy(items, 'id');
  assert.equal(dict['c1'].val, 100);
  assert.equal(dict['t1'].val, 300);

  // groupBy
  const groups = groupBy(items, (x) => x.type);
  assert.equal(groups.get('contract').length, 2);
  assert.equal(groups.get('ticket').length, 1);
});

test('U-11: Đối chiếu chéo 3 chiều HAK.Integrity.reconcileThreeWay', () => {
  bootEnv();
  const { reconcileThreeWay } = HAK.Integrity;
  assert.equal(typeof reconcileThreeWay, 'function');
  assert.equal(HAK.Reconciliation.reconcileThreeWay, reconcileThreeWay);

  const catalog = {
    contracts: [
      {
        id: 'hd-01',
        no: '01/HAK/2026',
        details: [
          { id: 'ct-01', no: 'Lô 1', mt: 50 }, // 50 tấn = 50.000 kg
          { id: 'ct-02', no: 'Lô 2', mt: 30 }, // 30 tấn = 30.000 kg
        ],
      },
    ],
  };

  const customs = [
    { id: 'tk-01', no: '100000000001', detailId: 'ct-01', qty: 50, unit: 'tan', status: 'cleared' }, // Khai 50.000 kg
    { id: 'tk-02', no: '100000000002', detailId: 'ct-02', qty: 20, unit: 'tan', status: 'cleared' }, // Khai 20.000 kg (thiếu so với HĐ)
    { id: 'tk-orphan', no: '100000000003', detailId: 'ct-non-existent', qty: 10, unit: 'tan' },
  ];

  const metas = [
    { id: 'rec-01', contract: 'ct-01', kg: 50000, delKg: 50000 }, // Khớp hoàn hảo với HĐ và tờ khai
    { id: 'rec-02', contract: 'ct-02', kg: 35000, delKg: 35000 }, // Cân 35.000 kg: vượt HĐ (30.000) và vượt tờ khai (20.000)
    { id: 'rec-unlinked', contract: '', kg: 5000 },
  ];

  const report = reconcileThreeWay(catalog, customs, metas, { thresholdKg: 0 });

  assert.equal(report.details.length, 2);
  const ct1 = report.details.find((d) => d.detailId === 'ct-01');
  assert.equal(ct1.status, 'MATCH');
  assert.equal(ct1.diffContract, 0);
  assert.equal(ct1.diffCustoms, 0);

  const ct2 = report.details.find((d) => d.detailId === 'ct-02');
  assert.equal(ct2.status, 'OVER_CONTRACT'); // Cân 35.000 > 30.000 kg
  assert.equal(ct2.diffContract, 5000);
  assert.equal(ct2.diffCustoms, -15000); // Tờ khai (20.000) - Cân (35.000) = -15.000

  // Kiểm tra hồ sơ mồ côi / chưa gắn
  assert.equal(report.unlinkedMetas.length, 1);
  assert.equal(report.orphanCustoms.length, 1);
  assert.equal(report.summary.hasIssues, true);
});

test('U-13..U-15: Helper dùng chung deepClone, escapeHtml, compareVersions, formatNumber', () => {
  bootEnv();
  const { deepClone, escapeHtml, compareVersions, formatNumber } = HAK.Util;

  // deepClone
  const orig = { a: 1, b: { c: [2, 3] } };
  const cloned = deepClone(orig);
  assert.deepEqual(cloned, orig);
  cloned.b.c.push(4);
  assert.equal(orig.b.c.length, 2);

  // escapeHtml
  assert.equal(escapeHtml('<script>alert("1 & 2")</script>'), '&lt;script&gt;alert(&quot;1 &amp; 2&quot;)&lt;/script&gt;');

  // compareVersions
  assert.equal(compareVersions('2.25.7', '2.25.8'), -1);
  assert.equal(compareVersions('2.25.8', '2.25.7'), 1);
  assert.equal(compareVersions('2.25.8', '2.25.8'), 0);
  assert.equal(compareVersions('2.25.8.1', '2.25.8'), 1);

  // formatNumber
  assert.equal(formatNumber(1234567), '1.234.567');
  assert.equal(formatNumber(1234567.89, 2), '1.234.567,89');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(null), '');
});
