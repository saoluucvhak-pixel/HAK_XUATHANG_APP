/* Rà soát toàn vẹn cha–con trên FILE SAO LƯU (không đụng dữ liệu đang dùng; chỉ đọc):
 *   node tools/integrity-audit.cjs <HAK_SaoLuuToanBo.zip | .json> [--json]
 * Đọc danh mục (hak.catalog.v1), hồ sơ Lưu trữ (meta), tệp đính kèm trong bản sao lưu, rồi chạy app/js/integrity-model.js.
 * Thoát mã 1 nếu có LỖI (error); cảnh báo (warn) chỉ liệt kê để đối soát. Không tự sửa, không xóa gì. */
const fs = require('node:fs');
global.window = global;
global.HAK = {};
global.HAK.ContractModel = require('../app/js/contract-model.js');
global.HAK.CustomsModel = require('../app/js/customs-model.js');
const Integrity = require('../app/js/integrity-model.js');
const JSZip = require('../app/libs/jszip.min.js');
const file = process.argv[2],
  asJson = process.argv.includes('--json');
if (!file) {
  console.error('Dùng: node tools/integrity-audit.cjs <sao lưu .zip|.json> [--json]');
  process.exit(2);
}
(async () => {
  let buf = fs.readFileSync(file),
    text;
  if (/\.zip$/i.test(file) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    const z = await JSZip.loadAsync(buf),
      f = Object.values(z.files).find((x) => !x.dir && /\.json$/i.test(x.name));
    if (!f) throw Error('Không thấy tệp .json trong ZIP.');
    text = await f.async('string');
  } else text = buf.toString('utf8');
  const j = JSON.parse(text);
  const catalog = (j.keys && j.keys['hak.catalog.v1']) || j.catalog || { customers: [], contracts: [] };
  const metas = (j.archive || []).map((x) => x.meta || x).filter(Boolean);
  const attachmentIds = Array.isArray(j.attachments) ? j.attachments.map((x) => x.id) : null;
  const data = HAK.ContractModel.migrate(catalog).data;
  const findings = Integrity.audit(data, metas, { attachmentIds });
  const r = {
    findings,
    relations: Integrity.relations(data, metas),
    errors: findings.filter((f) => f.level === 'error').length,
    warnings: findings.filter((f) => f.level === 'warn').length,
  };
  if (asJson) console.log(JSON.stringify(r, null, 1));
  else {
    console.log('Quan hệ: ' + JSON.stringify(r.relations));
    r.findings.forEach((f) => console.log('  [' + f.level.toUpperCase() + '] ' + f.code + ' (' + f.ref + '): ' + f.msg));
    console.log('Lỗi ' + r.errors + ' · Cảnh báo ' + r.warnings);
  }
  process.exit(r.errors ? 1 : 0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(2);
});
