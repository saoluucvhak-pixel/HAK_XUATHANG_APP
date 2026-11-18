/**
 * customs-parser.js — đọc tờ khai hải quan (file .xls/.xlsx "Bản xác nhận nội dung tờ khai" của VNACCS, hoặc chữ OCR của bản in)
 * và giấy nộp tiền vào ngân sách nhà nước (mẫu C1-02/NS, chữ OCR từ ảnh chụp / PDF). Hàm thuần → kiểm thử trong Node.
 * Kết quả chỉ là ĐỀ XUẤT: giao diện cho người dùng đối chiếu bản gốc trước khi lưu.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const fold = (s) =>
    String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
      .toLowerCase();
  const clean = (s) =>
    String(s == null ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const empty = (s) => {
    const t = clean(s);
    return !t || /^[-\/.:]+$/.test(t.replace(/\s/g, ''));
  };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d, m, y) => {
    d = +d;
    m = +m;
    y = +y;
    if (y < 100) y += 2000;
    const t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? y + '-' + pad(m) + '-' + pad(d) : '';
  };
  /** "11/06/2026 16:24:27" → "2026-06-11". */
  const dmy = (s) => {
    const m = /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/.exec(String(s || ''));
    return m ? iso(m[1], m[2], m[3]) : '';
  };
  /** Số theo kiểu hải quan Việt: "1.078.598,4" · "27.584.832.000" · "551696640" · "6.000". */
  function vn(s) {
    const raw = String(s == null ? '' : s);
    let t = raw.replace(/[^\d.,\-]/g, '');
    if (!/\d/.test(t)) return null;
    if (/^-?0\.\d+$/.test(t)) return Number(t); // "0.500" luôn là số thập phân (không có nhóm nghìn nào bắt đầu bằng 0)
    if (/^-?\d+$/.test(t)) return Number(t);
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
    if (/^-?\d+,\d+$/.test(t)) return Number(t.replace(',', '.'));
    if (/^-?\d+\.\d+$/.test(t)) return Number(t);
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  const vessel = (s) => {
    const t = clean(s).replace(/^M\s*\/?\s*V\.?\s*/i, '');
    return t ? 'M/V ' + t.toUpperCase() : '';
  };

  /** rows: mảng các dòng, mỗi dòng là mảng ô. Từ chữ OCR: mỗi dòng tách ở " : " (rowsText của HAKDocs). */
  const rowsFromText = (text) =>
    String(text || '')
      .split(/\r?\n/)
      .map((l) => l.split(/\s:\s|\t|\s{3,}/))
      .filter((r) => r.some((c) => clean(c)));

  function reader(rows) {
    const cells = rows.map((r) => (r || []).map((c) => clean(c)));
    const folded = cells.map((r) => r.map(fold));
    /** Ô đầu tiên khớp `re` (trên chữ đã bỏ dấu); trả {r, j, rest}. */
    function find(re, from) {
      for (let r = from || 0; r < cells.length; r++)
        for (let j = 0; j < cells[r].length; j++) {
          const m = re.exec(folded[r][j]);
          if (m) return { r, j, rest: cells[r][j].slice(m.index + m[0].length).replace(/^[\s:：]+/, '') };
        }
      return null;
    }
    /** Các ô có giá trị sau ô nhãn (cùng dòng), bỏ ô rỗng / "-"; phần còn lại trong chính ô nhãn (OCR) đứng đầu. */
    function after(hit) {
      if (!hit) return [];
      const out = [];
      if (!empty(hit.rest)) out.push(hit.rest);
      for (let j = hit.j + 1; j < cells[hit.r].length; j++) if (!empty(cells[hit.r][j])) out.push(cells[hit.r][j]);
      return out;
    }
    const first = (re, from) => {
      const v = after(find(re, from));
      return v.length ? v[0] : '';
    };
    /** Giá trị của dòng "Tên" nằm dưới tiêu đề một bên (Người xuất khẩu / nhập khẩu / ủy thác). */
    function party(re) {
      const h = find(re);
      if (!h) return '';
      for (let r = h.r + 1; r < Math.min(cells.length, h.r + 9); r++) {
        if (folded[r].some((c) => /^nguoi (xuat|nhap|uy thac)/.test(c))) break;
        const k = folded[r].findIndex((c) => c === 'ten');
        if (k >= 0) {
          const v = cells[r].slice(k + 1).find((c) => !empty(c));
          return v || '';
        }
      }
      return '';
    }
    return { cells, folded, find, after, first, party };
  }

  function parseDeclarationRows(rows) {
    const R = reader(rows),
      out = { warnings: [] };
    const no = R.first(/^so to khai$/);
    out.no = (/\d{8,}/.exec(no.replace(/\s/g, '')) || [''])[0];
    const firstNo = R.first(/^so to khai dau tien$/);
    out.firstNo = (/\d{8,}/.exec(firstNo.replace(/\s/g, '')) || [''])[0];
    out.openDate = dmy(R.first(/^ngay dang ky$/));
    out.changedAt = dmy(R.first(/^ngay thay doi dang ky$/));
    out.type = (/\b([A-Z]\d{2})\b/.exec(R.first(/^ma loai hinh$/)) || [])[1] || '';
    out.office = R.first(/^ten co quan hai quan tiep nhan to khai$/);
    out.exporter = R.party(/^nguoi xuat khau$/);
    out.trustee = R.party(/^nguoi uy thac xuat khau$/);
    out.importer = R.party(/^nguoi nhap khau$/);
    out.bill = R.first(/^so van don$/);
    const vh = R.after(R.find(/^phuong tien van chuyen/)).filter((c) => /[a-z]/i.test(c));
    out.ship = vessel(vh[vh.length - 1] || '');
    out.shipDate = dmy(R.first(/^ngay hang di du kien$/));
    const inv = R.after(R.find(/^so hoa don$/)).filter((c) => !/^[-A]$/.test(c));
    out.invoiceNo = inv[inv.length - 1] || '';
    const money1 = (re) => {
      const v = R.after(R.find(re))
        .map((c) => (/^[\d.,]+$/.test(c.replace(/\s/g, '')) ? vn(c) : null))
        .filter((x) => x !== null && x > 0);
      return v.length ? v[0] : null;
    };
    out.invoiceUsd = money1(/^tong tri gia hoa don$/);
    out.taxableVnd = money1(/^tong tri gia tinh thue$/);
    const rate = R.after(R.find(/^ty gia tinh thue$/))
      .map((c) => (/\d/.test(c) && !/^usd$/i.test(c) ? vn(c.replace(/^[\s\-]+/, '')) : null))
      .filter((x) => x);
    out.exchangeRate = rate.length ? rate[0] : null;
    out.taxVnd = money1(/^tong so tien thue xuat khau$/);
    if (out.taxVnd === null) out.taxVnd = money1(/^so tien thue$/);
    out.goods = R.first(/^mo ta hang hoa$/)
      .split('#&')[0]
      .replace(/[,\s]+$/, '');
    out.hs = (/\d{8,10}/.exec(R.first(/^ma so hang hoa$/)) || [''])[0];
    for (const re of [/^so luong \(1\)$/, /^so luong \(2\)$/]) {
      const v = R.after(R.find(re)),
        n = v.length ? vn(v[0]) : null,
        unit = (v[1] || '').replace(/[^A-Za-z]/g, '').toUpperCase();
      if (n === null) continue;
      if (/^(MDW|BDMT|MTK|MT)$/.test(unit) && out.qtyBdmt == null) out.qtyBdmt = n;
      else if (/^(TNE|TON|TONS)$/.test(unit) && out.qtyTon == null) out.qtyTon = n;
    }
    const up = R.after(R.find(/^don gia hoa don$/));
    out.unitPrice = up.length ? vn(up[0]) : null;
    const tr = R.first(/^thue suat$/);
    out.taxRate = tr ? vn(tr.replace('%', '')) : null;
    out.note = R.first(/^phan ghi chu$/);
    const marks = (R.first(/^ky hieu va so hieu$/) + ' ' + out.note)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'D')
      .toUpperCase();
    out.certNo = (/CHUNG\s*THU[^:]{0,40}?SO\s*:?\s*([A-Z0-9][A-Z0-9\-]{5,})/.exec(marks) || [])[1] || '';
    out.relatedNo = (/\bTK\s*:?\s*(\d{12})/.exec(marks) || [])[1] || '';
    out.round = 1;
    // Quyết định nghiệp vụ mục 28: CHƯA đọc ngoặc là số âm ở tờ khai — chỉ cảnh báo để người dùng đối chiếu file gốc.
    const paren = [];
    rows.forEach((row, ri) =>
      (row || []).forEach((c) => {
        if (typeof c === 'string' && /^\(\s*\d[\d.,\s]*\)$/.test(c.trim()) && paren.length < 5)
          paren.push('dòng ' + (ri + 1) + ' "' + c.trim() + '"');
      })
    );
    if (paren.length)
      out.warnings.push(
        'Có ô số dạng ngoặc (' + paren.join('; ') + '): app KHÔNG đọc ngoặc là số âm — kiểm tra lại số liệu trên file gốc.'
      );
    if (!out.no) out.warnings.push('Chưa đọc được SỐ TỜ KHAI.');
    if (out.taxVnd === null) out.warnings.push('Chưa đọc được TỔNG SỐ TIỀN THUẾ XUẤT KHẨU.');
    if (!out.openDate) out.warnings.push('Chưa đọc được NGÀY ĐĂNG KÝ (ngày mở tờ khai).');
    return out;
  }

  /** Chữ OCR của tờ khai in: đọc theo ô như file Excel, rồi bù các trường còn thiếu bằng mẫu chữ trên toàn văn. */
  function parseDeclarationText(text) {
    const out = parseDeclarationRows(rowsFromText(text)),
      t = fold(text).replace(/\s+/g, ' ');
    if (!out.no) {
      const m = /so to khai\s*:?\s*(\d[\d ]{10,14}\d)/.exec(t);
      if (m) out.no = m[1].replace(/\s/g, '').slice(0, 12);
    }
    if (!out.openDate) {
      const m = /ngay dang ky\s*:?\s*(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4})/.exec(t);
      if (m) out.openDate = dmy(m[1]);
    }
    if (out.taxVnd === null) {
      const m = /tong so tien thue xuat khau\s*:?\s*([\d.,]+)/.exec(t);
      if (m) out.taxVnd = vn(m[1]);
    }
    if (!out.type) {
      const m = /ma loai hinh\s*:?\s*([a-z]\d{2})\b/.exec(t);
      if (m) out.type = m[1].toUpperCase();
    }
    out.warnings = out.warnings.filter((w) =>
      /SỐ TỜ KHAI/.test(w) ? !out.no : /TỔNG SỐ TIỀN THUẾ/.test(w) ? out.taxVnd === null : /NGÀY ĐĂNG KÝ/.test(w) ? !out.openDate : true
    );
    return out;
  }

  /* ---------------- Giấy nộp tiền vào NSNN (mẫu C1-02/NS, cả mẫu cũ lẫn mẫu mới có "Mã hiệu / Số tham chiếu") ---------------- */
  /** Dãy 12 chữ số bị OCR tách bằng khoảng trắng ("3086 2970 1720") → nối lại. */
  function declNumbers(line) {
    const found = [],
      add = (d, at, end, fuzzy) => {
        if (d.length >= 11 && d.length <= 13 && !found.some((x) => x.no === d))
          found.push({ no: d, at, end, fuzzy: !!fuzzy || d.length !== 12 });
      };
    const f = fold(line),
      lab = /(?:to\s*khai|\btk\b|\bhq\b)(?:[^0-9]|\(\d\)){0,30}?((?:[0-9olisb][\s.,\-]?){10,16}[0-9olisb])/g;
    let m;
    while ((m = lab.exec(f))) {
      // "Tờ khai số: 3088 4709 1251", "TK 308.847.091.251", chữ O/l/S/B bị OCR nhầm thành số
      const raw = m[1].replace(/[^0-9olisb]/g, '');
      if (raw.replace(/\D/g, '').length < 9) continue;
      add(
        raw.replace(/o/g, '0').replace(/[il]/g, '1').replace(/s/g, '5').replace(/b/g, '8'),
        m.index,
        m.index + m[0].length,
        /[olisb]/.test(raw)
      );
    }
    const re = /(?<![\d.,])(?:\d{12}|\d{4} \d{4} \d{4})(?![\d.,]\d)(?!\d)/g;
    while ((m = re.exec(line))) add(m[0].replace(/\s/g, ''), m.index, m.index + m[0].length, false);
    found.sort((x, y) => (x.fuzzy ? 1 : 0) - (y.fuzzy ? 1 : 0)); // số đủ 12 chữ số đứng trước số nghi ngờ
    return found;
  }
  const isMoney = (t) => /^\d{1,3}(\.\d{3})+$/.test(t) || /^\d{5,11}$/.test(t);
  /** Một dòng của bảng: nhiều ô cách nhau " : " hoặc khoảng trắng; số tiền là ô có dấu "." nghìn (hoặc ≥ 5 chữ số). */
  function tableLine(line) {
    const words = String(line)
        .split(/[\s:：|]+/)
        .filter(Boolean),
      clean1 = (w) => w.replace(/đ$/i, '');
    const idx = [];
    words.forEach((w, i) => {
      if (isMoney(clean1(w))) idx.push(i);
    });
    if (!idx.length) return null;
    const after = words.slice(idx[idx.length - 1] + 1).map((w) => w.replace(/[^\dA-Za-z]/g, ''));
    return {
      amount: vn(clean1(words[idx[idx.length - 1]])),
      content: clean(
        words
          .slice(0, idx[0])
          .filter((w) => /[a-z]/i.test(fold(w)) && !/\d/.test(w))
          .join(' ')
      ),
      chapter: after.find((w) => /^\d{3}$/.test(w)) || '',
      ndkt: after.find((w) => /^\d{4}$/.test(w)) || '',
      dbhc: after.find((w) => /^\d{2}[A-Za-z]{3}$/.test(w)) || '',
      date: dmy(line),
    };
  }
  function parseReceiptText(text, alt) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(clean)
        .filter(Boolean),
      flat = lines.map(fold).join('\n'),
      flatSp = flat.replace(/\s*[:：]\s*(?=\S)/g, ': ');
    const out = {
      receiptNo: '',
      formCode: '',
      refNo: '',
      date: '',
      payer: '',
      agent: '',
      payerTax: '',
      lines: [],
      total: null,
      warnings: [],
    };
    // Số tham chiếu (20 chữ số, có thể bị tách khoảng trắng) · Mã hiệu · Số giấy nộp tiền
    const ref = /so\s*tham\s*chieu\s*[:：]*\s*(\d[\d ]{8,30}\d)/.exec(flatSp);
    if (ref) out.refNo = ref[1].replace(/\s/g, '');
    const form = /ma\s*hieu\s*[:：]*\s*([a-z0-9]{6,14})\b/.exec(flatSp);
    if (form) out.formCode = form[1].toUpperCase();
    const no = /(?:^|[\s|])so\s*(?:[:：]\s*)+([a-z]{0,3}\d{4,10}(?:\s?\/\s?\d{2})?)(?![\d\/])/.exec(flatSp);
    if (no) out.receiptNo = no[1].replace(/\s/g, '').toUpperCase();
    const dt = /ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/.exec(flat);
    if (dt) out.date = iso(dt[1], dt[2], dt[3]);
    // Người nộp thuế / người nộp thay: nhãn có thể thiếu dấu ":", sai chính tả, hoặc tên nằm ở dòng kế
    const after = (re) => {
      for (let i = 0; i < lines.length; i++) {
        const f = fold(lines[i]),
          m = re.exec(f);
        if (!m) continue;
        let rest = lines[i].slice(m.index + m[0].length),
          fr = f.slice(m.index + m[0].length);
        if (!/[a-z]{3}/.test(fr) && lines[i + 1]) {
          rest = lines[i + 1];
          fr = fold(rest);
        }
        const cut = /\s*(?:[:：|]\s*)?(?:ma\s*so\s*thue|dia\s*chi|nguoi\s*nop\s*thay|de\s*nghi)\b/.exec(fr);
        if (cut) rest = rest.slice(0, cut.index);
        rest = clean(
          rest
            .replace(/^[\s:：.\-]+/, '')
            .replace(/[\s:：.|\-]+$/, '')
            .replace(/\s*[:：|].*$/, '')
        );
        if (/[a-z]{3}/i.test(fold(rest)) && !/^(ma|dia|\.+)/.test(fold(rest))) return rest;
      }
      return '';
    };
    out.payer = after(/n\w{3,5}\s*nop\s*thue\b/) || after(/\bnsnn\s*[:：]/) || after(/doi\s*tuong\s*nop[^:：]{0,20}/);
    if (!out.payer) {
      const l = lines.find(
        (x) =>
          /\b(cong\s*ty|tnhh|cty|doanh\s*nghiep)\b/.test(fold(x)) &&
          !/(hai\s*quan|kho\s*bac|ngan\s*hang|phat\s*trien|dau\s*tu|giao\s*dich)/.test(fold(x))
      );
      if (l) {
        const f = fold(l),
          at = f.search(/\b(?:cong\s*ty|cty|doanh\s*nghiep|tnhh)\b/);
        out.payer = clean(l.slice(at).replace(/\s*[:：|].*$/, ''));
      }
    }
    out.agent = after(/n\w{3,5}\s*nop\s*thay\b/);
    const mst = /ma\s*so\s*thue\s*[:：]*\s*(\d[\d ]{8,13}\d)/.exec(flatSp);
    if (mst) out.payerTax = mst[1].replace(/\s/g, '');
    const totalLine = lines.find((l) => /tong\s*cong/.test(fold(l))),
      tl = totalLine ? tableLine(totalLine.replace(/^.*?tong\s*cong/i, '')) : null;
    if (tl) out.total = tl.amount;
    const kind = (s) => (/le\s*phi/.test(fold(s)) ? 'fee' : 'tax');
    // Số tờ khai duy nhất xuất hiện trong giấy (bỏ dòng "Số tham chiếu") → dùng cho dòng nộp không ghi số tờ khai
    const nos = [],
      info = {},
      fuzzy = {},
      scan = lines.concat(
        String(alt || '')
          .split(/\r?\n/)
          .map(clean)
          .filter(Boolean)
      ); // chữ OCR thuần (không ghép cột) chỉ dùng để tìm số tờ khai
    scan.forEach((l) => {
      if (/tham\s*chieu/.test(fold(l))) return;
      declNumbers(l).forEach((d) => {
        if (nos.indexOf(d.no) < 0) {
          nos.push(d.no);
          fuzzy[d.no] = d.fuzzy;
        }
        const f = fold(l),
          t = /loai\s*hinh[^:：]*[:：]\s*([a-z]\d{2})\b/.exec(f);
        if (/to\s*khai/.test(f) && dmy(l)) info[d.no] = { date: dmy(l), type: t ? t[1].toUpperCase() : '' };
      });
    }); // "Tờ khai HQ số(1): N ngày: 11/06/2026 Loại hình XNK(1): B11"
    lines.forEach((l) => {
      const f = fold(l);
      if (/tong\s*cong|tham\s*chieu|ma\s*so\s*thue|so\s*tien\s*ghi\s*bang/.test(f)) return;
      if (!/(thue|le\s*phi|phi\b)/.test(f)) return;
      const t = tableLine(l);
      if (!t || t.amount === null) return;
      const ds = declNumbers(l),
        content = t.content.replace(/^\d+\s+/, '') || (kind(l) === 'fee' ? 'Lệ phí' : 'Thuế xuất khẩu');
      const dup = out.lines.some((x) => x.amount === t.amount && x.kind === kind(l) && (x.no || '') === (ds.length ? ds[0].no : '')); // cùng dòng đọc lại ở lượt OCR thứ hai
      if (dup) return;
      out.lines.push({
        no: ds.length ? ds[0].no : '',
        noFuzzy: ds.length ? ds[0].fuzzy : false,
        declDate: '',
        declType: '',
        amount: t.amount,
        kind: kind(l),
        content,
        periodDate: t.date,
        chapter: t.chapter,
        ndkt: t.ndkt,
        dbhc: t.dbhc,
      });
    });
    // Dạng "Tờ khai HQ số(1): 308629701720 …" + dòng "Thuế xuất khẩu … 551.696.640 đ" (không có số tờ khai trên dòng nộp) → gán số tờ khai duy nhất
    out.lines.forEach((x) => {
      if (!x.no && nos.length === 1) {
        x.no = nos[0];
        x.noFuzzy = !!fuzzy[x.no];
      }
    });
    out.lines.forEach((x) => {
      const i = info[x.no];
      if (i) {
        x.declDate = i.date;
        x.declType = i.type;
      }
    });
    if (!out.lines.length && out.total !== null)
      out.lines.push({
        no: nos.length === 1 ? nos[0] : '',
        declDate: '',
        declType: '',
        amount: out.total,
        kind: 'tax',
        content: 'Thuế xuất khẩu',
        periodDate: '',
        chapter: '',
        ndkt: '',
        dbhc: '',
      });
    if (out.total === null && out.lines.length) out.total = out.lines.reduce((a, x) => a + x.amount, 0);
    if (!out.receiptNo) out.warnings.push('Chưa đọc được SỐ giấy nộp tiền (góc trên bên phải, ô "Số:"). Nhập tay theo giấy gốc.');
    if (!out.date) out.warnings.push('Chưa đọc được ngày nộp tiền.');
    if (!out.lines.length) out.warnings.push('Chưa đọc được dòng nộp nào (nội dung + số tiền). Nhập tay sau khi đối chiếu ảnh gốc.');
    else if (out.total !== null && Math.abs(out.lines.reduce((a, x) => a + x.amount, 0) - out.total) > 0.5)
      out.warnings.push('Tổng các dòng khác "Tổng cộng" trên giấy — kiểm tra lại số tiền.');
    return out;
  }
  HAK.CustomsParser = { parseDeclarationRows, parseDeclarationText, parseReceiptText, rowsFromText, vn, dmy, fold };
  if (typeof module === 'object' && module.exports) module.exports = HAK.CustomsParser;
})(typeof window !== 'undefined' ? window : globalThis);
