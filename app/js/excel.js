/**
 * excel.js — Đọc "Bảng Cân Xuất Hàng" (Excel) bằng SheetJS và chuẩn hoá thành dataset.
 *
 * Quy trình:
 *   readFile()  → đọc workbook (async, có tiến độ)
 *   parseSheet()→ tìm dòng tiêu đề, tự nhận diện cột (có thể ghi đè thủ công), chuẩn hoá từng dòng,
 *                 kiểm tra dữ liệu, thống kê.
 *
 * Không phụ thuộc DOM nên chạy được cả trong Node để kiểm thử.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  /* ---------------------------------------------------------------
   * Danh sách trường chuẩn + nhãn hiển thị
   * required: bắt buộc phải có (thiếu → không sinh được biên bản)
   * ------------------------------------------------------------- */
  const FIELDS = [
    { key: 'ticket', label: 'Số phiếu', req: false },
    { key: 'date', label: 'Ngày cân', req: true },
    { key: 'timeIn', label: 'Giờ cân vào', req: false },
    { key: 'timeOut', label: 'Giờ cân ra', req: false },
    { key: 'datetime1', label: 'Ngày giờ cân 1', req: false, hidden: true },
    { key: 'datetime2', label: 'Ngày giờ cân 2', req: false, hidden: true },
    { key: 'plate', label: 'Biển số', req: true },
    { key: 'tare', label: 'Cân lần 1 (xe không)', req: false },
    { key: 'gross', label: 'Cân lần 2 (có hàng)', req: false },
    { key: 'net', label: 'Khối lượng hàng', req: true },
    { key: 'unit', label: 'Đơn vị tính', req: false },
    { key: 'driver', label: 'Tài xế', req: false },
    { key: 'carrier', label: 'Đơn vị vận chuyển', req: false },
    { key: 'wh', label: 'Kho', req: false },
    { key: 'weightType', label: 'Loại cân', req: false },
    { key: 'weigher', label: 'Người cân', req: false },
    { key: 'note', label: 'Nhãn / Ghi chú (tàu…)', req: false },
  ];

  /* Quy tắc nhận diện cột theo tiêu đề đã chuẩn hoá (không dấu, chữ thường). Thứ tự = độ ưu tiên. */
  const RULES = [
    ['datetime2', /ngay gio can 2|thoi gian can 2|ngay can 2/],
    ['datetime1', /ngay gio can 1|thoi gian can 1|ngay gio can( vao)?$|^thoi gian can$|^weigh(ing)? date time$/],
    ['timeIn', /gio can vao|gio vao|gio can 1|gio can lan 1/],
    ['timeOut', /gio can ra|gio ra|gio can 2|gio can lan 2/],
    ['date', /^ngay( can)?( 1| vao)?$|^ngay xuat|^ngay can|^(weigh(ing)? )?date$/],
    ['ticket', /phieu|^(ma|so) can$|^(weigh(ing)? )?ticket( no| number)?$/],
    ['tare', /xe khong|can lan 1|tl xe|^(bi|kl bi|tl bi)$|^tare|trong luong xe$|khoi luong xe$/],
    ['gross', /co hang|can lan 2|tong trong luong|^kl tong$|^tl tong$|^gross/],
    ['net', /luong hang|kl hang|khoi luong hang|^khoi luong$|^trong luong$|^(kl|tl) tinh$|^net/],
    ['unit', /^don vi tinh$|^dvt$/],
    ['weigher', /nguoi can/],
    ['driver', /tai xe|lai xe/],
    ['carrier', /don vi van (chuyen|tai)|dvvc|nha xe|nha van tai|chu xe/],
    ['wh', /^kho( hang| xuat| nhap| giao| nhan| gui)?$|ten kho|kho xuat|kho nhan/],
    ['weightType', /loai can|kieu can/],
    ['plate', /so xe|bien so|bien kiem soat|^xe$|^bks$|^(vehicle (no|number|plate)|license plate|plate number|plate)$/],
    ['note', /ghi chu|^tau$|chuyen tau|lo hang|^nhom$/],
  ];

  /* ---------------------------------------------------------------
   * Tiện ích chuỗi / số / ngày
   * ------------------------------------------------------------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9/ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  /** Khóa biển số để đếm / gộp xe: không phân biệt hoa/thường, khoảng trắng, dấu gạch, dấu chấm, dấu tiếng Việt ("43c-111.11" ≡ "43C 11111"). Cùng quy tắc HAK.Weigh.plateKey / Tìm kiếm chung (có test đối chiếu). */
  const plateKey = (s) =>
    String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'D')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '');
  const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

  /** Đọc số từ ô Excel kèm cảnh báo định dạng mơ hồ/đơn vị (L-10, L-11). */
  function parseNumWarn(v) {
    if (typeof v === 'number') return { value: isFinite(v) ? v : null, warn: null };
    if (isBlank(v)) return { value: null, warn: null };
    const raw = String(v)
      .trim()
      .replace(/[−‒–—]/g, '-');
    // Số âm kiểu kế toán trong ngoặc: "(1.200)" = -1200, "(1.200,50)" = -1200,5
    const paren = raw.match(/^\(([^()]*)\)$/);
    if (paren) {
      const inner = parseNumWarn(paren[1]);
      return { value: inner.value === null ? null : -Math.abs(inner.value), warn: inner.warn };
    }
    if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(raw)) {
      const sci = Number(raw);
      return { value: isFinite(sci) ? sci : null, warn: null };
    }
    let warn = null;
    if (/[^\d.,+\-\s]/.test(raw)) warn = 'Số có kèm chữ hoặc đơn vị ("' + raw.slice(0, 24) + '")';
    let s = raw.replace(/[^\d.,\-]/g, '');
    if (!s || s === '-') return { value: null, warn: null };
    const dots = (s.match(/\./g) || []).length,
      commas = (s.match(/,/g) || []).length;
    if (dots && commas) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (commas > 1 || dots > 1) {
      if (!/^-?\d{1,3}([.,]\d{3})+$/.test(s)) warn = warn || 'Nhóm chữ số ngăn cách không đều 3 chữ số ("' + raw.slice(0, 24) + '")';
      s = s.replace(/[.,]/g, '');
    } else if (commas === 1) {
      s = /,\d{3}$/.test(s) && !/^-?0,/.test(s) ? s.replace(',', '') : s.replace(',', '.');
    } else if (dots === 1) {
      if (/\.\d{3}$/.test(s) && !/^-?0?\./.test(s)) s = s.replace('.', '');
    }
    const n = parseFloat(s);
    return isFinite(n) ? { value: n, warn } : { value: null, warn: null };
  }
  function parseNum(v) {
    return parseNumWarn(v).value;
  }

  const pad = (n, w) => String(n).padStart(w || 2, '0');

  /** Số serial Excel → {y,m,d,hh,mm,ss}. Hỗ trợ hệ ngày 1904 (date1904 = true). */
  function serialToParts(n, is1904) {
    const day = Math.floor(n) + (is1904 && n >= 1 ? 1462 : 0);
    let frac = Math.round((n - Math.floor(n)) * 86400);
    const ms = Date.UTC(1899, 11, 30) + day * 86400000;
    const dt = new Date(ms);
    const hh = Math.floor(frac / 3600);
    frac -= hh * 3600;
    const mm = Math.floor(frac / 60);
    const ss = frac - mm * 60;
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), hh, mm, ss, hasDate: n >= 1, hasTime: n % 1 !== 0 };
  }

  /**
   * Phân tích ngày / giờ ở nhiều dạng:
   *   "16/08/2026", "16/08/2026 11:43:33", "2026-01-22 06:28:43", "16-08-2026", "11:43:33", AM/PM, số serial, Date.
   * Trả về {y,m,d,hh,mm,ss,hasDate,hasTime} hoặc null.
   */
  /** Ngày giờ có tồn tại không (28/29/30/31 ngày, tháng 1–12, giờ 0–23; cho phép 24:00:00 = nửa đêm)? */
  function validParts(p) {
    if (p.m < 1 || p.m > 12 || p.d < 1) return false;
    const dim = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    if (p.d > dim) return false;
    if (p.mm > 59 || p.ss > 59) return false;
    return p.hh < 24 || (p.hh === 24 && p.mm === 0 && p.ss === 0);
  }
  function applyAmPm(hh, ampm) {
    if (!ampm) return hh;
    const u = ampm.toUpperCase();
    if (u === 'AM' || u === 'SA') return hh === 12 ? 0 : hh;
    if (u === 'PM' || u === 'CH') return hh < 12 ? hh + 12 : hh;
    return hh;
  }
  function parseDT(v, is1904) {
    if (isBlank(v)) return null;
    if (v instanceof Date) {
      return {
        y: v.getFullYear(),
        m: v.getMonth() + 1,
        d: v.getDate(),
        hh: v.getHours(),
        mm: v.getMinutes(),
        ss: v.getSeconds(),
        hasDate: true,
        hasTime: true,
      };
    }
    if (typeof v === 'number') return v >= 0 ? serialToParts(v, is1904) : null;
    const chk = (p) => (validParts(p) ? p : null);
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T\u00a0,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)?)?/i);
    if (m) {
      const hh = m[4] !== undefined ? applyAmPm(+m[4], m[7]) : 0;
      if (m[7] && (+m[4] < 1 || +m[4] > 12)) return null;
      return chk({
        y: +m[3],
        m: +m[2],
        d: +m[1],
        hh,
        mm: +(m[5] || 0),
        ss: +(m[6] || 0),
        hasDate: true,
        hasTime: m[4] !== undefined,
      });
    }
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T\u00a0,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)?)?/i);
    if (m) {
      const hh = m[4] !== undefined ? applyAmPm(+m[4], m[7]) : 0;
      if (m[7] && (+m[4] < 1 || +m[4] > 12)) return null;
      return chk({
        y: +m[1],
        m: +m[2],
        d: +m[3],
        hh,
        mm: +(m[5] || 0),
        ss: +(m[6] || 0),
        hasDate: true,
        hasTime: m[4] !== undefined,
      });
    }
    m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)?$/i);
    if (m) {
      if (m[4] && (+m[1] < 1 || +m[1] > 12)) return null;
      return { y: 0, m: 0, d: 0, hh: applyAmPm(+m[1], m[4]), mm: +m[2], ss: +(m[3] || 0), hasDate: false, hasTime: true };
    }
    return null;
  }
  const partsToTs = (p) => Date.UTC(p.y, p.m - 1, p.d, p.hh || 0, p.mm || 0, p.ss || 0);
  const tsToParts = (ts) => {
    const d = new Date(ts);
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth() + 1,
      d: d.getUTCDate(),
      hh: d.getUTCHours(),
      mm: d.getUTCMinutes(),
      ss: d.getUTCSeconds(),
    };
  };
  const fmtDate = (p) => pad(p.d) + '/' + pad(p.m) + '/' + p.y;
  const fmtDateTime = (p) => fmtDate(p) + ' ' + pad(p.hh) + ':' + pad(p.mm) + ':' + pad(p.ss);

  /** Chuẩn hoá số phiếu: "7998/2026 /XK" → "7998/2026/XK"; số nguyên giữ nguyên. */
  function normTicket(v) {
    if (isBlank(v)) return '';
    if (typeof v === 'number') return String(v);
    return String(v)
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const PLATE_RE = /^\d{2}[A-Z]{1,2}[- ]?\d{3,6}(\.\d+)?$/i;

  /* ---------------------------------------------------------------
   * Đọc file
   * ------------------------------------------------------------- */
  function readFile(file, onProgress) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 60));
      };
      fr.onerror = () => reject(new Error('Không đọc được file.'));
      fr.onload = () => {
        try {
          if (onProgress) onProgress(70);
          // Cho trình duyệt cơ hội vẽ lại loading trước khi SheetJS parse (đồng bộ, có thể vài trăm ms)
          setTimeout(async () => {
            try {
              const bytes = new Uint8Array(fr.result);
              if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b && typeof root.JSZip === 'function') {
                const U = root.HAK && root.HAK.Util;
                if (U && U.checkZipLimits) {
                  const z = await root.JSZip.loadAsync(bytes);
                  U.checkZipLimits(z, { maxFile: 80 * 1024 * 1024, maxTotal: 160 * 1024 * 1024 });
                }
              }
              const wb = root.XLSX.read(bytes, { type: 'array', cellDates: false, cellNF: false, cellStyles: false });
              if (onProgress) onProgress(100);
              resolve({ workbook: wb, sheetNames: wb.SheetNames.slice(), fileName: file.name, size: file.size });
            } catch (e) {
              console.error(e);
              // giữ thông báo tiếng Việt của app (vd. giới hạn zip); lỗi thô của thư viện (tiếng Anh) chỉ ghi Console
              const vi = /[àáảãạăâđêôơưèéẻẽẹìíòóõọùúũụỳýỹỵ]/i.test(e && e.message);
              reject(
                new Error(
                  vi
                    ? 'File không phải Excel hợp lệ hoặc vượt giới hạn: ' + e.message
                    : 'File không phải Excel hợp lệ (hoặc hỏng). Mở bằng Excel, lưu lại dạng .xlsx rồi nhập lại.'
                )
              );
            }
          }, 30);
        } catch (e) {
          reject(e);
        }
      };
      fr.readAsArrayBuffer(file);
    });
  }

  /** Đọc từ ArrayBuffer/Uint8Array (dùng cho kiểm thử Node). */
  function readBuffer(buf) {
    const wb = root.XLSX.read(buf, { type: buf instanceof ArrayBuffer ? 'array' : 'buffer', cellDates: false });
    return { workbook: wb, sheetNames: wb.SheetNames.slice() };
  }

  /* ---------------------------------------------------------------
   * Phân tích 1 sheet
   * ------------------------------------------------------------- */
  const unitSuffix = /(?:\s*[(\[]\s*(kg|tấn|tan|t)\s*[)\]]|\s+(kg|tấn|tan|t))$/i;
  const unitOnly = /^(?:kg|tấn|tan|t)$/i;
  const headerKey = (value) =>
    norm(
      String(value ?? '')
        .trim()
        .replace(unitSuffix, '')
    );
  const weightUnit = (value) => {
    const m = String(value ?? '')
      .trim()
      .match(unitSuffix);
    return m ? (/^kg$/i.test(m[1] || m[2]) ? 1 : 1000) : null;
  };
  function mapHeaders(cells) {
    const mapping = {};
    cells.forEach((cell, index) => {
      const key = headerKey(cell);
      const rule = key && RULES.find(([, re]) => re.test(key));
      if (rule && mapping[rule[0]] === undefined) mapping[rule[0]] = index;
    });
    return mapping;
  }
  function headerScore(cells) {
    const m = mapHeaders(cells);
    const recognized = Object.keys(m).length;
    const complete =
      m.plate !== undefined &&
      (m.date !== undefined || m.datetime1 !== undefined) &&
      (m.net !== undefined || (m.gross !== undefined && m.tare !== undefined));
    return recognized + (complete ? RULES.length : 0);
  }
  function headerAt(grid, row) {
    const top = grid[row] || [];
    const next = grid[row + 1] || [];
    const score = headerScore(top);
    // Một dòng số liệu có thể chứa chữ giống tiêu đề trong cột ghi chú.
    if (
      top.every(isBlank) ||
      next.some((cell) => typeof cell === 'number' || (typeof cell === 'string' && (PLATE_RE.test(cell.trim()) || parseDT(cell))))
    )
      return { row, end: row, cells: top, score };
    const full = Array.from({ length: Math.max(top.length, next.length) }, (_, i) => {
      const upper = String(top[i] ?? '').trim();
      const lower = String(next[i] ?? '').trim();
      if (upper && unitOnly.test(lower)) return upper + ' (' + lower + ')';
      if (!lower || typeof next[i] !== 'string') return upper;
      const key = headerKey(lower);
      if (!RULES.some(([, re]) => re.test(key))) return upper;
      const topKey = headerKey(upper);
      if (/^(khoi luong|trong luong|can)$/.test(topKey)) return lower;
      if (!upper || !RULES.some(([, re]) => re.test(topKey))) return lower;
      return upper;
    });
    const fullScore = headerScore(full);
    const hasUnits = full.some((cell, i) => weightUnit(cell) !== weightUnit(top[i]) && unitOnly.test(String(next[i] ?? '').trim()));
    return fullScore > score || (hasUnits && fullScore === score)
      ? { row, end: row + 1, cells: full, score: fullScore }
      : { row, end: row, cells: top, score };
  }
  function findHeader(grid) {
    let best = null;
    const lim = Math.min(grid.length, 60);
    for (let r = 0; r < lim; r++) {
      const candidate = headerAt(grid, r);
      if (candidate.score >= 3 && (!best || candidate.score > best.score)) best = candidate;
    }
    return best;
  }

  function detectMapping(headerCells, dataSample) {
    const mapping = mapHeaders(headerCells);
    const used = new Set(Object.values(mapping));
    // --- Dự phòng theo nội dung cho cột chưa nhận diện ---
    const ncol = headerCells.length;
    for (let ci = 0; ci < ncol; ci++) {
      if (used.has(ci) || /^(stt|so thu tu)$/.test(headerKey(headerCells[ci]))) continue;
      const vals = dataSample.map((r) => r[ci]).filter((v) => !isBlank(v));
      if (!vals.length) continue;
      if (mapping.plate === undefined && vals.filter((v) => PLATE_RE.test(String(v).trim())).length > vals.length * 0.8) {
        mapping.plate = ci;
        used.add(ci);
        continue;
      }
      // cột chữ có ít giá trị khác nhau (vd "TÀU 1", "TÀU 2", "CHO QC MƯỢN") → nhãn / ghi chú
      const strs = vals.filter((v) => typeof v === 'string');
      if (mapping.note === undefined && strs.length === vals.length && !strs.every((x) => /^\d+$/.test(x.trim()))) {
        const distinct = new Set(strs.map((s) => s.trim()));
        if (distinct.size >= 1 && distinct.size <= 30 && vals.length >= dataSample.length * 0.02) {
          mapping.note = ci;
          used.add(ci);
          continue;
        }
      }
    }
    return mapping;
  }

  /** Dòng tiêu đề báo cáo: công ty, khoảng thời gian, tổng số xe / KL khai báo, kiểu cân. */
  function parseMeta(grid, headerRow) {
    const meta = { company: '', address: '', title: '', from: null, to: null, declaredTrips: null, declaredKg: null, weightType: '' };
    const texts = [];
    for (let r = 0; r < Math.max(0, headerRow); r++) {
      // ô gộp (merge) có thể được SheetJS lặp lại ở nhiều cột → chỉ lấy giá trị duy nhất của mỗi dòng
      const seen = new Set();
      (grid[r] || []).forEach((c) => {
        if (isBlank(c) || typeof c !== 'string') return;
        const t = c.trim();
        if (!seen.has(t)) {
          seen.add(t);
          texts.push(t);
        }
      });
    }
    if (texts[0]) meta.company = texts[0];
    if (texts[1]) meta.address = texts[1];
    if (texts[2]) meta.title = texts[2];
    texts.forEach((t) => {
      let m =
        t.match(/t[ưu]̣?\s*ng[àa]y\s*(\d{1,2}\/\d{1,2}\/\d{4}).*?[đd][ếe]n\s*ng[àa]y\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
        t.match(/(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (m && !meta.from) {
        meta.from = parseDT(m[1]);
        meta.to = parseDT(m[2]);
      }
      m = t.match(/T[ổo]ng s[ốo]\s*:\s*([\d.,]+)\s*xe[^\d]*([\d.,]+)\s*(kg|t[ấa]n)?/i);
      if (m) {
        meta.declaredTrips = parseNum(m[1]);
        let kg = parseNum(m[2]);
        if (m[3] && /t[ấa]n/i.test(m[3])) kg *= 1000;
        meta.declaredKg = kg;
      }
      m = t.match(/ki[ểe]u c[âa]n\s*=\s*([^;]+)/i);
      if (m) meta.weightType = m[1].trim();
    });
    return meta;
  }

  /**
   * parseSheet(workbook, sheetName, opts)
   *   opts.mapping   : ghi đè ánh xạ cột { field: colIndex | -1 }
   *   opts.autoSwap  : hoán đổi cân lần 1/2 khi lần 1 > lần 2
   */
  function parseSheet(workbook, sheetName, opts) {
    opts = opts || {};
    const ws = workbook.Sheets[sheetName];
    if (!ws) throw new Error('Không tìm thấy sheet "' + sheetName + '"');
    // Đọc toàn bộ sheet thành mảng 2 chiều. blankrows:true để giữ đúng số dòng thực trong Excel.
    const range = root.XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const rowOff = range.s.r,
      colOff = range.s.c;
    const G = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });

    const ds = {
      sheetName,
      rows: [],
      columns: [],
      mapping: {},
      autoMapping: {},
      missing: [],
      missingOptional: [],
      warnings: [],
      errors: [],
      meta: {},
      headerRow: -1,
      stats: null,
      ok: false,
    };
    // Cho phép người dùng chỉ định dòng tiêu đề (số dòng Excel, bắt đầu từ 1) nếu tự dò thất bại
    const explicitRow = opts.headerRow ? opts.headerRow - 1 - rowOff : null;
    const header = explicitRow === null ? findHeader(G) : explicitRow >= 0 && explicitRow < G.length ? headerAt(G, explicitRow) : null;
    if (!header) {
      ds.errors.push('Không tìm thấy dòng tiêu đề (cần ít nhất 3 cột như Số phiếu / Ngày cân / Số xe / Trọng lượng…).');
      return ds;
    }
    const { row: hr, end: headerEnd, cells: headerCells } = header;
    ds.headerRow = hr;
    ds.headerExcelRow = hr + rowOff + 1;
    const width = Math.max(headerCells.length, ...G.slice(headerEnd + 1, headerEnd + 50).map((r) => (r || []).length));
    ds.columns = [];
    for (let i = 0; i < width; i++) {
      const h = headerCells[i];
      ds.columns.push({
        index: i,
        header: isBlank(h) ? '' : String(h).trim(),
        label: isBlank(h) ? '(cột ' + colName(i + colOff) + ' — không có tiêu đề)' : String(h).trim(),
        letter: colName(i + colOff),
      });
    }
    const sample = G.slice(headerEnd + 1, headerEnd + 301).map((r) => r || []);
    ds.autoMapping = detectMapping(
      Array.from({ length: width }, (_, i) => headerCells[i]),
      sample
    );
    ds.mapping = Object.assign({}, ds.autoMapping);
    if (opts.inspectOnly) return ds;
    if (opts.mapping)
      Object.keys(opts.mapping).forEach((k) => {
        if (opts.mapping[k] === -1 || opts.mapping[k] === null) delete ds.mapping[k];
        else ds.mapping[k] = opts.mapping[k];
      });
    ds.meta = parseMeta(G, hr);

    const M = ds.mapping;
    const has = (k) => M[k] !== undefined;
    const hasDate = has('date') || has('datetime1');
    // ---- thiếu cột ----
    FIELDS.forEach((f) => {
      if (f.hidden) return;
      let present = has(f.key);
      if (f.key === 'date') present = hasDate;
      if (f.key === 'net') present = has('net') || (has('tare') && has('gross'));
      if (!present) (f.req ? ds.missing : ds.missingOptional).push(f);
    });
    if (ds.missing.length) {
      ds.errors.push('Thiếu cột bắt buộc: ' + ds.missing.map((f) => f.label).join(', ') + '. Hãy chọn cột tương ứng ở bảng "Ánh xạ cột".');
    }
    if (ds.missingOptional.length) {
      ds.warnings.push(
        'Không có cột: ' +
          ds.missingOptional.map((f) => f.label).join(', ') +
          ' — các trường này sẽ để trống hoặc dùng giá trị mặc định trong Cài đặt.'
      );
    }
    if (ds.errors.length) return ds;

    // ---- đơn vị ----
    const units = Object.fromEntries(['net', 'tare', 'gross'].map((field) => [field, weightUnit(headerCells[M[field]])]));
    const unitFactor = units.net ?? units.gross ?? units.tare ?? (opts.weightUnit === 't' ? 1000 : 1);

    // ---- chuẩn hoá từng dòng ----
    const is1904 = !!(workbook && workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904);
    const rows = [];
    const issues = {
      swap: [],
      mismatch: [],
      noDate: [],
      dupTicket: [],
      nonPos: [],
      plate: [],
      noWeight: [],
      weightOnly: [],
      weirdNum: [],
      badTime24: [],
      hugeWeight: [],
    };
    const seenTicket = new Map();
    const excluded = []; // phiếu KL ≤ 0 (kể cả âm): KHÔNG cộng vào tổng, KHÔNG đưa vào biên bản — liệt kê riêng để đối soát (quy tắc 29)
    const cancelled = []; // phiếu "BO" (bỏ cân — xe cân lại phiếu khác) → loại khỏi biên bản
    let skipped = 0;
    for (let r = headerEnd + 1; r < G.length; r++) {
      const raw = G[r] || [];
      const g = (k) => (has(k) ? raw[M[k]] : null);
      const plate = isBlank(g('plate')) ? '' : String(g('plate')).trim();
      const pTare = parseNumWarn(g('tare')),
        pGross = parseNumWarn(g('gross')),
        pNet = parseNumWarn(g('net'));
      let tare = pTare.value,
        gross = pGross.value,
        net = pNet.value;
      const first = isBlank(raw[0]) ? '' : norm(raw[0]);
      if (/^(cong|tong)\b/.test(first)) {
        skipped++;
        continue;
      }
      const plateNorm = norm(plate);
      const noIdentity =
        (!plate || /^(tong(\s+cong)?|cong)\b/.test(plateNorm)) && isBlank(g('ticket')) && isBlank(g('datetime1')) && isBlank(g('date'));
      // Mẫu có thể đặt ngày ký hoặc dòng ký tên ngay trong cột khối lượng hàng.
      const signatureDate = ['net', 'gross', 'tare'].some((field) => /\bngay \d{1,2} thang \d{1,2} nam \d{4}\b/.test(norm(g(field))));
      if (noIdentity && signatureDate) {
        skipped++;
        continue;
      }
      if (noIdentity && raw.some((c) => !isBlank(c) && /^(tong(\s+cong)?|cong)\b/.test(norm(c)))) {
        skipped++;
        continue;
      }
      if (!plate && net === null) {
        skipped++;
        continue;
      }
      if (net === null && (tare === null || gross === null)) {
        skipped++;
        // dòng có số phiếu / biển số nhưng không đọc được khối lượng: KHÔNG được nuốt âm thầm → báo kèm số dòng Excel
        if (plate || !isBlank(g('ticket'))) issues.noWeight.push(r + 1 + rowOff);
        continue;
      }
      let rowUnit;
      if (has('unit')) {
        const u = norm(g('unit'));
        if (/^t(an)?$/.test(u)) rowUnit = 1000;
        else if (/^kg$/.test(u)) rowUnit = 1;
      }
      if (tare !== null) tare *= rowUnit ?? units.tare ?? unitFactor;
      if (gross !== null) gross *= rowUnit ?? units.gross ?? unitFactor;
      if (net !== null) net *= rowUnit ?? units.net ?? unitFactor;

      const row = {
        idx: r + 1 + rowOff, // số dòng thực trong Excel
        ticket: normTicket(g('ticket')),
        plate,
        driver: has('driver') && !isBlank(g('driver')) ? String(g('driver')).trim() : '',
        carrier: has('carrier') && !isBlank(g('carrier')) ? String(g('carrier')).trim() : '',
        wh: has('wh') && !isBlank(g('wh')) ? String(g('wh')).trim() : '',
        weightType: has('weightType') && !isBlank(g('weightType')) ? String(g('weightType')).trim() : '',
        weigher: has('weigher') && !isBlank(g('weigher')) ? String(g('weigher')).trim() : '',
        note: has('note') && !isBlank(g('note')) ? String(g('note')).trim() : '',
        warn: [],
      };
      if (noIdentity) {
        issues.weightOnly.push(row.idx);
        row.warn.push('Dòng chỉ có khối lượng (thiếu biển, số phiếu, ngày — nghi dòng tổng cộng)');
      }
      const nw = pNet.warn || pGross.warn || pTare.warn;
      if (nw) {
        issues.weirdNum.push(row.idx + ' (' + nw + ')');
        row.warn.push(nw);
      }
      // --- thời gian ---
      let d1 = has('datetime1') ? parseDT(g('datetime1'), is1904) : null;
      let dDate = has('date') ? parseDT(g('date'), is1904) : null;
      const base = d1 && d1.hasDate ? d1 : dDate;
      const tIn = has('timeIn') ? parseDT(g('timeIn'), is1904) : d1 && d1.hasTime ? d1 : null;
      const tOut = has('timeOut') ? parseDT(g('timeOut'), is1904) : null;
      let d2 = has('datetime2') ? parseDT(g('datetime2'), is1904) : null;
      if (!base || !base.hasDate) {
        issues.noDate.push(row.idx);
        row.warn.push('Thiếu/sai ngày cân');
        row.ts1 = null;
        row.ts2 = null;
        row.dateStr = '';
        row.time1 = '';
        row.time2 = '';
      } else {
        const p1 = {
          y: base.y,
          m: base.m,
          d: base.d,
          hh: tIn ? tIn.hh : base.hasTime ? base.hh : 0,
          mm: tIn ? tIn.mm : base.hasTime ? base.mm : 0,
          ss: tIn ? tIn.ss : base.hasTime ? base.ss : 0,
        };
        row.ts1 = partsToTs(p1);
        if (p1.hh === 24) {
          issues.badTime24.push(row.idx);
          row.warn.push('Giờ cân 24:00:00 không chuẩn — cần kiểm tra lại ngày cân');
          const normP1 = tsToParts(row.ts1);
          row.dateStr = fmtDate(normP1);
          row.time1 = fmtDateTime(normP1);
        } else {
          row.dateStr = fmtDate(p1);
          row.time1 = fmtDateTime(p1);
        }
        let ts2 = null;
        if (d2 && d2.hasDate) ts2 = partsToTs(d2);
        else if (tOut && tOut.hasTime) {
          ts2 = partsToTs({ y: base.y, m: base.m, d: base.d, hh: tOut.hh, mm: tOut.mm, ss: tOut.ss });
          if (ts2 < row.ts1) ts2 += 86400000; // ra sau nửa đêm
        } else if (d2 && d2.hasTime) {
          ts2 = partsToTs({ y: base.y, m: base.m, d: base.d, hh: d2.hh, mm: d2.mm, ss: d2.ss });
          if (ts2 < row.ts1) ts2 += 86400000;
        }
        row.ts2 = ts2;
        row.time2 = ts2 !== null ? fmtDateTime(tsToParts(ts2)) : '';
      }
      // --- khối lượng (kg) ---
      if (net === null) net = Math.abs(gross - tare);
      if (isCancelledPlate(plate)) {
        cancelled.push({ idx: r + 1 + rowOff, ticket: normTicket(g('ticket')), net });
        continue;
      }
      if (net <= 0) {
        excluded.push({
          idx: row.idx,
          ticket: row.ticket,
          plate,
          net,
          dateStr: row.dateStr,
          ts1: row.ts1,
          time1: row.time1,
          note: row.note,
        });
        issues.nonPos.push(row.idx);
        continue;
      }
      if (net > 200000) {
        issues.hugeWeight.push(row.idx + ' (' + Math.round(net).toLocaleString('vi-VN') + ' kg)');
        row.warn.push('Khối lượng bất thường (> 200 tấn)');
      }
      if (tare !== null && gross !== null) {
        if (tare > gross) {
          issues.swap.push(row.idx);
          row.warn.push('Cân lần 1 (' + tare + ') > cân lần 2 (' + gross + ')');
          if (opts.autoSwap) {
            const t = tare;
            tare = gross;
            gross = t;
            row.swapped = true;
          }
        }
        if (Math.abs(Math.abs(gross - tare) - net) > 1) {
          issues.mismatch.push(row.idx);
          row.warn.push('KL hàng ≠ |lần 2 − lần 1|');
        }
      }
      row.tare = tare;
      row.gross = gross;
      row.net = net;
      // --- biển số bất thường (vd "BO") ---
      if (plate && !PLATE_RE.test(plate)) {
        issues.plate.push(row.idx + ' "' + plate + '"');
        row.warn.push('Biển số bất thường');
      }
      // --- trùng số phiếu ---
      if (row.ticket) {
        if (seenTicket.has(row.ticket)) {
          issues.dupTicket.push(row.idx + ' (trùng dòng ' + seenTicket.get(row.ticket) + ')');
          row.warn.push('Trùng số phiếu');
        } else seenTicket.set(row.ticket, row.idx);
      }
      rows.push(row);
    }
    ds.rows = rows;
    ds.skipped = skipped - issues.noWeight.length; // dòng tiêu đề / chữ ký / trống thật sự
    ds.noWeightRows = issues.noWeight;
    ds.cancelled = cancelled;
    ds.cancelledKg = cancelled.reduce((a, c) => a + c.net, 0);
    ds.excluded = excluded;
    ds.excludedKg = excluded.reduce((a, c) => a + c.net, 0);
    if (!rows.length) {
      ds.errors.push(
        'Không có dòng dữ liệu hợp lệ sau dòng tiêu đề.' +
          (issues.noWeight.length ? ' (' + issues.noWeight.length + ' dòng có biển số/số phiếu nhưng không đọc được khối lượng.)' : '') +
          (excluded.length ? ' (' + excluded.length + ' phiếu có KL ≤ 0 đã loại khỏi tổng.)' : '')
      );
      return ds;
    }

    // ---- Cảnh báo dữ liệu ----
    const lim = (a) => a.slice(0, 8).join(', ') + (a.length > 8 ? ' … (+' + (a.length - 8) + ')' : '');
    if (issues.noWeight.length)
      ds.warnings.push(
        '⚠ ' +
          issues.noWeight.length +
          ' dòng có số phiếu/biển số nhưng không đọc được khối lượng nên CHƯA được nạp (dòng Excel: ' +
          lim(issues.noWeight) +
          ').'
      );
    if (issues.noDate.length)
      ds.warnings.push('⚠ ' + issues.noDate.length + ' dòng thiếu/sai ngày cân (dòng Excel: ' + lim(issues.noDate) + ').');
    if (issues.badTime24.length)
      ds.warnings.push(
        '⚠ ' +
          issues.badTime24.length +
          ' dòng có giờ 24:00:00 không chuẩn — cần kiểm tra lại ngày cân (dòng Excel: ' +
          lim(issues.badTime24) +
          ').'
      );
    if (issues.weightOnly.length)
      ds.warnings.push(
        '⚠ CẢNH BÁO: ' +
          issues.weightOnly.length +
          ' dòng chỉ có khối lượng (không biển số, số phiếu, ngày — nghi dòng tổng cộng không nhãn) ở dòng Excel: ' +
          lim(issues.weightOnly) +
          '.'
      );
    if (issues.weirdNum.length)
      ds.warnings.push(
        '⚠ ' + issues.weirdNum.length + ' dòng có ô số kèm chữ/đơn vị hoặc dấu phân cách bất thường: ' + lim(issues.weirdNum) + '.'
      );
    if (issues.hugeWeight.length)
      ds.warnings.push('⚠ ' + issues.hugeWeight.length + ' dòng có khối lượng bất thường (> 200 tấn): ' + lim(issues.hugeWeight) + '.');
    if (cancelled.length)
      ds.warnings.push(
        '🚫 Đã loại ' +
          cancelled.length +
          ' phiếu "BO" (bỏ cân, xe cân lại phiếu khác) khỏi biên bản — dòng Excel: ' +
          cancelled
            .map((c) => c.idx + (c.ticket ? ' (phiếu ' + c.ticket + ', ' + Math.round(c.net).toLocaleString('vi-VN') + ' kg)' : ''))
            .slice(0, 8)
            .join(', ') +
          (cancelled.length > 8 ? ' …' : '') +
          '.'
      );
    if (issues.swap.length)
      ds.warnings.push(
        '⚠ ' +
          issues.swap.length +
          ' dòng có cân lần 1 > cân lần 2, nghi nhập đảo (dòng Excel: ' +
          lim(issues.swap) +
          ')' +
          (opts.autoSwap
            ? ' — đã tự hoán đổi theo Cài đặt.'
            : ' — giữ nguyên số liệu gốc; bật "Tự hoán đổi" trong Cài đặt nếu muốn sửa tự động.')
      );
    if (issues.mismatch.length)
      ds.warnings.push(
        '⚠ ' + issues.mismatch.length + ' dòng có KL hàng ≠ |cân lần 2 − cân lần 1| (dòng Excel: ' + lim(issues.mismatch) + ').'
      );
    if (excluded.length)
      ds.warnings.push(
        '⚠ ' +
          excluded.length +
          ' phiếu có KL hàng ≤ 0 (' +
          excluded.reduce((a, c) => a + c.net, 0).toLocaleString('en-US') +
          ' kg) đã LOẠI khỏi tổng và biên bản — số phiếu: ' +
          lim(excluded.map((x) => x.ticket || 'dòng ' + x.idx)) +
          ' (dòng Excel: ' +
          lim(issues.nonPos) +
          '). Đối chiếu với file gốc; danh sách nằm ở Báo cáo › Ngoại lệ cần đối soát.'
      );
    if (issues.plate.length)
      ds.warnings.push('⚠ ' + issues.plate.length + ' dòng có biển số bất thường (dòng Excel: ' + lim(issues.plate) + ').');
    if (issues.dupTicket.length)
      ds.warnings.push('⚠ ' + issues.dupTicket.length + ' phiếu bị trùng số phiếu (dòng Excel: ' + lim(issues.dupTicket) + ').');
    ds.issues = issues;

    // ---- Thống kê ----
    ds.stats = computeStats(rows);
    // ---- Đối chiếu với dòng "Tổng số" trong tiêu đề báo cáo ----
    const mt = ds.meta;
    // (đối chiếu tính cả phiếu BO vì tiêu đề báo cáo của phần mềm cân vẫn đếm chúng)
    const allTrips = ds.stats.trips + cancelled.length + excluded.length,
      allKg = ds.stats.kg + ds.cancelledKg + ds.excludedKg;
    if (mt.declaredTrips !== null && mt.declaredTrips !== allTrips)
      ds.warnings.push('⚠ Số xe đọc được (' + allTrips + ') khác "Tổng số" ghi ở tiêu đề báo cáo (' + mt.declaredTrips + ').');
    if (mt.declaredKg !== null && Math.abs(mt.declaredKg - allKg) > 1)
      ds.warnings.push(
        '⚠ Tổng KL đọc được (' +
          allKg.toLocaleString('en-US') +
          ' kg) khác "Tổng KL" ghi ở tiêu đề báo cáo (' +
          mt.declaredKg.toLocaleString('en-US') +
          ' kg).'
      );
    ds.reconciled =
      mt.declaredTrips !== null && mt.declaredTrips === allTrips && mt.declaredKg !== null && Math.abs(mt.declaredKg - allKg) <= 1;
    ds.ok = true;
    return ds;
  }

  /** Biển số "BO" = bỏ cân (không tính vào biên bản). */
  function isCancelledPlate(plate) {
    return !!plate && norm(plate).replace(/[^a-z0-9]/g, '') === 'bo';
  }

  function colName(i) {
    let s = '';
    i++;
    while (i > 0) {
      const m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* ---------------------------------------------------------------
   * Thống kê
   * ------------------------------------------------------------- */
  function computeStats(rows) {
    let kg = 0,
      minTs = Infinity,
      maxTs = -Infinity;
    const plates = new Map(),
      groups = new Map(),
      tickets = new Set();
    rows.forEach((r) => {
      kg += r.net;
      if (r.ts1 !== null) {
        if (r.ts1 < minTs) minTs = r.ts1;
        if (r.ts1 > maxTs) maxTs = r.ts1;
      }
      const pk = plateKey(r.plate);
      let p = plates.get(pk);
      if (!p) {
        p = { plate: r.plate, trips: 0, kg: 0, minTs: Infinity, maxTs: -Infinity };
        plates.set(pk, p);
      }
      p.trips++;
      p.kg += r.net;
      if (r.ts1 !== null) {
        if (r.ts1 < p.minTs) p.minTs = r.ts1;
        if (r.ts1 > p.maxTs) p.maxTs = r.ts1;
      }
      const gk = r.note || '';
      let g = groups.get(gk);
      if (!g) {
        g = { label: gk, trips: 0, kg: 0, minTs: Infinity, maxTs: -Infinity };
        groups.set(gk, g);
      }
      g.trips++;
      g.kg += r.net;
      if (r.ts1 !== null) {
        if (r.ts1 < g.minTs) g.minTs = r.ts1;
        if (r.ts1 > g.maxTs) g.maxTs = r.ts1;
      }
      if (r.ticket) tickets.add(r.ticket);
    });
    const byPlate = Array.from(plates.values()).sort((a, b) => a.plate.localeCompare(b.plate));
    return {
      trips: rows.length,
      kg,
      tons: kg / 1000,
      tickets: tickets.size,
      plates: byPlate.length,
      byPlate,
      groups: Array.from(groups.values()),
      minTs: isFinite(minTs) ? minTs : null,
      maxTs: isFinite(maxTs) ? maxTs : null,
      from: isFinite(minTs) ? fmtDate(tsToParts(minTs)) : '',
      to: isFinite(maxTs) ? fmtDate(tsToParts(maxTs)) : '',
    };
  }

  HAK.Excel = {
    FIELDS,
    RULES,
    readFile,
    readBuffer,
    parseSheet,
    computeStats,
    util: { norm, parseNum, parseNumWarn, parseDT, partsToTs, tsToParts, fmtDate, fmtDateTime, normTicket, plateKey, colName, isBlank },
  };
})(typeof window !== 'undefined' ? window : globalThis);
