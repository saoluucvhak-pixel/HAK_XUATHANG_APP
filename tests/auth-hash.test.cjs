/* Băm mật khẩu: PBKDF2 cho bản ghi mới; bản ghi cũ (SHA-256 × 2.000) vẫn xác minh được và nhận diện là "cũ" để nâng cấp. */
const { test } = require('node:test'),
  assert = require('node:assert/strict');
global.window = global;
if (!global.crypto) global.crypto = require('node:crypto').webcrypto; // Node 18 chưa có crypto toàn cục (trình duyệt luôn có)
global.HAK = {};
global.document = {
  querySelector() {
    return null;
  },
  addEventListener() {},
};
require('../app/js/auth.js');
const A = HAK.Auth;

test('bản ghi mới dùng PBKDF2 210.000 vòng, xác minh đúng/sai', async () => {
  const r = await A._hashRec('matkhau1');
  assert.equal(r.alg, 'p2');
  assert.equal(r.iter, 210000);
  assert.equal(r.hash.length, 64);
  assert.equal(await A._verifyRec(r, 'matkhau1'), true);
  assert.equal(await A._verifyRec(r, 'matkhau2'), false);
  assert.equal(A._isLegacy(r), false);
});
test('bản ghi cũ (không có alg) vẫn xác minh được và được nhận là cũ', async () => {
  const old = { salt: 'abc123', hash: A._hash('123456', 'abc123') };
  assert.equal(A._isLegacy(old), true);
  assert.equal(await A._verifyRec(old, '123456'), true);
  assert.equal(await A._verifyRec(old, 'x'), false);
});
test('bản ghi thiếu muối/băm → sai, không ném lỗi; hai lần băm cùng mật khẩu cho muối khác nhau', async () => {
  assert.equal(await A._verifyRec(null, 'a'), false);
  assert.equal(await A._verifyRec({ alg: 'p2' }, 'a'), false);
  const a = await A._hashRec('same'),
    b = await A._hashRec('same');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});
