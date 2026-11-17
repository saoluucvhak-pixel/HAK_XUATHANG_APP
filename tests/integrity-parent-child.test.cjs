/* Rà soát toàn vẹn cha–con (mở rộng HAK.Integrity.audit; test gốc ở integrity.test.cjs): dữ liệu sạch không có lỗi; từng loại hỏng được phát hiện đúng mã; thao tác thông thường (sửa, ngừng dùng, khôi phục, xóa mềm, nhập bổ sung) không tạo bản ghi mồ côi. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const M = require('../app/js/contract-model.js'),
  CM = require('../app/js/customs-model.js');
global.HAK.CustomsModel = CM;
global.HAK.ContractModel = M;
const Integrity = require('../app/js/integrity-model.js');
// bọc lại API của HAK.Integrity (mảng { code, level, ref, msg }) thành dạng { findings, errors, relations } cho các ca dưới
const I = {
  audit: (s) => {
    const findings = Integrity.audit(s.catalog, s.metas, { attachmentIds: s.attachmentIds });
    return { findings, errors: findings.filter((f) => f.level === 'error').length, relations: Integrity.relations(s.catalog, s.metas) };
  },
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const codes = (r) => r.findings.map((f) => f.code).sort();
function scenario() {
  const customers = [
    { id: 'k-hak', name: 'HAK', companyId: 'hak' },
    { id: 'k-dh', name: 'ĐH', companyId: 'dh' },
    { id: 'k-iwc', name: 'IWC' },
  ];
  const c1 = M.parent({
    id: 'hd1',
    type: 'uythac',
    no: 'HD1',
    date: '2026-01-05',
    contractQty: 5000,
    exporterId: 'k-hak',
    buyerId: 'k-iwc',
    details: [],
  });
  c1.qtyOrig = 5000;
  c1.addenda = [{ id: 'pl1', no: 'PL1', date: '2026-01-20', qty: 6000 }];
  M.applyAddenda(c1);
  c1.details.push(
    M.child('hd1', { id: 'd1', ship: 'TÀU A', certNo: 'C1', bdmt: 4000, mt: 8000, certificateFiles: ['f1'] }),
    M.child('hd1', { id: 'd2', ship: 'TÀU Z', bdmt: 1000 })
  );
  const c2 = M.parent({
    id: 'hd2',
    type: 'xuatkhau',
    no: 'HD2',
    contractQty: 3000,
    exporterId: 'k-dh',
    buyerId: 'k-iwc',
    details: [{ id: 'd3', ship: 'TÀU B', bdmt: 3000 }],
  });
  const customs = [
    CM.newDecl({
      id: 'tk1',
      no: '308629701000',
      contractId: 'hd1',
      detailId: 'd1',
      status: 'cleared',
      taxVnd: 100,
      payments: [{ id: 'p1', receiptNo: 'R1', amount: 80 }],
      supplements: [{ id: 'b1', no: '308629701900', round: 2, taxVnd: 120 }],
    }),
    CM.newDecl({
      id: 'tk2',
      no: '308629701001',
      contractId: 'hd1',
      detailId: 'd2',
      status: 'cleared',
      taxVnd: 100,
      payments: [
        { id: 'p2', receiptNo: 'R2', amount: 120 },
        { id: 'p3', receiptNo: 'H2', kind: 'refund', amount: 20 },
      ],
    }),
  ];
  return {
    catalog: { v: 3, customers, products: [], contracts: [c1, c2], customs },
    metas: [{ id: 'a1', title: 'HS A', contract: 'd1', cid: 'hak' }],
    attachmentIds: ['f1'],
  };
}
test('dữ liệu sạch: không lỗi, bảng quan hệ đúng số lượng', () => {
  const r = I.audit(scenario());
  assert.deepEqual(r.findings, []);
  assert.equal(r.relations.contracts, 2);
  assert.deepEqual(r.relations.details, { parents: 2, children: 3, max: 2 });
  assert.deepEqual(r.relations.addenda, { parents: 2, children: 1, max: 1 });
  assert.equal(r.relations.declarations, 2);
  assert.equal(r.relations.payments.children, 3);
  assert.equal(r.relations.refunds, 1);
  assert.equal(r.relations.archiveLinked, 1);
});
test('phát hiện từng loại hỏng: mồ côi, khóa trùng, con trỏ ngừng dùng, liên kết nhầm công ty, tệp thiếu, KL phụ lục lệch', () => {
  const s = scenario(),
    cat = s.catalog;
  cat.customs.push(CM.newDecl({ id: 'tk3', no: '308629701002', contractId: 'khong-co' }));
  cat.customs.push(CM.newDecl({ id: 'tk4', no: '308629701003', contractId: 'hd1', detailId: 'd-ma' }));
  cat.customs.push(CM.newDecl({ id: 'tk5', no: '308629701004', contractId: 'hd1', detailId: 'd3' })); // chi tiết của hợp đồng khác
  cat.customs.push(CM.newDecl({ id: 'tk6', no: '308629701000', contractId: 'hd1', detailId: 'd1' })); // trùng số tờ khai + chung chi tiết với tk1
  cat.contracts[0].details.find((d) => d.id === 'd2').deletedAt = '2026-02-01';
  cat.contracts[1].details[0].sourcePdfId = 'file-mat';
  cat.contracts[0].contractQty = 9999; // lệch so với tính lại từ phụ lục (6.000)
  cat.contracts[1].buyerId = 'k-khong-co';
  s.metas.push({ id: 'a2', title: 'HS B', contract: 'd3', cid: 'hak' }); // hồ sơ công ty HAK gắn hợp đồng của ĐH
  s.metas.push({ id: 'a3', title: 'HS C', contract: 'd-khong-co' });
  s.metas.push({ id: 'a4', title: 'HS D', contract: 'd2', cid: 'hak' }); // chi tiết đã ngừng dùng
  const c = codes(I.audit(s));
  for (const want of [
    'decl-orphan',
    'decl-detail-fk',
    'decl-detail-fk',
    'dup-decl-no',
    'decl-detail-shared',
    'decl-deleted-detail',
    'attachment-missing',
    'addenda-qty-stale',
    'party-missing',
    'archive-cross-company',
    'archive-link',
    'archive-deleted-detail',
  ])
    assert.ok(c.includes(want), 'phải phát hiện ' + want + ' — có: ' + c.join(','));
  const dupId = clone(s);
  dupId.catalog.contracts[1].details[0].id = 'd1';
  assert.ok(codes(I.audit(dupId)).includes('dup-detail-id'));
});
test('khoản nộp trùng và khai bổ sung trùng trong cùng tờ khai được báo (nghi cộng đôi)', () => {
  const s = scenario();
  s.catalog.customs[0].payments.push({ id: 'p9', receiptNo: 'R1', kind: 'tax', amount: 80 });
  s.catalog.customs[0].supplements.push({ id: 'b9', no: '308629701900', round: 2, taxVnd: 120 });
  const c = codes(I.audit(s));
  assert.ok(c.includes('dup-payment') && c.includes('supplement-no-dup'));
});
test('thao tác thông thường không tạo mồ côi: sửa chi tiết, ngừng dùng / khôi phục, xóa mềm hợp đồng, nhập bổ sung bản cũ', () => {
  const s = scenario();
  let cat = s.catalog;
  // sửa một chi tiết chỉ đổi đúng bản ghi đó
  const before = clone(cat);
  const edited = clone(cat.contracts[0]);
  edited.details.find((d) => d.id === 'd1').bdmt = 4200;
  cat = M.upsert(cat, edited, cat.contracts[0].revision).data;
  assert.equal(cat.contracts[0].details.find((d) => d.id === 'd2').bdmt, 1000, 'chi tiết khác không đổi');
  assert.deepEqual(cat.customs, before.customs, 'tờ khai không bị đụng');
  // ngừng dùng chi tiết có tờ khai: giữ liên kết lịch sử → chỉ cảnh báo (cần đối soát), không lỗi
  cat.contracts[0] = M.archiveChild(cat.contracts[0], 'd2');
  let r = I.audit({ catalog: cat, metas: s.metas, attachmentIds: s.attachmentIds });
  assert.equal(r.errors, 0);
  assert.ok(codes(r).includes('decl-deleted-detail'));
  assert.equal(cat.customs.find((d) => d.id === 'tk2').detailId, 'd2', 'không tự xóa / gỡ liên kết chứng từ đã lưu');
  // khôi phục
  const restored = clone(cat.contracts[0]);
  delete restored.details.find((d) => d.id === 'd2').deletedAt;
  cat = M.upsert(cat, restored, cat.contracts[0].revision).data;
  r = I.audit({ catalog: cat, metas: s.metas, attachmentIds: s.attachmentIds });
  assert.deepEqual(r.findings, []);
  // xóa mềm hợp đồng: tờ khai còn trỏ → cảnh báo, không lỗi, không mất tờ khai
  const stopped = clone(cat.contracts[1]);
  stopped.deletedAt = '2026-03-01';
  cat = M.upsert(cat, stopped, cat.contracts[1].revision).data;
  r = I.audit({ catalog: cat, metas: s.metas, attachmentIds: s.attachmentIds });
  assert.equal(r.errors, 0);
  // nhập bổ sung bản cũ (revision thấp hơn) vào máy này: giữ bản máy này và vẫn sạch
  const old = clone(before);
  old.contracts[0].revision = 0;
  old.contracts[0].details.forEach((d) => (d.revision = 0));
  const merged = M.mergeCatalog(cat, old);
  merged.customs = CM.merge(cat.customs, old.customs);
  r = I.audit({ catalog: merged, metas: s.metas, attachmentIds: s.attachmentIds });
  assert.equal(r.errors, 0, JSON.stringify(r.findings));
  assert.equal(merged.contracts[0].details.find((d) => d.id === 'd1').bdmt, 4200, 'bản cũ không ghi đè bản mới');
});
