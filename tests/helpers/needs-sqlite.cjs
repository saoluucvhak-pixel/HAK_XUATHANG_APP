/* Các test lõi SQLite dùng `node:sqlite` (Node ≥ 22.5; không cờ từ 22.13). Node 18 / 20 không có → các tệp test đó tự bỏ qua có thông báo thay vì làm hỏng cả bộ test.
 * Dùng ở ĐẦU tệp test:  if (require('./helpers/needs-sqlite.cjs')()) return;   (trả true khi đã đăng ký ca "bỏ qua") */
module.exports = function skipWithoutSqlite() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    new DatabaseSync(':memory:').close();
    return false;
  } catch (e) {
    require('node:test').test(
      'node:sqlite không có ở Node ' + process.version + ' (cần ≥ 22.5) — bỏ qua các test SQLite',
      { skip: true },
      () => {}
    );
    return true;
  }
};
