/* Bộ kiểm hợp đồng HAKDB (tools/hakdb/contract.cjs) chạy trên máy chủ tham chiếu Node. CI Windows chạy đúng bộ này trên HAKDocs.exe thật. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../tools/hakdb/server.cjs');
const { run } = require('../tools/hakdb/contract.cjs');

test('máy chủ tham chiếu đạt toàn bộ ca hợp đồng', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hakdb-contract-'));
  const token = 'e'.repeat(32);
  const srv = createServer({ dataDir: dir, token });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    const res = await run('http://127.0.0.1:' + srv.address().port, token);
    const bad = res.filter((x) => !x.ok);
    assert.deepEqual(bad, [], 'ca lỗi: ' + JSON.stringify(bad));
    assert.ok(res.length >= 14);
  } finally {
    await new Promise((ok) => srv.close(ok));
  }
});
