const { test } = require('node:test'),
  assert = require('node:assert/strict');

global.window = global;
global.HAK = {};
require('../app/js/util.js');
require('../app/js/config.js');
require('../app/js/excel.js');
require('../app/js/generator.js');
require('../app/js/weigh-model.js');
require('../app/js/customs-model.js');
require('../app/js/trip-details.js');

test('L-08: khi có hồ sơ bị bỏ tick manual=false, trạng thái hợp đồng ghi rõ nhãn "chưa tính hồ sơ bị bỏ tick"', () => {
  const contract = {
    id: 'c1',
    details: [{ id: 'D1', ship: 'TAU A', certNo: 'CT1' }],
  };
  const customs = [{ id: 'decl1', contractId: 'c1', detailId: 'D1', status: 'cleared' }];

  // Nguồn tripDetails báo D1 đã có phiếu cân
  HAK.CustomsModel.setTripDetailsProvider(() => new Set(['D1']));

  // Giả lập có hồ sơ bị bỏ tick manual trong Store
  global.HAK.Store = {
    get: (key) => (key === 'hak.report.manual' ? { r1: false } : null),
  };

  const st = HAK.CustomsModel.contractStatus(customs, 'c1', contract);
  assert.ok(
    (st.basis && st.basis.includes('chưa tính hồ sơ bị bỏ tick')) ||
      (st.label && st.label.includes('chưa tính hồ sơ bị bỏ tick')) ||
      st.untickedManual === true,
    'phải ghi nhận nhãn hoặc cờ chưa tính hồ sơ bị bỏ tick'
  );
});
