/**
 * read-config.js — kiểm tra cách đọc Excel MỚI (đổi sheet / dòng tiêu đề / ánh xạ cột / nhận diện lại cột) trước khi áp dụng.
 * Hàm thuần, không đụng DOM hay dữ liệu đang dùng → kiểm thử trong Node. main.js dùng lại để hoãn việc thay dữ liệu cho tới khi
 * kết quả đọc mới được xác nhận là hợp lệ và không có dòng trùng hoàn toàn (cùng quy tắc G.duplicateRows với luồng nạp file).
 * Phải nạp sau excel.js và generator.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  /** Tóm tắt các dòng TRÙNG HOÀN TOÀN (G.duplicateRows) cho người dùng: số phiếu, biển số và số dòng Excel. */
  function dupSummary(dups) {
    const nExtra = dups.reduce((a, g) => a + g.rows.length - 1, 0),
      sample = dups
        .slice(0, 5)
        .map(
          (g) =>
            (g.rows[0].ticket ? 'phiếu ' + g.rows[0].ticket + ' · ' : '') +
            g.rows[0].plate +
            ' (dòng Excel ' +
            g.rows.map((r) => r.idx).join(', ') +
            ')'
        )
        .join('; ');
    return (
      nExtra +
      ' dòng trùng hoàn toàn (cùng số phiếu, biển số, giờ cân) — ' +
      sample +
      (dups.length > 5 ? '… và ' + (dups.length - 5) + ' nhóm khác' : '')
    );
  }

  function read(wb, cfg, autoSwap) {
    const opts = { mapping: cfg.mapping || {}, autoSwap: !!autoSwap };
    if (cfg.headerRow) opts.headerRow = cfg.headerRow;
    if (cfg.fallbackUnit) opts.fallbackUnit = cfg.fallbackUnit;
    let ds;
    try {
      ds = HAK.Excel.parseSheet(wb, cfg.sheet, opts);
    } catch (e) {
      ds = { ok: false, errors: [e.message], rows: [] };
    }
    if (cfg.templateError?.length) {
      ds.ok = false;
      ds.rows = [];
      ds.templateError = cfg.templateError;
    }
    if (cfg.templateWarnings?.length) ds.warnings = [...cfg.templateWarnings, ...(ds.warnings || [])];
    return ds;
  }

  /** Đọc thử đúng cấu hình sẽ áp dụng, rồi đối chiếu phiếu trùng. */
  function probeRead(wb, cfg, autoSwap) {
    const ds = read(wb, cfg, autoSwap);
    return { ds, dups: ds.ok ? HAK.Generator.duplicateRows(ds.rows) : [], sheet: cfg.sheet };
  }

  /**
   * Có áp dụng kết quả đọc thử không?
   *  - có dòng trùng hoàn toàn → KHÔNG (kể cả khi đợt hiện chưa hợp lệ);
   *  - đợt đang có dữ liệu hợp lệ (wasOk) mà cách đọc mới không hợp lệ → KHÔNG (giữ dữ liệu và cấu hình hợp lệ gần nhất);
   *  - đợt hiện chưa hợp lệ (đang chỉnh cấu hình để sửa) → cho áp dụng để người dùng thử tiếp.
   * @returns {{apply:true}|{apply:false, why:string, hint:string, code:'dup'|'invalid'}}
   */
  function decide(wasOk, probe) {
    if (probe.dups.length)
      return {
        apply: false,
        code: 'dup',
        why: 'sheet "' + probe.sheet + '" có ' + dupSummary(probe.dups),
        hint: 'Xóa dòng thừa trong file Excel, đổi dòng tiêu đề / ánh xạ cột hoặc chọn sheet khác.',
      };
    if (wasOk && !probe.ds.ok)
      return {
        apply: false,
        code: 'invalid',
        why: 'cách đọc mới không hợp lệ (' + (probe.ds.templateError || probe.ds.errors || []).join('; ') + ')',
        hint: 'Sửa cấu hình (dòng tiêu đề / ánh xạ cột) hoặc chọn sheet khác.',
      };
    return { apply: true };
  }

  HAK.ReadConfig = { dupSummary, read, probeRead, decide };
  if (typeof module === 'object' && module.exports) module.exports = HAK.ReadConfig;
})(typeof window !== 'undefined' ? window : globalThis);
