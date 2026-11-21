(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const fold = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase();
  function amount(s) {
    s = s.replace(/[oO]/g, '0').replace(/\s/g, '');
    if (s.includes(',') && s.includes('.'))
      return Number(s.replace(s.lastIndexOf(',') > s.lastIndexOf('.') ? /\./g : /,/g, '').replace(',', '.'));
    if (/^[1-9]\d{0,2}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
    return Number(s.replace(',', '.'));
  }
  function extract(input) {
    const pages = typeof input === 'string' ? [{ page: 1, text: input }] : input;
    const lines = pages.flatMap((p) => p.text.split(/\r?\n/).map((text) => ({ text: text.trim(), page: p.page }))).filter((x) => x.text);
    const parties = {},
      lots = [];
    let product = '';
    const company = (line) =>
      /^(?:c[o06]ng\s*ty|cty)\b/.test(fold(line)) || /\b(?:company limited|corporation pte\.? ltd\.?|co\.,?\s*ltd\.?)\b/i.test(line);
    const companies = lines.map((l, i) => ({ line: l, index: i })).filter((x) => company(x.line.text));
    const agency = lines.some((l) => /ben.*thac|hop dong.*thac.*xuat/.test(fold(l.text)));
    function party(role, candidate) {
      if (!candidate || parties[role]) return;
      let name = candidate.line.text;
      const foreign = /((?:INTERNATIONAL|[A-Z][A-Z &'-]+)\s+(?:WOODCHIP\s+)?CORPORATION PTE LTD)/.exec(name);
      if (role === 'buyer' && foreign) name = foreign[1];
      const cut = fold(name).search(/,\s*(?:cong ty|mot cong ty|met cong ty)/);
      if (cut >= 0) name = name.slice(0, cut);
      const end = companies.find((x) => x.index > candidate.index);
      const block = lines.slice(candidate.index, Math.min(end ? end.index : lines.length, candidate.index + 16));
      let tax = '';
      for (const l of block) {
        const m = /(?:ma s[oe6] thue|tax code)\s*[:：]?\s*(\d{10}(?:-\d{3})?)/.exec(fold(l.text));
        if (m) {
          tax = m[1];
          break;
        }
      }
      const address = HAK.DocExtract ? HAK.DocExtract.addressLabelled(block.map((l) => l.text)) : '';
      parties[role] = { name, tax, address, evidence: candidate.line.text, page: candidate.line.page };
    }
    if (agency) {
      const principalHeader = lines.findIndex((l) => /^ben\s*(?!nh)\w*\s*thac/.test(fold(l.text)));
      const exporterHeader = lines.findIndex((l) => /^ben\s*nh.*thac/.test(fold(l.text)));
      party(
        'principal',
        companies.find((x) => x.index > principalHeader && principalHeader >= 0)
      );
      party(
        'exporter',
        companies.find((x) => x.index > exporterHeader && exporterHeader >= 0)
      );
      const buyer = companies.find(
        (x) =>
          /\b(?:corporation|pte|international|co\.,)/i.test(x.line.text) && (!parties.exporter || x.line.text !== parties.exporter.name)
      );
      party('buyer', buyer);
    } else {
      // Purchase order: tiêu đề "BUYER" / "SELLER" (kèm chữ Hán bị OCR thành rác) rồi tới tên công ty; "END USER" không phải bên mua.
      const header = (re) => lines.findIndex((l) => re.test(l.text)),
        hb = header(/^buyer\b(?:[^A-Za-z]|[A-Za-z]{1,2}\b){0,10}$/i),
        hs = header(/^seller\b(?:[^A-Za-z]|[A-Za-z]{1,2}\b){0,120}$/i);
      if (hb >= 0 && hs >= 0 && Math.abs(hb - hs) >= 3) {
        party(
          'buyer',
          companies.find((x) => x.index > hb && x.index < hb + 6)
        );
        party(
          'exporter',
          companies.find((x) => x.index > hs && x.index < hs + 6)
        );
      }
      // v2.19.5: PO bố cục 2 cột — dòng nhãn "Seller   Buyer" rồi dòng tên song song: tên thứ nhất = Seller, thứ hai = Buyer (theo thứ tự nhãn)
      for (let i = 0; i < lines.length - 1 && !(parties.exporter && parties.buyer); i++) {
        const m = /^(seller|buyer)\s{2,}(seller|buyer)$/i.exec(lines[i].text);
        if (!m || m[1].toLowerCase() === m[2].toLowerCase()) continue;
        const names = lines[i + 1].text
          .split(/\s{2,}/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (names.length !== 2 || !names.every((n) => company(n) || /\b(?:co\.?,?\s*ltd|limited|corp|inc)\b/i.test(n))) continue;
        const roles = [m[1].toLowerCase() === 'seller' ? 'exporter' : 'buyer', m[2].toLowerCase() === 'seller' ? 'exporter' : 'buyer'];
        roles.forEach((role, k) => {
          if (!parties[role])
            parties[role] = { name: names[k], tax: '', address: '', evidence: lines[i + 1].text, page: lines[i + 1].page };
        });
      }
      // PO tiếng Anh: "Messrs: <người nhận PO>" = bên bán (seller); bên phát hành PO (tên ở đầu văn bản) = bên mua
      if (!parties.exporter || !parties.buyer) {
        const hasPo = lines.some((l) => /^purchase order$/i.test(l.text)),
          ms = lines.findIndex((l) => /^messrs\s*[:：]/i.test(l.text));
        if (hasPo && ms >= 0) {
          const name = lines[ms].text
              .replace(/^messrs\s*[:：]\s*/i, '')
              .replace(/\s{2,}.*$/, '')
              .replace(/COMP\s+ANY/i, 'COMPANY')
              .trim(),
            issuer = lines.slice(0, ms).find((l) => company(l.text));
          if (name && !parties.exporter) parties.exporter = { name, tax: '', address: '', evidence: lines[ms].text, page: lines[ms].page };
          if (issuer && !parties.buyer)
            parties.buyer = { name: issuer.text, tax: '', address: '', evidence: issuer.text, page: issuer.page };
        }
      }
      party('exporter', companies[0]);
      party('buyer', companies[1]);
    }
    Object.keys(parties).forEach((k) => {
      parties[k].name = String(parties[k].name || '')
        .replace(/^(?:seller|buyer)\s*[:：]\s*/i, '')
        .replace(/\s{2,}.*$/, '')
        .replace(/\s+[.,]$/, '')
        .trim();
    });
    // The foreign buyer may occur in a paragraph rather than a table row.
    if (!parties.buyer) {
      for (const l of lines) {
        const m = /(?:cho\s+|buyer\s*[:：]\s*)([A-Z][A-Z &.,'-]+(?:CORPORATION PTE LTD|CO\.,?\s*LTD\.?))/i.exec(l.text);
        if (m) {
          parties.buyer = { name: m[1].trim(), tax: '', evidence: l.text, page: l.page };
          break;
        }
      }
    }
    for (const l0 of lines) {
      const l = Object.assign({}, l0, { text: l0.text.replace(/^\S{1,4}\s{3,}(?=\S)/, '') });
      const f = fold(l.text);
      if (
        /woodchips?/.test(f) &&
        !/^iwc\//.test(f) &&
        !/(?:moisture|gross|certificate|equipped|shall|buyer agrees)/.test(f) &&
        /^(?:(?:vietnam(?:ese)?\s+)?(?:hardwood|acacia|eucalyptus)|product\s*:)/.test(f)
      ) {
        product = l.text
          .replace(/\s*\(["“]?Product["”]?\).*$/i, '')
          .replace(/^product\s*[:：]\s*/i, '')
          .trim();
        if (/^vietnam/i.test(product)) product = product.replace(/\s*[^A-Za-z0-9 ,()\-\/&.'].*$/, '').trim();
        product = product
          .replace(/\s{2,}.*$/, '')
          .replace(/,\s*vietnam(?:ese)?\s+origin.*$/i, '')
          .trim();
        if (product && product === product.toUpperCase())
          product = product.toLowerCase().replace(/(^|[ (\/-])([a-z])/g, (m0, a0, b0) => a0 + b0.toUpperCase());
        break;
      }
    }
    if (!product) {
      for (const l of lines) {
        const f = fold(l.text);
        if (/dam g[o6].*la.*dam g[o6]/.test(f)) {
          const match = /la\s+(.+?)(?:\s+do\s+|\s+duoc\s+|$)/.exec(f);
          if (match) {
            const start = f.indexOf(match[1]);
            product = l.text.slice(start, start + match[1].length).trim();
            break;
          }
        }
      }
    }
    if (fold(product).replace(/\bg6\b/, 'go') === 'dam go keo') product = 'Dăm gỗ keo';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i],
        f = fold(l.text);
      if (/usd|unit price|per day|weather|formula|=/.test(f)) continue;
      const prev = fold((lines[i - 1] || {}).text || '');
      const quantityContext =
        /(?:s[o6]\s*lu[qou]+ng|quantity|supply|full loading)/.test(f) ||
        /^\d+[).]\s*/.test(f) ||
        /(?:s[o6]\s*lu[qou]+ng|quantity)\s*[:：]?\s*$/.test(prev);
      if (!quantityContext) continue;
      const re = /([0-9][0-9Oo., ]*)\s*B[D0O]M[TI1l]\b/gi;
      let m;
      while ((m = re.exec(l.text))) {
        let token = m[1].trim();
        const qty = amount(token);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const next = fold((lines[i + 1] || {}).text || '');
        const nearby = /pefc/.test(f) ? f : f + (/^\d+[).]/.test(next) ? '' : ' ' + next);
        const category = /non\s*pefc/.test(nearby) ? 'NON PEFC' : /pefc/.test(nearby) ? 'PEFC Controlled Sources' : '';
        const name = [product, category].filter(Boolean).join(' — ');
        if (!lots.some((x) => x.qty === qty && x.product === name))
          lots.push({ qty, unit: 'BDMT', product: name || product, evidence: l.text, page: l.page });
      }
    }
    if (!lots.length && HAK.DocExtract)
      HAK.DocExtract.quantityFallback(lines, amount).forEach((l) =>
        lots.push({ qty: l.qty, unit: 'BDMT', product, evidence: l.evidence, page: l.page })
      ); // v2.13.0: nhãn "Quantity" bị OCR làm mất → tìm số đứng trước BDMT
    const vessel = /(?:tau|vessel)\s*[:：]?\s*((?:MV\.?\s*)?[A-Z][A-Z0-9 ._-]*?V[.\-]?\s*\d+[A-Z0-9]*)/i.exec(
      lines.map((x) => fold(x.text)).join('\n')
    );
    if (vessel) lots.forEach((lot) => (lot.ship = vessel[1].toUpperCase()));
    const fullText = lines.map((x) => x.text).join('\n');
    const parens = parenNumberNotes(fullText);
    const warnings = [];
    if (parens.length) {
      warnings.push(
        'Có ô số dạng ngoặc (' + parens.join('; ') + '): app KHÔNG đọc ngoặc là số âm (quy tắc 28) — kiểm tra lại số liệu trên file gốc.'
      );
    }
    return { type: agency ? 'uythac' : 'xuatkhau', parties, product, lots, warnings };
  }
  /**
   * Quy tắc 28: app KHÔNG đọc số trong ngoặc "(1.200)" là số âm. Ở hợp đồng / PO, ô khối lượng hoặc đơn giá dạng ngoặc nên bộ đọc để TRỐNG;
   * hàm này tìm các số dạng ngoặc nằm sát nhãn / đơn vị khối lượng hoặc giá để báo cho người dùng (hàm thuần, trả về danh sách chuỗi gốc).
   */
  function parenNumberNotes(text) {
    const num = '\\(\\s*\\d[\\d.,\\s]*\\)';
    const marker = '(?:quantity|so luong|khoi luong|price|don gia|gia ban|amount|thanh tien|tong gia tri)';
    const unit = '(?:bdmt|mt|tan|usd|us\\$|vnd|\\$|kg)\\b';
    const near = new RegExp(marker + '[^\\n(]{0,30}' + num + '|' + num + '\\s*' + unit, 'g');
    const out = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((line) => {
        const f = fold(line);
        near.lastIndex = 0;
        let m;
        while ((m = near.exec(f))) {
          const hit = /\(\s*\d[\d.,\s]*\)/.exec(m[0]);
          if (hit && out.length < 5 && out.indexOf(hit[0].replace(/\s+/g, '')) < 0) out.push(hit[0].replace(/\s+/g, ''));
        }
      });
    return out;
  }
  function matchParty(party, customers) {
    if (!party) return null;
    const tax = String(party.tax || '').replace(/\D/g, '');
    const byTax = tax ? customers.filter((c) => String(c.tax || '').replace(/\D/g, '') === tax) : [];
    if (byTax.length === 1) return byTax[0];
    if (byTax.length > 1) return null;
    const key = (s) => fold(s).replace(/[^a-z0-9]/g, '');
    const exact = customers.filter((c) => key(c.name) === key(party.name));
    if (exact.length !== 1) return null;
    const existing = String(exact[0].tax || '').replace(/\D/g, '');
    return tax && existing && existing !== tax ? null : exact[0];
  }
  HAK.ContractParser = { extract, amount, fold, matchParty, parenNumberNotes };
  if (typeof module === 'object' && module.exports) module.exports = HAK.ContractParser;
})(typeof window !== 'undefined' ? window : globalThis);
