/**
 * doc-extract.js — bộ đọc chữ OCR CHỊU LỖI cho chứng thư giám định và hợp đồng (v2.13.0).
 * Chữ OCR thật hay bị: mất dấu, mất khoảng trắng ("MVMCQUEENV.26053HJ", "ngay25/5/2026den ngay30/5/2026"), chèn dấu nháy ("TU'OI"),
 * tách số ("USD17 4.00", "23.789, 17"), nhầm chữ/số ("6,00o"), nhãn và giá trị nằm 2 dòng. Mọi hàm ở đây là hàm thuần (không DOM) → kiểm thử trong Node.
 * Kết quả chỉ là ĐỀ XUẤT: giao diện vẫn cho người dùng đối chiếu với PDF gốc trước khi điền.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const fold = (s) =>
    String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'));
  /** Bỏ dấu nháy lạc ("TU'OI") và nối số bị tách quanh dấu phẩy ("23.789, 17" → "23.789,17"). */
  const tidy = (s) =>
    String(s || '')
      .replace(/[\u2018\u2019\u02bc\u00b4`']/g, '')
      .replace(/(\d)[ \t]*,[ \t]+(\d)/g, '$1,$2')
      .replace(/(\d)[ \t]+,(\d)/g, '$1,$2');
  const iso = (d, m, y) => {
    d = +d;
    m = +m;
    y = +y;
    const t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d
      ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
      : null;
  };
  const lines = (text) =>
    String(text || '')
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);

  /* ---------------- Chứng thư: thời gian giám định → từ ngày / đến ngày ---------------- */
  const DATE = '(\\d{1,2})\\s*[/.\\-]\\s*(\\d{1,2})\\s*[/.\\-]\\s*(\\d{4})';
  function inspectionPeriod(text) {
    const t = fold(tidy(text)).toLowerCase();
    const forms = [
      new RegExp('ngay\\s*' + DATE + '\\s*(?:den|toi)\\s*(?:ngay\\s*)?' + DATE), // Từ ngày 25/5/2026 đến ngày 30/5/2026 (kể cả dính liền, "Tip ngay…")
      new RegExp('from\\s*' + DATE + '\\s*(?:to|until|till|-)\\s*' + DATE), // From 25/5/2026 to 30/5/2026
      new RegExp('(?:inspection|survey|period)[^\\n]{0,40}?' + DATE + '\\s*(?:to|-|until)\\s*' + DATE),
    ];
    for (const re of forms) {
      const m = re.exec(t);
      if (!m) continue;
      const from = iso(m[1], m[2], m[3]),
        to = iso(m[4], m[5], m[6]);
      if (from && to && from <= to) return { from, to, evidence: m[0].replace(/\s+/g, ' ').trim() };
    }
    return null;
  }

  /* ---------------- Tên tàu ---------------- */
  function vessel(text) {
    for (const raw of lines(text)) {
      const f = fold(tidy(raw));
      const lab =
        /(?:^|\s)(?:ten\s*tau|vessel\s*name|vessel|ship\s*name|name\s*of\s*vessel)\s*[:：;]\s*(.+)$/i.exec(f) ||
        /^\s*ten\s*tau\s+(.+)$/i.exec(f);
      if (!lab) continue;
      const val = lab[1].replace(/^[\s:：;.\-]+/, '').trim();
      const m = /^(?:M\s*[/.]?\s*V\.?\s*)?([A-Z0-9][A-Z0-9 ._&-]*?)\s*V\.?\s*(\d{3,6}[A-Z0-9]{0,4})\b/i.exec(val);
      if (m && /[A-Z]/i.test(m[1])) return { value: 'M/V ' + m[1].trim().toUpperCase() + ' V.' + m[2].toUpperCase(), evidence: raw };
      const p = /^(?:M\s*[/.]?\s*V\.?\s*)(.{3,40})$/i.exec(val);
      if (p) return { value: 'M/V ' + p[1].trim().toUpperCase(), evidence: raw };
    }
    return null;
  }

  /* ---------------- Tên hàng ---------------- */
  const WORDS = {
    dam: 'Dăm',
    go: 'gỗ',
    keo: 'keo',
    lai: 'lai',
    tram: 'tràm',
    bach: 'bạch',
    dan: 'đàn',
    cao: 'cao',
    su: 'su',
    rung: 'rừng',
    trong: 'trồng',
  };
  function niceProduct(value) {
    const toks = String(value).trim().replace(/\s+/g, ' ').split(' ');
    const out = toks.map((tok, i) => {
      const k = fold(tok).toLowerCase();
      if (/^(pefc|fsc|cs|non|vn|iwc)$/.test(k)) return tok.toUpperCase();
      if (/^(controlled|sources?|certified)$/.test(k)) return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
      const hasMarks = /[^\u0000-\u007f]/.test(tok);
      return hasMarks ? tok.toLowerCase() : WORDS[k] || tok.toLowerCase();
    });
    out[0] = out[0].charAt(0).toUpperCase() + out[0].slice(1);
    return out.join(' ');
  }
  function product(text) {
    for (const raw of lines(text)) {
      const f = fold(raw);
      const m = /^\s*(?:ten\s*hang(?:\s*hoa)?|commodity|product|goods?\s*name|description\s*of\s*goods?)\s*[:：;]?\s*(.+)$/i.exec(f);
      if (!m) continue;
      const val = raw
        .slice(Math.max(0, raw.length - m[1].length))
        .replace(/^[\s:：;.\-]+/, '')
        .replace(/\s*\(["“]?Product["”]?\).*$/i, '')
        .trim();
      if (val.length < 3 || /^\d/.test(val)) continue;
      return { value: niceProduct(val), evidence: raw };
    }
    return null;
  }

  /* ---------------- Địa chỉ ---------------- */
  const STOP =
    /^\s*(?:ten\s*hang|khoi\s*luong|ten\s*tau|cang\s|ngay\s|so\s*[:：]|ket\s*qua|nguoi\s|ben\s|vessel|port|date|product|quantity|price|seller|buyer|attn|tel|dien\s*thoai|ma\s*s[o06]\s*thue|tax)/i;
  /** Nối lại các từ địa chỉ bị dính ("80RAFFLESPLACE,NO.50-01UOBPLAZA1" → "80 RAFFLES PLACE, NO.50-01 UOB PLAZA 1"). */
  function respace(s) {
    return String(s)
      .replace(/(\d)([A-Za-z]{2,})/g, '$1 $2')
      .replace(/([A-Za-z]{3,})(\d)/g, '$1 $2')
      .replace(/([A-Z]{3,})(PLACE|PLAZA|ROAD|STREET|TOWER|BUILDING|AVENUE)\b/g, '$1 $2')
      .replace(/,(?=\S)/g, ', ')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .replace(/[,\s]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  /** Địa chỉ = các dòng ngay dưới dòng tên (tối đa 3 dòng, dừng ở dòng có nhãn khác). */
  function addressAfter(arr, index, max) {
    const out = [];
    for (let i = index + 1; i < arr.length && out.length < (max || 3); i++) {
      const t = arr[i].trim();
      if (!t) continue;
      const f = fold(t).replace(/^[-•*\s]+/, ''); // gạch đầu dòng "- Dien thoai: …"
      if (STOP.test(f) || /^[a-z' ]{3,32}\s*[:：]/i.test(f)) break;
      if (t.split(/\s+/).length >= 4 && /\b(?:the|and|have|has|entered|whereby|agrees?|parties|shall|will|this|hereby)\b/i.test(f)) break; // câu văn của hợp đồng, không phải địa chỉ
      out.push(t);
    }
    return respace(out.join(', '));
  }
  /** Địa chỉ nằm cùng khối với nhãn "Buyer's Address:" / "Địa chỉ:" (hợp đồng). arr = các dòng của khối. */
  function addressLabelled(arr) {
    for (let i = 0; i < arr.length; i++) {
      const f = fold(arr[i]);
      const m = /(?:seller'?s?\s*address|buyer'?s?\s*address|address|dia\s*chi|d\/c)\s*[:：]\s*(.*)$/i.exec(f);
      if (!m) continue;
      const first = arr[i].slice(arr[i].length - m[1].length).trim();
      const rest = addressAfter(arr, i, 3);
      return respace([first, rest].filter(Boolean).join(', '));
    }
    return '';
  }

  /** Tên công ty bị OCR làm dính chữ ("INTERNATIONALWOODCHIP CORPORATION PTELTD") → tách lại các từ quen thuộc. */
  const tidyName = (n) =>
    String(n)
      .replace(/PTELTD\b/i, 'PTE LTD')
      .replace(/([A-Z]{4,})(WOODCHIP|CORPORATION|COMPANY|LIMITED|TRADING|INDUSTRIAL)\b/g, '$1 $2')
      .replace(/\bCOLTD\b/i, 'CO., LTD')
      .replace(/\s{2,}/g, ' ')
      .trim();
  /** Bên giao / bên nhận trên chứng thư, kèm địa chỉ. Trả về { deliverId:{name,address,page,evidence}, receiverId:{…} }. */
  function certificateParties(pages) {
    const arr = [];
    (pages || []).forEach((p) =>
      tidy(p.rowsText || p.text || '')
        .split(/\r?\n/)
        .forEach((t) => {
          if (t.trim()) arr.push({ text: t.trim(), page: p.page });
        })
    );
    const result = {},
      plain = arr.map((x) => x.text);
    const roles = [
      ['deliverId', /(?:ng.{1,6}i\s*xuat\s*kh|ben\s*giao|shipper|exporter)[^:：]{0,3}[:：]?/],
      ['receiverId', /(?:ng.{1,6}i\s*mua\s*hang|ben\s*nhan|buyer|consignee)\s*[:：]?/],
    ];
    for (const [role, label] of roles) {
      const at = arr.findIndex((l) => {
        const f = fold(l.text).toLowerCase();
        return (
          (label.test(f) && /(?:cong\s*ty|ty\s*tnhh|company|corporation|co\.|ltd)/.test(f.replace(/\s+/g, ' '))) ||
          (label.test(f) && /(?:woodchip|pte)/.test(f.replace(/\s+/g, '')))
        );
      });
      if (at < 0) continue;
      const f = fold(arr[at].text),
        m = label.exec(f.toLowerCase());
      const name = tidyName(
        arr[at].text
          .slice(m.index + m[0].length)
          .replace(/^[\s:：]+/, '')
          .trim()
      );
      result[role] = { name, address: addressAfter(plain, at, 3), page: arr[at].page, evidence: arr[at].text };
    }
    return result;
  }

  /* ---------------- Đơn giá ---------------- */
  const BAD_PRICE =
    /(?:phi|fee|commission|tai khoan|account|penalt|demurrage|despatch|dispatch|shall|apply|not fully|discount|deduct|incentive|inspection|rate of|surcharge|less than|per day|dead ?freight|bank|swift|gmt)/i;
  /** "USD17 4.00" (OCR tách chữ số) → "USD174.00". */
  const gluePrice = (s) => s.replace(/(USD|US\s*\$|VND|\$)\s*(\d{2,3})[ \u00a0](\d{1,2}[.,]\d{2})(?!\d)/i, '$1$2$3');
  const UNIT = '(?:per|\\/)\\s*(?:bone\\s*dry\\s*)?(?:metric\\s*)?(?:tons?|tonnes?|bdmt|mt)\\b';
  /** Giá hàng (USD/VND mỗi BDMT) — lấy dòng có nhãn giá, hoặc có "per bone dry metric ton"; cho phép giá nằm ở dòng kế tiếp nhãn. null nếu mơ hồ. */
  function price(source, number) {
    const arr = String(source || '')
      .split('\n')
      .map((x) => x.replace(/\u00a0/g, ' '));
    const cands = [];
    const money = '(USD|US\\s*\\$|VND|VN[DĐ]|EUR|JPY|CNY|\\$)',
      amt = '([0-9]+(?:[.,][0-9O]+)*(?:[ \\u00a0][0-9]{3})*)';
    const label = /(?:gia\s+(?:dam|go|ban|hang)|don\s*gia|unit\s*price|price\s*of\s*product|price\s*:|\bprice\b)/i;
    const perUnit = new RegExp(UNIT, 'i');
    const tryLine = (rawLine, evidenceLine, needLabel) => {
      const line = gluePrice(fold(rawLine));
      if (BAD_PRICE.test(line)) return;
      const lab = label.test(line),
        per = perUnit.test(line);
      if (needLabel ? !(lab || per) : !per) return;
      const after = new RegExp(amt + '\\s*' + money + '(?=\\s|/|$|[-.,])', 'i').exec(line);
      const before = after ? null : new RegExp(money + '\\s*' + amt, 'i').exec(line);
      if (!after && !before) return;
      const value = number((after ? after[1] : before[2]).replace(/O/g, '0'));
      const cur0 = (after ? after[2] : before[1]).toUpperCase().replace(/\s/g, '');
      const currency = /^(?:USD|US\$|\$)$/.test(cur0) ? 'USD' : /^VN/.test(cur0) ? 'VND' : cur0;
      if (Number.isFinite(value) && value > 0) cands.push({ value, currency, evidence: evidenceLine.trim() });
    };
    for (let i = 0; i < arr.length; i++) {
      const f = fold(arr[i]);
      tryLine(arr[i], arr[i], true);
      // Nhãn "Price of Product" ở 1 dòng, số tiền ở dòng kế tiếp (OCR tách hàng)
      if (label.test(f) && !/\d/.test(f) && arr[i + 1]) tryLine(arr[i] + ' ' + arr[i + 1], arr[i] + ' ' + arr[i + 1], true);
    }
    const distinct = cands.filter((c, i) => cands.findIndex((x) => x.value === c.value && x.currency === c.currency) === i);
    return distinct.length === 1 && ['USD', 'VND'].includes(distinct[0].currency) ? distinct[0] : null;
  }

  /* ---------------- Khối lượng hợp đồng (BDMT) ---------------- */
  const BDMT = 'B[D0O]M[TI1l]';
  const NOT_QTY = /(?:reach|kg\s*\/|per\s|usd|\/\s*bdmt|inspection|pdi|toler|deduct|volume|shall|minimum|maximum|threshold|=)/i;
  /** Khối lượng BDMT dự phòng khi không có dòng "Số lượng / Quantity": các số ≥ 1.000 đứng trước BDMT, bỏ ngữ cảnh điều kiện kỹ thuật. */
  function quantityFallback(textLines, number) {
    const out = [],
      re = new RegExp('(\\d{1,3}(?:[.,][0-9Oo]{3})+(?:[.,][0-9Oo]{1,2})?|\\d{4,6}(?:[.,]\\d{1,2})?)[.,]?\\s*' + BDMT + '\\b', 'gi');
    for (const l of textLines) {
      const f = fold(l.text);
      if (NOT_QTY.test(f) || /&|shipment is to be loaded|million|dwt/.test(f) || (l.page && l.page > 2)) continue;
      let m;
      while ((m = re.exec(l.text))) {
        const qty = number(m[1].replace(/[Oo]/g, '0'));
        if (Number.isFinite(qty) && qty >= 1000 && !out.some((x) => x.qty === qty))
          out.push({ qty, unit: 'BDMT', evidence: l.text, page: l.page });
      }
    }
    return out.slice(0, 4);
  }

  HAK.DocExtract = {
    fold,
    tidy,
    tidyName,
    iso,
    inspectionPeriod,
    vessel,
    product,
    niceProduct,
    respace,
    addressAfter,
    addressLabelled,
    certificateParties,
    price,
    quantityFallback,
    BDMT,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = HAK.DocExtract;
})(typeof window !== 'undefined' ? window : globalThis);
