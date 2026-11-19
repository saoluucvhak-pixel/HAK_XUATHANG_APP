/* Sao lưu theo THÁNG (quy tắc 33–35): chọn đúng hồ sơ / chứng từ / đợt Excel / hợp đồng-tờ khai-khách hàng-tệp theo NGÀY CÂN ĐẦU TIÊN. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const BM = require('../app/js/backup-month.js');
const item = (id, from, extra) => ({
  meta: Object.assign({ id, type: 'xuatkhau', from, to: from, trips: 3, kg: 60000 }, extra || {}),
  data: 'D-' + id,
});
const catalog = {
  v: 3,
  products: [{ id: 'p1' }],
  customers: [
    { id: 'k-mua', name: 'IWC' },
    { id: 'k-ban', name: 'HAK' },
    { id: 'k-khac', name: 'KHÁC' },
  ],
  contracts: [
    {
      id: 'hd1',
      no: 'HD-1',
      buyerId: 'k-mua',
      exporterId: 'k-ban',
      contractFiles: ['f-hd1'],
      details: [{ id: 'd1a', certificateFiles: ['f-ct1'] }, { id: 'd1b' }],
    },
    { id: 'hd2', no: 'HD-2', buyerId: 'k-khac', details: [{ id: 'd2a' }] },
  ],
  customs: [
    { id: 't1', no: '111', contractId: 'hd1' },
    { id: 't2', no: '222', contractId: 'hd2' },
  ],
};
const coll = () => ({
  keys: { 'hak.catalog.v1': catalog, 'hak.khac': 1 },
  items: [
    item('a-feb', '05/02/2026', { contract: 'd1a' }),
    item('a-2thang', '28/02/2026', { contract: 'd1b' }), // kéo dài sang tháng 3 → thuộc tháng 2 (ngày cân đầu tiên)
    item('a-mar', '03/03/2026', { contract: 'd2a' }),
    item('a-khong-ngay', '', {}),
  ],
  batches: [
    { meta: { id: 'x|can-feb.xlsx', fileName: 'can-feb.xlsx' }, b64: 'AA' },
    { meta: { id: 'x|can-mar.xlsx', fileName: 'can-mar.xlsx' }, b64: 'BB' },
    { meta: { id: 'x|khac.xlsx', fileName: 'khac.xlsx' }, b64: 'CC' },
  ],
  issued: [
    { id: 'i1', kind: 'bkls', from: '06/02/2026', batch: 'can-feb.xlsx' },
    { id: 'i2', kind: 'pxk', from: '10/03/2026', batch: 'can-mar.xlsx' },
  ],
  attachments: [
    { id: 'f-hd1', base64: 'QQ==' },
    { id: 'f-ct1', base64: 'QQ==' },
    { id: 'f-khac', base64: 'QQ==' },
  ],
  bklsTemplates: [{ id: 't', base64: 'QQ==' }],
  yearbook: { records: [] },
});
const decode = async (d) => ({
  params: d === 'D-a-feb' ? { filter: { files: ['can-feb.xlsx'] } } : d === 'D-a-mar' ? { filter: { files: ['can-mar.xlsx'] } } : {},
});
test('monthKey: ngày dd/mm/yyyy → yyyy-mm; sai / trống → rỗng', () => {
  assert.equal(BM.monthKey('05/02/2026 08:00'), '2026-02');
  assert.equal(BM.monthKey('5/2/2026'), '2026-02');
  for (const v of ['', null, undefined, 'abc', '32/13/2026', '00/00/0000']) assert.equal(BM.monthKey(v), '', String(v));
});
test('months: liệt kê tháng có dữ liệu, mới → cũ, đếm hồ sơ không có ngày cân', () => {
  const r = BM.months(coll());
  assert.deepEqual(r.list, [
    { month: '2026-03', archive: 1, issued: 1 },
    { month: '2026-02', archive: 2, issued: 1 },
  ]);
  assert.equal(r.undated, 1);
});
test('select tháng 2: hồ sơ theo ngày cân đầu (kể cả hồ sơ qua 2 tháng); chứng từ, đợt Excel, danh mục liên quan, tệp đính kèm', async () => {
  const s = await BM.select(coll(), '2026-02', { decode });
  assert.deepEqual(s.items.map((x) => x.meta.id).sort(), ['a-2thang', 'a-feb']);
  assert.deepEqual(
    s.issued.map((x) => x.id),
    ['i1']
  );
  assert.deepEqual(
    s.batches.map((b) => b.meta.fileName),
    ['can-feb.xlsx']
  );
  const c = s.keys['hak.catalog.v1'];
  assert.deepEqual(
    c.contracts.map((x) => x.id),
    ['hd1']
  );
  assert.deepEqual(
    c.customs.map((x) => x.id),
    ['t1']
  );
  assert.deepEqual(c.customers.map((x) => x.id).sort(), ['k-ban', 'k-mua']);
  assert.deepEqual(c.products, catalog.products, 'phần còn lại của danh mục giữ nguyên');
  assert.deepEqual(s.attachments.map((a) => a.id).sort(), ['f-ct1', 'f-hd1']);
  assert.deepEqual(Object.keys(s.keys), ['hak.catalog.v1'], 'không mang cài đặt khác');
  assert.equal(s.bklsTemplates.length, 0);
  assert.equal(s.yearbook, null);
  assert.equal(s.scope.kind, 'month');
  assert.equal(s.scope.month, '2026-02');
  assert.deepEqual(s.scope.counts, { archive: 2, batches: 1, issued: 1, attachments: 2, contracts: 1, customs: 1, customers: 2 });
});
test('hợp đồng dùng chung nhiều tháng có mặt ở CẢ HAI bản tháng (nhập bổ sung theo mã nên không nhân đôi)', async () => {
  const c = coll();
  c.items.push(item('a-mar2', '09/03/2026', { contract: 'd1a' })); // cùng hợp đồng hd1 nhưng ở tháng 3
  const feb = await BM.select(c, '2026-02', { decode }),
    mar = await BM.select(c, '2026-03', { decode });
  assert.deepEqual(
    feb.keys['hak.catalog.v1'].contracts.map((x) => x.id),
    ['hd1']
  );
  assert.deepEqual(mar.keys['hak.catalog.v1'].contracts.map((x) => x.id).sort(), ['hd1', 'hd2']);
});
test('tháng không có hồ sơ → bản rỗng (không lỗi); tháng sai định dạng → lỗi rõ', async () => {
  const s = await BM.select(coll(), '2025-12', { decode });
  assert.equal(s.items.length, 0);
  assert.equal(s.keys['hak.catalog.v1'].contracts.length, 0);
  await assert.rejects(BM.select(coll(), '2026-13', { decode }), /Tháng không hợp lệ/);
  await assert.rejects(BM.select(coll(), 'abc', { decode }), /Tháng không hợp lệ/);
});
test('hồ sơ không giải nén được không làm hỏng việc chọn (bỏ qua phần đợt Excel của hồ sơ đó)', async () => {
  const s = await BM.select(coll(), '2026-02', {
    decode: async () => {
      throw new Error('hỏng');
    },
  });
  assert.equal(s.items.length, 2);
  assert.deepEqual(
    s.batches.map((b) => b.meta.fileName),
    ['can-feb.xlsx'],
    'đợt vẫn lấy được theo nhật ký chứng từ'
  );
});
