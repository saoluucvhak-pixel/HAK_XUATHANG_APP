const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { analyze, buildSample, decode } = require('../tools/data-audit-core.cjs');

const by = (r, code) => r.exceptions.filter((e) => e.code === code);
test('bộ dữ liệu thử: có đủ các nhóm ngoại lệ và mã hồ sơ nguồn', () => {
  const r = analyze(buildSample());
  const codes = new Set(r.exceptions.map((e) => e.code));
  [
    'RECORD_UNREADABLE',
    'TICKET_NO_DATE',
    'TICKET_NO_IDENTITY',
    'TICKET_REPEAT_IN_RECORD',
    'TICKET_DUP_SAME_SCOPE',
    'TICKET_CONFLICT',
    'TICKET_ACROSS_STEPS',
    'PAYMENT_MAYBE_DUP',
    'INTEGRITY:dup-payment',
    'INTEGRITY:decl-orphan',
    'INTEGRITY:archive-link',
    'INTEGRITY:archive-cross-company',
  ].forEach((c) => assert.ok(codes.has(c), 'thiếu ' + c));
  assert.deepStrictEqual(
    by(r, 'RECORD_UNREADABLE')[0].records.map((x) => x.id),
    ['r-E']
  );
  assert.deepStrictEqual(by(r, 'INTEGRITY:archive-link')[0].ref, 'r-M');
  assert.strictEqual(r.summary.unreadable, 1);
});
test('phân biệt bước nghiệp vụ hợp lệ với cộng trùng cùng phạm vi', () => {
  const r = analyze(buildSample());
  const steps = by(r, 'TICKET_ACROSS_STEPS');
  assert.strictEqual(steps.length, 1);
  assert.deepStrictEqual(steps[0].records.map((x) => x.id).sort(), ['r-K', 'r-X']);
  assert.strictEqual(steps[0].level, 'info');
  assert.strictEqual(r.summary.acrossValidSteps.kg, 30000);
  const dup = by(r, 'TICKET_DUP_SAME_SCOPE');
  assert.strictEqual(dup.length, 1);
  assert.deepStrictEqual(dup[0].records.map((x) => x.id).sort(), ['r-A', 'r-C']);
  assert.strictEqual(r.summary.sameScopeDuplicates.kg, 20000);
  const conf = by(r, 'TICKET_CONFLICT');
  assert.strictEqual(conf.length, 2);
  assert.ok(conf.some((c) => /khối lượng \(21000 \/ 21500 kg\)/.test(c.msg)));
  assert.ok(conf.some((c) => /liên kết hợp đồng/.test(c.msg)));
  assert.strictEqual(r.summary.sameScopeConflicts.n, 2);
});
test('không sửa dữ liệu đầu vào và chạy lặp cho cùng kết quả', () => {
  const b = buildSample(),
    before = JSON.stringify(b);
  const a1 = analyze(b),
    a2 = analyze(b);
  assert.strictEqual(JSON.stringify(b), before);
  assert.deepStrictEqual(a1.exceptions, a2.exceptions);
});
test('dữ liệu sạch: không có lỗi / cảnh báo', () => {
  const b = { archive: [], keys: { 'hak.catalog.v1': { v: 3, customers: [], products: [], contracts: [], customs: [] } } };
  const r = analyze(b);
  assert.strictEqual(r.exceptions.length, 0);
});
test('decode: gz / raw / định dạng lạ', () => {
  assert.deepStrictEqual(decode('raw:{"a":1}'), { a: 1 });
  assert.deepStrictEqual(decode('gz:' + zlib.gzipSync('{"a":2}').toString('base64')), { a: 2 });
  assert.throws(() => decode('xyz'));
  assert.throws(() => decode(null));
});
test('CLI: --sample thoát mã 1 (có lỗi) và --write-sample không ghi đè', () => {
  const { spawnSync } = require('node:child_process');
  const cli = path.join(__dirname, '..', 'tools', 'data-audit.cjs');
  const r = spawnSync(process.execPath, [cli, '--sample', '--json'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(JSON.parse(r.stdout).nguon, /THỬ/);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hak-aud-')), 's.json');
  assert.strictEqual(spawnSync(process.execPath, [cli, '--write-sample', f]).status, 0);
  assert.strictEqual(spawnSync(process.execPath, [cli, '--write-sample', f]).status, 2);
  assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).archive.length, 10);
  const real = spawnSync(process.execPath, [cli, f, '--json'], { encoding: 'utf8' });
  assert.match(JSON.parse(real.stdout).nguon, /THẬT/);
});
