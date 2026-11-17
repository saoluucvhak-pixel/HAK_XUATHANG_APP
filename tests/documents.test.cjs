const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const { parse, number } = require('../app/js/document-import.js');
test('OCR parses certificate quantities with Vietnamese separators and keeps source evidence', () => {
  const p = parse('Số: TEST12345-01\nNgày: 17/10/2026\n12.345,67 TAN TUOI / 6.789,01 TAN KHO', 'certificate');
  const d = Object.fromEntries(p.map((x) => [x.key, x.value]));
  assert.equal(d.certNo, 'TEST12345-01');
  assert.equal(d.mt, 12345.67);
  assert.equal(d.bdmt, 6789.01);
  assert.equal(d.certDate, '2026-10-17');
  assert.ok(p.every((x) => x.evidence));
});
test('OCR keeps product price distinct from agency fee and handles grouped BDMT', () => {
  const d = Object.fromEntries(
    parse(
      'S6: TEST/ABC/2626\nGia dam go la 180,00 USD/BDMT\nPhi uy thac: 1.20 USD/BDMT\nSo luong la: 4.000 BDMT\nVessel: MV SAMPLE V.1234AB',
      'contract'
    ).map((x) => [x.key, x.value])
  );
  assert.equal(d.priceUsd, 180);
  assert.equal(d.qty, 4000);
  assert.equal(d.ship, 'MV SAMPLE V.1234AB');
});
test('OCR leaves unsupported fields empty, rejects impossible dates and invalid moisture', () => {
  assert.deepEqual(parse('Date: 31/02/2026\nMoisture: 101%', 'certificate'), []);
  assert.deepEqual(parse('', 'contract'), []);
  assert.equal(number('6,543.21'), 6543.21);
  assert.equal(number('0.480'), 0.48);
});
function backupHarness() {
  const data = {
      attachments: [{ id: 'pdf-qa', base64: 'UERG', name: 'QA.pdf' }],
      bklsTemplates: [{ id: 'template-qa', base64: 'RE9DWA==', name: 'QA.docx' }],
    },
    keys = { 'hak.catalog.v1': { contracts: [{ id: 'qa', contractFiles: ['pdf-qa'] }] } };
  const HAK = {
    Store: { keys: () => Object.keys(keys), get: (k) => keys[k], set: (k, v) => (keys[k] = v) },
    DB: {
      getAll: async (k) => data[k] || [],
      get: async (k, id) => (data[k] || []).find((x) => x.id === id),
      put: async (k, v) => {
        data[k] = data[k] || [];
        data[k].push(v);
      },
    },
    Archive: { collectItems: async () => [], importItems: async () => ({ added: 0, updated: 0, skipped: 0 }) },
  };
  const root = { HAK },
    ctx = { window: root, document: {}, console, Blob, Uint8Array, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/js/backup.js'), 'utf8'), ctx);
  return { HAK, data, keys };
}
test('full backup includes original PDF and BKLS binary templates and restores both', async () => {
  const { HAK, data } = backupHarness();
  const full = await HAK.Backup.buildFull();
  const j = JSON.parse(full.parts.join(''));
  assert.equal(j.attachments[0].base64, 'UERG');
  assert.equal(j.bklsTemplates[0].base64, 'RE9DWA==');
  data.attachments = [];
  data.bklsTemplates = [];
  await HAK.Backup.restoreFile(new Blob([JSON.stringify(j)]));
  assert.equal(data.attachments[0].name, 'QA.pdf');
  assert.equal(data.bklsTemplates[0].name, 'QA.docx');
});
test('older full backups restore; malformed attachment blocks before settings mutation', async () => {
  const { HAK, keys } = backupHarness();
  await HAK.Backup.restoreFile(new Blob([JSON.stringify({ app: 'hak-bienban-backup', keys: {}, archive: [] })]));
  const before = JSON.stringify(keys);
  await assert.rejects(
    HAK.Backup.restoreFile(
      new Blob([JSON.stringify({ app: 'hak-bienban-backup', keys: { 'hak.qa': 'bad' }, archive: [], attachments: [{ id: 'bad' }] })])
    )
  );
  assert.equal(JSON.stringify(keys), before);
});

test('v4 DB migration adds binary stores without deleting existing data', async () => {
  let request;
  const created = [],
    ctx = {
      window: {
        indexedDB: {
          open: (name, version) => {
            assert.equal(name, 'hak-app');
            assert.equal(version, 4);
            request = { result: { createObjectStore: (name) => created.push(name), close: () => {} } };
            return request;
          },
        },
      },
      setTimeout,
      clearTimeout,
      console,
    };
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/js/db.js'), 'utf8'), ctx);
  const job = ctx.window.HAK.DB.open();
  request.onupgradeneeded({ oldVersion: 3 });
  assert.deepEqual(created, ['attachments', 'bklsTemplates']);
  request.onsuccess();
  await job;
  assert.equal(ctx.window.HAK.DB.usable(), true);
});

test('moisture computed from certificate weights is explicitly marked as derived and needs review', () => {
  const result = parse('12.345,67 TAN TUOI / 6.789,01 TAN KHO', 'certificate'),
    m = result.find((x) => x.key === 'moisture');
  assert.equal(m.derived, true);
  assert.match(m.evidence, /chưa đọc trực tiếp/);
  assert.equal(m.value, Math.round((1 - 6789.01 / 12345.67) * 1e6) / 1e4);
  assert.ok(!parse('1 TAN TUOI / 2 TAN KHO', 'certificate').some((x) => x.key === 'moisture'));
  const direct = parse('Moisture: 46,1234%\n12.345,67 TAN TUOI / 6.789,01 TAN KHO', 'certificate').find((x) => x.key === 'moisture');
  assert.equal(direct.value, 46.1234);
  assert.ok(!direct.derived);
});
test('certificate parties use the aligned rows and keep the shipping and receiving roles separate', () => {
  require('../app/js/contract-parser.js');
  const { certificateParties } = require('../app/js/document-import.js');
  const parties = certificateParties([
    {
      page: 1,
      text: '',
      rowsText: 'Nguoi xuat khau : CONG TY TNHH SAMPLE\nAddress line\nNguoi mua hang : SAMPLE WOODCHIP CORPORATION PTE LTD',
    },
  ]);
  assert.equal(parties.deliverId.name, 'CONG TY TNHH SAMPLE');
  assert.equal(parties.receiverId.name, 'SAMPLE WOODCHIP CORPORATION PTE LTD');
});
