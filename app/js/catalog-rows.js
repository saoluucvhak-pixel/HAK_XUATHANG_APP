/**
 * catalog-rows.js — HAK.CatalogRows: phần CHIẾU quan hệ của Danh mục (hak.catalog.v1) vào các bảng SQLite có khóa ngoại.
 * Hàm thuần (không DOM, không mạng) → kiểm thử trong Node.
 *
 *   build(data)    → { tables: { customers, contracts, contract_details, contract_addenda, customs_decls, customs_supplements, customs_payments },
 *                      orphans:[{ table, id, field, target }], warnings:[{ table, id, field, msg }] }
 *   assemble(rows) → đối tượng Danh mục dựng LẠI từ các dòng (để chứng minh phần chiếu khớp bản gốc)
 *   TABLES         → thứ tự cha → con (ghi theo thứ tự này, xóa theo thứ tự ngược)
 *
 * Quy ước (xem installer/native/db/schema.v1.sql):
 *  - Mỗi dòng có `doc` = JSON của CHÍNH bản ghi đó (không lồng mảng con) và `ord` = vị trí trong mảng cha → dựng lại đúng thứ tự, không mất trường nào.
 *  - Cột kiểu chỉ là phần chiếu: khối lượng theo 1/1000 (số nguyên), tiền VND số nguyên. Giá trị có nhiều chữ số lẻ hơn độ chính xác cột → cảnh báo (doc vẫn giữ giá trị gốc).
 *  - Khóa ngoại cấu trúc: chi tiết / phụ lục → hợp đồng; khai bổ sung / giấy nộp tiền → tờ khai (luôn có). Tờ khai → hợp đồng / chi tiết: nếu đích KHÔNG tồn tại (dữ liệu cũ mồ côi)
 *    thì cột FK = NULL và ghi vào `orphans` (giá trị gốc vẫn nằm trong doc) — không chặn lưu, không che giấu.
 *  - Tham chiếu tới khách hàng (bên xuất / ủy thác / mua) là tham chiếu mềm: không FK, kiểm bằng HAK.Integrity.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const TABLES = [
    'customers',
    'contracts',
    'contract_details',
    'contract_addenda',
    'customs_decls',
    'customs_supplements',
    'customs_payments',
  ];
  const J = JSON.stringify;
  const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  const milli = (v, w, t, id, f) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      w.push({ table: t, id, field: f, msg: 'không phải số: ' + J(v) });
      return null;
    }
    const m = Math.round(n * 1000);
    if (Math.abs(n * 1000 - m) > 1e-6)
      w.push({ table: t, id, field: f, msg: 'nhiều hơn 3 chữ số lẻ (' + n + '): cột kiểu làm tròn, doc giữ nguyên' });
    return m;
  };
  const whole = (v, w, t, id, f) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      w.push({ table: t, id, field: f, msg: 'không phải số: ' + J(v) });
      return null;
    }
    if (n !== Math.round(n))
      w.push({ table: t, id, field: f, msg: 'không phải số nguyên đồng (' + n + '): cột kiểu làm tròn, doc giữ nguyên' });
    return Math.round(n);
  };
  /** Bản ghi cha không lồng mảng con; `$k` ghi nhớ khóa mảng nào ĐÃ có trong bản gốc (để dựng lại y hệt, kể cả khi thiếu khóa). */
  const without = (o, keys) => {
    const c = Object.assign({}, o),
      has = keys.filter((k) => Object.prototype.hasOwnProperty.call(o, k));
    keys.forEach((k) => delete c[k]);
    c.$k = has;
    return c;
  };

  function build(data) {
    const d = data || {},
      w = [],
      orphans = [];
    const T = {};
    TABLES.forEach((t) => (T[t] = []));
    (d.customers || []).forEach((c, ord) =>
      T.customers.push({ id: c.id, company_id: str(c.companyId), name: str(c.name), deleted_at: str(c.deletedAt), ord, doc: J(c) })
    );
    const contractIds = new Set((d.contracts || []).map((c) => c.id));
    const detailIds = new Set();
    (d.contracts || []).forEach((c) => (c.details || []).forEach((x) => detailIds.add(x.id)));
    (d.contracts || []).forEach((c, ord) => {
      T.contracts.push({
        id: c.id,
        no: str(c.no),
        type: str(c.type),
        exporter_id: str(c.exporterId),
        principal_id: str(c.principalId),
        buyer_id: str(c.buyerId),
        qty_milli: milli(c.contractQty, w, 'contracts', c.id, 'contractQty'),
        closed_at: str(c.closedAt),
        reopened_at: str(c.reopenedAt),
        deleted_at: str(c.deletedAt),
        ord,
        doc: J(without(c, ['details', 'addenda'])),
      });
      (c.details || []).forEach((x, i) =>
        T.contract_details.push({
          id: x.id,
          contract_id: c.id,
          ship: str(x.ship),
          qty_milli: milli(x.qty, w, 'contract_details', x.id, 'qty'),
          bdmt_milli: milli(x.bdmt, w, 'contract_details', x.id, 'bdmt'),
          cert_no: str(x.certNo),
          deleted_at: str(x.deletedAt),
          ord: i,
          doc: J(x),
        })
      );
      (c.addenda || []).forEach((a, i) =>
        T.contract_addenda.push({
          id: a.id,
          contract_id: c.id,
          no: str(a.no),
          date: str(a.date),
          deleted_at: str(a.deletedAt),
          ord: i,
          doc: J(a),
        })
      );
    });
    (d.customs || []).forEach((t, ord) => {
      let cid = str(t.contractId),
        did = str(t.detailId);
      if (cid && !contractIds.has(cid)) {
        orphans.push({ table: 'customs_decls', id: t.id, field: 'contractId', target: cid });
        cid = null;
      }
      if (did && !detailIds.has(did)) {
        orphans.push({ table: 'customs_decls', id: t.id, field: 'detailId', target: did });
        did = null;
      }
      T.customs_decls.push({
        id: t.id,
        no: String(t.no == null ? '' : t.no),
        contract_id: cid,
        detail_id: did,
        status: str(t.status),
        round: Number.isFinite(Number(t.round)) && t.round !== null && t.round !== '' ? Math.trunc(Number(t.round)) : null,
        tax_vnd: whole(t.taxVnd, w, 'customs_decls', t.id, 'taxVnd'),
        deleted_at: str(t.deletedAt),
        ord,
        doc: J(without(t, ['supplements', 'payments'])),
      });
      (t.supplements || []).forEach((s, i) =>
        T.customs_supplements.push({
          id: s.id,
          decl_id: t.id,
          no: str(s.no),
          tax_vnd: whole(s.taxVnd, w, 'customs_supplements', s.id, 'taxVnd'),
          deleted_at: str(s.deletedAt),
          ord: i,
          doc: J(s),
        })
      );
      (t.payments || []).forEach((p, i) =>
        T.customs_payments.push({
          id: p.id,
          decl_id: t.id,
          receipt_no: str(p.receiptNo),
          kind: str(p.kind),
          amount_vnd: whole(p.amount, w, 'customs_payments', p.id, 'amount'),
          date: str(p.date),
          deleted_at: str(p.deletedAt),
          ord: i,
          doc: J(p),
        })
      );
    });
    return { tables: T, orphans, warnings: w };
  }

  /** Dựng lại Danh mục từ các dòng (đúng thứ tự `ord`). `extra` = phần không chiếu (v, products…) lấy từ bản gốc. */
  function assemble(rows, extra) {
    const by = (t) => (rows[t] || []).slice().sort((a, b) => a.ord - b.ord);
    const kids = (t, fk) => {
      const m = new Map();
      by(t).forEach((r) => {
        if (!m.has(r[fk])) m.set(r[fk], []);
        m.get(r[fk]).push(JSON.parse(r.doc));
      });
      return m;
    };
    const dets = kids('contract_details', 'contract_id'),
      adds = kids('contract_addenda', 'contract_id'),
      sups = kids('customs_supplements', 'decl_id'),
      pays = kids('customs_payments', 'decl_id');
    const out = Object.assign({}, extra || {});
    out.customers = by('customers').map((r) => JSON.parse(r.doc));
    const restore = (o, map, id) => {
      const keys = o.$k || [];
      delete o.$k;
      Object.entries(map).forEach(([k, m]) => keys.includes(k) && (o[k] = m.get(id) || []));
      return o;
    };
    out.contracts = by('contracts').map((r) => restore(JSON.parse(r.doc), { details: dets, addenda: adds }, r.id));
    out.customs = by('customs_decls').map((r) => restore(JSON.parse(r.doc), { supplements: sups, payments: pays }, r.id));
    return out;
  }

  /** Tổng đối chiếu (số dòng, tổng khối lượng milli, tổng tiền) — dùng khi di trú để báo sai lệch. */
  function totals(tables) {
    const sum = (rs, f) => rs.reduce((a, r) => a + (r[f] || 0), 0);
    const n = {};
    TABLES.forEach((t) => (n[t] = tables[t].length));
    return {
      rows: n,
      contractQtyMilli: sum(tables.contracts, 'qty_milli'),
      detailQtyMilli: sum(tables.contract_details, 'qty_milli'),
      detailBdmtMilli: sum(tables.contract_details, 'bdmt_milli'),
      declTaxVnd: sum(tables.customs_decls, 'tax_vnd'),
      suppTaxVnd: sum(tables.customs_supplements, 'tax_vnd'),
      paymentVnd: sum(
        tables.customs_payments.filter((p) => !p.deleted_at),
        'amount_vnd'
      ),
    };
  }

  HAK.CatalogRows = { TABLES, build, assemble, totals };
  if (typeof module === 'object' && module.exports) module.exports = HAK.CatalogRows;
})(typeof window !== 'undefined' ? window : globalThis);
