/* Lịch tự sao lưu SQLite (quy tắc 35): mặc định mỗi ngày giữ 30 bản; tới hạn / chưa tới hạn; lỗi thử lại sau 1 giờ; ngày/tuần; thư mục mặc định. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
global.HAK = {};
const S = require('../app/js/backup-schedule.js');
const at = (y, m, d, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi, 0).getTime();
test('mặc định: bật, mỗi ngày, giữ 30; cấu hình hỏng / thiếu được chuẩn hóa', () => {
  assert.deepEqual(S.normalize(undefined), { on: true, freq: 'day', keep: 30, dir: '', last: null });
  assert.deepEqual(S.normalize('lỗi'), S.normalize(null));
  const c = S.normalize({ freq: 'tuần', keep: 0, dir: '  D:\\SL  ', on: 0 });
  assert.equal(c.freq, 'day');
  assert.equal(c.keep, 1);
  assert.equal(c.dir, 'D:\\SL');
  assert.equal(c.on, true, 'chỉ on === false mới tắt');
  assert.equal(S.normalize({ keep: 9999 }).keep, 365);
  assert.equal(S.normalize({ keep: 'abc' }).keep, 30);
  assert.equal(S.normalize({ freq: 'week' }).freq, 'week');
});
test('mỗi ngày: chưa có bản → đến hạn; đã có bản HÔM NAY → chưa; sang ngày mới (kể cả sát nửa đêm) → đến hạn', () => {
  assert.equal(S.due(null, at(2026, 11, 19)), true);
  const done = S.record(null, { ok: true, name: 'a.db' }, at(2026, 11, 19, 8));
  assert.equal(S.due(done, at(2026, 11, 19, 23, 59)), false);
  assert.equal(S.due(done, at(2026, 11, 20, 0, 1)), true);
});
test('mỗi tuần: chỉ đến hạn khi cách bản thành công gần nhất ≥ 7 ngày', () => {
  const done = S.record({ freq: 'week' }, { ok: true }, at(2026, 11, 10, 9));
  assert.equal(S.due(done, at(2026, 11, 16, 9)), false);
  assert.equal(S.due(done, at(2026, 11, 17, 9)), true);
});
test('tắt thì không bao giờ đến hạn', () => {
  assert.equal(S.due({ on: false }, at(2026, 11, 19)), false);
});
test('lần trước LỖI: chờ ≥ 1 giờ rồi mới thử lại; vẫn nhớ lần thành công gần nhất; lỗi không làm "coi như đã sao lưu"', () => {
  const ok = S.record(null, { ok: true }, at(2026, 11, 18, 9));
  const bad = S.record(ok, { ok: false, error: 'Ổ đĩa đầy' }, at(2026, 11, 19, 9));
  assert.equal(bad.last.ok, false);
  assert.equal(bad.last.error, 'Ổ đĩa đầy');
  assert.equal(bad.last.okAt, at(2026, 11, 18, 9));
  assert.equal(S.due(bad, at(2026, 11, 19, 9, 30)), false, 'chưa đủ 1 giờ');
  assert.equal(S.due(bad, at(2026, 11, 19, 10, 1)), true, 'sau 1 giờ thử lại (hôm nay chưa có bản thành công)');
  const week = S.record({ freq: 'week' }, { ok: false, error: 'x' }, at(2026, 11, 19, 9));
  assert.equal(S.due(week, at(2026, 11, 19, 11)), true, 'chưa từng thành công → đến hạn');
});
test('thư mục mặc định giữ kiểu dấu phân cách; record không sửa đối tượng cũ', () => {
  assert.equal(
    S.defaultDir('C:\\Users\\A\\AppData\\Local\\HAK_XUATHANG\\data'),
    'C:\\Users\\A\\AppData\\Local\\HAK_XUATHANG\\data\\backups'
  );
  assert.equal(S.defaultDir('/home/a/data/'), '/home/a/data/backups');
  assert.equal(S.defaultDir(''), '');
  const base = S.normalize(null);
  S.record(base, { ok: true }, 1);
  assert.equal(base.last, null);
});

test('L-03: tự sao lưu ghi lỗi giữa chừng → không để lại tệp rác 0 byte, không xóa bản tốt khi xoay vòng', async () => {
  const store = new Map();
  global.window = global;
  global.HAK = {};
  global.JSZip = require('../app/libs/jszip.min.js');
  HAK.Store = {
    get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d),
    set: (k, v) => {
      store.set(k, JSON.stringify(v));
      return true;
    },
    remove: (k) => store.delete(k),
    keys: () => Array.from(store.keys()),
  };
  HAK.Archive = { collectItems: async () => [], importItems: async () => ({}) };
  HAK.UI = { toast() {} };
  global.location = { hash: '' };
  global.showDirectoryPicker = async () => dirHandle;
  global.showSaveFilePicker = async () => ({});
  global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };

  const files = new Map();
  let failWrite = true;
  const makeEntry = (name, rec) => ({
    kind: 'file',
    name,
    getFile: async () => {
      const buf = rec.buf;
      return {
        name,
        size: buf.length,
        lastModified: rec.mtime,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
        text: async () => buf.toString('utf8'),
        slice: (a, b) => ({
          arrayBuffer: async () => {
            const sub = buf.subarray(a, b);
            return sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.length);
          },
        }),
      };
    },
    createWritable: async () => ({
      write: async (blob) => {
        if (failWrite) throw new Error('Disk full');
        const ab = await blob.arrayBuffer();
        rec.buf = Buffer.from(ab);
        rec.mtime = Date.now();
      },
      close: async () => {},
    }),
    move: async (newName) => {
      files.delete(name);
      files.set(newName, rec);
    },
  });
  const dirHandle = {
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    entries: async function* () {
      for (const [name, rec] of files.entries()) yield [name, makeEntry(name, rec)];
    },
    getFileHandle: async (name, opts) => {
      if (!files.has(name)) {
        if (opts && opts.create) files.set(name, { buf: Buffer.alloc(0), mtime: Date.now() });
        else throw new Error('NotFoundError');
      }
      return makeEntry(name, files.get(name));
    },
    removeEntry: async (name) => {
      files.delete(name);
    },
  };
  HAK.DB = {
    get: async (s, k) => (s === 'handles' && k === 'autoDir' ? dirHandle : null),
    put: async () => {},
    del: async () => {},
    getAll: async () => [],
  };

  delete require.cache[require.resolve('../app/js/backup.js')];
  require('../app/js/backup.js');

  files.set('HAK_TuDong_20261101_0800.zip', { buf: Buffer.from('good1'), mtime: 1000 });
  files.set('HAK_TuDong_20261102_0800.zip', { buf: Buffer.from('good2'), mtime: 2000 });
  HAK.Store.set('hak.backup.auto', { on: true, keep: 2 });

  const r1 = await HAK.Backup.autoRun({ force: true });
  assert.equal(r1.err, 'fail');
  const zeroOrPart = Array.from(files.entries()).filter(([n, rec]) => rec.buf.length === 0 || n.endsWith('.part'));
  assert.equal(zeroOrPart.length, 0, 'không được để lại tệp 0 byte hoặc .part sau khi ghi lỗi');
  assert.equal(files.has('HAK_TuDong_20261101_0800.zip'), true);
  assert.equal(files.has('HAK_TuDong_20261102_0800.zip'), true);

  // Nếu có sẵn tệp 0 byte từ trước, autoList phải bỏ qua và xoay vòng không được xóa nhầm bản tốt
  files.set('HAK_TuDong_20261103_0800.zip', { buf: Buffer.alloc(0), mtime: 3000 });
  const listed = await HAK.Backup.autoList();
  assert.equal(listed.length, 2, 'autoList phải bỏ qua tệp 0 byte');

  failWrite = false;
  const r2 = await HAK.Backup.autoRun({ force: true });
  assert.ok(!r2.err, 'lần chạy thành công không lỗi: ' + r2.msg);
  assert.equal(files.has('HAK_TuDong_20261102_0800.zip'), true, 'bản tốt gần nhất phải còn khi keep=2');
});
