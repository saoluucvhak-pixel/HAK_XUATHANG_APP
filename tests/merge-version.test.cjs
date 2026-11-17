/* Gộp bản sao lưu / Gói cấu hình theo PHIÊN BẢN: bản cũ không ghi đè bản mới; thiếu phiên bản = cũ nhất; trùng phiên bản khác nội dung = xung đột giữ máy này; nhập lặp lại ổn định; dữ liệu con (chi tiết, phụ lục, tệp). */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const M = require('../app/js/contract-model.js'),
  CM = require('../app/js/customs-model.js');
global.HAK.CustomsModel = CM;
const clone = (x) => JSON.parse(JSON.stringify(x));
const det = (id, extra) => Object.assign({ id, contractId: 'hd1', ship: 'TÀU ' + id, mt: 100, bdmt: 50, revision: 1 }, extra || {});
const cat = (c, customs) => ({
  v: 3,
  customers: [],
  products: [],
  contracts: [Object.assign({ id: 'hd1', type: 'xuatban', no: 'HD1', contractQty: 700, details: [det('d1')], revision: 4 }, c || {})],
  customs: customs || [],
});
const one = (d) => d.contracts[0];

test('nghiệm thu: máy đang 700 BDMT (phiên bản 4) nhập bản sao 500 BDMT (phiên bản 2) → giữ 700, phiên bản không tăng', () => {
  const local = cat(),
    old = cat({ contractQty: 500, revision: 2 });
  const m = M.mergeCatalog(local, old);
  assert.equal(one(m).contractQty, 700);
  assert.equal(one(m).revision, 4, 'không tăng chỉ vì nhập lại bản cũ');
  assert.equal(M.mergeCatalog.report.kept.length, 1);
  assert.equal(M.mergeCatalog.report.kept[0].localRevision, 4);
  const again = M.mergeCatalog(m, old);
  assert.equal(one(again).contractQty, 700);
  assert.equal(one(again).revision, 4);
});
test('bản MỚI hơn ghi đè ô; nhập lặp lại cùng bản mới cho cùng kết quả', () => {
  const local = cat({ contractQty: 500, revision: 2 }),
    newer = cat({ contractQty: 900, revision: 6, note: 'mới' });
  const m = M.mergeCatalog(local, newer);
  assert.equal(one(m).contractQty, 900);
  assert.equal(one(m).note, 'mới');
  const r1 = one(m).revision,
    twice = M.mergeCatalog(m, newer);
  assert.equal(one(twice).contractQty, 900);
  assert.equal(one(twice).revision, r1, 'nhập lặp lại không tăng phiên bản');
});
test('bản cũ thiếu phiên bản = phiên bản 0: không ghi đè bản trên máy; trống ô bên mới không xóa dữ liệu', () => {
  const legacy = cat({ contractQty: 500 });
  delete one(legacy).revision;
  one(legacy).details.forEach((d) => delete d.revision);
  const m = M.mergeCatalog(cat(), legacy);
  assert.equal(one(m).contractQty, 700);
  assert.equal(one(m).revision, 4);
  const local = cat({ note: 'ghi chú máy này' }),
    blank = cat({ note: '', revision: 9 });
  assert.equal(one(M.mergeCatalog(local, blank)).note, 'ghi chú máy này', 'ô trống không xóa dữ liệu');
});
test('cùng phiên bản nhưng khác nội dung → xung đột: giữ bản trên máy này và báo', () => {
  const local = cat({ contractQty: 700, revision: 4 }),
    other = cat({ contractQty: 650, revision: 4 });
  const m = M.mergeCatalog(local, other);
  assert.equal(one(m).contractQty, 700);
  assert.deepEqual(
    M.mergeCatalog.report.conflicts.map((c) => c.fields),
    [['contractQty']]
  );
  assert.equal(one(M.mergeCatalog(local, clone(local))).revision, 4);
  assert.equal(M.mergeCatalog.report.conflicts.length, 0, 'cùng nội dung không phải xung đột');
});
test('hợp đồng đã mở lại ở bản mới vẫn mở khi nhập bản đã đóng cũ (kèm phiên bản cao hơn của các trường khác)', () => {
  const closed = cat({ revision: 2, closedAt: '2026-10-01' }),
    reopened = cat({ revision: 4 });
  M.reopenContract(one(reopened), '2026-10-05');
  one(reopened).closeRev = 2;
  assert.equal(one(M.mergeCatalog(reopened, closed)).closedAt, undefined);
  const m = M.mergeCatalog(closed, reopened);
  assert.equal(one(m).closedAt, undefined);
  assert.equal(one(M.mergeCatalog(m, closed)).closedAt, undefined);
});
test('chi tiết hợp đồng: bản cũ không ghi đè chi tiết mới, không làm "sống lại" chi tiết đã ngừng dùng; bản mới khôi phục được; chi tiết chỉ có ở bản cũ vẫn được thêm', () => {
  const local = cat({ details: [det('d1', { mt: 120, revision: 3 }), det('d2', { revision: 5, deletedAt: '2026-10-02' })] });
  const old = cat({ revision: 2, details: [det('d1', { mt: 80, revision: 1 }), det('d2', { revision: 2 }), det('d3', { revision: 1 })] });
  const m = M.mergeCatalog(local, old),
    d = (id) => one(m).details.find((x) => x.id === id);
  assert.equal(d('d1').mt, 120);
  assert.equal(d('d2').deletedAt, '2026-10-02', 'ngừng dùng ở phiên bản mới hơn → không sống lại');
  assert.ok(d('d3'), 'dữ liệu bổ sung hợp lệ được giữ');
  const restore = cat({ revision: 9, details: [det('d2', { revision: 7 })] }),
    r = M.mergeCatalog(m, restore);
  assert.equal(one(r).details.find((x) => x.id === 'd2').deletedAt, undefined, 'bản mới hơn khôi phục chi tiết');
});
test('phụ lục và tệp đính kèm: gộp theo id, bản mới thắng; tệp đính kèm là hợp (không mất tệp); KL hiện hành tính lại', () => {
  const A = (id, qty, extra) => Object.assign({ id, no: id, date: '2026-09-01', qty, seq: 1 }, extra || {});
  const local = cat({
    revision: 4,
    contractQty: 600,
    qtyOrig: 500,
    addenda: [A('pl1', 600)],
    contractFiles: ['f1.pdf'],
    details: [det('d1', { certificateFiles: ['c1.pdf'] })],
  });
  const old = cat({
    revision: 2,
    contractQty: 550,
    qtyOrig: 500,
    addenda: [A('pl1', 550), A('pl0', 520, { date: '2026-08-01', seq: 0 })],
    contractFiles: ['f0.pdf'],
    details: [det('d1', { certificateFiles: ['c0.pdf'] })],
  });
  const m = M.mergeCatalog(local, old),
    c = one(m);
  assert.equal(c.addenda.find((x) => x.id === 'pl1').qty, 600, 'phụ lục sửa ở bản mới giữ nguyên');
  assert.ok(
    c.addenda.find((x) => x.id === 'pl0'),
    'phụ lục chỉ có ở bản cũ vẫn được thêm'
  );
  assert.deepEqual(c.contractFiles.sort(), ['f0.pdf', 'f1.pdf']);
  assert.deepEqual(c.details[0].certificateFiles.sort(), ['c0.pdf', 'c1.pdf']);
  assert.equal(c.qtyOrig, 500);
  assert.equal(c.contractQty, 600, 'KL hiện hành theo phụ lục mới nhất (600), không bị bản cũ kéo về 550');
  const oldDeleted = cat({ revision: 2, addenda: [A('pl1', 600, { deletedAt: '2026-09-02' })] });
  assert.equal(
    one(M.mergeCatalog(local, oldDeleted)).addenda[0].deletedAt,
    undefined,
    'bản cũ đã ngừng dùng phụ lục không xóa phụ lục ở bản mới'
  );
});
test('tờ khai: bản cũ nhập lại không ghi đè tờ khai mới (trạng thái, thuế, khoản nộp đã xóa)', () => {
  const mk = (rev, extra, pays) =>
    CM.newDecl(
      Object.assign(
        { id: 'tk1', no: '308629701001', contractId: 'hd1', status: 'opened', taxVnd: 100, revision: rev, payments: pays || [] },
        extra
      )
    );
  const localD = mk(5, { status: 'cleared', taxVnd: 130 }, [{ id: 'p1', amount: 130, receiptNo: 'A1', deletedAt: '2026-10-03' }]),
    oldD = mk(2, { status: 'opened', taxVnd: 100 }, [{ id: 'p1', amount: 130, receiptNo: 'A1' }]);
  const m = CM.merge([localD], [oldD])[0];
  assert.equal(m.status, 'cleared');
  assert.equal(m.taxVnd, 130);
  assert.equal(m.payments[0].deletedAt, '2026-10-03', 'khoản nộp đã xóa không sống lại');
  const again = CM.merge([m], [oldD])[0];
  assert.deepEqual([again.status, again.taxVnd, again.revision], [m.status, m.taxVnd, m.revision]);
  const newerD = mk(8, { taxVnd: 200 });
  assert.equal(CM.merge([m], [newerD])[0].taxVnd, 200);
});

test('hồi quy: nhập bản cùng nội dung nhưng phiên bản cao hơn → không tăng thêm, nhưng phiên bản KHÔNG tụt xuống dưới bản nhập', () => {
  const local = cat({ contractQty: 2000, revision: 2 }),
    incoming = cat({ contractQty: 2000, revision: 3 });
  const m = M.mergeCatalog(local, incoming);
  assert.equal(one(m).revision, 3, 'trước khi sửa: 2 (tụt dưới bản nhập → hai máy cùng "phiên bản 3" khác nội dung bị báo xung đột giả)');
  const again = M.mergeCatalog(m, incoming);
  assert.equal(one(again).revision, 3, 'nhập lặp cho cùng kết quả');
  assert.equal(one(M.mergeCatalog(cat({ revision: 5 }), cat({ revision: 3 }))).revision, 5, 'bản nhập thấp hơn: giữ phiên bản máy này');
});
test('hồi quy: cùng một giấy nộp tiền nhập ở hai máy (khác id) → gộp không cộng đôi "đã nộp"; khoản nghi trùng được báo để đối soát', () => {
  const mk = (id, payId, extra) =>
    CM.newDecl({
      id,
      no: '308629701721',
      status: 'cleared',
      taxVnd: 1000000,
      contractId: 'hd1',
      revision: 2,
      payments: [Object.assign({ id: payId, receiptNo: 'DN0206/26', kind: 'tax', amount: 1000000, date: '2026-06-12' }, extra || {})],
    });
  let m = CM.merge([mk('tk-A', 'pay-A')], [mk('tk-B', 'pay-B')]);
  assert.equal(m.length, 1);
  assert.equal(m[0].payments.length, 1, 'trước khi sửa: 2 khoản (đã nộp 2.000.000, nộp thừa 1.000.000 giả)');
  assert.equal(CM.totals(m[0]).paidTax, 1000000);
  assert.equal(CM.totals(m[0]).over, 0);
  assert.equal(CM.merge.report.duplicatePayments.length, 1);
  // giấy khác → khoản khác, giữ cả hai
  m = CM.merge([mk('tk-A', 'pay-A')], [mk('tk-B', 'pay-B', { receiptNo: 'DN0207/26' })]);
  assert.equal(m[0].payments.length, 2);
  // thiếu số giấy ở hai bên, cùng số tiền → không tự quyết: giữ cả hai và báo nghi trùng
  m = CM.merge([mk('tk-A', 'pay-A', { receiptNo: '' })], [mk('tk-B', 'pay-B', { receiptNo: '' })]);
  assert.equal(m[0].payments.length, 2);
  assert.equal(CM.merge.report.maybe.length, 1);
  // nhập lặp cùng bản: ổn định
  const once = CM.merge([mk('tk-A', 'pay-A')], [mk('tk-B', 'pay-B')]);
  assert.deepEqual(CM.merge(once, [mk('tk-B', 'pay-B')])[0].payments.length, 1);
});
test('hồi quy: cùng số tờ khai bổ sung nhập ở hai máy (khác id) → một lần khai bổ sung', () => {
  const mk = (id, sid) =>
    CM.newDecl({
      id,
      no: '308629701721',
      status: 'cleared',
      taxVnd: 1000,
      contractId: 'hd1',
      revision: 2,
      supplements: [{ id: sid, no: '308629701799', date: '2026-06-20', round: 2, taxVnd: 1500 }],
    });
  const m = CM.merge([mk('tk-A', 'bs-A')], [mk('tk-B', 'bs-B')]);
  assert.equal(m[0].supplements.length, 1);
  assert.equal(CM.merge.report.duplicateSupplements.length, 1);
});
