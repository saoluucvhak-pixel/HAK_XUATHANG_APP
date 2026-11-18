/**
 * batch-merge.js — gộp các đợt Excel của MỘT loại biên bản thành một bộ dữ liệu (ds). Hàm thuần, không đụng DOM → kiểm thử trong Node.
 * Tách từ main.js (v2.20.3) để test gọi trực tiếp, không phụ thuộc cách xuống dòng (LF / CRLF) của mã nguồn.
 *  - 1 đợt hợp lệ → dùng thẳng ds của đợt đó (giữ nguyên mọi dòng, kể cả dòng lặp trong cùng file).
 *  - ≥ 2 đợt → nối dòng; loại phiếu trùng GIỮA các file (cùng số phiếu + biển số + giờ cân vào, G.omitKey), giữ đợt nạp trước
 *    (hoặc đợt sau nếu người dùng chọn qua useNew). Dòng cùng khóa nằm trong CÙNG một file được giữ nguyên.
 *  - phiếu trùng giữa các file nhưng KHÁC khối lượng (net / gross / tare) → ghi vào conflicts để người dùng chọn.
 * Phải nạp sau excel.js và generator.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  /**
   * @param {{batches:object[], sel?:number, ds?:object}} sl  slot của một loại (mỗi batch có fileName, ds)
   * @param {Set<string>} [useNew]  khóa phiếu mà người dùng chọn "dùng số của đợt sau"
   * Ghi kết quả vào sl.ds (hoặc null khi chưa có đợt nào) và gán r.uid cho từng dòng của các đợt hợp lệ.
   */
  function merge(sl, useNew) {
    const G = HAK.Generator,
      X = HAK.Excel;
    useNew = useNew || new Set();
    const ok = sl.batches.filter((b) => b.ds && b.ds.ok);
    if (!sl.batches.length) {
      sl.ds = null;
      return;
    }
    // Mã duy nhất cho từng xe (tên file + số dòng Excel): r.idx trùng nhau giữa các file → không dùng idx để nhận diện "xe trả về".
    ok.forEach((b) =>
      b.ds.rows.forEach((r) => {
        r.uid = b.fileName + '#' + r.idx;
      })
    );
    if (!ok.length) {
      sl.ds = (sl.batches[sl.sel] || sl.batches[0]).ds;
      return;
    }
    if (ok.length === 1) {
      sl.ds = ok[0].ds;
      return;
    }
    // v2.12.1: gom các dòng cùng khóa (số phiếu|biển số|giờ cân vào) từ mọi đợt. Mặc định giữ dòng của đợt NẠP TRƯỚC (như cũ);
    // phiếu trùng giữa các file mà KHÁC khối lượng → ghi vào conflicts để người dùng chọn dùng số của đợt sau (lưu theo loại, bền qua lần mở app).
    const groups = new Map(),
      warnings = [];
    let total = 0;
    ok.forEach((b) => {
      b.ds.rows.forEach((r) => {
        const k = G.omitKey(r);
        total++;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push({ r, file: b.fileName });
      });
      (b.ds.warnings || []).forEach((w) => warnings.push('[' + b.fileName + '] ' + w));
    });
    const rows = [],
      conflicts = [],
      sig = (r) => [r.net, r.gross, r.tare].join('/');
    groups.forEach((g, k) => {
      const files = new Set(g.map((x) => x.file));
      if (files.size === 1) {
        // Chỉ một file có khóa này: giữ NGUYÊN các dòng (lặp trong cùng file không phải trùng giữa các đợt; như khi chỉ có 1 đợt).
        g.forEach((x) => rows.push(x.r));
        return;
      }
      // Nhiều file cùng khóa: giữ toàn bộ dòng của MỘT đợt (đợt nạp trước, hoặc đợt sau nếu người dùng chọn), bỏ dòng của đợt còn lại.
      const pickNew = useNew.has(k),
        keepFile = pickNew ? g[g.length - 1].file : g[0].file,
        kept = g.filter((x) => x.file === keepFile);
      kept.forEach((x) => rows.push(x.r));
      if (g.some((x) => sig(x.r) !== sig(kept[0].r))) {
        conflicts.push({
          key: k,
          ticket: g[0].r.ticket || '',
          plate: g[0].r.plate,
          time: g[0].r.time1,
          useNew: pickNew,
          items: g.map((x) => ({ file: x.file, net: x.r.net, gross: x.r.gross, tare: x.r.tare })),
        });
      }
    });
    const dup = total - rows.length;
    if (dup) warnings.unshift('ℹ Đã bỏ ' + dup + ' phiếu trùng giữa các đợt (cùng số phiếu, biển số, ngày giờ cân).');
    if (conflicts.length)
      warnings.unshift(
        '⚠ ' +
          conflicts.length +
          ' phiếu trùng giữa các đợt nhưng KHÁC khối lượng — kiểm tra ở mục Nhập liệu → "Xem & chọn" để dùng đúng số.'
      );
    const t = (r) => (r.ts1 !== null && r.ts1 !== undefined ? r.ts1 : Infinity);
    rows.sort((a, b) => (t(a) === t(b) ? 0 : t(a) < t(b) ? -1 : 1));
    sl.ds = {
      ok: true,
      merged: true,
      batchCount: ok.length,
      dup,
      conflicts,
      rows,
      stats: X.computeStats(rows),
      // phiếu KL ≤ 0 đã loại khỏi tổng ở từng đợt (quy tắc 29) — gom lại để lưu cùng hồ sơ và liệt kê ở "Ngoại lệ cần đối soát"
      excluded: ok.flatMap((b) => (b.ds.excluded || []).map((x) => Object.assign({ file: b.fileName }, x))),
      excludedKg: ok.reduce((a, b) => a + (b.ds.excludedKg || 0), 0),
      warnings,
      errors: [],
      meta: {},
      columns: [],
      mapping: {},
      autoMapping: {},
      missing: [],
      missingOptional: [],
      skipped: 0,
      reconciled: false,
    };
  }

  HAK.BatchMerge = { merge };
  if (typeof module === 'object' && module.exports) module.exports = HAK.BatchMerge;
})(typeof window !== 'undefined' ? window : globalThis);
