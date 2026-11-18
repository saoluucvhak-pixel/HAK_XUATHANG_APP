/* S1 — nguồn chung "chi tiết hợp đồng đã có phiếu cân": contractStatus mặc định dùng nguồn đã đăng ký; opt.tripDetails (nếu truyền) thắng; chưa có nguồn (null) → như cũ. */
const { test, afterEach } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const CM = require('../app/js/customs-model.js');
const contract = { id: 'c1', details: [{ id: 'dA', certNo: 'CT-A' }, { id: 'dB' }] };
const decls = [CM.newDecl({ no: '111111111111', contractId: 'c1', detailId: 'dA', status: 'cleared' })];
afterEach(() => CM.setTripDetailsProvider(null));
test('chưa có nguồn phiếu cân → chi tiết chưa chứng thư không bị đòi tờ khai (như trước)', () => {
  assert.equal(CM.contractStatus(decls, 'c1', contract).code, 'done');
});
test('nguồn chung báo chi tiết B đã có phiếu cân → chưa hoàn thành, nêu chi tiết thiếu; có tờ khai thông quan cho B → hoàn thành', () => {
  CM.setTripDetailsProvider(() => new Set(['dB']));
  const s = CM.contractStatus(decls, 'c1', contract);
  assert.equal(s.code, 'running');
  assert.deepEqual(s.missingDetails, ['dB']);
  const both = decls.concat(CM.newDecl({ no: '222222222222', contractId: 'c1', detailId: 'dB', status: 'cleared' }));
  assert.equal(CM.contractStatus(both, 'c1', contract).code, 'done');
});
test('nguồn trả null (chưa tính xong) → như cũ; opt.tripDetails truyền tường minh thắng nguồn chung', () => {
  CM.setTripDetailsProvider(() => null);
  assert.equal(CM.contractStatus(decls, 'c1', contract).code, 'done');
  CM.setTripDetailsProvider(() => new Set(['dB']));
  assert.equal(CM.contractStatus(decls, 'c1', contract, { tripDetails: new Set() }).code, 'done');
});
test('hợp đồng đóng thủ công vẫn "Đã đóng hợp đồng" bất kể phiếu cân', () => {
  CM.setTripDetailsProvider(() => new Set(['dB']));
  const s = CM.contractStatus(decls, 'c1', Object.assign({}, contract, { closedAt: '2026-07-01' }));
  assert.equal(s.code, 'done');
  assert.equal(s.label, 'Đã đóng hợp đồng');
});
