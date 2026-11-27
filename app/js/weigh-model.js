/**
 * weigh-model.js — nhận diện và đối soát PHIẾU CÂN giữa các hồ sơ Lưu trữ (v2.17.0). Hàm thuần, không DOM → kiểm thử trong Node.
 *
 * Vì sao cần: hai hồ sơ cùng tàu / cùng chi tiết hợp đồng có thể giao nhau về ngày (A: P1,P2 — B: P2,P3). Loại cả hồ sơ cũ làm MẤT P1;
 * cộng cả hai làm TRÙNG P2. Ở đây trùng được xác định ở cấp PHIẾU:
 *   - Nhận diện = công ty (cid) + số phiếu + ngày cân + biển số (có số phiếu); không có số phiếu → công ty + ngày + giờ cân 1 + biển số;
 *     thiếu cả hai → không nhận diện được → luôn được tính (đếm riêng "phiếu không nhận diện được").
 *   - Cùng nhận diện, cùng khối lượng, cùng cờ xe trả về, cùng liên kết (hợp đồng + tàu) → trùng → tính 1 lần (hồ sơ mới nhất giữ phiếu).
 *   - Cùng nhận diện nhưng khác khối lượng / cờ trả về / liên kết → XUNG ĐỘT: tính tạm theo hồ sơ mới nhất, liệt kê mọi hồ sơ nguồn, tổng đang "chờ đối soát".
 *   - Lặp lại trong CÙNG một hồ sơ không bị coi là trùng (số phiếu dùng chung cho nhiều xe vẫn đủ).
 * Phạm vi so khớp: cùng loại biên bản + cùng công ty + hồ sơ giao nhau về ngày cân. Cùng một phiếu đi qua nhiều loại (kho gửi → xuất khẩu)
 * vẫn tính ở từng loại; "tổng thực giao" (overall) mới loại trùng giữa các loại.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const norm = (s) =>
    String(s == null ? '' : s)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  /** Khóa biển số (xem HAK.Excel.util.plateKey): "43c-111.11" ≡ "43C 11111". */
  const plateKey = (s) =>
    String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'D')
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '');
  const kgKey = (n) => Math.round((Number(n) || 0) * 1000); // so khớp khối lượng lẻ tới gram

  /** Khóa nhận diện của 1 dòng phiếu cân (null = không nhận diện được). */
  function identity(row, cid) {
    const r = row || {},
      c = norm(cid),
      date = norm(r.dateStr),
      plate = plateKey(r.plate),
      tk = norm(r.ticket);
    if (tk) return 'T|' + c + '|' + tk + '|' + date + '|' + plate;
    if (plate && norm(r.time1)) return 'S|' + c + '|' + date + '|' + norm(r.time1) + '|' + plate;
    return null;
  }
  /**
   * Phiếu của 1 hồ sơ. rows = các dòng đã lọc theo hồ sơ; isRet(row) → xe trả về; meta = { id, cid, contract, ship }.
   * @returns {{id:string|null, key:string|null, ticket:string, date:string, plate:string, net:number, ret:boolean, link:string}[]}
   */
  function ticketsOf(rows, isRet, meta) {
    const m = meta || {},
      seen = new Map(),
      link = norm(m.contract) + '|' + norm(m.ship);
    return (rows || []).map((row, i) => {
      const base = identity(row, m.cid);
      let id = null;
      if (base) {
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        id = base + '#' + n;
      }
      return {
        i,
        id,
        ticket: String(row.ticket == null ? '' : row.ticket).trim(),
        date: row.dateStr || '',
        plate: String(row.plate || '').trim(),
        net: Number(row.net) || 0,
        carrier: String(row.carrier == null ? '' : row.carrier).trim(), // đơn vị vận chuyển (phân tích theo ĐVVC)
        uid: row.uid,
        ret: !!(isRet && isRet(row)),
        link,
      };
    });
  }
  /** Nhóm hồ sơ giao nhau về ngày cân trong cùng loại + công ty → các cụm ≥ 2 hồ sơ cần đối soát. */
  function clusters(recs) {
    const groups = new Map();
    recs.forEach((r) => {
      if (r.fromTs == null || r.fromTs === undefined) return;
      const k = r.type + '|' + (r.cid || '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    const out = [];
    groups.forEach((list) => {
      list.sort((a, b) => a.fromTs - b.fromTs);
      let cur = [],
        hi = -Infinity;
      list.forEach((r) => {
        if (cur.length && r.fromTs > hi) {
          if (cur.length > 1) out.push(cur);
          cur = [];
          hi = -Infinity;
        }
        cur.push(r);
        hi = Math.max(hi, r.toTs == null ? r.fromTs : r.toTs);
      });
      if (cur.length > 1) out.push(cur);
    });
    return out;
  }
  /**
   * Đối soát 1 cụm. entries = [{ rec:{id,title,updatedAt}, tickets }] (đã chỉ gồm hồ sơ đang tính).
   * @returns {{ byRec: Map<id,{trips,kg,retTrips,retKg,dupTrips,dupKg,noIdTrips}>, conflicts:[], dup:{trips,kg}, pendingKg:number }}
   */
  function resolve(entries) {
    const order = entries
      .slice()
      .sort((a, b) => (b.rec.updatedAt || 0) - (a.rec.updatedAt || 0) || String(a.rec.id).localeCompare(String(b.rec.id)));
    const owner = new Map(),
      conflictOf = new Map(),
      byRec = new Map();
    let dupTrips = 0,
      dupKg = 0;
    order.forEach(({ rec, tickets }) => {
      const e = { trips: 0, kg: 0, retTrips: 0, retKg: 0, dupTrips: 0, dupKg: 0, noIdTrips: 0, skip: new Set() };
      byRec.set(rec.id, e);
      tickets.forEach((t) => {
        if (!t.id) {
          e.noIdTrips++;
          count(e, t);
          return;
        }
        const o = owner.get(t.id);
        if (!o) {
          owner.set(t.id, { rec, t });
          count(e, t);
          return;
        }
        if (o.rec.id === rec.id) {
          count(e, t);
          return;
        }
        const same = kgKey(o.t.net) === kgKey(t.net) && o.t.ret === t.ret && o.t.link === t.link;
        if (same) {
          e.dupTrips++;
          e.dupKg += t.net;
          dupTrips++;
          dupKg += t.net;
          e.skip.add(t.i);
          return;
        }
        e.skip.add(t.i);
        let c = conflictOf.get(t.id);
        if (!c) {
          c = {
            id: t.id.replace(/#\d+$/, ''),
            ticket: o.t.ticket,
            date: o.t.date,
            plate: o.t.plate,
            counted: { rec: o.rec, net: o.t.net, ret: o.t.ret, link: o.t.link },
            others: [],
          };
          conflictOf.set(t.id, c);
        }
        c.others.push({ rec, net: t.net, ret: t.ret, link: t.link });
      });
    });
    const conflicts = Array.from(conflictOf.values());
    conflicts.forEach((c) => {
      c.fields = [];
      const all = [c.counted].concat(c.others);
      if (new Set(all.map((x) => kgKey(x.net))).size > 1) c.fields.push('khối lượng');
      if (new Set(all.map((x) => x.ret)).size > 1) c.fields.push('xe trả về');
      if (new Set(all.map((x) => x.link)).size > 1) c.fields.push('liên kết hợp đồng / tàu');
    });
    return { byRec, conflicts, dup: { trips: dupTrips, kg: dupKg }, pendingKg: conflicts.reduce((a, c) => a + c.counted.net, 0) };
  }
  function count(e, t) {
    e.trips++;
    e.kg += t.net;
    if (t.ret) {
      e.retTrips++;
      e.retKg += t.net;
    }
  }
  /** Tổng thực giao loại trùng GIỮA các loại biên bản (cùng phiếu đi qua nhiều nghiệp vụ). entries như resolve, mỗi rec có type. */
  function overall(entries) {
    const seen = new Set(),
      o = { trips: 0, kg: 0, retKg: 0, delKg: 0, sharedTrips: 0, sharedKg: 0 };
    entries
      .slice()
      .sort((a, b) => (b.rec.updatedAt || 0) - (a.rec.updatedAt || 0) || String(a.rec.id).localeCompare(String(b.rec.id)))
      .forEach(({ rec, tickets }) => {
        tickets.forEach((t) => {
          const k = t.id ? t.id.replace(/#\d+$/, '') + '#' + (t.id.match(/#(\d+)$/) || [])[1] : null;
          if (k && seen.has(k)) {
            o.sharedTrips++;
            o.sharedKg += t.net;
            return;
          }
          if (k) seen.add(k);
          o.trips++;
          o.kg += t.net;
          if (t.ret) o.retKg += t.net;
        });
      });
    o.delKg = o.kg - o.retKg;
    return o;
  }
  /**
   * Phát hiện các phiếu cân có dấu hiệu bất thường về tải trọng hoặc lặp chuyến quá nhanh:
   *   - Quá tải trọng thông thường (mặc định > 45.000 kg).
   *   - Quá nhỏ hoặc số âm (mặc định <= 0 hoặc < 500 kg).
   *   - Cân lặp quá nhanh cùng biển số xe trong ngày (cách nhau < 15 phút).
   * @param {Array} rows - Danh sách các dòng phiếu cân
   * @param {Object} [opts] - Tùy chọn { maxNetKg: 45000, minNetKg: 500, minGapMinutes: 15 }
   * @returns {{ list: Array, overweightCount: number, underweightCount: number, rapidCount: number, total: number }}
   */
  function detectAnomalies(rows, opts) {
    if (!Array.isArray(rows) || !rows.length) {
      return { list: [], overweightCount: 0, underweightCount: 0, rapidCount: 0, total: 0 };
    }
    const o = opts || {};
    const maxNet = Number(o.maxNetKg) || 45000;
    const minNet = Number(o.minNetKg) || 500;
    const minGap = (Number(o.minGapMinutes) || 15) * 60 * 1000;

    const list = [];
    let overweightCount = 0;
    let underweightCount = 0;
    let rapidCount = 0;

    const lastSeenByPlate = new Map();

    rows.forEach((r, idx) => {
      const net = Number(r.net) || 0;
      const issues = [];

      // 1. Quá tải
      if (net > maxNet) {
        issues.push({
          type: 'overweight',
          msg: 'Khối lượng ' + Math.round(net / 10) / 100 + 't > ' + maxNet / 1000 + 't (vượt tải thông thường)',
        });
        overweightCount++;
      }
      // 2. Quá nhẹ hoặc âm
      else if (net <= 0 || net < minNet) {
        issues.push({ type: 'underweight', msg: 'Khối lượng ' + net + ' kg bất thường (<= ' + minNet + ' kg)' });
        underweightCount++;
      }

      // 3. Cân lặp quá nhanh
      const pk = plateKey(r.plate);
      const dateStr = norm(r.dateStr || r.date || '');
      if (pk && dateStr) {
        const key = dateStr + '|' + pk;
        const ts = r.ts || (r.time1 ? Date.parse(dateStr + ' ' + r.time1) || null : null);
        if (lastSeenByPlate.has(key)) {
          const prev = lastSeenByPlate.get(key);
          if (ts && prev.ts && Math.abs(ts - prev.ts) < minGap) {
            issues.push({
              type: 'rapid_repeat',
              msg:
                'Biển số ' +
                (r.plate || '') +
                ' cân lại chỉ sau ' +
                Math.round(Math.abs(ts - prev.ts) / 60000) +
                ' phút (phiếu trước #' +
                (prev.row.ticket || '') +
                ')',
            });
            rapidCount++;
          }
        }
        if (ts) lastSeenByPlate.set(key, { row: r, ts });
      }

      if (issues.length) {
        list.push({ row: r, index: idx, issues });
      }
    });

    return {
      list,
      overweightCount,
      underweightCount,
      rapidCount,
      total: list.length,
    };
  }

  HAK.Weigh = { identity, ticketsOf, clusters, resolve, overall, norm, plateKey, detectAnomalies };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Weigh;
})(typeof window !== 'undefined' ? window : globalThis);
