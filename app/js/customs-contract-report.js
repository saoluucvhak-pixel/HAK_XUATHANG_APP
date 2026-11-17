/**
 * customs-contract-report.js — Báo cáo "Tình hình thực hiện hợp đồng": mô hình contractReportModel (hợp đồng · chứng thư · tờ khai · nộp thuế) và màn hình báo cáo.
 * Tách từ customs.js (không đổi công thức / giao diện / lưu trữ); giữ API HAK.Customs trong customs.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { hasNum, vnDate } = HAK.Util || (typeof require === 'function' ? require('./util.js') : {}); // hàm dùng chung (util.js)
  const {
    $,
    CM,
    F,
    NF,
    card,
    contractBadge,
    contracts,
    core,
    custName,
    customsList,

    distinct,
    esc,
    money,
    smartView,
    statusBadge,
    statusOpts,
  } = HAK.CustomsCommon;

  /* ---------------- Báo cáo "Tình hình thực hiện hợp đồng" (hợp đồng · chứng thư · tờ khai · nộp thuế · lệ phí) ---------------- */
  const sumOf = (arr) => arr.reduce((a, x) => a + (Number(x) || 0), 0);
  /** Mỗi hợp đồng: các dòng thực hiện (đợt → chứng thư + tờ khai) và cộng dồn. Tờ khai gắn hợp đồng nhưng chưa gắn đợt là dòng riêng. */
  function contractReportModel() {
    const M = HAK.ContractModel,
      scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null,
      all = customsList().filter((d) => !d.deletedAt);
    const list = contracts()
      .filter((c) => !scope || !HAK.Catalog.relatedTo || HAK.Catalog.relatedTo(c, scope))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.no || '').localeCompare(String(b.no || '')));
    return list.map((c) => {
      const details = M.active(c),
        mine = all.filter((d) => d.contractId === c.id),
        rows = [];
      const declRow = (x) => {
        const t = x ? CM().totals(x) : null;
        return {
          decl: x || null,
          payable: t ? t.payable : null,
          paidTax: t ? t.paidTax : 0,
          paidFee: t ? t.paidFee : 0,
          remaining: t ? t.owed : null,
          over: t ? t.over : 0,
          undetermined: !!(t && t.undetermined),
        };
      }; // remaining = CÒN NỢ của tờ khai (không bù trừ với tờ khai nộp thừa)
      details.forEach((d) => {
        const ds = mine.filter((x) => x.detailId === d.id),
          v = M.valuation(c, d);
        (ds.length ? ds : [null]).forEach((x, i) =>
          rows.push(
            Object.assign(
              {
                detail: d,
                first: i === 0,
                mt: i === 0 ? d.mt : null,
                bdmt: i === 0 ? d.bdmt : null,
                usd: i === 0 ? v.valueUsd : null,
                vnd: i === 0 ? v.valueVnd : null,
              },
              declRow(x)
            )
          )
        );
      });
      mine
        .filter((x) => !x.detailId || !details.some((d) => d.id === x.detailId))
        .forEach((x) => rows.push(Object.assign({ detail: null, first: false, mt: null, bdmt: null, usd: null, vnd: null }, declRow(x))));
      const st = CM().contractStatus(all, c.id, c),
        bd = sumOf(details.map((d) => d.bdmt));
      const model = {
        c,
        rows,
        st,
        tot: {
          details: details.length,
          certs: details.filter((d) => d.certNo).length,
          bdmt: bd,
          mt: sumOf(details.map((d) => d.mt)),
          usd: sumOf(details.map((d) => M.valuation(c, d).valueUsd)),
          vnd: sumOf(details.map((d) => M.valuation(c, d).valueVnd)),
          decls: mine.length,
          cleared: st.cleared,
          payable: sumOf(mine.map((x) => CM().totals(x).payable)),
          paidTax: sumOf(mine.map((x) => CM().totals(x).paidTax)),
          paidFee: sumOf(mine.map((x) => CM().totals(x).paidFee)),
          remaining: CM().settlement(mine).owed,
          over: CM().settlement(mine).over,
          undetermined: CM().settlement(mine).undetermined,
          left: hasNum(c.contractQty) ? Number(c.contractQty) - bd : null,
          pct: hasNum(c.contractQty) && c.contractQty > 0 ? (bd / c.contractQty) * 100 : null,
        },
      };
      const t = model.tot;
      model.f = {
        id: c.id,
        type: c.type,
        no: c.no || '',
        date: c.date || '',
        buyerId: c.buyerId || '',
        buyer: custName(c.buyerId),
        product: c.contractProduct || '',
        status: st.code,
        statusLabel: st.label,
        ships: details.map((d) => d.ship).filter(Boolean),
        certNos: details.map((d) => d.certNo).filter(Boolean),
        declNos: mine.map((x) => x.no),
        declStatuses: mine.map((x) => x.status),
        owing: (t.remaining || 0) > 0,
        missingCert: t.certs < t.details,
      };
      return model;
    });
  }
  const ctFields = () => {
    const f = F(),
      SF = f.core,
      many = (key, label, options, get) => ({
        key,
        label,
        type: 'multi',
        options,
        match: (r, sel) => (get(r).length ? get(r) : ['']).some((x) => SF.inSet(sel, x)),
      });
    return [
      f.multi(
        'type',
        'Hình thức',
        () => Object.keys(HAK.Catalog.TYPES || {}).map((k) => ({ value: k, label: HAK.Catalog.TYPES[k].label })),
        (r) => r.type
      ),
      f.multi(
        'buyerId',
        'Bên mua',
        () =>
          core()
            .customers()
            .map((c) => ({ value: c.id, label: c.name })),
        (r) => r.buyerId
      ),
      f.multi(
        'status',
        'Trạng thái hợp đồng',
        () => [
          { value: 'running', label: 'Đang thực hiện' },
          { value: 'done', label: 'Đã hoàn thành (thông quan đủ / đã đóng)' },
        ],
        (r) => r.status
      ),
      many(
        'ship',
        'Tàu / chuyến',
        () => distinct(contracts().flatMap((c) => HAK.ContractModel.active(c).map((d) => d.ship))),
        (r) => r.ships
      ),
      many(
        'declStatus',
        'Trạng thái tờ khai',
        () => statusOpts().map((o) => ({ value: o[0], label: o[1] })),
        (r) => r.declStatuses
      ),
      { key: 'owing', label: 'Chỉ hợp đồng còn phải nộp thuế', type: 'bool', match: (r) => r.owing },
      { key: 'missingCert', label: 'Chỉ hợp đồng còn đợt chưa có chứng thư', type: 'bool', match: (r) => r.missingCert },
    ];
  };
  const ctView = () =>
    smartView('ct', '#repCtSmart', {
      screenId: 'report-contracts',
      source: () => contractReportModel().map((m) => m.f),
      fields: ctFields(),
      searchPlaceholder: 'Tìm số hợp đồng, bên mua, hàng, tàu, chứng thư, số tờ khai…',
      matchQ: (r, q) =>
        F()
          .core.hay([r.no, r.buyer, r.product, r.ships.join(' '), r.certNos.join(' '), r.declNos.join(' '), r.statusLabel])
          .includes(q),
      matchDate: (r, f, t) => F().dateMatch(r.date, f, t),
      onApply: () => drawContractReport(),
    });
  function contractReportList() {
    const all = contractReportModel(),
      v = ctView();
    if (!v) return all;
    const ids = new Set(v.filter(all.map((m) => m.f)).rows.map((r) => r.id));
    return all.filter((m) => ids.has(m.c.id));
  }
  const typeLabel = (t) => ((HAK.Catalog.TYPES || {})[t] || {}).label || t || '';
  function drawContractReport() {
    const host = $('#repCtBody');
    if (!host || !HAK.Catalog || !HAK.Catalog.core) return;
    const v0 = ctView();
    if (v0) v0.refresh();
    const model = contractReportList(),
      g = (k) => sumOf(model.map((m) => m.tot[k]));
    const run = model.filter((m) => m.st.code === 'running').length,
      done = model.length - run;
    host.innerHTML =
      '<div class="row g-2 mb-2">' +
      card('Hợp đồng', model.length, run + ' đang thực hiện · ' + done + ' đã hoàn thành') +
      card(
        'KL thực hiện / hợp đồng (BDMT)',
        money(g('bdmt')) + ' / ' + money(sumOf(model.map((m) => m.c.contractQty))),
        'Giá trị: ' + money(g('usd')) + ' USD'
      ) +
      card('Tờ khai', g('decls'), g('cleared') + ' đã thông quan') +
      card(
        'Thuế XK phải nộp',
        money(g('payable')) + ' đ',
        'Đã nộp ' +
          money(g('paidTax')) +
          ' đ · lệ phí ' +
          money(g('paidFee')) +
          ' đ · còn nợ ' +
          money(g('remaining')) +
          ' đ' +
          (g('over') > 0 ? ' · nộp thừa ' + money(g('over')) + ' đ (không bù trừ)' : '') +
          (g('undetermined') > 0 ? ' · ' + g('undetermined') + ' tờ khai chưa xác định thuế' : '')
      ) +
      '</div>' +
      '<div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th>Hợp đồng</th><th>Bên mua</th><th class="num">KL hợp đồng</th><th class="num">KL thực hiện</th><th class="num">%</th><th class="num">Còn lại</th><th class="num">Giá trị USD</th><th class="num">Chứng thư</th><th class="num">Tờ khai</th><th class="num">Thuế phải nộp</th><th class="num">Đã nộp thuế</th><th class="num">Lệ phí đã nộp</th><th class="num">Còn phải nộp</th><th>Trạng thái</th></tr></thead><tbody>' +
      (model.length
        ? model
            .map((m) => {
              const c = m.c,
                t = m.tot;
              return (
                '<tr class="table-light fw-semibold"><td>' +
                esc(c.no || c.id) +
                '<div class="small muted fw-normal">' +
                esc(typeLabel(c.type)) +
                (c.date ? ' · ' + esc(vnDate(c.date)) : '') +
                '</div></td><td>' +
                esc(custName(c.buyerId)) +
                '</td><td class="num">' +
                esc(money(c.contractQty)) +
                ((c.addenda || []).some((x) => !x.deletedAt)
                  ? '<div class="small muted fw-normal">đã điều chỉnh (gốc ' + esc(money(c.qtyOrig)) + ')</div>'
                  : '') +
                '</td><td class="num">' +
                esc(money(t.bdmt)) +
                '</td><td class="num">' +
                (t.pct === null ? '' : esc(NF().txt(Math.round(t.pct * 10) / 10, 'dec')) + '%') +
                '</td><td class="num">' +
                esc(money(t.left)) +
                '</td><td class="num">' +
                esc(money(t.usd)) +
                '</td><td class="num">' +
                t.certs +
                '/' +
                t.details +
                '</td><td class="num">' +
                t.cleared +
                '/' +
                t.decls +
                '</td><td class="num">' +
                esc(money(t.payable)) +
                '</td><td class="num">' +
                esc(money(t.paidTax)) +
                '</td><td class="num">' +
                esc(money(t.paidFee)) +
                '</td><td class="num ' +
                (t.remaining > 0 ? 'text-danger' : '') +
                '">' +
                esc(money(t.remaining)) +
                '</td><td>' +
                contractBadge(c.id) +
                '</td></tr>' +
                m.rows
                  .map(
                    (r) =>
                      '<tr class="small"><td class="ps-4">' +
                      esc(
                        r.detail
                          ? [r.detail.ship, r.detail.product].filter(Boolean).join(' · ') || 'Đợt thực hiện'
                          : '(tờ khai chưa gắn đợt)'
                      ) +
                      '</td><td>' +
                      (r.detail && r.detail.certNo
                        ? 'CT ' + esc(r.detail.certNo) + (r.detail.certDate ? ' · ' + esc(vnDate(r.detail.certDate)) : '')
                        : '<span class="muted">chưa có chứng thư</span>') +
                      '</td><td></td><td class="num">' +
                      esc(money(r.bdmt)) +
                      '</td><td></td><td></td><td class="num">' +
                      esc(money(r.usd)) +
                      '</td><td></td><td>' +
                      (r.decl
                        ? '<span class="mono">' + esc(r.decl.no) + '</span> ' + statusBadge(r.decl.status)
                        : '<span class="muted">chưa có tờ khai</span>') +
                      '</td><td class="num">' +
                      esc(money(r.payable)) +
                      '</td><td class="num">' +
                      esc(money(r.paidTax)) +
                      '</td><td class="num">' +
                      esc(money(r.paidFee)) +
                      '</td><td class="num ' +
                      (r.remaining > 0 ? 'text-danger' : '') +
                      '">' +
                      esc(money(r.remaining)) +
                      '</td><td></td></tr>'
                  )
                  .join('')
              );
            })
            .join('')
        : '<tr><td colspan="14" class="muted text-center">Chưa có hợp đồng trong khoảng đã chọn.</td></tr>') +
      '</tbody></table></div>';
    const b = $('#repCtXls');
    if (b) b.disabled = !model.length;
    const bp = $('#repCtPdf');
    if (bp) bp.disabled = !model.length;
  }
  HAK.ContractReport = { contractReportList, contractReportModel, ctView, drawContractReport, sumOf, typeLabel };
})(window);
