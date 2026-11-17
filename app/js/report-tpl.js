/**
 * report-tpl.js — 5 MẪU BÁO CÁO (chọn theo mục đích) dựng từ báo cáo và mô hình dữ liệu hiện có. Hàm thuần, không đụng DOM → kiểm thử trong Node.
 *
 *   period     Tổng hợp xuất hàng theo kỳ (ngày / tháng / quý / năm / tự chọn; nhóm theo công ty, hình thức, kho; so với kỳ trước cùng độ dài)
 *   breakdown  Phân tích theo tàu / kho / đơn vị vận chuyển (tỷ lệ xe trả về, tỷ trọng; sắp xếp, Top N, nhóm "Khác"; mở hồ sơ + phiếu cân)
 *   contracts  Tiến độ và đối chiếu hợp đồng (BDMT gốc / hiện hành / chứng thư, MT thực giao, còn lại; lọc thiếu chứng thư, vượt KL, lệch, chưa gắn tờ khai)
 *   tax        Hải quan và công nợ thuế (công ty → hợp đồng → tờ khai; phải nộp, đã nộp, đã hoàn, còn nợ, nộp thừa, lệ phí, chưa xác định)
 *   exceptions Ngoại lệ cần đối soát (xung đột phiếu, hồ sơ lỗi đọc, phiếu thiếu ngày, chưa gắn hồ sơ / hợp đồng, chênh lệch chứng thư–thực giao)
 *
 * MỖI MẪU TRẢ VỀ MỘT "doc" DUY NHẤT; màn hình, Excel (toExcel) và PDF / in (toPrintSpec) đều đọc từ doc đó nên dùng chung kết quả tính và phạm vi lọc.
 *   doc = { id, title, header:{company, period, basis, filters, units, createdText}, notes:[], warnings:[], sections:[section] }
 *   section = { id, sheet:'Tổng hợp'|'Chi tiết', title, note, columns:[{k,h,t,u,w,sum}], rows:[{c:{k:v}, cls, drill}], totals:{k:v}, chart }
 *   kiểu cột t: text | id (số phiếu / số tờ khai: luôn là văn bản, giữ số 0 đầu) | int | dec | pct (phân số 0–1) | vnd | usd | date
 *
 * Phạm vi công ty: ctx.metas phải là hồ sơ ĐÃ lọc theo phạm vi được cấp (scopeMetas); hợp đồng / tờ khai lấy từ báo cáo hợp đồng đã áp cùng phạm vi.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  /* ======================= Định dạng ======================= */
  const thousands = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const isNum = (v) => v !== null && v !== undefined && v !== '' && isFinite(Number(v));
  /** Số kiểu Việt (nghìn "." thập phân ","), làm tròn half-up trên số nguyên để tránh sai số dấu phẩy động. */
  function fmtNum(n, d) {
    if (!isNum(n)) return '';
    const f = Math.pow(10, d),
      v = Math.round(Math.abs(Number(n)) * f + 1e-9),
      ip = Math.floor(v / f),
      fp = String(v % f).padStart(d, '0');
    return (Number(n) < 0 && v ? '-' : '') + thousands(String(ip)) + (d ? ',' + fp : '');
  }
  const p2 = (n) => String(n).padStart(2, '0');
  /** ts (UTC) | 'yyyy-mm-dd' | 'dd/mm/yyyy' → 'dd/mm/yyyy'. */
  function fmtDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') {
      const d = new Date(v);
      return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    }
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v);
  }
  /** Văn bản hiển thị của một ô theo kiểu cột (màn hình và PDF dùng hàm này; Excel dùng kiểu ô thật). */
  function fmtCell(col, v) {
    if (v === null || v === undefined || v === '') return '';
    switch (col.t) {
      case 'int':
      case 'vnd':
        return fmtNum(v, 0);
      case 'dec':
      case 'usd':
        return fmtNum(v, 2);
      case 'pct':
        return isNum(v) ? fmtNum(Number(v) * 100, 1) + '%' : String(v);
      case 'date':
        return fmtDate(v);
      default:
        return String(v);
    }
  }
  const unitOf = (c) => (c.u ? ' (' + c.u + ')' : '');
  const headerText = (c) => c.h + unitOf(c);

  /* ======================= Ngày kỳ ======================= */
  const DAY = 86400000;
  const isoTs = (s) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const tsIso = (ts) => {
    const d = new Date(ts);
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  };
  const dmyTs = (s) => {
    const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
  };
  /** Kỳ trước CÙNG ĐỘ DÀI: [from, to] gồm N ngày → [from − N, from − 1]. null nếu chưa có đủ hai đầu mút hợp lệ. */
  function prevRange(from, to) {
    const a = isoTs(from),
      b = isoTs(to);
    if (a === null || b === null || b < a) return null;
    const n = Math.round((b - a) / DAY) + 1,
      pt = a - DAY,
      pf = pt - (n - 1) * DAY;
    return { from: tsIso(pf), to: tsIso(pt), days: n };
  }
  /** Khóa + nhãn kỳ của một mốc thời gian theo độ chi tiết. */
  function bucketOf(ts, gran) {
    if (ts === null || ts === undefined) return { key: '~', label: 'Không rõ ngày' };
    const d = new Date(ts),
      y = d.getUTCFullYear(),
      mo = d.getUTCMonth() + 1;
    if (gran === 'day') return { key: tsIso(ts), label: fmtDate(ts) };
    if (gran === 'quarter') {
      const q = Math.ceil(mo / 3);
      return { key: y + '-Q' + q, label: 'Quý ' + q + '/' + y };
    }
    if (gran === 'year') return { key: String(y), label: 'Năm ' + y };
    if (gran === 'custom') return { key: 'custom', label: 'Kỳ đã chọn' };
    return { key: y + '-' + p2(mo), label: p2(mo) + '/' + y };
  }
  const GRAN_TEXT = { day: 'ngày', month: 'tháng', quarter: 'quý', year: 'năm', custom: 'kỳ tự chọn' };

  /* ======================= Tên / phạm vi ======================= */
  function names(ctx) {
    const n = ctx.names || {};
    return {
      company: n.company || ((id) => id || '(chưa rõ công ty)'),
      kho: n.kho || ((id) => id || '(chưa chọn kho)'),
      type: n.type || ((t) => t || '(chưa rõ hình thức)'),
    };
  }
  const hasRetOf = (ctx) => ctx.hasRet || ((t) => !!(HAK.Report && HAK.Report.HAS_RET && HAK.Report.HAS_RET[t]));
  /** Lọc hồ sơ theo phạm vi công ty được cấp (scope = mảng id công ty | null = tất cả). Dùng chung cho mọi mẫu, màn hình và bản xuất. */
  function scopeMetas(metas, scope, companyOfMeta) {
    if (!scope) return metas.slice();
    return metas.filter((m) => scope.indexOf(companyOfMeta(m)) >= 0);
  }
  const khoId = (r) => String((r && r.kho) || '').split('>')[0];

  /* ======================= Khung doc ======================= */
  function basisText(m) {
    if (m && m.basisFallback) return 'theo ngày BẮT ĐẦU của hồ sơ (chọn ngày cân nhưng chưa đọc được danh sách phiếu)';
    return m && m.basis === 'weigh' ? 'theo NGÀY CÂN của từng phiếu' : 'theo ngày BẮT ĐẦU của hồ sơ';
  }
  function periodText(from, to) {
    return from || to ? 'từ ' + (from ? fmtDate(from) : '…') + ' đến ' + (to ? fmtDate(to) : '…') : 'toàn bộ thời gian';
  }
  const stamp = (now) => {
    const d = now || new Date();
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  function newDoc(ctx, p, id, title, m, extra) {
    return Object.assign(
      {
        id,
        title,
        header: {
          company: ctx.companyText || 'Tất cả công ty được phép',
          period: periodText(p.from, p.to),
          basis: m ? basisText(m) : '—',
          filters: (m && m.filterText) || p.filterText || 'Không lọc thêm',
          units: 'kg = kilôgam qua cân; MT = tấn tươi; BDMT = tấn khô quy đổi; tiền: VND và USD ghi rõ ở từng cột',
          createdText: stamp(ctx.now),
        },
        notes: [],
        warnings: [],
        sections: [],
      },
      extra || {}
    );
  }
  const col = (k, h, t, o) => Object.assign({ k, h, t: t || 'text' }, o || {});
  const sumRow = (cols, rows) => {
    const out = {};
    cols.forEach((c) => {
      if (c.sum) out[c.k] = rows.reduce((a, r) => a + (Number(r.c[c.k]) || 0), 0);
    });
    return out;
  };
  const runCompute = (ctx, p, from, to) =>
    (ctx.compute || HAK.Report.compute)(ctx.metas, {
      basis: p.basis || 'weigh',
      tickets: ctx.tickets || undefined,
      ticketErrors: ctx.ticketErrors || null,
      from: from || '',
      to: to || '',
      q: p.q || '',
      type: p.type || '',
      types: p.types || [],
      manual: p.manual || {},
    });

  /* ======================= Sự kiện (facts) từ kết quả compute ======================= */
  /**
   * Mỗi fact = một phiếu (kỳ theo ngày cân, hoặc khi cần phiếu cho phân tích ĐVVC) hoặc cả hồ sơ (kỳ theo ngày bắt đầu, chưa có phiếu).
   * Phiếu bị loại vì trùng / xung đột (skipIdx) và phiếu ngoài kỳ không có mặt — đúng tập số liệu của compute().
   */
  function factsOf(m, ctx, needTickets) {
    const hasRet = hasRetOf(ctx),
      tk = ctx.tickets || null,
      out = [];
    const one = (r, ts, t) => ({
      rec: r,
      ts,
      trips: 1,
      kg: t.net,
      retTrips: hasRet(r.type) && t.ret ? 1 : 0,
      retKg: hasRet(r.type) && t.ret ? t.net : 0,
      ticket: t,
    });
    m.used.forEach((r) => {
      if (m.basis === 'weigh' && r.days) {
        r.days.forEach((x) => out.push(one(r, x.ts, x.t)));
        return;
      }
      const list = needTickets && tk && tk.get(r.id);
      if (list) {
        const skip = r.skipIdx || new Set();
        list.forEach((t) => {
          if (!skip.has(t.i)) out.push(one(r, r.fromTs, t));
        });
        return;
      }
      out.push({
        rec: r,
        ts: r.fromTs,
        trips: r.trips || 0,
        kg: r.kg || 0,
        retTrips: r.retTrips || 0,
        retKg: r.retKg || 0,
        noTickets: true,
      });
    });
    return out;
  }
  const emptyAgg = (key, label) => ({ key, label, recs: new Map(), trips: 0, kg: 0, retTrips: 0, retKg: 0, un: { n: 0, trips: 0, kg: 0 } });
  const addFact = (a, f) => {
    a.recs.set(f.rec.id, f.rec);
    a.trips += f.trips;
    a.kg += f.kg;
    a.retTrips += f.retTrips;
    a.retKg += f.retKg;
  };
  const del = (a) => a.kg - a.retKg;

  /* ======================= Mẫu 1 — Tổng hợp xuất hàng theo kỳ ======================= */
  function groupKeyOf(by, N) {
    if (by === 'type') return (r) => ({ key: r.type || '', label: N.type(r.type) });
    if (by === 'kho') return (r) => ({ key: khoId(r), label: N.kho(khoId(r)) });
    return (r) => ({ key: r.cid || '', label: N.company(r.cid) });
  }
  const BY_TEXT = { company: 'công ty', type: 'hình thức', kho: 'kho xuất', ship: 'tàu', carrier: 'đơn vị vận chuyển' };

  function aggregate(m, facts, keyOf) {
    const map = new Map();
    const get = (k) => {
      if (!map.has(k.key)) map.set(k.key, emptyAgg(k.key, k.label));
      return map.get(k.key);
    };
    facts.forEach((f) => addFact(get(keyOf(f.rec, f)), f));
    ((m.unallocated && m.unallocated.items) || []).forEach((u) => {
      const a = get(keyOf(u, null));
      a.un.n++;
      a.un.trips += u.trips;
      a.un.kg += u.kg;
    });
    return map;
  }
  const recRows = (a) =>
    Array.from(a.recs.values()).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      from: r.from,
      to: r.to,
      trips: r.trips,
      kg: r.kg,
      retKg: r.retKg,
      delKg: r.delKg,
    }));

  function compareCell(cur, prevAgg, hasPrev) {
    // trạng thái so sánh kỳ trước
    if (hasPrev === null) return { st: 'na', text: 'Chưa chọn kỳ có đủ ngày bắt đầu và kết thúc nên không so sánh' };
    if (!prevAgg || (prevAgg.recs.size === 0 && prevAgg.un.n === 0)) return { st: 'nodata', text: 'Kỳ trước chưa có dữ liệu' };
    const base = del(prevAgg);
    if (!(base > 0)) return { st: 'zero', text: 'Kỳ trước bằng 0 — không tính %', base, diff: cur - base };
    const diff = cur - base;
    return { st: 'ok', text: diff > 0 ? 'Tăng' : diff < 0 ? 'Giảm' : 'Không đổi', base, diff, pct: diff / base };
  }

  function periodReport(ctx, p0) {
    const p = Object.assign({ granularity: 'month', groupBy: 'company', basis: 'weigh', compare: true }, p0 || {});
    const N = names(ctx),
      m = runCompute(ctx, p, p.from, p.to),
      facts = factsOf(m, ctx, false);
    const keyOf = groupKeyOf(p.groupBy, N);
    const groups = aggregate(m, facts, keyOf);
    const range = p.compare ? prevRange(p.from, p.to) : null;
    let prevGroups = null,
      prevM = null;
    if (range) {
      prevM = runCompute(ctx, p, range.from, range.to);
      prevGroups = aggregate(prevM, factsOf(prevM, ctx, false), keyOf);
    }
    const hasPrev = range ? true : null;
    // hợp nhất nhóm: kỳ này + nhóm chỉ có ở kỳ trước (đã về 0)
    const keys = new Set(groups.keys());
    if (prevGroups) prevGroups.forEach((_, k) => keys.add(k));
    const doc = newDoc(ctx, p, 'period', 'TỔNG HỢP XUẤT HÀNG THEO KỲ', m);
    doc.model = { basis: m.basis, unallocated: m.unallocated };
    const cols = [
      col('grp', 'Theo ' + BY_TEXT[p.groupBy]),
      col('recs', 'Số hồ sơ', 'int', { sum: 1 }),
      col('trips', 'Số phiếu (xe)', 'int', { sum: 1 }),
      col('kg', 'Qua cân', 'int', { u: 'kg', sum: 1 }),
      col('retTrips', 'Xe trả về', 'int', { u: 'xe', sum: 1 }),
      col('retKg', 'Xe trả về', 'int', { u: 'kg', sum: 1 }),
      col('delKg', 'Thực giao', 'int', { u: 'kg', sum: 1 }),
      col('unKg', 'Chưa phân bổ', 'int', { u: 'kg', sum: 1 }),
    ];
    if (range)
      cols.push(
        col('prevKg', 'Thực giao kỳ trước', 'int', { u: 'kg', sum: 1 }),
        col('diffKg', 'Chênh lệch', 'int', { u: 'kg' }),
        col('diffPct', 'Chênh lệch', 'pct'),
        col('cmp', 'So sánh kỳ trước')
      );
    const rows = [];
    keys.forEach((k) => {
      const a = groups.get(k) || emptyAgg(k, (prevGroups.get(k) || {}).label);
      const c = {
        grp: a.label,
        recs: a.recs.size,
        trips: a.trips,
        kg: a.kg,
        retTrips: a.retTrips,
        retKg: a.retKg,
        delKg: del(a),
        unKg: a.un.kg,
      };
      if (range) {
        const cmp = compareCell(del(a), prevGroups.get(k), hasPrev);
        Object.assign(c, {
          prevKg: cmp.base === undefined ? (prevGroups.get(k) ? del(prevGroups.get(k)) : 0) : cmp.base,
          diffKg: cmp.diff === undefined ? '' : cmp.diff,
          diffPct: cmp.pct === undefined ? '' : cmp.pct,
          cmp: cmp.text,
        });
      }
      rows.push({ c, drill: { recs: recRows(a) }, delKg: del(a) });
    });
    rows.sort((x, y) => y.delKg - x.delKg || String(x.c.grp).localeCompare(String(y.c.grp)));
    const totals = sumRow(cols, rows);
    totals.grp = 'TỔNG CỘNG (đã xác minh)';
    if (range) {
      const tot = { cur: totals.delKg || 0 },
        base = prevM.used.length || (prevM.unallocated && prevM.unallocated.n) ? prevGroups_total(prevGroups) : null;
      const cmp =
        base === null
          ? { st: 'nodata', text: 'Kỳ trước chưa có dữ liệu' }
          : !(base > 0)
            ? { st: 'zero', text: 'Kỳ trước bằng 0 — không tính %' }
            : {
                st: 'ok',
                base,
                diff: tot.cur - base,
                pct: (tot.cur - base) / base,
                text: tot.cur > base ? 'Tăng' : tot.cur < base ? 'Giảm' : 'Không đổi',
              };
      totals.prevKg = base === null ? '' : base;
      totals.diffKg = cmp.diff === undefined ? '' : cmp.diff;
      totals.diffPct = cmp.pct === undefined ? '' : cmp.pct;
      totals.cmp = cmp.text;
      doc.compare = { range, total: cmp.st, prevTotalKg: base };
    } else doc.compare = { range: null, total: 'na' };
    doc.sections.push({
      id: 'groups',
      sheet: 'Tổng hợp',
      title: 'Theo ' + BY_TEXT[p.groupBy],
      note:
        'Thực giao = qua cân − xe trả về. Cột "Chưa phân bổ" là số liệu chưa xác minh được ngày cân (không nằm trong các cột còn lại).' +
        (range
          ? ' So sánh với kỳ trước cùng độ dài: ' + fmtDate(range.from) + ' → ' + fmtDate(range.to) + ' (' + range.days + ' ngày).'
          : ' Chưa so sánh được kỳ trước: cần chọn kỳ có đủ ngày bắt đầu và kết thúc.'),
      columns: cols,
      rows,
      totals,
      chart: {
        type: 'bar',
        title: 'Thực giao theo ' + BY_TEXT[p.groupBy],
        unit: 'tấn',
        scale: 1000,
        points: rows.slice(0, 12).map((r) => ({ label: r.c.grp, value: r.c.delKg })),
      },
    });
    // theo kỳ
    const bm = new Map();
    facts.forEach((f) => {
      const b = bucketOf(f.ts, p.granularity);
      if (!bm.has(b.key)) bm.set(b.key, emptyAgg(b.key, b.label));
      addFact(bm.get(b.key), f);
    });
    const bcols = [
      col('per', 'Kỳ (' + GRAN_TEXT[p.granularity] + ')'),
      col('recs', 'Số hồ sơ', 'int'),
      col('trips', 'Số phiếu (xe)', 'int', { sum: 1 }),
      col('kg', 'Qua cân', 'int', { u: 'kg', sum: 1 }),
      col('retTrips', 'Xe trả về', 'int', { u: 'xe', sum: 1 }),
      col('retKg', 'Xe trả về', 'int', { u: 'kg', sum: 1 }),
      col('delKg', 'Thực giao', 'int', { u: 'kg', sum: 1 }),
    ];
    const brows = Array.from(bm.values())
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((a) => ({
        c: { per: a.label, recs: a.recs.size, trips: a.trips, kg: a.kg, retTrips: a.retTrips, retKg: a.retKg, delKg: del(a) },
        drill: { recs: recRows(a) },
      }));
    doc.sections.push({
      id: 'periods',
      sheet: 'Tổng hợp',
      title: 'Theo kỳ (' + GRAN_TEXT[p.granularity] + ')',
      note: 'Phiếu xếp vào kỳ theo ' + basisText(m) + '.',
      columns: bcols,
      rows: brows,
      totals: Object.assign(sumRow(bcols, brows), { per: 'TỔNG CỘNG (đã xác minh)' }),
      chart:
        p.granularity === 'custom'
          ? null
          : {
              type: 'line',
              title: 'Thực giao theo ' + GRAN_TEXT[p.granularity],
              unit: 'tấn',
              scale: 1000,
              points: brows.map((r) => ({ label: r.c.per, value: r.c.delKg })),
            },
    });
    addUnallocated(doc, m, N);
    if (m.basisFallback)
      doc.warnings.push('Đã chọn kỳ theo ngày cân nhưng chưa đọc được danh sách phiếu — số liệu đang theo ngày bắt đầu hồ sơ.');
    return doc;
  }
  const prevGroups_total = (g) => {
    let s = 0;
    g.forEach((a) => (s += del(a)));
    return s;
  };

  /** Phần "Chưa phân bổ" dùng chung (sheet Chi tiết) + cảnh báo. */
  function addUnallocated(doc, m, N) {
    const u = m.unallocated;
    if (!u || !u.n) return;
    const cols = [
      col('title', 'Hồ sơ'),
      col('type', 'Hình thức'),
      col('from', 'Từ ngày', 'date'),
      col('to', 'Đến ngày', 'date'),
      col('trips', 'Số xe', 'int', { sum: 1 }),
      col('kg', 'Qua cân', 'int', { u: 'kg', sum: 1 }),
      col('delKg', 'Thực giao', 'int', { u: 'kg', sum: 1 }),
      col('why', 'Lý do chưa phân bổ'),
      col('id', 'Mã hồ sơ', 'id'),
    ];
    const rows = u.items.map((x) => ({
      c: {
        title: x.title || x.id,
        type: N.type(x.type),
        from: x.from,
        to: x.to,
        trips: x.trips,
        kg: x.kg,
        delKg: x.delKg,
        why: x.reason,
        id: x.id,
      },
      drill: { recs: [{ id: x.id, title: x.title, type: x.type, from: x.from, to: x.to, trips: x.trips, kg: x.kg, delKg: x.delKg }] },
    }));
    doc.sections.push({
      id: 'unallocated',
      sheet: 'Chi tiết',
      title: 'Số liệu chưa phân bổ theo ngày cân',
      note: 'Không xác minh được ngày cân của từng phiếu nên KHÔNG nằm trong số liệu theo kỳ / nhóm của báo cáo này.',
      columns: cols,
      rows,
      totals: Object.assign(sumRow(cols, rows), { title: 'TỔNG CỘNG chưa phân bổ' }),
    });
    doc.warnings.push(
      'Chưa phân bổ: ' +
        u.n +
        ' hồ sơ · ' +
        fmtNum(u.trips, 0) +
        ' xe · ' +
        fmtNum(u.kg, 0) +
        ' kg qua cân (' +
        fmtNum(u.delKg, 0) +
        ' kg thực giao) — không nằm trong số liệu đã xác minh.'
    );
  }

  /* ======================= Mẫu 2 — Phân tích theo tàu / kho / đơn vị vận chuyển ======================= */
  const SORTS = {
    delKg: (a, b) => b.delKg - a.delKg,
    kg: (a, b) => b.kg - a.kg,
    trips: (a, b) => b.trips - a.trips,
    retRate: (a, b) => (b.trips ? b.retTrips / b.trips : -1) - (a.trips ? a.retTrips / a.trips : -1),
    share: (a, b) => b.delKg - a.delKg,
    label: (a, b) => String(a.label).localeCompare(String(b.label)),
  };
  function breakdownReport(ctx, p0) {
    const p = Object.assign({ groupBy: 'ship', basis: 'weigh', sort: 'delKg', dir: 'desc', topN: 0 }, p0 || {});
    const N = names(ctx),
      m = runCompute(ctx, p, p.from, p.to),
      facts = factsOf(m, ctx, true); // luôn mở rộng theo phiếu khi có (cần đơn vị vận chuyển, và để mở được danh sách phiếu từ dòng tổng)
    const keyOf =
      p.groupBy === 'carrier'
        ? (r, f) => {
            const c = f && f.ticket ? f.ticket.carrier : null;
            return c === null
              ? { key: '~noticket', label: '(chưa đọc phiếu cân)' }
              : { key: c || '~none', label: c || '(không ghi đơn vị vận chuyển)' };
          }
        : p.groupBy === 'kho'
          ? (r) => ({ key: khoId(r), label: N.kho(khoId(r)) })
          : (r) => {
              const s = String(r.ship || '')
                .trim()
                .toUpperCase();
              return { key: s || '~none', label: s || '(chưa nhập tàu)' };
            };
    const map = new Map();
    const tickets = new Map();
    facts.forEach((f) => {
      const k = keyOf(f.rec, f);
      if (!map.has(k.key)) {
        map.set(k.key, emptyAgg(k.key, k.label));
        tickets.set(k.key, []);
      }
      addFact(map.get(k.key), f);
      if (f.ticket) tickets.get(k.key).push(ticketRow(f));
    });
    let list = Array.from(map.values()).map((a) => ({
      label: a.label,
      key: a.key,
      a,
      trips: a.trips,
      kg: a.kg,
      retTrips: a.retTrips,
      retKg: a.retKg,
      delKg: del(a),
      recs: a.recs,
      tickets: tickets.get(a.key),
    }));
    const cmp = SORTS[p.sort] || SORTS.delKg;
    list.sort((a, b) => (p.dir === 'asc' ? -cmp(a, b) : cmp(a, b)) || String(a.label).localeCompare(String(b.label)));
    const totalDel = list.reduce((s, x) => s + x.delKg, 0),
      totalTrips = list.reduce((s, x) => s + x.trips, 0);
    // Top N + "Khác": giữ đủ tổng
    let shown = list,
      other = null;
    if (p.topN > 0 && list.length > p.topN) {
      shown = list.slice(0, p.topN);
      const rest = list.slice(p.topN);
      other = {
        label: 'Khác (' + rest.length + ' nhóm)',
        key: '~other',
        trips: rest.reduce((s, x) => s + x.trips, 0),
        kg: rest.reduce((s, x) => s + x.kg, 0),
        retTrips: rest.reduce((s, x) => s + x.retTrips, 0),
        retKg: rest.reduce((s, x) => s + x.retKg, 0),
        delKg: rest.reduce((s, x) => s + x.delKg, 0),
        recs: new Map(rest.flatMap((x) => Array.from(x.recs.entries()))),
        tickets: rest.flatMap((x) => x.tickets),
        members: rest.map((x) => x.label),
      };
    }
    const doc = newDoc(ctx, p, 'breakdown', 'PHÂN TÍCH THEO ' + BY_TEXT[p.groupBy].toUpperCase(), m);
    const cols = [
      col('grp', BY_TEXT[p.groupBy].charAt(0).toUpperCase() + BY_TEXT[p.groupBy].slice(1)),
      col('recs', 'Số hồ sơ', 'int'),
      col('trips', 'Số xe qua cân', 'int', { sum: 1 }),
      col('kg', 'Qua cân', 'int', { u: 'kg', sum: 1 }),
      col('retTrips', 'Xe trả về', 'int', { u: 'xe', sum: 1 }),
      col('retKg', 'Xe trả về', 'int', { u: 'kg', sum: 1 }),
      col('delKg', 'Thực giao', 'int', { u: 'kg', sum: 1 }),
      col('retRate', 'Tỷ lệ xe trả về = xe trả về ÷ xe qua cân', 'pct'),
      col('retRateKg', 'Tỷ lệ xe trả về = kg trả về ÷ kg qua cân', 'pct'),
      col('share', 'Tỷ trọng thực giao = thực giao ÷ tổng thực giao của bảng', 'pct'),
      col('denShare', 'Mẫu số tỷ trọng (tổng thực giao của bảng)', 'int', { u: 'kg' }),
    ];
    const toRow = (x, extra) => ({
      c: {
        grp: x.label,
        recs: x.recs.size,
        trips: x.trips,
        kg: x.kg,
        retTrips: x.retTrips,
        retKg: x.retKg,
        delKg: x.delKg,
        retRate: x.trips ? x.retTrips / x.trips : '',
        retRateKg: x.kg ? x.retKg / x.kg : '',
        share: totalDel ? x.delKg / totalDel : '',
        denShare: totalDel,
      },
      cls: extra && extra.cls,
      drill: { recs: recRows({ recs: x.recs }), tickets: x.tickets, members: x.members || null },
    });
    const rows = shown.map((x) => toRow(x)).concat(other ? [toRow(other, { cls: 'other' })] : []);
    const totals = Object.assign(sumRow(cols, rows), {
      grp: 'TỔNG CỘNG (đã xác minh)',
      retRate: totalTrips ? list.reduce((s, x) => s + x.retTrips, 0) / totalTrips : '',
      retRateKg: list.reduce((s, x) => s + x.kg, 0) ? list.reduce((s, x) => s + x.retKg, 0) / list.reduce((s, x) => s + x.kg, 0) : '',
      share: totalDel ? 1 : '',
      denShare: totalDel,
    });
    doc.sections.push({
      id: 'groups',
      sheet: 'Tổng hợp',
      title: 'Theo ' + BY_TEXT[p.groupBy],
      note:
        'Sắp xếp theo ' +
        ({ delKg: 'thực giao', kg: 'qua cân', trips: 'số xe', retRate: 'tỷ lệ xe trả về', share: 'tỷ trọng', label: 'tên nhóm' }[p.sort] ||
          'thực giao') +
        (p.dir === 'asc' ? ' tăng dần' : ' giảm dần') +
        (p.topN > 0 ? '; Top ' + p.topN + ' và nhóm "Khác" (tổng vẫn đủ).' : '; hiện toàn bộ nhóm.') +
        ' Mẫu số: tỷ lệ xe trả về chia cho chính số xe / kg qua cân của dòng; tỷ trọng chia cho tổng thực giao ' +
        fmtNum(totalDel, 0) +
        ' kg của ' +
        fmtNum(totalTrips, 0) +
        ' xe trong bảng.',
      columns: cols,
      rows,
      totals,
      chart: {
        type: 'bar',
        title: 'Thực giao theo ' + BY_TEXT[p.groupBy],
        unit: 'tấn',
        scale: 1000,
        points: rows.map((r) => ({ label: r.c.grp, value: r.c.delKg })),
      },
    });
    // Bảng chéo kho xuất × hình thức: cùng tập phiếu (facts) với bảng trên nên tổng khớp nhau; mỗi ô = thực giao (kg) của kho đó ở hình thức đó
    if (facts.length) {
      const khoMap = new Map(),
        typeTot = new Map();
      facts.forEach((f) => {
        const kid = khoId(f.rec),
          ty = f.rec.type || '';
        if (!khoMap.has(kid))
          khoMap.set(kid, { label: N.kho(kid), types: new Map(), recs: new Map(), tickets: [], trips: 0, kg: 0, retKg: 0 });
        const kx = khoMap.get(kid);
        kx.types.set(ty, (kx.types.get(ty) || 0) + f.kg - f.retKg);
        typeTot.set(ty, (typeTot.get(ty) || 0) + f.kg - f.retKg);
        kx.recs.set(f.rec.id, f.rec);
        if (f.ticket) kx.tickets.push(ticketRow(f));
        kx.trips += f.trips;
        kx.kg += f.kg;
        kx.retKg += f.retKg;
      });
      const types = Array.from(typeTot.keys()).sort((a, b) => typeTot.get(b) - typeTot.get(a) || N.type(a).localeCompare(N.type(b), 'vi'));
      const mcols = [col('kho', 'Kho xuất')]
        .concat(types.map((ty) => col('t_' + ty, N.type(ty), 'int', { u: 'kg thực giao', sum: 1 })))
        .concat([
          col('trips', 'Số xe qua cân', 'int', { sum: 1 }),
          col('kg', 'Qua cân', 'int', { u: 'kg', sum: 1 }),
          col('retKg', 'Xe trả về', 'int', { u: 'kg', sum: 1 }),
          col('delKg', 'Tổng thực giao', 'int', { u: 'kg', sum: 1 }),
        ]);
      const mrows = Array.from(khoMap.values())
        .sort((a, b) => b.kg - b.retKg - (a.kg - a.retKg) || a.label.localeCompare(b.label, 'vi'))
        .map((kx) => {
          const c = { kho: kx.label, trips: kx.trips, kg: kx.kg, retKg: kx.retKg, delKg: kx.kg - kx.retKg };
          types.forEach((ty) => {
            c['t_' + ty] = kx.types.get(ty) || 0;
          });
          return { c, drill: { recs: recRows({ recs: kx.recs }), tickets: kx.tickets, members: null } };
        });
      doc.sections.push({
        id: 'khoType',
        sheet: 'Tổng hợp',
        title: 'Kho xuất × hình thức (thực giao, kg)',
        note:
          'Mỗi ô là thực giao (qua cân trừ xe trả về) của kho ở hình thức đó; ô trống = 0. Cùng tập phiếu đã xác minh với bảng trên nên tổng cộng bằng tổng thực giao ' +
          fmtNum(totalDel, 0) +
          ' kg. Hồ sơ chưa đọc được phiếu hoặc phiếu thiếu ngày nằm ở phần "Chưa phân bổ", không có trong bảng này. Kho = kho xuất của hồ sơ; không có số liệu nhập kho.',
        columns: mcols,
        rows: mrows,
        totals: Object.assign(sumRow(mcols, mrows), { kho: 'TỔNG CỘNG (đã xác minh)' }),
      });
    }
    // chi tiết phiếu của toàn bộ nhóm (sheet Chi tiết) — mở được từ một dòng tổng
    const tcols = [
      col('grp', BY_TEXT[p.groupBy].charAt(0).toUpperCase() + BY_TEXT[p.groupBy].slice(1)),
      col('rec', 'Hồ sơ'),
      col('ticket', 'Số phiếu', 'id'),
      col('date', 'Ngày cân', 'date'),
      col('plate', 'Biển số', 'id'),
      col('carrier', 'Đơn vị vận chuyển'),
      col('kg', 'Qua cân', 'int', { u: 'kg', sum: 1 }),
      col('ret', 'Xe trả về'),
    ];
    const trows = [];
    shown.concat(other ? [other] : []).forEach((x) =>
      x.tickets.forEach((t) =>
        trows.push({
          c: {
            grp: x.label,
            rec: t.recTitle,
            ticket: t.ticket,
            date: t.ts,
            plate: t.plate,
            carrier: t.carrier,
            kg: t.kg,
            ret: t.ret ? 'Có' : '',
          },
        })
      )
    );
    if (trows.length)
      doc.sections.push({
        id: 'tickets',
        sheet: 'Chi tiết',
        title: 'Phiếu cân tạo ra số liệu trên',
        note: 'Cùng tập phiếu với bảng tổng hợp.',
        columns: tcols,
        rows: trows,
        totals: Object.assign(sumRow(tcols, trows), { grp: 'TỔNG CỘNG' }),
      });
    addUnallocated(doc, m, N);
    if (!list.length) doc.warnings.push('Không có số liệu đã xác minh trong phạm vi đang chọn.');
    return doc;
  }
  function ticketRow(f) {
    return {
      recId: f.rec.id,
      recTitle: f.rec.title,
      ticket: f.ticket.ticket,
      ts: f.ts,
      plate: f.ticket.plate,
      carrier: f.ticket.carrier || '',
      kg: f.kg,
      ret: f.retTrips > 0,
    };
  }

  /* ======================= Mẫu 3 — Tiến độ và đối chiếu hợp đồng ======================= */
  const FLAGS = {
    missingCert: 'Thiếu chứng thư',
    over: 'Vượt khối lượng',
    mismatch: 'Lệch đối chiếu',
    noDecl: 'Chưa gắn tờ khai',
  };
  const needsDecl = (c) => c.type === 'xuatkhau' || c.type === 'uythac';
  function contractFlags(it) {
    const m = it.m,
      c = m.c,
      f = [];
    if (m.rows.length && m.withCert < m.rows.length) f.push('missingCert');
    if (m.qty != null && m.certBdmt > m.qty + 0.005) f.push('over');
    // Lệch đối chiếu = tờ khai ↔ chứng thư hoặc chứng thư ↔ thực giao lệch (chỉ dòng ĐÃ có tờ khai) hoặc có tờ khai chưa gắn chi tiết.
    // Không tính "chưa có tờ khai" và "vượt khối lượng hợp đồng" (đã có cờ riêng) để bốn cờ không chồng lên nhau.
    const bad =
      m.rows.some((r) => r.decl && ((r.tkct && r.tkct.s === 'warn') || (r.cttt && r.cttt.s === 'warn'))) || (m.loose && m.loose.length > 0);
    if (bad) f.push('mismatch');
    if (needsDecl(c) && (!m.T.length || m.rows.some((r) => !r.decl))) f.push('noDecl');
    return f;
  }
  const closeText = (c) =>
    c.closedAt ? 'Đã đóng ' + fmtDate(c.closedAt) : c.reopenedAt !== undefined && c.closeRev ? 'Đã mở lại' : 'Chưa đóng';
  function contractsReport(ctx, p0) {
    const p = Object.assign({ flags: [], q: '' }, p0 || {});
    const orig = ctx.originalQty || ((c) => (HAK.ContractModel ? HAK.ContractModel.originalQty(c) : c.contractQty)),
      N = names(ctx);
    const wantFlags = (p.flags || []).filter((x) => FLAGS[x]);
    const q = String(p.q || '')
      .trim()
      .toLowerCase();
    const items = (ctx.contracts || []).filter((it) => it && it.m && it.m.c);
    const rows = [];
    items.forEach((it) => {
      const m = it.m,
        c = m.c,
        flags = contractFlags(it);
      if (wantFlags.length && !wantFlags.some((x) => flags.indexOf(x) >= 0)) return;
      const buyer = (it.g && it.g.f && it.g.f.buyer) || '';
      if (q && [c.no, buyer, N.type(c.type)].join(' ').toLowerCase().indexOf(q) < 0) return;
      const delKg = it.g && it.g.tot ? it.g.tot.delKg : 0,
        mtCert = m.rows.reduce((a, r) => a + (isNum(r.d.mt) ? Number(r.d.mt) : 0), 0),
        hasMt = m.rows.some((r) => isNum(r.d.mt));
      const o = orig(c);
      rows.push({
        c: {
          no: c.no || c.id,
          type: N.type(c.type),
          date: c.date || '',
          buyer,
          qtyOrig: isNum(o) ? Number(o) : '',
          qtyNow: m.qty === null || m.qty === undefined ? '' : m.qty,
          certBdmt: m.certBdmt,
          remain: m.qty === null || m.qty === undefined ? '' : m.qty - m.certBdmt,
          pct: m.qty ? m.certBdmt / m.qty : '',
          certs: m.withCert + '/' + m.rows.length,
          mtCert: hasMt ? mtCert : '',
          mtDel: delKg / 1000,
          gapMt: hasMt && delKg > 0 ? mtCert - delKg / 1000 : '',
          decls: m.T.length,
          clear: m.T.length ? m.cleared + '/' + m.T.length + ' đã thông quan' : '—',
          closing: closeText(c),
          status: (m.status && m.status.label) || '',
          flags: flags.map((x) => FLAGS[x]).join('; '),
        },
        flags,
        drill: { contractId: c.id, hasTrips: !!(it.g && it.g.tot && it.g.tot.trips > 0) },
      });
    });
    const cols = [
      col('no', 'Hợp đồng', 'id'),
      col('type', 'Hình thức'),
      col('date', 'Ngày', 'date'),
      col('buyer', 'Bên mua / nhận'),
      col('qtyOrig', 'BDMT gốc', 'dec', { u: 'BDMT', sum: 1 }),
      col('qtyNow', 'BDMT hiện hành sau phụ lục', 'dec', { u: 'BDMT', sum: 1 }),
      col('certBdmt', 'BDMT theo chi tiết hợp đồng (gồm cả chi tiết chưa có chứng thư)', 'dec', { u: 'BDMT', sum: 1 }),
      col('remain', 'Còn lại = hiện hành − BDMT chi tiết', 'dec', { u: 'BDMT', sum: 1 }),
      col('pct', '% đã thực hiện = BDMT chi tiết ÷ hiện hành', 'pct'),
      col('certs', 'Chi tiết có chứng thư'),
      col('mtCert', 'MT theo chi tiết hợp đồng', 'dec', { u: 'MT', sum: 1 }),
      col('mtDel', 'MT thực giao qua cân (sau trừ xe trả về)', 'dec', { u: 'MT', sum: 1 }),
      col('gapMt', 'Chênh lệch MT chi tiết − thực giao', 'dec', { u: 'MT' }),
      col('decls', 'Số tờ khai', 'int', { sum: 1 }),
      col('clear', 'Thông quan'),
      col('closing', 'Đóng hợp đồng'),
      col('status', 'Trạng thái thực hiện'),
      col('flags', 'Cần chú ý'),
    ];
    const doc = newDoc(ctx, p, 'contracts', 'TIẾN ĐỘ VÀ ĐỐI CHIẾU HỢP ĐỒNG', null, {
      header: {
        company: ctx.companyText || 'Tất cả công ty được phép',
        period: 'Tình trạng tại thời điểm lập',
        basis: 'theo phiếu cân đã xác minh trong Lưu trữ và chứng thư trong Danh mục',
        filters: wantFlags.length
          ? 'Chỉ hợp đồng: ' + wantFlags.map((x) => FLAGS[x]).join(' hoặc ')
          : 'Tất cả hợp đồng' + (q ? ' · tìm "' + p.q + '"' : ''),
        units: 'BDMT = tấn khô quy đổi; MT = tấn tươi; không quy đổi chéo giữa BDMT và MT',
        createdText: stamp(ctx.now),
      },
    });
    if (q && wantFlags.length) doc.header.filters += ' · tìm "' + p.q + '"';
    doc.sections.push({
      id: 'contracts',
      sheet: 'Tổng hợp',
      title: 'Tiến độ theo hợp đồng',
      note: 'BDMT gốc = trước phụ lục; BDMT hiện hành = sau phụ lục; "BDMT theo chi tiết hợp đồng" cộng BDMT của MỌI chi tiết, kể cả chi tiết chưa có số chứng thư (cột "Chi tiết có chứng thư" cho biết còn thiếu bao nhiêu; cờ "Thiếu chứng thư" lọc các hợp đồng này); "Còn lại" và % đã thực hiện tính theo số đó. MT thực giao lấy từ phiếu cân (sau trừ xe trả về) — hai đơn vị này khác nhau nên không so trực tiếp.',
      columns: cols,
      rows,
      totals: Object.assign(sumRow(cols, rows), { no: 'TỔNG CỘNG' }),
    });
    doc.counts = {};
    Object.keys(FLAGS).forEach((k) => (doc.counts[k] = items.filter((it) => contractFlags(it).indexOf(k) >= 0).length));
    doc.notes.push(
      'Số hợp đồng: ' +
        items.length +
        ' · thiếu chứng thư ' +
        doc.counts.missingCert +
        ' · vượt khối lượng ' +
        doc.counts.over +
        ' · lệch đối chiếu ' +
        doc.counts.mismatch +
        ' · chưa gắn tờ khai ' +
        doc.counts.noDecl +
        '.'
    );
    return doc;
  }

  /* ======================= Mẫu 4 — Hải quan và công nợ thuế ======================= */
  const DECL_STATUS = { opened: 'Đã mở tờ khai', waiting: 'Chờ thông quan', cleared: 'Đã thông quan' };
  const PAY_KIND = { tax: 'Thuế xuất khẩu', fee: 'Lệ phí / khác', refund: 'Hoàn thuế' };
  function taxReport(ctx, p0) {
    const p = Object.assign({ q: '' }, p0 || {});
    const CM = ctx.CM || HAK.CustomsModel,
      N = names(ctx);
    const companyOf =
      ctx.companyOfContract || ((c) => (HAK.Catalog && HAK.Catalog.companyIdsOf ? HAK.Catalog.companyIdsOf(c) : [])[0] || '');
    const q = String(p.q || '')
      .trim()
      .toLowerCase();
    const cols = [
      col('lvl', 'Cấp'),
      col('name', 'Công ty / hợp đồng / tờ khai', 'id'),
      col('status', 'Trạng thái tờ khai'),
      col('open', 'Ngày mở', 'date'),
      col('payable', 'Thuế phải nộp', 'vnd', { u: 'VND', sum: 1 }),
      col('paid', 'Đã nộp thuế (trước hoàn)', 'vnd', { u: 'VND', sum: 1 }),
      col('refunded', 'Đã hoàn', 'vnd', { u: 'VND', sum: 1 }),
      col('owed', 'Còn nợ', 'vnd', { u: 'VND', sum: 1 }),
      col('over', 'Nộp thừa (chờ hoàn)', 'vnd', { u: 'VND', sum: 1 }),
      col('fee', 'Lệ phí đã nộp', 'vnd', { u: 'VND', sum: 1 }),
      col('undet', 'Tờ khai chưa xác định nghĩa vụ thuế', 'int', { u: 'tờ khai', sum: 1 }),
      col('basis', 'Căn cứ thuế phải nộp'),
    ];
    const companies = new Map();
    (ctx.contracts || []).forEach((it) => {
      if (!it || !it.m || !it.m.c) return;
      const c = it.m.c,
        decls = it.m.T || [];
      if (!decls.length) return;
      if (q && [c.no, ...decls.map((x) => x.d.no)].join(' ').toLowerCase().indexOf(q) < 0) return;
      const cid = companyOf(c) || '',
        co = companies.get(cid) || { cid, contracts: [] };
      companies.set(cid, co);
      co.contracts.push({ c, decls });
    });
    const money = (t) => ({
      payable: t.undetermined ? '' : t.payable,
      paid: t.paidGross,
      refunded: t.refunded,
      owed: t.undetermined ? '' : t.owed,
      over: t.undetermined ? '' : t.over,
      fee: t.paidFee,
      undet: t.undetermined ? 1 : 0,
    });
    const rows = [],
      allDecls = [];
    const sumOf = (list) => {
      const s = CM.settlement(list.map((x) => x.d));
      return {
        payable: s.payable,
        paid: s.paidGross,
        refunded: s.refunded,
        owed: s.owed,
        over: s.over,
        fee: s.paidFee,
        undet: s.undetermined,
      };
    };
    Array.from(companies.values())
      .sort((a, b) => N.company(a.cid).localeCompare(N.company(b.cid)))
      .forEach((co) => {
        const all = co.contracts.flatMap((x) => x.decls);
        rows.push({
          c: Object.assign({ lvl: 'Công ty', name: N.company(co.cid), status: '', open: '', basis: '' }, sumOf(all)),
          cls: 'main',
          nosum: true,
        });
        co.contracts.forEach(({ c, decls }) => {
          rows.push({
            c: Object.assign({ lvl: 'Hợp đồng', name: c.no || c.id, status: N.type(c.type), open: c.date || '', basis: '' }, sumOf(decls)),
            cls: 'sub',
            nosum: true,
          });
          decls.forEach(({ d, t }) => {
            allDecls.push(d);
            const sup = t.lastSupplement,
              pays = CM.active(d.payments),
              supps = CM.active(d.supplements);
            rows.push({
              c: Object.assign(
                {
                  lvl: 'Tờ khai',
                  name: d.no,
                  status: DECL_STATUS[d.status] || d.status || '',
                  open: d.openDate || d.changedAt || '',
                  basis: t.undetermined
                    ? 'Chưa có thuế gốc / khai bổ sung'
                    : sup
                      ? 'Khai bổ sung lần ' + (sup.round || '?') + (sup.no ? ' (số ' + sup.no + ')' : '')
                      : 'Tờ khai gốc',
                },
                money(t)
              ),
              drill: {
                declId: d.id,
                no: d.no,
                basis: t.undetermined
                  ? 'Chưa xác định nghĩa vụ thuế'
                  : sup
                    ? 'Thuế phải nộp theo khai bổ sung lần ' + (sup.round || '?')
                    : 'Thuế phải nộp theo tờ khai gốc',
                receipts: pays.map((x) => ({
                  receiptNo: x.receiptNo,
                  refNo: x.refNo,
                  date: x.date,
                  kind: PAY_KIND[x.kind] || x.kind,
                  amount: x.amount,
                  content: x.content,
                })),
                supps: supps.map((x) => ({ round: x.round, no: x.no, date: x.date, taxVnd: x.taxVnd, reason: x.reason })),
              },
            });
          });
        });
      });
    const st = CM.settlement(allDecls);
    const totals = {
      lvl: '',
      name: 'TỔNG CỘNG (cộng riêng từng tờ khai)',
      payable: st.payable,
      paid: st.paidGross,
      refunded: st.refunded,
      owed: st.owed,
      over: st.over,
      fee: st.paidFee,
      undet: st.undetermined,
    };
    const doc = newDoc(ctx, p, 'tax', 'HẢI QUAN VÀ CÔNG NỢ THUẾ', null, {
      header: {
        company: ctx.companyText || 'Tất cả công ty được phép',
        period: 'Tình trạng tại thời điểm lập',
        basis: 'theo tờ khai trong Danh mục, giấy nộp tiền và lần khai bổ sung mới nhất có số thuế',
        filters: q ? 'Tìm "' + p.q + '"' : 'Tất cả tờ khai trong phạm vi',
        units: 'Tiền thuế và lệ phí: VND (đồng). Không bù trừ giữa các tờ khai.',
        createdText: stamp(ctx.now),
      },
    });
    doc.sections.push({
      id: 'tax',
      sheet: 'Tổng hợp',
      title: 'Công ty → hợp đồng → tờ khai',
      note: 'Còn nợ và nộp thừa được tính RIÊNG từng tờ khai, không bù trừ. "Còn nợ" và "Nộp thừa" đã trừ khoản hoàn thuế; "Đã nộp" là số trước hoàn. Dòng Công ty / Hợp đồng là cộng các tờ khai bên dưới (không cộng lặp vào tổng cuối).',
      columns: cols,
      rows,
      totals,
    });
    doc.net = { value: st.net, name: 'Số dư ròng (phải nộp − đã nộp sau hoàn; chỉ để tham khảo, không bù trừ giữa các tờ khai)' };
    doc.notes.push(doc.net.name + ': ' + fmtNum(st.net, 0) + ' VND.');
    if (st.undetermined)
      doc.warnings.push(
        st.undetermined + ' tờ khai chưa xác định nghĩa vụ thuế (chưa có thuế gốc / khai bổ sung) — không tính vào Còn nợ / Nộp thừa.'
      );
    if (st.nStale) doc.warnings.push(st.nStale + ' tờ khai có khai bổ sung mới nhất chưa nhập số thuế — đang tính theo lần trước.');
    if (st.over > 0) doc.warnings.push('Nộp thừa ' + fmtNum(st.over, 0) + ' VND (' + st.nOver + ' tờ khai) — cần làm thủ tục hoàn thuế.');
    return doc;
  }

  /* ======================= Mẫu 5 — Ngoại lệ cần đối soát ======================= */
  function exceptionsReport(ctx, p0) {
    // Ngoại lệ luôn dò THEO TỪNG PHIẾU (ngày cân): hồ sơ lỗi đọc và phiếu thiếu ngày chỉ phát hiện được ở căn cứ này, bất kể căn cứ đang chọn ở trang.
    const p = Object.assign({}, p0 || {}, { basis: 'weigh' });
    const N = names(ctx),
      m = runCompute(ctx, p, p.from, p.to);
    const doc = newDoc(ctx, p, 'exceptions', 'NGOẠI LỆ CẦN ĐỐI SOÁT', m);
    const items = [];
    const push = (o) => items.push(o);
    (m.conflicts || []).forEach((c) =>
      push({
        kind: 'Phiếu trùng có xung đột',
        source:
          'Hồ sơ: ' +
          [c.counted && c.counted.rec && c.counted.rec.title]
            .concat((c.others || []).map((o) => o.rec && o.rec.title))
            .filter(Boolean)
            .join(' ↔ '),
        target: [c.ticket && 'Phiếu ' + c.ticket, c.plate, c.date].filter(Boolean).join(' · '),
        why: 'Cùng phiếu nhưng khác ' + (c.fields || []).join(', ') + ' giữa các hồ sơ',
        kg: c.counted ? c.counted.net : 0,
        status: 'Tạm tính theo hồ sơ mới nhất — chờ đối soát',
        open: c.counted && c.counted.rec ? { kind: 'record', id: c.counted.rec.id } : null,
      })
    );
    ((m.unallocated && m.unallocated.items) || []).forEach((u) =>
      push({
        kind: u.whole ? 'Hồ sơ lỗi đọc' : 'Phiếu thiếu / sai ngày cân',
        source: 'Hồ sơ: ' + (u.title || u.id),
        target: fmtDate(u.from) + ' → ' + fmtDate(u.to) + ' · ' + N.type(u.type),
        why: u.reason,
        kg: u.kg,
        status: 'Chưa phân bổ',
        open: { kind: 'record', id: u.id },
      })
    );
    if (ctx.unassignedSkipped)
      doc.warnings.push(
        'Chưa kiểm được phiếu chưa gắn hồ sơ vì ' +
          ctx.unassignedSkipped +
          ' hồ sơ không đọc được phiếu cân (không thể khẳng định phiếu nào chưa thuộc hồ sơ nào).'
      );
    const UN_CAP = 300,
      unList = ctx.unassigned || [];
    if (unList.length > UN_CAP)
      doc.warnings.push('Có ' + unList.length + ' phiếu trong đợt đang nạp chưa gắn hồ sơ; danh sách chỉ hiện ' + UN_CAP + ' phiếu đầu.');
    unList.slice(0, UN_CAP).forEach((t) =>
      push({
        kind: 'Phiếu chưa gắn hồ sơ',
        source: 'Đợt Excel đang nạp: ' + (t.batch || '?') + ' · ' + N.type(t.type),
        target: [t.ticket && 'Phiếu ' + t.ticket, t.plate, t.date].filter(Boolean).join(' · '),
        why: 'Phiếu nằm trong đợt đang nạp nhưng chưa thuộc hồ sơ nào trong Lưu trữ',
        kg: t.net,
        status: 'Chưa gắn hồ sơ',
        open: { kind: 'batch', type: t.type },
      })
    );
    (ctx.unlinked || []).forEach((u) =>
      push({
        kind: 'Hồ sơ chưa gắn hợp đồng',
        source: 'Hồ sơ: ' + (u.title || u.id),
        target: [u.ship, N.type(u.type)].filter(Boolean).join(' · '),
        why: 'Hồ sơ Lưu trữ chưa gắn chi tiết hợp đồng nào',
        kg: u.kg || 0,
        status: 'Chưa gắn hợp đồng',
        open: { kind: 'record', id: u.id },
      })
    );
    (ctx.contracts || []).forEach((it) => {
      const lots = (it.g && it.g.lots) || [];
      lots.forEach((L) => {
        if (!L.c || !isNum(L.c.mt) || !(L.trips > 0)) return;
        const gap = Number(L.c.mt) - L.delKg / 1000;
        if (Math.abs(gap) < 0.005) return;
        push({
          kind: 'Chênh lệch chứng thư – thực giao',
          source: 'Hợp đồng: ' + ((it.m && it.m.c && it.m.c.no) || it.g.key),
          target: [L.ship, L.c.certNo && 'CT ' + L.c.certNo].filter(Boolean).join(' · '),
          why:
            'MT theo chứng thư ' +
            fmtNum(L.c.mt, 2) +
            ' ≠ MT thực giao qua cân ' +
            fmtNum(L.delKg / 1000, 2) +
            ' (chênh ' +
            fmtNum(gap, 2) +
            ' MT)',
          kg: Math.abs(gap) * 1000,
          status: 'Cần đối soát',
          open: { kind: 'contract', id: it.m ? it.m.c.id : it.g.key },
        });
      });
    });
    const verifiedKg = m.used.reduce((s, r) => s + del({ kg: r.kg, retKg: r.retKg }), 0),
      verifiedTrips = m.used.reduce((s, r) => s + (r.trips || 0), 0);
    const u = m.unallocated || { n: 0, kg: 0, trips: 0, delKg: 0 };
    const scols = [
      col('item', 'Phần số liệu'),
      col('n', 'Số mục', 'int'),
      col('trips', 'Số xe', 'int'),
      col('kg', 'Khối lượng', 'int', { u: 'kg' }),
      col('status', 'Tình trạng'),
    ];
    const srows = [
      { c: { item: 'Đã xác minh (đã tính vào báo cáo)', n: m.used.length, trips: verifiedTrips, kg: verifiedKg, status: 'Đã xác minh' } },
      {
        c: {
          item: 'Tạm tính do phiếu trùng có xung đột',
          n: (m.conflicts || []).length,
          trips: (m.conflicts || []).length,
          kg: m.pendingKg || 0,
          status: 'Tạm tính — chờ đối soát',
        },
      },
      { c: { item: 'Chưa phân bổ theo ngày cân', n: u.n, trips: u.trips, kg: u.delKg, status: 'Chưa phân bổ' } },
      {
        c: {
          item: 'Phiếu trùng đã loại (giữ một lần)',
          n: m.dupTickets ? m.dupTickets.trips : 0,
          trips: m.dupTickets ? m.dupTickets.trips : 0,
          kg: m.dupTickets ? m.dupTickets.kg : 0,
          status: 'Đã loại khỏi số liệu',
        },
      },
    ];
    doc.sections.push({
      id: 'summary',
      sheet: 'Tổng hợp',
      title: 'Phần đã xác minh và phần còn tạm tính / chưa phân bổ',
      note: 'Khối lượng ở đây là thực giao (qua cân − xe trả về) cho dòng "đã xác minh" và "chưa phân bổ".',
      columns: scols,
      rows: srows,
    });
    const kinds = Array.from(new Set(items.map((x) => x.kind)));
    const kcols = [
      col('kind', 'Nhóm ngoại lệ'),
      col('n', 'Số mục', 'int', { sum: 1 }),
      col('kg', 'Khối lượng', 'int', { u: 'kg', sum: 1 }),
    ];
    doc.sections.push({
      id: 'kinds',
      sheet: 'Tổng hợp',
      title: 'Theo nhóm ngoại lệ',
      columns: kcols,
      rows: kinds.map((k) => ({
        c: { kind: k, n: items.filter((x) => x.kind === k).length, kg: items.filter((x) => x.kind === k).reduce((s, x) => s + x.kg, 0) },
      })),
      totals: { kind: 'TỔNG CỘNG', n: items.length, kg: items.reduce((s, x) => s + x.kg, 0) },
    });
    const icols = [
      col('kind', 'Nhóm ngoại lệ'),
      col('source', 'Nguồn dữ liệu'),
      col('target', 'Đối tượng'),
      col('why', 'Lý do cần kiểm tra'),
      col('kg', 'Khối lượng', 'int', { u: 'kg', sum: 1 }),
      col('status', 'Tình trạng'),
    ];
    doc.sections.push({
      id: 'items',
      sheet: 'Chi tiết',
      title: 'Danh sách ngoại lệ',
      note: 'Mỗi dòng mở được bản ghi nguồn (hồ sơ, hợp đồng hoặc đợt Excel).',
      columns: icols,
      rows: items.map((x) => ({
        c: { kind: x.kind, source: x.source, target: x.target, why: x.why, kg: x.kg, status: x.status },
        open: x.open,
      })),
      totals: { kind: 'TỔNG CỘNG', kg: items.reduce((s, x) => s + x.kg, 0) },
    });
    doc.items = items;
    if (!items.length) doc.notes.push('Không có ngoại lệ nào trong phạm vi đang chọn.');
    return doc;
  }

  /* ======================= Danh sách mẫu và điểm vào ======================= */
  const TEMPLATES = [
    {
      id: 'period',
      label: 'Tổng hợp xuất hàng theo kỳ',
      q: 'Mỗi kỳ / mỗi công ty, hình thức, kho đã xuất bao nhiêu và so với kỳ trước ra sao?',
      src: 'Hồ sơ trong 🗄️ Lưu trữ và phiếu cân của hồ sơ (theo ngày cân từng phiếu hoặc ngày bắt đầu hồ sơ).',
      trace: 'Từ một dòng nhóm / kỳ bấm "Hồ sơ" để xem các hồ sơ tạo ra số liệu và mở hồ sơ trong Lưu trữ.',
      build: periodReport,
    },
    {
      id: 'breakdown',
      label: 'Phân tích theo tàu, kho, đơn vị vận chuyển',
      q: 'Tàu / kho / ĐVVC nào xuất nhiều, tỷ lệ xe trả về bao nhiêu, chiếm bao nhiêu phần trăm?',
      src: 'Hồ sơ và phiếu cân trong 🗄️ Lưu trữ (đơn vị vận chuyển lấy từ từng phiếu cân).',
      trace: 'Từ một dòng tổng bấm "Hồ sơ" hoặc "Phiếu cân" để xem đúng các hồ sơ / phiếu tạo ra số liệu đó.',
      build: breakdownReport,
    },
    {
      id: 'contracts',
      label: 'Tiến độ và đối chiếu hợp đồng',
      q: 'Mỗi hợp đồng đã thực hiện bao nhiêu BDMT, còn lại bao nhiêu, có thiếu chứng thư / vượt KL / lệch / chưa gắn tờ khai không?',
      src: 'Danh mục hợp đồng + phụ lục, chứng thư, tờ khai (🧭 Báo cáo thực hiện hợp đồng) và phiếu cân trong Lưu trữ.',
      trace: 'Từ một dòng bấm "Hồ sơ hợp đồng" hoặc "Phiếu cân" để mở hồ sơ hợp đồng / danh sách phiếu cân của hợp đồng đó.',
      build: contractsReport,
    },
    {
      id: 'tax',
      label: 'Hải quan và công nợ thuế',
      q: 'Thuế phải nộp, đã nộp, đã hoàn, còn nợ, nộp thừa của từng công ty → hợp đồng → tờ khai?',
      src: 'Danh mục → 🛃 Tờ khai hải quan: thuế gốc, lần khai bổ sung, giấy nộp tiền, hoàn thuế, lệ phí.',
      trace: 'Từ một tờ khai bấm "Giấy nộp tiền · khai bổ sung" để xem từng giấy nộp tiền và lần khai bổ sung làm căn cứ.',
      build: taxReport,
    },
    {
      id: 'exceptions',
      label: 'Ngoại lệ cần đối soát',
      q: 'Còn những phiếu / hồ sơ / hợp đồng nào chưa chắc chắn cần kiểm tra lại?',
      src: 'Lưu trữ (đối soát phiếu trùng, hồ sơ lỗi đọc, phiếu thiếu ngày), Danh mục hợp đồng (chứng thư – thực giao) và các đợt Excel đang nạp.',
      trace: 'Mỗi dòng có nút "Mở bản ghi nguồn" (hồ sơ, hợp đồng hoặc đợt Excel).',
      build: exceptionsReport,
    },
  ];
  function build(id, ctx, p) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error('Không có mẫu báo cáo "' + id + '".');
    return t.build(ctx, p || {});
  }

  /* ======================= Biểu đồ SVG (cùng số liệu với bảng) ======================= */
  const escX = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function chartSvg(spec) {
    if (!spec || !spec.points || !spec.points.length) return '';
    const W = 680,
      H = 250,
      L = 64,
      R = 12,
      T = 28,
      B = 70;
    const sc = spec.scale || 1,
      vals = spec.points.map((p) => (Number(p.value) || 0) / sc),
      max = Math.max.apply(null, vals.concat([0.000001])),
      n = vals.length,
      iw = W - L - R,
      ih = H - T - B;
    const X = (i) => L + (n === 1 ? iw / 2 : (iw * i) / (n - 1)),
      bw = Math.min(46, iw / n - 6),
      BX = (i) => L + (iw * (i + 0.5)) / n,
      Y = (v) => T + ih - (v / max) * ih;
    let s =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      W +
      ' ' +
      H +
      '" role="img" aria-label="' +
      escX(spec.title) +
      '" class="rt-chart"><title>' +
      escX(spec.title) +
      '</title>';
    s +=
      '<text x="' +
      L +
      '" y="16" font-size="12" font-weight="bold" fill="currentColor">' +
      escX(spec.title) +
      ' (' +
      escX(spec.unit) +
      ')</text>';
    for (let g = 0; g <= 4; g++) {
      const v = (max * g) / 4,
        y = Y(v);
      s +=
        '<line x1="' +
        L +
        '" x2="' +
        (W - R) +
        '" y1="' +
        y +
        '" y2="' +
        y +
        '" stroke="currentColor" stroke-opacity=".15"/><text x="' +
        (L - 6) +
        '" y="' +
        (y + 4) +
        '" font-size="10" text-anchor="end" fill="currentColor">' +
        fmtNum(v, max >= 10 ? 0 : 2) +
        '</text>';
    }
    if (spec.type === 'line') {
      s +=
        '<polyline fill="none" stroke="#0a58ca" stroke-width="2" points="' +
        vals.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') +
        '"/>';
      vals.forEach((v, i) => {
        s +=
          '<circle cx="' +
          X(i).toFixed(1) +
          '" cy="' +
          Y(v).toFixed(1) +
          '" r="3.5" fill="#0a58ca"><title>' +
          escX(spec.points[i].label) +
          ': ' +
          fmtNum(v, 2) +
          ' ' +
          escX(spec.unit) +
          '</title></circle>';
      });
    } else {
      vals.forEach((v, i) => {
        s +=
          '<rect x="' +
          (BX(i) - bw / 2).toFixed(1) +
          '" y="' +
          Y(v).toFixed(1) +
          '" width="' +
          bw.toFixed(1) +
          '" height="' +
          Math.max(0, T + ih - Y(v)).toFixed(1) +
          '" fill="#0a58ca"><title>' +
          escX(spec.points[i].label) +
          ': ' +
          fmtNum(v, 2) +
          ' ' +
          escX(spec.unit) +
          '</title></rect>';
      });
    }
    spec.points.forEach((pt, i) => {
      const x = spec.type === 'line' ? X(i) : BX(i),
        lab = String(pt.label).length > 16 ? String(pt.label).slice(0, 15) + '…' : String(pt.label);
      s +=
        '<text x="' +
        x.toFixed(1) +
        '" y="' +
        (T + ih + 12) +
        '" font-size="10" text-anchor="end" transform="rotate(-35 ' +
        x.toFixed(1) +
        ' ' +
        (T + ih + 12) +
        ')" fill="currentColor">' +
        escX(lab) +
        '</text>';
    });
    return s + '</svg>';
  }

  /* ======================= Excel ======================= */
  const NUMFMT = { int: '#,##0', vnd: '#,##0', dec: '#,##0.00', usd: '#,##0.00', pct: '0.0%', date: 'dd/mm/yyyy', text: '@', id: '@' };
  const colLetter = (i) => {
    let s = '',
      n = i + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  function cellValue(c, v) {
    if (v === null || v === undefined || v === '') return null;
    if (c.t === 'id' || c.t === 'text') return String(v); // số phiếu / số tờ khai / biển số: văn bản, giữ số 0 đầu
    if (c.t === 'date') {
      const ts = typeof v === 'number' ? v : isoTs(String(v)) !== null ? isoTs(String(v)) : dmyTs(v);
      return ts === null ? String(v) : new Date(ts);
    }
    return isNum(v) ? Number(v) : String(v);
  }
  /** Workbook (ExcelJS) từ doc: sheet "Tổng hợp" + "Chi tiết" khi có; ô số / ngày đúng kiểu. E = constructor module ExcelJS. */
  function toExcel(doc, E) {
    const wb = new E.Workbook();
    wb.creator = 'HAK';
    wb.created = new Date();
    const sheets = [];
    doc.sections.forEach((s) => {
      if (!sheets.includes(s.sheet)) sheets.push(s.sheet);
    });
    const thin = { style: 'thin', color: { argb: 'FF808080' } },
      B = { top: thin, left: thin, bottom: thin, right: thin };
    sheets.forEach((name) => {
      const ws = wb.addWorksheet(name),
        secs = doc.sections.filter((s) => s.sheet === name),
        ncol = Math.max.apply(
          null,
          secs.map((s) => s.columns.length)
        );
      ws.columns = Array.from({ length: ncol }, (_, i) => ({
        width: Math.max.apply(
          null,
          secs.map((s) => (s.columns[i] ? s.columns[i].w || (s.columns[i].t === 'text' || s.columns[i].t === 'id' ? 26 : 16) : 8))
        ),
      }));
      let r = 1;
      const line = (text, o) => {
        ws.mergeCells(r, 1, r, ncol);
        Object.assign(
          ws.getCell(r, 1),
          Object.assign({ value: text, font: { name: 'Arial', size: 9 }, alignment: { wrapText: true, vertical: 'top' } }, o || {})
        );
        r++;
      };
      line(doc.title, { font: { name: 'Arial', size: 13, bold: true } });
      const h = doc.header;
      line('Công ty: ' + h.company);
      line('Kỳ: ' + h.period + ' · Căn cứ tính kỳ: ' + h.basis);
      line('Bộ lọc đang áp dụng: ' + h.filters);
      line('Đơn vị: ' + h.units);
      line('Thời điểm lập: ' + h.createdText);
      doc.notes
        .concat(doc.warnings.map((x) => '⚠ ' + x))
        .forEach((t) => line(t, { font: { name: 'Arial', size: 9, italic: true, color: { argb: 'FF555555' } } }));
      r++;
      let titleRow = null;
      secs.forEach((s) => {
        line(s.title, { font: { name: 'Arial', size: 11, bold: true } });
        if (s.note) {
          line(s.note, { font: { name: 'Arial', size: 9, italic: true, color: { argb: 'FF555555' } } });
          ws.getRow(r - 1).height = 30;
        }
        const head = r;
        if (titleRow === null) titleRow = head;
        s.columns.forEach((c, i) =>
          Object.assign(ws.getCell(r, i + 1), {
            value: headerText(c),
            font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
            border: B,
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
          })
        );
        ws.getRow(r).height = 32;
        r++;
        const first = r;
        s.rows.forEach((row) => {
          s.columns.forEach((c, i) => {
            const cell = ws.getCell(r, i + 1);
            cell.value = cellValue(c, row.c[c.k]);
            cell.border = B;
            cell.font = { name: 'Arial', size: 9, bold: /main|total/.test(row.cls || '') };
            cell.numFmt = NUMFMT[c.t] || '@';
            if (c.t !== 'text' && c.t !== 'id' && c.t !== 'date') cell.alignment = { horizontal: 'right' };
            if (/main/.test(row.cls || '')) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3F8' } };
          });
          r++;
        });
        if (s.totals) {
          s.columns.forEach((c, i) => {
            const cell = ws.getCell(r, i + 1);
            cell.border = {
              top: { style: 'double', color: { argb: 'FF808080' } },
              bottom: { style: 'double', color: { argb: 'FF808080' } },
              left: thin,
              right: thin,
            };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
            cell.font = { name: 'Arial', size: 9, bold: true };
            const tv = s.totals[c.k];
            cell.numFmt = NUMFMT[c.t] || '@';
            if (c.sum && s.rows.length && !s.rows.some((x) => x.nosum)) {
              cell.value = { formula: 'SUM(' + colLetter(i) + first + ':' + colLetter(i) + (r - 1) + ')', result: Number(tv) || 0 };
              cell.alignment = { horizontal: 'right' };
            } else if (tv !== undefined && tv !== '') {
              cell.value = cellValue(c, tv);
              if (c.t !== 'text' && c.t !== 'id') cell.alignment = { horizontal: 'right' };
            }
          });
          r++;
        }
        r++;
      });
      ws.headerFooter.oddFooter = 'HAK · &D · Trang &P / &N';
      ws.pageSetup = {
        paperSize: 9,
        orientation: ncol > 7 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: titleRow + ':' + titleRow,
      };
    });
    return wb;
  }

  /* ======================= PDF / in ======================= */
  /** Đặc tả cho HAK.Customs.printReport: A4 ngang / dọc và cỡ chữ theo số cột, tiêu đề bảng lặp lại khi sang trang. */
  function toPrintSpec(doc) {
    const maxCols = Math.max.apply(null, doc.sections.map((s) => s.columns.length).concat([1]));
    const h = doc.header;
    return {
      file: 'BaoCao_' + doc.id,
      title: doc.title,
      sub: [
        'Công ty: ' + h.company,
        'Kỳ: ' + h.period + ' · Căn cứ: ' + h.basis,
        'Bộ lọc: ' + h.filters,
        'Đơn vị: ' + h.units,
        'Lập lúc: ' + h.createdText,
      ]
        .concat(
          doc.notes,
          doc.warnings.map((x) => '⚠ ' + x)
        )
        .join(' | '),
      orientation: maxCols <= 7 ? 'portrait' : 'landscape',
      fontPt: maxCols <= 7 ? 8.5 : maxCols <= 11 ? 7.5 : 6.5,
      tables: doc.sections.map((s, i) => ({
        caption: s.title + (s.note ? ' — ' + s.note : ''),
        svg: s.chart ? chartSvg(s.chart) : '',
        pageBreak: i > 0 && s.sheet !== doc.sections[i - 1].sheet,
        cols: s.columns.map((c) => ({ h: headerText(c), n: c.t !== 'text' && c.t !== 'id' && c.t !== 'date' })),
        rows: s.rows
          .map((r) => ({ cls: r.cls || '', c: s.columns.map((c) => fmtCell(c, r.c[c.k])) }))
          .concat(s.totals ? [{ cls: 'main', c: s.columns.map((c) => fmtCell(c, s.totals[c.k])) }] : []),
      })),
    };
  }

  HAK.ReportTpl = {
    TEMPLATES,
    FLAGS,
    SORTS,
    BY_TEXT,
    GRAN_TEXT,
    build,
    periodReport,
    breakdownReport,
    contractsReport,
    taxReport,
    exceptionsReport,
    contractFlags,
    scopeMetas,
    prevRange,
    bucketOf,
    fmtNum,
    fmtDate,
    fmtCell,
    headerText,
    chartSvg,
    toExcel,
    toPrintSpec,
  };
  if (typeof module === 'object' && module.exports) module.exports = HAK.ReportTpl;
})(typeof window !== 'undefined' ? window : globalThis);
