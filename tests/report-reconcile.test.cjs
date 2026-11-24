const { test } = require('node:test'),
  assert = require('node:assert/strict');

global.window = global;
global.HAK = {};
require('../app/js/util.js');
require('../app/js/excel.js');
require('../app/js/generator.js');
require('../app/js/weigh-model.js');
require('../app/js/report.js');
require('../app/js/archive.js');
require('../app/js/trip-details.js');

test('L-22: Archive.setContract cập nhật updatedAt và làm mới bộ đệm phiếu cân (không xung đột giả)', async () => {
  const initialUpdatedAt = 1000;
  const m = {
    id: 'rec1',
    type: 'xuatkhau',
    from: '05/01/2026',
    to: '05/01/2026',
    updatedAt: initialUpdatedAt,
    contract: '',
    ship: 'TAU A',
    trips: 1,
    kg: 20000,
  };
  const d = {
    v: 1,
    type: 'xuatkhau',
    params: { giaoId: 'c1' },
    rows: [{ ticket: 'P1', plate: '43C-111.11', ts1: 1736064000000, time1: '08:00', net: 20000 }],
  };

  HAK.Archive._mem.meta.set('rec1', m);
  HAK.Archive._mem.data.set('rec1', 'raw:' + JSON.stringify(d));

  const cache = new Map();
  const tk1 = await HAK.Report.prepareTickets([m], cache, true);
  const ticketsBefore = tk1.get('rec1');
  assert.equal(ticketsBefore[0].link, '|TAUA');

  // Gọi setContract thật của Archive
  await HAK.Archive.setContract(['rec1'], 'd1');
  const updatedMeta = HAK.Archive._mem.meta.get('rec1');

  assert.equal(updatedMeta.contract, 'd1');
  assert.ok(updatedMeta.updatedAt > initialUpdatedAt, 'updatedAt phải được cập nhật mới hơn');

  // Gọi prepareTickets dùng lại cùng bộ đệm cache
  const tk2 = await HAK.Report.prepareTickets([updatedMeta], cache, true);
  const ticketsAfter = tk2.get('rec1');
  assert.equal(ticketsAfter[0].link, 'D1|TAUA', 'phiếu cân trong bộ đệm phải phản ánh đúng hợp đồng mới (không bị cache cũ)');
});
