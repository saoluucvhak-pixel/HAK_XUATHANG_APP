/* Đối soát dữ liệu trên FILE SAO LƯU (chỉ đọc, không sửa, không ghi đè bản gốc):
 *   node tools/data-audit.cjs <HAK_SaoLuuToanBo.zip | .json> [--json]     phân tích bản sao lưu (làm việc trên BẢN SAO của file)
 *   node tools/data-audit.cjs --sample [--json]                             phân tích bộ dữ liệu THỬ có đủ ca (không phải dữ liệu thật)
 *   node tools/data-audit.cjs --write-sample <đường-dẫn.json>               ghi bộ dữ liệu thử ra tệp để nhập vào ứng dụng thử
 * Thoát mã 1 nếu có LỖI; cảnh báo / thông tin chỉ liệt kê. Không tự xử lý: người dùng đối chiếu hồ sơ nguồn rồi quyết định. */
const fs = require('node:fs');
const { analyze, buildSample } = require('./data-audit-core.cjs');
const args = process.argv.slice(2),
  asJson = args.includes('--json');
const pos = args.filter((a) => !a.startsWith('--'));
(async () => {
  if (args.includes('--write-sample')) {
    const out = pos[0];
    if (!out) return (console.error('Dùng: --write-sample <tệp.json>'), process.exit(2));
    if (fs.existsSync(out)) return (console.error('Tệp đã tồn tại, không ghi đè: ' + out), process.exit(2));
    fs.writeFileSync(out, JSON.stringify(buildSample(), null, 1));
    return console.log('Đã ghi bộ dữ liệu THỬ: ' + out);
  }
  let j, nguon;
  if (args.includes('--sample')) ((j = buildSample()), (nguon = 'DỮ LIỆU THỬ (mẫu)'));
  else {
    const file = pos[0];
    if (!file) return (console.error('Dùng: node tools/data-audit.cjs <sao lưu .zip|.json> [--json] | --sample'), process.exit(2));
    const buf = fs.readFileSync(file); // chỉ đọc
    let text;
    if (/\.zip$/i.test(file) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
      const z = await require('../app/libs/jszip.min.js').loadAsync(buf),
        f = Object.values(z.files).find((x) => !x.dir && /\.json$/i.test(x.name));
      if (!f) throw Error('Không thấy tệp .json trong ZIP.');
      text = await f.async('string');
    } else text = buf.toString('utf8');
    ((j = JSON.parse(text)), (nguon = 'DỮ LIỆU THẬT: ' + file));
  }
  const r = analyze(j);
  if (asJson) console.log(JSON.stringify({ nguon, ...r }, null, 1));
  else {
    console.log('Nguồn: ' + nguon + '\n');
    const s = r.summary;
    console.log('Hồ sơ: ' + s.records + ' (không đọc được ' + s.unreadable + ') · phiếu thô: ' + s.ticketsRaw + ' · ' + s.kgRaw + ' kg');
    console.log('Trùng cùng phạm vi (tự loại): ' + s.sameScopeDuplicates.trips + ' phiếu / ' + s.sameScopeDuplicates.kg + ' kg');
    console.log('Xung đột cùng phạm vi: ' + s.sameScopeConflicts.n + ' phiếu / ' + s.sameScopeConflicts.pendingKg + ' kg tính tạm');
    console.log('Qua bước nghiệp vụ hợp lệ: ' + s.acrossValidSteps.tickets + ' phiếu / ' + s.acrossValidSteps.kg + ' kg');
    console.log('Lỗi ' + s.errors + ' · cảnh báo ' + s.warnings + ' · thông tin ' + s.infos + '\n');
    r.exceptions.forEach((e) => {
      console.log('[' + e.level.toUpperCase() + '] ' + e.code + ' · ' + e.ref + '\n   ' + e.msg);
      e.records.forEach((x) =>
        console.log('   ↳ hồ sơ nguồn ' + x.id + ' · ' + x.title + ' · ' + x.type + ' · ' + x.cid + ' · ' + x.from + '→' + x.to)
      );
    });
  }
  process.exit(r.summary.errors ? 1 : 0);
})().catch((e) => (console.error(e.message), process.exit(2)));
