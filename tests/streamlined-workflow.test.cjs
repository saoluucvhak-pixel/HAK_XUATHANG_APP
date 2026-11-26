const { test } = require('node:test'),
  assert = require('node:assert/strict');

global.window = global;
global.HAK = {
  DB: {
    usable: () => false,
    kvGet: async () => undefined,
    kvPut: async () => {},
    kvCas: async () => {},
  },
};
require('../app/libs/xlsx.full.min.js');
require('../app/js/util.js');
require('../app/js/excel.js');
require('../app/js/excel-template.js');
require('../app/js/yearbook.js');

test('1. HAK.Yearbook.checkDuplicates: phát hiện chính xác phiếu cân đã xuất trong hồ sơ khác', async () => {
  const currentId = 'doc-2026-new';
  const rows = [
    { ticket: 'P-001', plate: '43C-111.11', net: 25000 },
    { ticket: 'P-002', plate: '43C-222.22', net: 28000 },
    { ticket: 'P-003', plate: '43C-333.33', net: 22000 },
  ];

  // Giả lập state records trong Yearbook
  const dummyState = {
    records: [
      {
        id: 'doc-tau-a',
        title: 'Hồ sơ Tàu Biển Đông',
        type: 'xuatkhau',
        year: 2026,
        revision: 1,
        params: {},
        updatedAt: Date.now(),
        rows: [
          { ticket: 'P-001', plate: '43C-111.11', net: 25000 },
          { ticket: 'P-099', plate: '29C-999.99', net: 30000 },
        ],
      },
      {
        id: 'doc-2026-new', // chính là hồ sơ đang mở -> không tính là trùng với chính nó
        title: 'Hồ sơ đang mở',
        type: 'xuatkhau',
        year: 2026,
        revision: 1,
        params: {},
        updatedAt: Date.now(),
        rows: [{ ticket: 'P-002', plate: '43C-222.22', net: 28000 }],
      },
    ],
  };

  // Nạp state của Yearbook qua setCache
  HAK.Yearbook.setCache(dummyState);

  const dups = HAK.Yearbook.checkDuplicates(currentId, rows);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].row.ticket, 'P-001');
  assert.equal(dups[0].row.plate, '43C-111.11');
  assert.equal(dups[0].usedIn[0], 'Hồ sơ Tàu Biển Đông');
});

test('2. Cascade Auto-Fill: contractValues tự động điền tờ khai, hàng hóa, lâm sản và cảng', () => {
  // Giả lập PagesContract
  global.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  global.$ = () => null;

  require('../app/js/pages-contract.js');

  const DOCS = {
    xuatkhau: {
      groups: [
        {
          zone: 'general',
          fields: [
            { id: 'ship', label: 'Tàu' },
            { id: 'contractNo', label: 'Số HĐ' },
            { id: 'customsNo', label: 'Số tờ khai' },
            { id: 'soToKhai', label: 'Số tờ khai' },
            { id: 'bklsLoaiLamSan', label: 'Loại lâm sản' },
            { id: 'bklsNguonGoc', label: 'Nguồn gốc' },
            { id: 'hangHoa', label: 'Hàng hóa' },
            { id: 'cangXuat', label: 'Cảng xuất' },
            { id: 'cangDen', label: 'Cảng đến' },
          ],
        },
      ],
    },
  };

  const dummyCatalog = {
    TYPES: { xuatkhau: { label: 'Xuất khẩu' } },
    contracts: () => [],
    customer: () => null,
    parent: () => ({
      no: 'HD-2026/01',
      woodType: 'Dăm gỗ keo tràm lai',
      origin: 'Rừng trồng tỉnh Quảng Nam',
      commodity: 'Dăm gỗ keo xuất khẩu F.O.B',
      port: 'Cảng Chu Lai',
      destPort: 'Cảng Nhật Bản',
    }),
  };
  global.HAK.Catalog = dummyCatalog;

  const ctx = {
    HAK: global.HAK,
    $: () => null,
    esc: (s) => s,
    toast: () => {},
    BKLS_TYPES: { xuatkhau: true },
    DOCS,
    ST: { xuatkhau: {} },
    cfg: () => ({ companies: [], warehouses: [] }),
    getDs: () => null,
    fid: (t, id) => t + '_' + id,
    WH_CUSTOM: '__custom__',
    whAttrList: () => [],
    whoptValue: () => '',
    toggleCustomWh: () => {},
    saveForm: () => {},
    currentRows: () => [],
    renderCatalogNotice: () => {},
    updateSummary: () => {},
  };

  const PC = HAK.PagesContract(ctx);

  const contractDetail = {
    id: 'detail-01',
    parentId: 'parent-01',
    ship: 'Biển Đông 68',
    no: 'HD-2026/01',
    date: '2026-11-20',
    qty: 15000,
    tkhq: '106099988880',
    tkhqDate: '2026-11-25',
  };

  const res = PC.contractValues('xuatkhau', contractDetail);
  assert.equal(res.v.ship, 'Biển Đông 68');
  assert.equal(res.v.contractNo, 'HD-2026/01');
  assert.equal(res.v.customsNo, '106099988880');
  assert.equal(res.v.soToKhai, '106099988880');
  assert.equal(res.v.bklsLoaiLamSan, 'Dăm gỗ keo tràm lai');
  assert.equal(res.v.bklsNguonGoc, 'Rừng trồng tỉnh Quảng Nam');
  assert.equal(res.v.hangHoa, 'Dăm gỗ keo xuất khẩu F.O.B');
  assert.equal(res.v.cangXuat, 'Cảng Chu Lai');
  assert.equal(res.v.cangDen, 'Cảng Nhật Bản');
});

test('3. Smart Matching: phát hiện và lọc đúng tập phiếu theo từ khóa Tàu', () => {
  const rows = [
    { idx: 1, ticket: '001', plate: '43C-111.11', wh: 'Tàu Biển Đông Star', note: '', net: 25000 },
    { idx: 2, ticket: '002', plate: '43C-222.22', wh: 'Kho trung chuyển A', note: 'Giao tàu Biển Đông', net: 26000 },
    { idx: 3, ticket: '003', plate: '43C-333.33', wh: 'Kho nội địa B', note: 'Giao tàu Hải Vân', net: 24000 },
    { idx: 4, ticket: '004', plate: '43C-444.44', wh: 'Tàu Hải Vân 09', note: '', net: 25500 },
  ];

  const shipKeyword = 'Biển Đông';
  const shipNorm = HAK.Excel.util.norm(shipKeyword);

  const matched = rows.filter((r) => {
    const wh = HAK.Excel.util.norm(r.wh || '');
    const nt = HAK.Excel.util.norm(r.note || '');
    return wh.includes(shipNorm) || nt.includes(shipNorm);
  });

  assert.equal(matched.length, 2);
  assert.deepEqual(
    matched.map((r) => r.idx),
    [1, 2]
  );
  const totalNet = matched.reduce((a, r) => a + r.net, 0);
  assert.equal(totalNet, 51000);
});
