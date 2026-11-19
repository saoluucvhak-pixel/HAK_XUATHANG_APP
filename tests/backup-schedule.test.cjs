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
