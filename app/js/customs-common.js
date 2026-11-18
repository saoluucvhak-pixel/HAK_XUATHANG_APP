/**
 * customs-common.js — Dùng chung của phần hải quan: truy cập dữ liệu Danh mục (tờ khai, hợp đồng), nhãn, trạng thái, bộ lọc smart và ô số liệu. Không giữ trạng thái màn hình.
 * Tách từ customs.js (không đổi công thức / giao diện / lưu trữ); giữ API HAK.Customs trong customs.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  const CM = () => HAK.CustomsModel,
    CP = () => HAK.CustomsParser;
  const core = () => HAK.Catalog.core;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);
  const NF = () => HAK.NumFmt;
  const money = (n) => (n === null || n === undefined || n === '' || !isFinite(+n) ? '' : NF().txt(+n, 'num'));
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fold = (s) =>
    String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase();
  const shipKey = (s) =>
    fold(s)
      .replace(/^m\s*\/?\s*v\.?\s*/, '')
      .replace(/[^a-z0-9]/g, '');
  const data = () => core().get();
  const customsList = () => data().customs || [];
  const decls = (all) => customsList().filter((d) => all || !d.deletedAt);
  const contracts = () => (data().contracts || []).filter((c) => !c.deletedAt);
  const contractOf = (id) => (data().contracts || []).find((c) => c.id === id) || null;
  const custName = (id) => {
    const c = core()
      .customers()
      .find((x) => x.id === id);
    return c ? c.name : '';
  };
  const cstatus = (id) => CM().contractStatus(customsList(), id, contractOf(id));
  const contractLabel = (c) => (c ? (c.no || c.id) + (custName(c.buyerId) ? ' · ' + custName(c.buyerId) : '') : '');
  const detailOf = (c, id) => (c && (c.details || []).find((d) => d.id === id)) || null;

  /* ---------------- Tờ khai (bảng cha) ---------------- */
  const statusOpts = () => Object.keys(CM().STATUS).map((k) => [k, CM().STATUS[k]]);
  const toast = (m, t) => HAK.UI.toast(m, t || 'info');
  /* ---------------- Giao diện tab ---------------- */
  const badgeCls = { opened: 'text-bg-secondary', waiting: 'text-bg-warning', cleared: 'text-bg-success' };
  const statusBadge = (s) => '<span class="badge ' + (badgeCls[s] || 'text-bg-secondary') + '">' + esc(CM().STATUS[s] || s) + '</span>';
  /** Nhãn trạng thái hợp đồng (cột "Trạng thái" ở bảng hợp đồng). */
  function contractBadge(contractId) {
    const s = cstatus(contractId);
    return (
      '<span class="badge ' +
      (s.code === 'done' ? 'text-bg-success' : 'text-bg-primary') +
      '" title="' +
      (s.total ? s.cleared + '/' + s.total + ' tờ khai đã thông quan' : 'Chưa có tờ khai hải quan') +
      '">' +
      s.label +
      '</span>'
    );
  }
  /* ---------------- Bộ lọc smart (dùng chung bộ lọc của các màn hình khác) ---------------- */
  const F = () => HAK.Filters;
  const distinct = (arr) =>
    Array.from(new Set(arr.filter(Boolean)))
      .sort()
      .map((v) => ({ value: v, label: v }));
  const views = {};
  /** Gắn bộ lọc vào ô chứa; gắn lại đúng bản cũ khi màn hình dựng lại (giữ trạng thái lọc). */
  function smartView(name, hostSel, cfg) {
    const host = $(hostSel);
    if (!host) return null;
    if (!views[name]) views[name] = F().mount(host, cfg);
    else if (!host.contains(views[name].el)) host.replaceChildren(views[name].el);
    return views[name];
  }
  function declFlat(d) {
    const t = CM().totals(d),
      c = contractOf(d.contractId);
    return Object.assign({}, d, {
      statusLabel: CM().STATUS[d.status],
      contractLabel: c ? contractLabel(c) : '',
      owing: (t.remaining || 0) > 0,
    });
  }
  const declFilterFields = () => {
    const f = F();
    return [
      f.multi(
        'status',
        'Trạng thái tờ khai',
        () => statusOpts().map((o) => ({ value: o[0], label: o[1] })),
        (r) => r.status
      ),
      f.multi(
        'contractId',
        'Hợp đồng',
        () => contracts().map((c) => ({ value: c.id, label: contractLabel(c) })),
        (r) => r.contractId || ''
      ),
      f.multi(
        'ship',
        'Tàu / chuyến',
        () => distinct(decls(true).map((d) => d.ship)),
        (r) => r.ship || ''
      ),
      f.multi(
        'type',
        'Loại hình',
        () => distinct(decls(true).map((d) => d.type)),
        (r) => r.type || ''
      ),
      { key: 'owing', label: 'Chỉ tờ khai còn phải nộp thuế', type: 'bool', match: (r) => r.owing },
      { key: 'supp', label: 'Chỉ tờ khai có khai bổ sung', type: 'bool', match: (r) => CM().active(r.supplements).length > 0 },
    ];
  };
  const declSmartCfg = (id, source, onApply) => ({
    screenId: id,
    source,
    fields: declFilterFields(),
    searchPlaceholder: 'Tìm số tờ khai, tàu, hợp đồng, hàng hóa…',
    matchQ: (r, q) =>
      F().core.hay([r.no, r.ship, r.goods, r.bill, r.certNo, r.importer, r.contractLabel, r.statusLabel, r.note]).includes(q),
    matchDate: (r, f, t) => F().dateMatch(r.openDate, f, t),
    onApply,
  });
  const byOpenDesc = (a, b) => String(b.openDate || '').localeCompare(String(a.openDate || '')) || String(b.no).localeCompare(String(a.no));
  const applyDeclFilter = (view, list) => {
    const ids = new Set(view.filter(list.map(declFlat)).rows.map((r) => r.id));
    return list.filter((d) => ids.has(d.id));
  };
  const card = (label, value, sub) =>
    '<div class="col-6 col-md-3"><div class="border rounded p-2"><div class="small muted">' +
    label +
    '</div><div class="fw-semibold fs-5">' +
    value +
    '</div>' +
    (sub ? '<div class="small muted">' + sub + '</div>' : '') +
    '</div></div>';
  function sums(list) {
    return list.reduce(
      (a, d) => {
        const t = CM().totals(d);
        a.payable += t.payable || 0;
        a.paid += t.paidTax;
        a.fee += t.paidFee;
        a.remaining += t.remaining || 0;
        a[d.status]++;
        return a;
      },
      { payable: 0, paid: 0, fee: 0, remaining: 0, opened: 0, waiting: 0, cleared: 0 }
    );
  }
  HAK.CustomsCommon = {
    $,
    CM,
    CP,
    F,
    NF,
    applyDeclFilter,
    byOpenDesc,
    card,
    contractBadge,
    contractLabel,
    contractOf,
    contracts,
    core,
    cstatus,
    custName,
    customsList,
    data,
    declFlat,
    declSmartCfg,
    decls,
    detailOf,
    distinct,
    esc,
    money,
    shipKey,
    smartView,
    statusBadge,
    statusOpts,
    sums,
    toast,
    today,
  };
})(window);
