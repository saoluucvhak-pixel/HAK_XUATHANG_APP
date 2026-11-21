/* Đợt 4 (v2.25.5): Nhóm Sao lưu / Khôi phục & Cấu hình (L-12, L-13, L-14, L-15, L-25, L-26, L-28, N-03, N-06) */
const { test } = require('node:test'),
  assert = require('node:assert/strict');

function bootEnv() {
  const store = new Map();
  global.window = global;
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    length: 0,
    key: () => null,
  };
  if (!global.crypto || !global.crypto.subtle) global.crypto = require('node:crypto').webcrypto;
  global.HAK = {};
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      store.set(k, JSON.stringify(v));
      return true;
    },
    remove: (k) => store.delete(k),
    keys: () => Array.from(store.keys()),
  };
  HAK.Archive = {
    importItems: async (items) => ({ added: items.length, updated: 0, skipped: 0 }),
    collectItems: async () => [],
    decode: async (s) => {
      if (s === 'bad-json') throw new Error('lỗi giải nén');
      if (s === 'no-rows') return { rows: 'not-array' };
      return { rows: [{ net: 1000 }] };
    },
  };
  HAK.DB = { put: async () => {}, getAll: async () => [], usable: () => false };
  HAK.UI = {
    $: () => null,
    $$: () => [],
    esc: (s) => s,
    toast() {},
    Loading: { show() {}, hide() {} },
    debounce: (f) => f,
    todayISO: () => '2026-02-20',
  };
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');
  return { store };
}

const fileOf = (obj) => {
  const b = Buffer.from(JSON.stringify(obj));
  return {
    slice: () => ({ arrayBuffer: async () => b.subarray(0, 2).buffer.slice(b.byteOffset, b.byteOffset + 2) }),
    text: async () => b.toString('utf8'),
    name: 'sao-luu.json',
  };
};

/* ---------------- L-12: Kiểm tra cấu trúc hồ sơ Lưu trữ trước khi khôi phục ---------------- */
test('L-12: validateArchive từ chối hồ sơ thiếu meta.id, thiếu data hoặc rows không phải mảng', async () => {
  bootEnv();
  // Thiếu meta.id
  await assert.rejects(() => HAK.Backup.validateArchive([{ meta: {}, data: 'ok' }]), /thiếu mục lục \(meta\.id\)/);
  // Thiếu data
  await assert.rejects(() => HAK.Backup.validateArchive([{ meta: { id: 'rec1' } }]), /thiếu nội dung/);
  // Không giải nén được
  await assert.rejects(() => HAK.Backup.validateArchive([{ meta: { id: 'rec1' }, data: 'bad-json' }]), /không giải nén được nội dung/);
  // rows không phải mảng
  await assert.rejects(
    () => HAK.Backup.validateArchive([{ meta: { id: 'rec1' }, data: 'no-rows' }]),
    /danh sách phiếu \(rows\) không phải mảng/
  );
  // Hợp lệ -> không ném lỗi
  await HAK.Backup.validateArchive([{ meta: { id: 'rec1' }, data: 'valid' }]);
});

test('L-12: restoreFile chặn file có hồ sơ hỏng TRƯỚC KHI thay đổi cài đặt trên máy', async () => {
  bootEnv();
  HAK.Store.set('hak.config.v1', { original: true });
  const badBackup = {
    app: 'hak-bienban-backup',
    v: 1,
    keys: { 'hak.config.v1': { tampered: true } },
    archive: [{ meta: { id: 'corrupted' }, data: 'no-rows' }],
  };
  await assert.rejects(() => HAK.Backup.restoreFile(fileOf(badBackup), { mode: 'replace' }), /không hợp lệ/);
  // Cài đặt ban đầu không bị sửa
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { original: true });
});

/* ---------------- L-13: Khôi phục dở dang giữ nguyên bản chụp Hoàn tác ---------------- */
test('L-13: khôi phục dừng giữa chừng đánh dấu incomplete; thử lại lần 2 không ghi đè bản chụp ban đầu', async () => {
  bootEnv();
  HAK.Store.set('hak.config.v1', { step: 'gốc' });

  // Mô phỏng lần 1: khôi phục ghi được keys nhưng dừng lỗi ở bước sau
  HAK.Archive.importItems = async () => {
    throw new Error('Mô phỏng đĩa đầy ở bước archive');
  };

  const backupData = {
    app: 'hak-bienban-backup',
    v: 1,
    keys: { 'hak.config.v1': { step: 'lần-1-dở' } },
    archive: [{ meta: { id: 'rec1' }, data: 'valid' }],
  };

  await assert.rejects(() => HAK.Backup.restoreFile(fileOf(backupData), { mode: 'replace' }), /Mô phỏng đĩa đầy/);

  // Bản chụp phải có cờ incomplete: true và lưu cấu hình gốc
  const pre1 = HAK.Store.get('hak.prerestore.v1');
  assert.ok(pre1, 'phải có bản chụp prerestore');
  assert.equal(pre1.incomplete, true, 'phải có cờ incomplete');
  assert.deepEqual(pre1.keys['hak.config.v1'], { step: 'gốc' });

  // Hiện tại máy đã bị dở 'lần-1-dở'
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { step: 'lần-1-dở' });

  // Lần 2: sửa lỗi kho, khôi phục lại
  HAK.Archive.importItems = async () => ({ added: 1, updated: 0, skipped: 0 });
  const backupData2 = {
    app: 'hak-bienban-backup',
    v: 1,
    keys: { 'hak.config.v1': { step: 'lần-2-thành-công' } },
    archive: [{ meta: { id: 'rec1' }, data: 'valid' }],
  };

  const r2 = await HAK.Backup.restoreFile(fileOf(backupData2), { mode: 'replace' });
  assert.ok(r2);

  // Sau khi thành công, cờ incomplete được gỡ, nhưng NỘI DUNG bản chụp vẫn là bản 'gốc' (không bị đè bằng 'lần-1-dở')
  const pre2 = HAK.Store.get('hak.prerestore.v1');
  assert.equal(pre2.incomplete, undefined);
  assert.deepEqual(pre2.keys['hak.config.v1'], { step: 'gốc' });

  // Hoàn tác trả về đúng bản 'gốc'
  await HAK.Backup.undoRestore();
  assert.deepEqual(HAK.Store.get('hak.config.v1'), { step: 'gốc' });
});

/* ---------------- L-14: Xử lý khóa bộ lọc khi khôi phục sang máy khác ---------------- */
test('L-14: remapFilterKey ánh xạ bộ lọc theo username khi mã tài khoản khác máy; bỏ qua khi không khớp', () => {
  bootEnv();
  const ctx = {
    finalUsers: [
      { id: 'u_target_admin', username: 'admin' },
      { id: 'u_target_staff', username: 'nv_nam' },
    ],
    backupUsers: [
      { id: 'u_src_old1', username: 'nv_nam' },
      { id: 'u_src_old2', username: 'nv_khac' },
    ],
  };

  // Khóa tài khoản trùng id sẵn -> giữ nguyên
  assert.equal(HAK.Backup.remapFilterKey('hak.sf.presets@u_target_admin@hak', ctx), 'hak.sf.presets@u_target_admin@hak');

  // Khác id nhưng cùng username 'nv_nam' -> đổi sang 'u_target_staff'
  assert.equal(HAK.Backup.remapFilterKey('hak.sf.presets@u_src_old1@daihiep', ctx), 'hak.sf.presets@u_target_staff@daihiep');

  // Kèm đuôi sao lưu .bak.xxx -> đổi ID và giữ đuôi
  assert.equal(
    HAK.Backup.remapFilterKey('hak.sf.presets@u_src_old1@daihiep.bak.123', ctx),
    'hak.sf.presets@u_target_staff@daihiep.bak.123'
  );

  // Không có tài khoản khớp -> null (bỏ qua, không làm mồ côi)
  assert.equal(HAK.Backup.remapFilterKey('hak.sf.presets@u_src_old2@hak', ctx), null);

  // Không phải khóa bộ lọc -> giữ nguyên
  assert.equal(HAK.Backup.remapFilterKey('hak.config.v1', ctx), 'hak.config.v1');
});

/* ---------------- L-15: BackupMonth thu thập đủ khách hàng qua details ---------------- */
test('L-15: BackupMonth.select thu thập khách hàng chỉ có ở details[].buyer hoặc commissionCustomer', async () => {
  const BM = require('../app/js/backup-month.js');
  const catalog = {
    v: 3,
    customers: [
      { id: 'c-parent-buyer', name: 'Buyer Cha' },
      { id: 'c-detail-buyer', name: 'Buyer Con Chi Tiết' },
      { id: 'c-comm', name: 'Hoa Hồng Độc Lập' },
      { id: 'c-unrelated', name: 'Không Liên Quan' },
    ],
    contracts: [
      {
        id: 'hd-test',
        buyerId: 'c-parent-buyer',
        details: [
          {
            id: 'dt-1',
            buyer: 'c-detail-buyer',
            commissionCustomer: 'c-comm',
          },
        ],
      },
    ],
    customs: [],
  };

  const coll = {
    keys: { 'hak.catalog.v1': catalog },
    items: [{ meta: { id: 'it1', from: '10/02/2026', contract: 'dt-1' }, data: '' }],
    batches: [],
    issued: [],
    attachments: [],
  };

  const res = await BM.select(coll, '2026-02');
  const custIds = res.keys['hak.catalog.v1'].customers.map((c) => c.id).sort();
  assert.deepEqual(custIds, ['c-comm', 'c-detail-buyer', 'c-parent-buyer']);
  assert.ok(!custIds.includes('c-unrelated'));
});

/* ---------------- L-25: Ẩn đường dẫn tuyệt đối máy chủ trong thông báo ---------------- */
test('L-25: hidePaths ẩn đường dẫn Windows (C:\\, D:\\) và UNC (\\\\server)', () => {
  bootEnv();
  const hp = HAK.Backup.hidePaths;
  assert.equal(hp('Lỗi ghi tệp tại D:\\Data\\HAK\\sao_luu.db thất bại'), 'Lỗi ghi tệp tại [đường dẫn đã ẩn] thất bại');
  assert.equal(hp('Không thể mở \\\\nas_server\\share\\hak.db: bị khóa'), 'Không thể mở [đường dẫn đã ẩn]: bị khóa');
  assert.equal(hp('Lỗi mạng thông thường'), 'Lỗi mạng thông thường');
});

/* ---------------- N-03: Cài đặt Chung chống xung đột 2 tab (rev) ---------------- */
test('N-03: HAK.Config.save tăng rev và phát hiện xung đột khi Store có rev mới hơn', () => {
  bootEnv();
  delete require.cache[require.resolve('../app/js/config.js')];
  require('../app/js/config.js');

  HAK.Config.load();
  const initialRev = HAK.Config._rev;
  assert.equal(typeof initialRev, 'number');

  // Lưu bình thường -> tăng rev
  const ok1 = HAK.Config.save();
  assert.equal(ok1, true);
  assert.equal(HAK.Config._rev, initialRev + 1);

  // Giả lập tab khác đã ghi vào Store với rev mới hơn
  const saved = HAK.Store.get('hak.config.v1');
  HAK.Store.set('hak.config.v1', Object.assign({}, saved, { rev: saved.rev + 1, general: { place: 'Tab Khác' } }));

  // Tab hiện tại cố lưu mà chưa tải lại -> từ chối, conflict = true
  const ok2 = HAK.Config.save();
  assert.equal(ok2, false);
  assert.equal(HAK.Config.conflict, true);
});

/* ---------------- N-06: hasUnsaved cho cảnh báo beforeunload ---------------- */
test('N-06: Settings.hasUnsaved và Pages.hasUnsaved kiểm tra thay đổi chưa lưu', () => {
  bootEnv();
  delete require.cache[require.resolve('../app/js/settings.js')];
  require('../app/js/settings.js');

  require('../app/js/pages-modals.js');
  require('../app/js/pages-contract.js');
  require('../app/js/pages-filter.js');
  require('../app/js/pages-bkls.js');
  delete require.cache[require.resolve('../app/js/pages.js')];
  require('../app/js/pages.js');

  assert.equal(HAK.Settings.hasUnsaved(), false);
  assert.equal(typeof HAK.Pages.hasUnsaved, 'function');
  assert.equal(HAK.Pages.hasUnsaved(), false);
});
