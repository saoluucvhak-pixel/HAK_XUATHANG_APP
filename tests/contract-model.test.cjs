const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../app/js/contract-model.js'),
  P = require('../app/js/contract-parser.js');
const blank = () => ({ v: 3, customers: [], contracts: [] });
test('legacy migration preserves every export value and the old contract selection ID', () => {
  const source = {
    v: 2,
    customers: [],
    contracts: [
      {
        id: 'old',
        type: 'uythac',
        no: 'QA-1',
        sellerId: 'principal',
        customerId: 'exporter',
        ship: 'QA V.1',
        tkhq: '001234567890',
        product: 'Dăm gỗ',
        qty: 2400,
        mt: 100,
        bdmt: 48,
        moisture: 52,
        certNo: 'CT-QA',
        certificateFiles: ['pdf-1'],
        priceUsd: 180,
        note: 'Hợp đồng cũ',
      },
    ],
  };
  const original = JSON.stringify(source),
    { data } = M.migrate(source),
    c = data.contracts[0],
    view = M.resolve(data, 'old');
  assert.equal(JSON.stringify(source), original);
  assert.equal(c.exporterId, 'exporter');
  assert.equal(c.principalId, 'principal');
  assert.equal(c.buyerId, '');
  assert.equal(c.note, 'Hợp đồng cũ');
  for (const key of ['ship', 'tkhq', 'product', 'qty', 'mt', 'bdmt', 'moisture', 'certNo', 'priceUsd'])
    assert.equal(view[key], source.contracts[0][key], key);
  assert.deepEqual(view.certificateFiles, ['pdf-1']);
  assert.equal(view.sellerId, 'principal');
  assert.equal(view.customerId, 'exporter');
  assert.equal(M.migrate(data).changed, false);
});
test('two child lots retain independent goods, customs declarations and execution quantities', () => {
  const c = M.parent({ no: 'QA-2', type: 'xuatkhau', details: [] });
  c.details = [
    M.child(c.id, { product: 'PEFC', qty: 5000, tkhq: '000001', bdmt: 100 }),
    M.child(c.id, { product: 'NON PEFC', qty: 9000, tkhq: '000002', bdmt: 200 }),
  ];
  const result = M.upsert(blank(), c),
    choices = M.choices(result.data);
  assert.equal(choices.length, 2);
  assert.equal(M.sum(result.record, 'qty'), 14000);
  assert.equal(M.sum(result.record, 'bdmt'), 300);
  assert.equal(M.resolve(result.data, choices[1].id).product, 'NON PEFC');
  assert.equal(M.resolve(result.data, choices[1].id).qty, 9000);
  assert.equal(M.resolve(result.data, c.id), null);
});
test('invalid child rolls back whole immutable upsert and revision conflicts fail', () => {
  let c = M.parent({ no: 'QA-3', details: [] }),
    data = blank();
  const saved = M.upsert(data, c);
  data = saved.data;
  c = saved.record;
  const before = JSON.stringify(data),
    bad = M.copy(c);
  bad.details.push(M.child(c.id, { qty: -1 }));
  assert.throws(() => M.upsert(data, bad, c.revision), /không âm/);
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => M.upsert(data, c, 0), /thay đổi/);
});
test('child FK, global child IDs and duplicate customs declarations are rejected', () => {
  const a = M.parent({ no: 'A', details: [] }),
    b = M.parent({ no: 'B', details: [] });
  a.details = [M.child(a.id, { id: 'unique', tkhq: '123' })];
  const data = M.upsert(blank(), a).data;
  b.details = [M.child(b.id, { id: 'other', tkhq: '123' })];
  assert.throws(() => M.upsert(data, b), /TKHQ/);
  b.details = [M.child(b.id, { id: 'unique' })];
  assert.throws(() => M.upsert(data, b), /thuộc hợp đồng khác/);
  b.details = [{ id: 'wrong-fk', contractId: a.id }];
  assert.throws(() => M.upsert(data, b), /khóa ngoại/);
});
test('archive preserves PDF and historical child while removing it from active totals', () => {
  const c = M.parent({ no: 'A', details: [] });
  c.details = [M.child(c.id, { qty: 200, certificateFiles: ['proof'] })];
  const next = M.archiveChild(c, c.details[0].id);
  assert.equal(M.active(next).length, 0);
  assert.equal(M.sum(next, 'qty'), null);
  assert.deepEqual(next.details[0].certificateFiles, ['proof']);
  assert.equal(M.active(c).length, 1);
});
test('OA layout with separated labels produces seller, buyer and two separate lots', () => {
  const input =
    'Seller:\nBuyer:\nEXAMPLE COMPANY LIMITED\nTAX CODE: 0123456789\nSAMPLE CORPORATION PTE LTD\nHardwood Acacia Woodchips ("Product")\n1) 5 000 BDMT the supply PEFC Controlled Sources\n2) 9 OOO BDMT the supply NON PEFC';
  const r = P.extract(input);
  assert.equal(r.parties.exporter.name, 'EXAMPLE COMPANY LIMITED');
  assert.equal(r.parties.exporter.tax, '0123456789');
  assert.equal(r.parties.buyer.name, 'SAMPLE CORPORATION PTE LTD');
  assert.deepEqual(
    r.lots.map((x) => x.qty),
    [5000, 9000]
  );
  assert.match(r.lots[0].product, /PEFC Controlled/);
  assert.match(r.lots[1].product, /NON PEFC/);
});
test('agency roles and goods are extracted independently of company spelling and fee', () => {
  const input =
    'HOP DONG UY THAC XUAT KHAU\nBEN UY THAC\nCONG TY TNHH A, cong ty duoc\nMa so thue: 0123456789\nBEN NHAN UY THAC\nCONG TY TNHH B, mot cong ty\nMa so thue: 0987654321\ncho SAMPLE CORPORATION PTE LTD, D/C: QA\n(1) Dam go la dam go Keo do Nguoi ban san xuat.\n4.1 So luong la: 2.000 BDMT (+/- 20%).\nPhi uy thac: 1.40 USD/BDMT';
  const r = P.extract(input);
  assert.equal(r.type, 'uythac');
  assert.equal(r.parties.principal.name, 'CONG TY TNHH A');
  assert.equal(r.parties.exporter.name, 'CONG TY TNHH B');
  assert.equal(r.parties.buyer.name, 'SAMPLE CORPORATION PTE LTD');
  assert.equal(r.product, 'Dăm gỗ keo');
  assert.deepEqual(
    r.lots.map((x) => x.qty),
    [2000]
  );
});
test('customer lookup uses unique tax or exact name and never picks a fuzzy match', () => {
  const rows = [
    { id: 'a', name: 'Công ty A', tax: '0123456789' },
    { id: 'b', name: 'Company B', tax: '9876543210' },
  ];
  assert.equal(P.matchParty({ name: 'OCR typo', tax: '0123456789' }, rows).id, 'a');
  assert.equal(P.matchParty({ name: 'Cong ty A' }, rows).id, 'a');
  assert.equal(P.matchParty({ name: 'Company' }, rows), null);
  assert.equal(P.matchParty({ tax: '0123456789' }, rows.concat({ id: 'c', name: 'Other', tax: '0123456789' })), null);
});

test('configuration import merges child IDs idempotently and preserves local PDF links', () => {
  const c = M.parent({ id: 'parent', no: 'QA', details: [] });
  c.details = [M.child(c.id, { id: 'one', qty: 100, certificateFiles: ['pdf-1'] }), M.child(c.id, { id: 'two', qty: 200 })];
  const local = { v: 3, customers: [], contracts: [c] },
    incoming = {
      v: 3,
      customers: [],
      contracts: [{ id: 'parent', no: 'QA', details: [{ id: 'one', contractId: 'parent', product: 'Updated' }] }],
    };
  const once = M.mergeCatalog(local, incoming),
    twice = M.mergeCatalog(once, incoming);
  assert.equal(once.contracts[0].details.length, 2);
  assert.equal(twice.contracts[0].details.length, 2);
  assert.equal(twice.contracts[0].details[0].qty, 100);
  assert.deepEqual(twice.contracts[0].details[0].certificateFiles, ['pdf-1']);
  assert.equal(twice.contracts[0].details[0].product, 'Updated');
});

test('several goods lines may share one customs declaration within the same contract', () => {
  const c = M.parent({ no: 'QA', details: [] });
  c.details = [M.child(c.id, { tkhq: '001', product: 'A' }), M.child(c.id, { tkhq: '001', product: 'B' })];
  assert.equal(M.upsert(blank(), c).record.details.length, 2);
});

test('historical child references stay linked after soft archive; current choices exclude them', () => {
  const c = M.parent({ no: 'QA', details: [] });
  c.details = [M.child(c.id, { id: 'old-detail', ship: 'SAME VESSEL', qty: 100 })];
  const archived = M.archiveChild(c, 'old-detail'),
    data = { v: 3, customers: [], contracts: [archived] };
  assert.equal(M.resolve(data, 'old-detail'), null);
  assert.equal(M.resolve(data, 'old-detail', { history: true }).qty, 100);
  assert.equal(M.choices(data).length, 0);
});
test('different tax number prevents matching an existing party by name alone', () => {
  assert.equal(P.matchParty({ name: 'Company A', tax: '1111111111' }, [{ id: 'a', name: 'Company A', tax: '2222222222' }]), null);
});

test('parent goods and contract quantity survive multiple execution rows without multiplying the contract total', () => {
  const c = M.parent({
    id: 'parent-total',
    no: 'QA-P',
    contractProduct: 'Contract goods',
    contractQty: 18000,
    details: [
      { id: 'lot-a', contractId: 'parent-total', mt: 100 },
      { id: 'lot-b', contractId: 'parent-total', mt: 200 },
    ],
  });
  const saved = M.upsert(blank(), c).record;
  assert.equal(saved.contractProduct, 'Contract goods');
  assert.equal(saved.contractQty, 18000);
  const views = M.choices({ contracts: [saved] });
  assert.equal(views[0].product, 'Contract goods');
  assert.equal(views[0].qty, null);
  assert.equal(views[1].qty, null);
  const one = M.parent({ ...saved, details: [saved.details[0]] });
  assert.equal(M.choices({ contracts: [one] })[0].qty, 18000);
  assert.equal(M.sum(saved, 'mt'), 300);
});
test('migration derives parent summary once and retains per-lot quantities and receiving party', () => {
  const old = {
    v: 3,
    customers: [],
    contracts: [
      {
        id: 'p',
        no: 'QA',
        details: [
          { id: 'a', contractId: 'p', product: 'Goods A', qty: 6000, receiverId: 'buyer' },
          { id: 'b', contractId: 'p', product: 'Goods B', qty: 12000 },
        ],
      },
    ],
  };
  const result = M.migrate(old);
  assert.equal(result.changed, true);
  assert.equal(result.data.contracts[0].contractProduct, 'Goods A; Goods B');
  assert.equal(result.data.contracts[0].contractQty, 18000);
  assert.equal(result.data.contracts[0].details[0].receiverId, 'buyer');
  assert.equal(M.migrate(result.data).changed, false);
  assert.equal(old.contracts[0].contractQty, undefined);
});

test('KL gốc để trống + phụ lục 500: giữ trống qua nhiều lần tính; ngừng dùng phụ lục cuối → KL hiện hành về trống', () => {
  const M = require('../app/js/contract-model.js');
  const c = M.parent({
    type: 'xuatkhau',
    no: 'HD-B',
    contractQty: null,
    details: [],
    addenda: [{ no: 'PL1', date: '2026-09-01', qty: 500 }],
  });
  M.applyAddenda(c);
  assert.equal(c.contractQty, 500);
  assert.equal(c.qtyOrig, null);
  assert.equal(M.originalQty(c), null);
  for (let i = 0; i < 3; i++) M.applyAddenda(c); // nhiều lần tính lại
  assert.equal(c.qtyOrig, null, 'KL gốc vẫn trống');
  assert.equal(c.contractQty, 500);
  const again = M.parent(JSON.parse(JSON.stringify(c)));
  assert.equal(again.qtyOrig, null);
  assert.equal(M.originalQty(again), null); // qua lưu / đọc lại
  c.addenda[0].deletedAt = '2026-10-01';
  M.applyAddenda(c);
  assert.equal(c.contractQty, null, 'ngừng dùng phụ lục cuối cùng → KL hiện hành trống');
  assert.equal('qtyOrig' in c, false);
});
test('KL gốc có số: giữ qua phụ lục; bỏ phụ lục → trả KL gốc; hồ sơ nghi ghi nhầm (gốc = phụ lục đầu) được gắn cờ đối chiếu, không tự sửa', () => {
  const M = require('../app/js/contract-model.js');
  const c = M.parent({
    type: 'xuatkhau',
    no: 'HD-C',
    contractQty: 1000,
    details: [],
    addenda: [{ no: 'PL1', date: '2026-09-01', qty: 1200 }],
  });
  M.applyAddenda(c);
  assert.equal(c.qtyOrig, 1000);
  assert.equal(c.contractQty, 1200);
  assert.equal(M.originalQty(c), 1000);
  assert.equal(M.auditOriginal(c), '');
  c.addenda[0].deletedAt = 'x';
  M.applyAddenda(c);
  assert.equal(c.contractQty, 1000);
  const bad = M.parent({
    type: 'xuatkhau',
    no: 'HD-D',
    contractQty: 500,
    qtyOrig: 500,
    details: [],
    addenda: [{ no: 'PL1', date: '2026-09-01', qty: 500 }],
  });
  M.applyAddenda(bad);
  assert.equal(bad.qtyOrig, 500, 'không tự sửa');
  assert.match(M.auditOriginal(bad), /[Đđ]ối chiếu/);
  assert.equal(M.originalQty({ contractQty: 700, addenda: [] }), 700, 'chưa có phụ lục → KL gốc = KL hợp đồng');
});
