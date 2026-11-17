/**
 * gsync-contracts.js — ☁ Đồng bộ HỢP ĐỒNG lên Google Sheet (v2.16.2): 4 sheet "snapshot" (ghi lại toàn bộ bảng mỗi lần bấm):
 *   NL_HOPDONG (mỗi hợp đồng 1 dòng: KL gốc/hiện hành, tờ khai, thuế còn nợ, thực giao), NL_CHUNGTHU (mỗi chứng thư 1 dòng), NL_TOKHAI (mỗi tờ khai 1 dòng), NL_PHULUC (mỗi phụ lục khối lượng 1 dòng).
 * Mỗi công ty gửi về Sheet của chính công ty đó (hợp đồng liên quan tới công ty: bên xuất / bên ủy thác / bên mua). Cần Code.gs bản VERSION 2 (📋 Code.gs ở Cài đặt → Chung).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { hasNum } = HAK.Util || (typeof require === 'function' ? require('./util.js') : {}); // hàm dùng chung (util.js)
  const num = (v) => (hasNum(v) ? +v : '');
  const r2 = (v) => (hasNum(v) ? Math.round(+v * 100) / 100 : '');
  const day = (iso) => (/^\d{4}-\d\d-\d\d/.test(iso || '') ? iso.slice(0, 10) + 'T00:00:00.000Z' : '');
  const DATE = 'dd/mm/yyyy',
    INT = '#,##0',
    DEC = '#,##0.00';

  const COLS = {
    NL_HOPDONG: [
      ['Mã HĐ (app)'],
      ['Số hợp đồng'],
      ['Hình thức'],
      ['Ngày ký', DATE],
      ['Bên mua'],
      ['Hàng hóa'],
      ['KL gốc (BDMT)', DEC],
      ['KL hiện hành (BDMT)', DEC],
      ['Số phụ lục', INT],
      ['KL khô chứng thư (BDMT)', DEC],
      ['Còn lại (BDMT)', DEC],
      ['% thực hiện', DEC],
      ['Số chứng thư'],
      ['Số tờ khai', INT],
      ['Đã thông quan', INT],
      ['Thuế XK phải nộp (đ)', INT],
      ['Đã nộp thuế (đ)', INT],
      ['Còn nợ thuế (đ)', INT],
      ['Lệ phí đã nộp (đ)', INT],
      ['Số chuyến xe', INT],
      ['Thực giao (tấn)', DEC],
      ['Trạng thái hợp đồng'],
      ['Cập nhật lúc'],
      // v2.17.0 — cột THÊM Ở CUỐI (giữ nguyên vị trí các cột cũ để công thức / bảng khác trong Sheet không lệch): thuế tách riêng + 4 trạng thái
      ['Nộp thừa (đ)', INT],
      ['Tờ khai chưa xác định thuế', INT],
      ['Số dư ròng thuế (đ)', INT],
      ['Tiến độ thực hiện'],
      ['Thông quan'],
      ['Tình trạng thuế'],
      ['Thực giao'],
    ],
    NL_TOKHAI: [
      ['Mã TK (app)'],
      ['Số tờ khai'],
      ['Lần khai', INT],
      ['Ngày mở', DATE],
      ['Trạng thái'],
      ['Ngày thông quan', DATE],
      ['Số hợp đồng'],
      ['Tàu'],
      ['Số chứng thư'],
      ['KL khô (BDMT)', DEC],
      ['Thuế tờ khai gốc (đ)', INT],
      ['Thuế sau bổ sung (đ)', INT],
      ['Thuế phải nộp (đ)', INT],
      ['Đã nộp thuế (đ)', INT],
      ['Còn nợ (đ)', INT],
      ['Lệ phí đã nộp (đ)', INT],
      ['Số lần khai bổ sung', INT],
      ['Nộp thừa (đ)', INT],
      ['Nghĩa vụ thuế'],
    ],
    NL_CHUNGTHU: [
      ['Mã CT (app)'],
      ['Số hợp đồng'],
      ['Tàu / chuyến'],
      ['Hàng hóa'],
      ['Số chứng thư'],
      ['Ngày chứng thư', DATE],
      ['KL tươi MT (tấn)', DEC],
      ['KL khô BDMT', DEC],
      ['Độ ẩm (%)', DEC],
      ['Tỷ giá (VNĐ/USD)', DEC],
      ['Giá trị (USD)', DEC],
      ['Giá trị (VNĐ)', INT],
      ['Số tờ khai'],
      ['Trạng thái tờ khai'],
      ['Số chuyến xe', INT],
      ['Thực giao (tấn)', DEC],
      ['MT − thực giao (tấn)', DEC],
      ['Thời gian cân'],
    ],
    NL_PHULUC: [
      ['Mã PL (app)'],
      ['Số hợp đồng'],
      ['Số phụ lục'],
      ['Ngày ký', DATE],
      ['KL sau điều chỉnh (BDMT)', DEC],
      ['Tăng / giảm (BDMT)', DEC],
      ['Lý do'],
    ],
  };
  const KEYCOL = { NL_CHUNGTHU: 'Mã CT (app)', NL_HOPDONG: 'Mã HĐ (app)', NL_TOKHAI: 'Mã TK (app)', NL_PHULUC: 'Mã PL (app)' };
  const cols = (name) => COLS[name].map((c) => (c[1] ? { h: c[0], n: c[1] } : { h: c[0] }));

  /** items = [{ c (hợp đồng cha), buyer (tên), m (kết quả HAK.ContractFile.build) }] → 3 sheet [{name,keyCol,cols,rows}] */
  function buildSheets(items, opt) {
    opt = opt || {};
    const CM = opt.CM || HAK.CustomsModel,
      types = opt.types || {},
      stamp = opt.stamp || new Date().toISOString().slice(0, 19) + 'Z';
    const hd = [],
      tk = [],
      pl = [],
      ct = [],
      M = opt.M || HAK.ContractModel;
    items.forEach(({ c, buyer, m }) => {
      const t = m.tax,
        qtyOrig = (opt.M || HAK.ContractModel).originalQty(c);
      const certNos = (c.details || [])
        .filter((d) => !d.deletedAt && d.certNo)
        .map((d) => d.certNo)
        .join('; ');
      hd.push([
        c.id,
        c.no || '',
        types[c.type] || c.type || '',
        day(c.date),
        buyer || '',
        c.contractProduct || '',
        num(qtyOrig),
        num(c.contractQty),
        m.addenda.length,
        r2(m.certBdmt),
        m.qty == null ? '' : r2(m.qty - m.certBdmt),
        m.qty ? r2((m.certBdmt / m.qty) * 100) : '',
        certNos,
        m.T.length,
        m.cleared,
        num(t.payable),
        num(t.paid),
        num(t.remaining),
        num(t.fee),
        m.trips,
        r2(m.delKg / 1000),
        m.status.label,
        stamp,
        num(t.over),
        t.undetermined || 0,
        num(t.net),
        m.axes.progress.label,
        m.axes.customs.label,
        m.axes.tax.label + (m.axes.tax.text ? ' — ' + m.axes.tax.text : ''),
        m.axes.delivery.label,
      ]);
      m.rows.forEach((r) => {
        const d = r.d,
          L = r.lot,
          tons = L && L.trips > 0 ? L.delKg / 1000 : '',
          v = r.v || (M ? M.valuation(c, d) : {});
        ct.push([
          d.id,
          c.no || '',
          d.ship || '',
          d.product || c.contractProduct || '',
          d.certNo || '',
          day(d.certDate),
          r2(d.mt),
          r2(d.bdmt),
          r2(d.moisture),
          num(d.exchangeRate),
          r2(v.valueUsd),
          num(v.valueVnd),
          r.decl ? r.decl.no : '',
          r.decl ? CM.STATUS[r.decl.status] || r.decl.status : '',
          tons === '' ? '' : L.trips,
          tons === '' ? '' : r2(tons),
          tons !== '' && hasNum(d.mt) ? r2(d.mt - tons) : '',
          L && L.from ? L.from + (L.to && L.to !== L.from ? ' → ' + L.to : '') : '',
        ]);
      });
      m.T.forEach(({ d, t: x }) =>
        tk.push([
          d.id,
          d.no,
          d.round || 1,
          day(d.openDate),
          CM.STATUS[d.status] || d.status,
          day(CM.statusDate(d, 'cleared')),
          c.no || '',
          d.ship || '',
          d.certNo || '',
          r2(d.qtyBdmt),
          num(x.base),
          x.lastSupplement ? num(x.lastSupplement.taxVnd) : '',
          num(x.payable),
          num(x.paidTax),
          num(x.remaining),
          num(x.paidFee),
          CM.active(d.supplements).length,
          x.undetermined ? '' : num(x.over),
          x.undetermined ? 'Chưa xác định' : 'Đã xác định',
        ])
      );
      let prev = qtyOrig;
      m.addenda.forEach((a) => {
        pl.push([a.id, c.no || '', a.no || '', day(a.date), num(a.qty), hasNum(prev) ? r2(a.qty - prev) : '', a.reason || '']);
        prev = a.qty;
      });
    });
    return [
      { name: 'NL_HOPDONG', rows: hd },
      { name: 'NL_CHUNGTHU', rows: ct },
      { name: 'NL_TOKHAI', rows: tk },
      { name: 'NL_PHULUC', rows: pl },
    ].map((s) => ({ name: s.name, keyCol: KEYCOL[s.name], cols: cols(s.name), rows: s.rows }));
  }

  /**
   * Hợp đồng nào gửi về Sheet của công ty `cid`: hợp đồng có gán công ty nội bộ → chỉ gửi cho đúng các công ty đó;
   * hợp đồng CHƯA gán công ty nội bộ nào → chỉ gửi cho công ty đang làm việc (không đổ sang Sheet của mọi công ty).
   */
  function pickForCompany(contracts, cid, curCid, companyIdsOf) {
    return contracts.filter((c) => {
      const ids = companyIdsOf(c);
      return ids.length ? ids.indexOf(cid) >= 0 : cid === curCid;
    });
  }
  /** Đọc dữ liệu thật của 1 công ty (hợp đồng liên quan + phiếu cân gắn hợp đồng) → 3 sheet. */
  async function collect(cid) {
    const CS = HAK.ContractStatus;
    if (CS && CS.load) await CS.load();
    const groups = CS && CS.state ? CS.state.groups : [],
      K = HAK.Catalog,
      F = HAK.ContractFile;
    const list = pickForCompany(
      K.parents().filter((c) => !c.deletedAt),
      cid,
      (HAK.Auth && HAK.Auth.company && HAK.Auth.company()) || cid,
      K.companyIdsOf
    );
    const items = list.map((c) => {
      const cu = K.customer(c.buyerId);
      return { c, buyer: cu ? cu.name : '', m: F.build(c.id, groups) };
    });
    const types = {};
    Object.keys(K.TYPES || {}).forEach((k) => {
      types[k] = K.TYPES[k].label;
    });
    return buildSheets(items, { types });
  }
  /** Gửi cho mọi công ty đang xem (đã cài Sheet). → [{cid, name, hd, tk, pl, skipped?, error?}] */
  async function pushAll(onStep) {
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    const cos = (HAK.Config.data.companies || []).filter((c) => !scope || scope.indexOf(c.id) >= 0);
    const out = [];
    let i = 0;
    for (const co of cos) {
      const it = { cid: co.id, name: co.short || co.name };
      if (!HAK.GSync.configured(co.id)) {
        it.skipped = true;
        out.push(it);
        continue;
      }
      if (onStep) onStep(++i, cos.length, it.name);
      try {
        const sheets = await collect(co.id),
          r = await HAK.GSync.pushSheets(co.id, sheets);
        it.hd = (r.NL_HOPDONG || {}).total || 0;
        it.tk = (r.NL_TOKHAI || {}).total || 0;
        it.ct = (r.NL_CHUNGTHU || {}).total || 0;
        it.pl = (r.NL_PHULUC || {}).total || 0;
      } catch (e) {
        it.error = e.message || String(e);
      }
      out.push(it);
    }
    return out;
  }
  HAK.GSyncContracts = { pickForCompany, buildSheets, collect, pushAll, COLS, KEYCOL };
  if (typeof module === 'object' && module.exports) module.exports = HAK.GSyncContracts;
})(typeof window !== 'undefined' ? window : globalThis);
