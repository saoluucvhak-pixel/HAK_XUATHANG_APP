/**
 * contract-status.js — trang "Tình hình thực hiện hợp đồng" (v2.15.0): hợp đồng · chi tiết hợp đồng · phiếu cân (số chuyến xe, kho xuất, khối lượng)
 * · chứng thư · tờ khai · thuế. Bấm một dòng → chi tiết xuất hàng từng xe (đọc lại phiếu cân từ 🗄️ Lưu trữ).
 * Dùng lại HAK.Report.compute / xhLots / xhTrips (cùng cách ghép hồ sơ ↔ hợp đồng như báo cáo Xuất hàng) và HAK.Customs (tờ khai, thuế).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);
  const toast = (m, t) => HAK.UI.toast(m, t || 'info');
  const G = () => HAK.Generator, F = () => HAK.Filters, K = () => HAK.Catalog;
  const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const hasNum = (v) => v !== null && v !== undefined && v !== '' && isFinite(+v);
  const int = (n) => (hasNum(n) ? Math.round(+n).toLocaleString('vi-VN') : '');
  const ton = (kg) => (hasNum(kg) ? G().fmtTon(+kg) : '');
  const dec = (n, d) => (hasNum(n) ? G().fmtDec(+n, d == null ? 2 : d) : '');
  const money = (n) => (hasNum(n) ? HAK.NumFmt.txt(+n, 'num') : '');
  const vnDate = (iso) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  const sum = (arr) => arr.reduce((a, x) => a + (Number(x) || 0), 0);
  const state = { groups: [], loading: false, view: null, detail: null };

  const khoName = (id) => { if (!id) return ''; try { const w = HAK.Config.warehouse(id); return (w && (w.short || w.name)) || id; } catch (e) { return id; } };
  const khoOf = (rec) => khoName(String((rec && rec.kho) || '').split('>')[0]);
  const typeLabel = (t) => (((K() || {}).TYPES || {})[t] || {}).label || t || '';
  const custName = (id) => { const c = K().customer(id); return c ? c.name : ''; };

  /* ---------------- Dữ liệu ---------------- */
  async function load() {
    const metas0 = await HAK.Archive.ensureStats(await HAK.Archive.list());
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    const metas = scope ? metas0.filter((m) => scope.indexOf(HAK.Auth.companyOfMeta(m)) >= 0) : metas0;
    const model = HAK.Report.compute(metas, {}), xl = HAK.Report.xhLots(model.used, scope ? { scope } : {});
    const cm = new Map(); if (HAK.Customs && HAK.Customs.contractReportModel) HAK.Customs.contractReportModel().forEach((m) => cm.set(m.c.id, m));
    const groups = new Map();
    xl.lots.forEach((L) => {
      const pid = L.c ? L.c.parentId : 'none:' + L.key;
      let g = groups.get(pid);
      if (!g) { g = { key: pid, c: L.c ? K().parent(pid) : null, lots: [] }; groups.set(pid, g); }
      g.lots.push(L);
    });
    (K().parents() || []).forEach((c) => { if (!groups.has(c.id) && (!scope || !K().relatedTo || K().relatedTo(c, scope))) groups.set(c.id, { key: c.id, c, lots: [] }); });
    const out = Array.from(groups.values()).map((g) => {
      const lots = g.lots, recs = lots.flatMap((L) => L.recs), c = g.c, cust = cm.get(g.key) || null;
      const khos = Array.from(new Set(recs.map(khoOf).filter(Boolean))), ships = Array.from(new Set(lots.map((L) => L.ship).filter(Boolean)));
      const tot = { recs: recs.length, trips: sum(lots.map((L) => L.trips)), kg: sum(lots.map((L) => L.kg)), retTrips: sum(lots.map((L) => L.retTrips)), retKg: sum(lots.map((L) => L.retKg)), delKg: sum(lots.map((L) => L.delKg)) };
      const withMt = lots.filter((L) => L.c && hasNum(L.c.mt) && L.recs.length);
      const fromTs = lots.map((L) => L.fromTs).filter((x) => x !== null), toTs = lots.map((L) => L.toTs).filter((x) => x !== null);
      const first = lots.find((L) => L.fromTs !== null && L.fromTs === Math.min.apply(null, fromTs)), last = lots.find((L) => L.toTs !== null && L.toTs === Math.max.apply(null, toTs));
      return Object.assign(g, { tot, khos, ships, cust, gap: withMt.length ? sum(withMt.map((L) => L.c.mt - L.delKg / 1000)) : null, from: first ? first.from : '', to: last ? last.to : '',
        f: { id: g.key, type: c ? c.type : (lots[0] && lots[0].type) || '', no: c ? c.no || '' : '(chưa gắn hợp đồng)', date: c ? c.date || '' : '', buyerId: c ? c.buyerId || '' : '', buyer: c ? custName(c.buyerId) : '', status: cust ? cust.st.code : 'running',
          statusLabel: cust ? cust.st.label : 'Đang thực hiện', ships, khos, hasTrips: tot.trips > 0, gap: withMt.some((L) => Math.abs(L.c.mt - L.delKg / 1000) >= 0.005), certNos: lots.map((L) => (L.c && L.c.certNo) || '').filter(Boolean) } });
    });
    out.sort((a, b) => String((b.c && b.c.date) || '').localeCompare(String((a.c && a.c.date) || '')) || String(a.f.no).localeCompare(String(b.f.no)));
    state.groups = out; state.unlinked = xl.unlinked;
  }

  /* ---------------- Bộ lọc smart ---------------- */
  const distinct = (arr) => Array.from(new Set(arr.filter(Boolean))).sort().map((v) => ({ value: v, label: v }));
  function fields() {
    const f = F(), SF = f.core, many = (key, label, options, get) => ({ key, label, type: 'multi', options, match: (r, sel) => (get(r).length ? get(r) : ['']).some((x) => SF.inSet(sel, x)) });
    return [
      f.multi('type', 'Hình thức', () => Object.keys(K().TYPES || {}).map((k) => ({ value: k, label: K().TYPES[k].label })), (r) => r.type),
      f.multi('buyerId', 'Bên mua / nhận', () => K().customers().map((c) => ({ value: c.id, label: c.name })), (r) => r.buyerId),
      f.multi('status', 'Trạng thái hợp đồng', () => [{ value: 'running', label: 'Đang thực hiện' }, { value: 'done', label: 'Đã hoàn thành' }], (r) => r.status),
      many('kho', 'Kho xuất', () => distinct(state.groups.flatMap((g) => g.khos)), (r) => r.khos),
      many('ship', 'Tàu / chuyến', () => distinct(state.groups.flatMap((g) => g.ships)), (r) => r.ships),
      { key: 'hasTrips', label: 'Chỉ hợp đồng đã có phiếu cân', type: 'bool', match: (r) => r.hasTrips },
      { key: 'gap', label: 'Chỉ hợp đồng lệch khối lượng chứng thư ↔ thực giao', type: 'bool', match: (r) => r.gap }
    ];
  }
  function smart() {
    const host = $('#csrSmart'); if (!host) return null;
    if (!state.view) state.view = F().mount(host, { screenId: 'contract-status', source: () => state.groups.map((g) => g.f), fields: fields(), searchPlaceholder: 'Tìm số hợp đồng, bên mua, tàu, kho, chứng thư…', quickFields: ['q', 'kho', 'type', 'buyerId'],
      matchQ: (r, q) => F().core.hay([r.no, r.buyer, r.ships.join(' '), r.khos.join(' '), r.certNos.join(' '), r.statusLabel]).includes(q), matchDate: (r, f, t) => F().dateMatch(r.date, f, t), onApply: () => draw() });
    else if (!host.contains(state.view.el)) host.replaceChildren(state.view.el);
    return state.view;
  }
  function filtered() { const v = smart(); if (!v) return state.groups; const ids = new Set(v.filter(state.groups.map((g) => g.f)).rows.map((r) => r.id)); return state.groups.filter((g) => ids.has(g.key)); }

  /* ---------------- Giao diện ---------------- */
  const card = (label, value, sub) => '<div class="col-6 col-md-3"><div class="border rounded p-2"><div class="small muted">' + label + '</div><div class="fw-semibold fs-5">' + value + '</div>' + (sub ? '<div class="small muted">' + sub + '</div>' : '') + '</div></div>';
  const lotLabel = (L) => [L.ship, L.c && L.c.product, L.c && L.c.certNo && 'CT ' + L.c.certNo].filter(Boolean).join(' · ') || 'Đợt thực hiện';
  function draw() {
    const host = $('#csrBody'); if (!host) return;
    const list = filtered(), t = { trips: sum(list.map((g) => g.tot.trips)), kg: sum(list.map((g) => g.tot.kg)), del: sum(list.map((g) => g.tot.delKg)), ret: sum(list.map((g) => g.tot.retTrips)), recs: sum(list.map((g) => g.tot.recs)) };
    $('#csrCards').innerHTML = card('Hợp đồng', list.length, list.filter((g) => g.f.status === 'done').length + ' đã hoàn thành') + card('Số chuyến xe', int(t.trips), 'Xe trả về: ' + int(t.ret) + ' · ' + t.recs + ' hồ sơ') + card('KL qua cân (tấn)', ton(t.kg)) + card('Thực giao (tấn)', ton(t.del), 'Qua cân − xe trả về');
    host.innerHTML = list.length ? list.map((g, gi) => {
      const c = g.c, tot = g.tot, cu = g.cust, tt = cu ? cu.tot : null;
      const head = '<tr class="table-light fw-semibold csr-row" data-csr-g="' + gi + '" style="cursor:pointer"><td>' + esc(g.f.no) + '<div class="small muted fw-normal">' + esc(typeLabel(g.f.type)) + (c && c.date ? ' · ' + esc(vnDate(c.date)) : '') + '</div></td><td>' + esc(g.f.buyer) + '</td><td>' + esc(g.khos.join(', ')) + '</td><td>' + esc(g.ships.join(', ')) + '</td>' +
        '<td class="num">' + int(tot.recs) + '</td><td class="num">' + int(tot.trips) + '</td><td class="num">' + ton(tot.kg) + '</td><td class="num">' + int(tot.retTrips) + '</td><td class="num">' + ton(tot.delKg) + '</td><td class="num">' + esc(c ? dec(c.contractQty, 0) : '') + (c && (c.addenda || []).some((x) => !x.deletedAt) ? '<div class="small muted">đã điều chỉnh (gốc ' + esc(dec(c.qtyOrig, 0)) + ')</div>' : '') + '</td><td class="num ' + (g.gap !== null && Math.abs(g.gap) >= 0.005 ? 'text-danger' : '') + '">' + (g.gap === null ? '' : dec(g.gap)) + '</td>' +
        '<td>' + esc(g.from) + (g.to && g.to !== g.from ? ' → ' + esc(g.to) : '') + '</td><td class="num">' + (cu ? cu.tot.certs + '/' + cu.tot.details : '') + '</td><td class="num">' + (cu ? cu.tot.cleared + '/' + cu.tot.decls : '') + '</td><td class="num">' + esc(tt ? money(tt.payable) : '') + '</td><td class="num ' + (tt && tt.remaining > 0 ? 'text-danger' : '') + '">' + esc(tt ? money(tt.remaining) : '') + '</td><td>' + (c && HAK.Customs ? HAK.Customs.contractBadge(c.id) : '') + (c ? ' <button class="btn btn-sm btn-outline-primary ms-1" type="button" data-csr-assign="' + gi + '" title="Gắn đợt giao hàng chưa có hợp đồng vào hợp đồng này">＋ Gắn đợt</button>' : '') + '</td></tr>';
      const sub = g.lots.map((L, li) => '<tr class="small csr-row" data-csr-g="' + gi + '" data-csr-l="' + li + '" style="cursor:pointer"><td class="ps-4">' + esc(lotLabel(L)) + '</td><td></td><td>' + esc(Array.from(new Set(L.recs.map(khoOf).filter(Boolean))).join(', ')) + '</td><td></td><td class="num">' + int(L.recs.length) + '</td><td class="num">' + (L.recs.length ? int(L.trips) : '') + '</td><td class="num">' + (L.recs.length ? ton(L.kg) : '') + '</td><td class="num">' + (L.recs.length ? int(L.retTrips) : '') + '</td><td class="num">' + (L.recs.length ? ton(L.delKg) : '') + '</td><td class="num">' + esc(L.c && hasNum(L.c.mt) ? dec(L.c.mt) + ' MT' : '') + '</td><td class="num">' + (L.recs.length && L.c && hasNum(L.c.mt) ? dec(L.c.mt - L.delKg / 1000) : '') + '</td><td>' + esc(L.from) + (L.to && L.to !== L.from ? ' → ' + esc(L.to) : '') + '</td><td></td><td></td><td></td><td></td><td>' + (L.recs.length ? '<span class="badge badge-soft">Xem xe ▸</span>' : '<span class="muted">chưa có phiếu cân</span>') + '</td></tr>').join('');
      return head + sub;
    }).join('') : '<tr><td colspan="17" class="muted text-center py-4">Chưa có hợp đồng / hồ sơ cân khớp bộ lọc. Phiếu cân lấy từ các hồ sơ đã xuất trong 🗄️ Lưu trữ (Xuất khẩu, Ủy thác, Xuất bán, Trao đổi) có gắn hợp đồng.</td></tr>';
    const un = (state.unlinked || []).length;
    $('#csrWarn').innerHTML = un ? '⚠ ' + un + ' hồ sơ cân chưa gắn được hợp đồng (lập biên bản không chọn hợp đồng và tên tàu không khớp) — hiện ở các dòng "(chưa gắn hợp đồng)".' : '';
    $('#csrWarn').classList.toggle('d-none', !un);
    drawUnlinked();
    ['#csrXls', '#csrPdf'].forEach((s) => { const b = $(s); if (b) b.disabled = !list.length; });
  }
  async function render() {
    if (!$('#page-contractstatus') || state.loading) return;
    state.loading = true; $('#csrBody').innerHTML = '<tr><td colspan="17" class="muted text-center py-4">Đang đọc Lưu trữ…</td></tr>';
    try { await load(); smart(); if (state.view) state.view.refresh(); draw(); }
    catch (e) { console.error(e); $('#csrBody').innerHTML = '<tr><td colspan="17" class="text-danger text-center py-4">' + esc(e.message || e) + '</td></tr>'; }
    finally { state.loading = false; }
  }


  /* ---------------- Gắn đợt giao hàng (hồ sơ cân) vào hợp đồng ---------------- */
  const GATED = ['xuatkhau', 'uythac'];
  const recKho = (r) => khoOf(r);
  const recLine = (r) => '<td>' + esc(typeLabel(r.type)) + '</td><td>' + esc(r.title || '') + '</td><td>' + esc(r.ship || '') + '</td><td>' + esc(r.from || '') + (r.to && r.to !== r.from ? ' → ' + esc(r.to) : '') + '</td><td class="num">' + int(r.trips) + '</td><td class="num">' + ton(r.kg) + '</td><td>' + esc(recKho(r)) + '</td>';
  function drawUnlinked() {
    const host = $('#csrUnlinked'); if (!host) return;
    const list = (state.unlinked || []).slice().sort((a, b) => (a.fromTs || 0) - (b.fromTs || 0));
    if (!list.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="border rounded p-2"><div class="d-flex flex-wrap align-items-center gap-2 mb-1"><b>📥 Đợt giao hàng chưa gắn hợp đồng (' + list.length + ')</b><span class="small muted">Chỉ hồ sơ Xuất khẩu, Ủy thác, Xuất bán, Trao đổi; trung chuyển / điều chuyển không gắn hợp đồng.</span>' +
      '<button class="btn btn-sm btn-primary ms-auto" id="csrAssignBtn" type="button" disabled>Gắn các đợt đã tick vào hợp đồng…</button></div><div class="tbl-wrap"><table class="table table-sm align-middle mb-0"><thead><tr><th><input type="checkbox" class="form-check-input" id="csrAllUn" aria-label="Chọn tất cả"></th><th>Hình thức</th><th>Hồ sơ / đợt giao hàng</th><th>Tàu</th><th>Từ ngày → đến ngày</th><th class="num">Số xe</th><th class="num">Tấn</th><th>Kho xuất</th></tr></thead><tbody>' +
      list.map((r) => '<tr><td><input type="checkbox" class="form-check-input csr-un" data-id="' + esc(r.id) + '" data-type="' + esc(r.type) + '"></td>' + recLine(r) + '</tr>').join('') + '</tbody></table></div></div>';
  }
  function unTicked() { return Array.from(document.querySelectorAll('#csrUnlinked .csr-un:checked')).map((x) => ({ id: x.dataset.id, type: x.dataset.type })); }
  function ensureAssignModal() {
    let m = $('#csrAssign'); if (m) return m;
    m = document.createElement('div'); m.className = 'modal fade'; m.id = 'csrAssign'; m.tabIndex = -1;
    m.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Gắn đợt giao hàng vào hợp đồng</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
      '<div class="modal-body"><label class="form-label" for="csrAsContract">Hợp đồng</label><select class="form-select mb-1" id="csrAsContract"></select><div class="small muted mb-3" id="csrAsHelp"></div>' +
      '<div class="sec-title mb-1">Các đợt giao hàng chưa gắn (cùng hình thức)</div><div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th></th><th>Hồ sơ / đợt giao hàng</th><th>Tàu</th><th>Từ → đến</th><th class="num">Xe</th><th class="num">Tấn</th><th>Kho xuất</th></tr></thead><tbody id="csrAsRecs"></tbody></table></div></div>' +
      '<div class="modal-footer"><div class="me-auto text-danger small" id="csrAsErr" role="alert"></div><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button><button type="button" class="btn btn-primary" id="csrAsSave">Gắn vào hợp đồng</button></div></div></div>';
    document.body.append(m); return m;
  }
  /** pre = {type, recIds[], contractId}: gắn từ danh sách đã tick (recIds) hoặc từ một hợp đồng (contractId). */
  function openAssign(pre) {
    const m = ensureAssignModal(), type = pre.type, scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    const decls = HAK.Customs ? HAK.Customs.activeDecls() : [];
    const contracts = K().parents().filter((c) => c.type === type && (!scope || !K().relatedTo || K().relatedTo(c, scope)));
    $('#csrAsContract').innerHTML = '<option value="">— Chọn hợp đồng —</option>' + contracts.map((c) => { const rd = HAK.CustomsModel.readiness(c, decls), ship = (HAK.ContractModel.active(c).find((d) => d.ship) || {}).ship || ''; return '<option value="' + esc(c.id) + '"' + (c.id === pre.contractId ? ' selected' : '') + (rd.ok ? '' : ' disabled') + '>' + esc((c.no || c.id) + (custName(c.buyerId) ? ' · ' + custName(c.buyerId) : '') + (ship ? ' · ' + ship : '') + (rd.ok ? '' : ' — thiếu: ' + rd.missing.join(' + '))) + '</option>'; }).join('');
    $('#csrAsContract').disabled = !!pre.contractId;
    $('#csrAsHelp').innerHTML = GATED.indexOf(type) >= 0 ? 'Hợp đồng ' + esc(typeLabel(type)) + ' phải có <b>tàu</b> và <b>tờ khai hải quan</b> trước mới gắn được (chưa có tờ khai thì chưa thực hiện được hợp đồng). Hợp đồng còn thiếu hiện mờ — nhập ở <a href="#/catalog">Danh mục</a>.' : 'Hợp đồng ' + esc(typeLabel(type)) + ' không cần tờ khai và tàu.';
    const recs = (state.unlinked || []).filter((r) => r.type === type).sort((a, b) => (a.fromTs || 0) - (b.fromTs || 0));
    $('#csrAsRecs').innerHTML = recs.length ? recs.map((r) => '<tr><td><input type="checkbox" class="form-check-input csr-as" data-id="' + esc(r.id) + '"' + ((pre.recIds || []).indexOf(r.id) >= 0 ? ' checked' : '') + '></td><td>' + esc(r.title || '') + '</td><td>' + esc(r.ship || '') + '</td><td>' + esc(r.from || '') + (r.to && r.to !== r.from ? ' → ' + esc(r.to) : '') + '</td><td class="num">' + int(r.trips) + '</td><td class="num">' + ton(r.kg) + '</td><td>' + esc(recKho(r)) + '</td></tr>').join('') : '<tr><td colspan="7" class="muted text-center py-3">Không còn đợt giao hàng nào chưa gắn của hình thức này.</td></tr>';
    $('#csrAsErr').textContent = '';
    $('#csrAsSave').onclick = async () => {
      const cid = $('#csrAsContract').value, ids = Array.from(document.querySelectorAll('#csrAsRecs .csr-as:checked')).map((x) => x.dataset.id);
      if (!cid) { $('#csrAsErr').textContent = 'Chọn hợp đồng.'; return; } if (!ids.length) { $('#csrAsErr').textContent = 'Tick ít nhất một đợt giao hàng.'; return; }
      const btn = $('#csrAsSave'); btn.disabled = true;
      try {
        const detailId = await HAK.Customs.ensureDetail(cid);
        await HAK.Archive.setContract(ids, detailId);
        bootstrap.Modal.getOrCreateInstance(m).hide(); toast('Đã gắn ' + ids.length + ' đợt giao hàng vào hợp đồng.', 'success'); await render();
      } catch (e) { $('#csrAsErr').textContent = 'Chưa gắn: ' + (e.message || e); } finally { btn.disabled = false; }
    };
    bootstrap.Modal.getOrCreateInstance(m).show();
  }
  async function unassign(recId) {
    await HAK.Archive.setContract([recId], '');
    const m = $('#csrModal'); if (m) bootstrap.Modal.getOrCreateInstance(m).hide();
    toast('Đã gỡ đợt giao hàng khỏi hợp đồng.', 'info'); await render();
  }
  function drawDetailRecs() {
    const d = state.detail, host = $('#csrRecs'); if (!d || !host) return;
    const recs = d.lots.flatMap((L) => L.recs).sort((a, b) => (a.fromTs || 0) - (b.fromTs || 0));
    host.innerHTML = '<div class="sec-title mb-1">Các đợt giao hàng của hợp đồng (' + recs.length + ')</div><div class="tbl-wrap mb-2"><table class="table table-sm align-middle mb-0"><thead><tr><th>Hồ sơ / đợt giao hàng</th><th>Từ ngày → đến ngày</th><th class="num">Số xe</th><th class="num">Tấn</th><th class="num">Xe trả về</th><th>Kho xuất</th><th></th></tr></thead><tbody>' +
      recs.map((r) => '<tr><td>' + esc(r.title || '') + '</td><td>' + esc(r.from || '') + (r.to && r.to !== r.from ? ' → ' + esc(r.to) : '') + '</td><td class="num">' + int(r.trips) + '</td><td class="num">' + ton(r.kg) + '</td><td class="num">' + int(r.retTrips) + '</td><td>' + esc(recKho(r)) + '</td><td class="text-end">' + (r.contract ? '<button class="btn btn-sm btn-outline-danger" type="button" data-csr-un="' + esc(r.id) + '">Gỡ khỏi hợp đồng</button>' : '<span class="small muted">ghép theo tên tàu</span>') + '</td></tr>').join('') + '</tbody></table></div>';
  }

  /* ---------------- Chi tiết xuất hàng từng xe ---------------- */
  function ensureModal() {
    let m = $('#csrModal'); if (m) return m;
    m = document.createElement('div'); m.className = 'modal fade'; m.id = 'csrModal'; m.tabIndex = -1;
    m.innerHTML = '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><div><h5 class="modal-title" id="csrTitle"></h5><div class="small muted" id="csrSub"></div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
      '<div class="modal-body"><div id="csrRecs"></div><div class="row g-2 mb-2" id="csrChips"></div><div id="csrDSmart" class="mb-2"></div><div class="d-flex justify-content-end gap-2 mb-2"><button class="btn btn-sm btn-success" id="csrDXls" type="button">📊 Xuất Excel</button><button class="btn btn-sm btn-outline-primary" id="csrDPdf" type="button">🖨️ Tải PDF</button></div>' +
      '<div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th class="num">STT</th><th>Ngày</th><th>Giờ cân 1</th><th>Giờ cân 2</th><th>Số phiếu</th><th>Biển số</th><th>Tài xế</th><th>Đơn vị vận chuyển</th><th>Kho xuất</th><th class="num">KL hàng (kg)</th><th class="num">Tấn</th><th>Hồ sơ / biên bản</th><th>Trả về</th><th>Số BKLS</th></tr></thead><tbody id="csrTrips"></tbody></table></div><div class="small muted" id="csrMore"></div></div></div></div>';
    document.body.append(m);
    $('#csrDXls').addEventListener('click', () => exportTrips().catch((e) => toast(e.message || String(e), 'error')));
    $('#csrDPdf').addEventListener('click', () => pdfTrips().catch((e) => toast(e.message || String(e), 'error')));
    return m;
  }
  const tripRow = (t) => { const r = t.row, kho = khoOf(t.rec); return { ts: r.ts1 === null || r.ts1 === undefined ? 0 : r.ts1, date: r.dateStr || '', t1: r.time1 || '', t2: r.time2 || '', ticket: r.ticket || '', plate: r.plate || '', driver: r.driver || '', carrier: r.carrier || '', kho, kg: r.net, rec: t.rec.title || '', ret: t.isRet, bkls: t.bkls || '', ship: t.lot.ship || '', lot: lotLabel(t.lot), weigher: r.weigher || '' }; };
  /** Bộ lọc smart của bảng từng xe: dựng lại mỗi lần mở (dữ liệu mỗi hợp đồng khác nhau), giữ bộ lọc đã lưu theo màn hình. */
  function tripFields(rows) {
    const f = F(), opt = (get) => () => Array.from(new Set(rows.map(get).filter(Boolean))).sort().map((v) => ({ value: v, label: v }));
    return [f.multi('plate', 'Biển số', opt((x) => x.plate), (x) => x.plate), f.multi('carrier', 'Đơn vị vận chuyển', opt((x) => x.carrier), (x) => x.carrier), f.multi('driver', 'Tài xế', opt((x) => x.driver), (x) => x.driver),
      f.multi('kho', 'Kho xuất', opt((x) => x.kho), (x) => x.kho), f.multi('rec', 'Hồ sơ / biên bản', opt((x) => x.rec), (x) => x.rec), { key: 'ret', label: 'Chỉ xe trả về', type: 'bool', match: (x) => x.ret }];
  }
  function mountTripFilter() {
    const d = state.detail; d.view = F().mount('#csrDSmart', { screenId: 'contract-trips', source: () => d.rows, fields: tripFields(d.rows), searchPlaceholder: 'Tìm số phiếu, biển số, tài xế, đơn vị vận chuyển, hồ sơ…', quickFields: ['q', 'kho', 'plate', 'carrier'],
      matchQ: (x, q) => F().core.hay([x.ticket, x.plate, x.driver, x.carrier, x.rec, x.bkls, x.date, x.kho]).includes(q), matchDate: (x, fr, to) => F().dateMatch(x.date, fr, to), onApply: () => drawTrips(),
      summary: (r) => [{ label: 'Xe', value: r.rows.length }, { label: 'Khối lượng', value: ton(sum(r.rows.map((x) => x.kg))) + ' tấn' }] });
  }
  function visibleTrips() { const d = state.detail; return d && d.view ? d.view.filter(d.rows).rows : (d ? d.rows : []); }
  function drawTrips() {
    const d = state.detail; if (!d) return;
    const all = visibleTrips(), shown = all.slice(0, 500), kg = sum(all.filter((x) => !x.ret).map((x) => x.kg)), ret = all.filter((x) => x.ret);
    $('#csrTrips').innerHTML = shown.map((x, i) => '<tr class="' + (x.ret ? 'table-warning' : '') + '"><td class="num">' + (i + 1) + '</td><td>' + esc(x.date) + '</td><td class="small">' + esc(x.t1) + '</td><td class="small">' + esc(x.t2) + '</td><td class="mono">' + esc(x.ticket) + '</td><td class="mono">' + esc(x.plate) + '</td><td>' + esc(x.driver) + '</td><td class="small">' + esc(x.carrier) + '</td><td>' + esc(x.kho) + '</td><td class="num">' + int(x.kg) + '</td><td class="num">' + ton(x.kg) + '</td><td class="small">' + esc(x.rec) + '</td><td>' + (x.ret ? '↩' : '') + '</td><td class="small mono">' + esc(x.bkls) + '</td></tr>').join('') || '<tr><td colspan="14" class="muted text-center py-3">Không có xe khớp.</td></tr>';
    $('#csrMore').textContent = all.length > shown.length ? 'Hiển thị ' + shown.length + ' / ' + all.length + ' xe — dùng ô tìm kiếm hoặc xuất Excel / PDF để có đủ.' : all.length + ' xe.';
    $('#csrChips').innerHTML = card('Số chuyến xe', int(all.length), 'Xe trả về: ' + ret.length) + card('Qua cân (tấn)', ton(sum(all.map((x) => x.kg)))) + card('Thực giao (tấn)', ton(kg), 'Không tính xe trả về') + card('Số phiếu / hồ sơ', int(new Set(all.map((x) => x.ticket).filter(Boolean)).size) + ' / ' + new Set(all.map((x) => x.rec)).size);
  }
  async function showTrips(gi, li) {
    const g = filtered()[gi]; if (!g) return;
    const lots = li === undefined ? g.lots.filter((L) => L.recs.length) : [g.lots[li]].filter((L) => L && L.recs.length);
    if (!lots.length) { toast('Chưa có phiếu cân nào trong Lưu trữ cho mục này.', 'warning'); return; }
    const { Loading } = HAK.UI; Loading.show('Đang đọc phiếu cân từ Lưu trữ…');
    let items;
    try { items = await HAK.Report.xhTrips(lots, (n, total) => Loading.show('Đang đọc hồ sơ ' + n + '/' + total + '…')); } finally { Loading.hide(); }
    const rows = items.map(tripRow).sort((a, b) => a.ts - b.ts);
    state.detail = { g, lots, rows, view: null, title: (g.f.no || '(chưa gắn hợp đồng)') + (li !== undefined ? ' — ' + lotLabel(lots[0]) : '') };
    ensureModal();
    $('#csrTitle').textContent = 'Chi tiết xuất hàng từng xe — ' + state.detail.title;
    $('#csrSub').textContent = [typeLabel(g.f.type), g.f.buyer, g.c && g.c.date ? 'ký ' + vnDate(g.c.date) : ''].filter(Boolean).join(' · ');
    drawDetailRecs(); mountTripFilter(); drawTrips(); bootstrap.Modal.getOrCreateInstance($('#csrModal')).show();
  }

  /* ---------------- Excel / PDF ---------------- */
  const stamp = () => { const v = state.view; return v ? ' · Bộ lọc: ' + v.describe() : ''; };
  async function exportSummary() {
    const list = filtered(); if (!list.length) return;
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report, wb = R.newWorkbook(), NI = '#,##0', ND = '#,##0.00', n = (v) => (hasNum(v) ? +v : null);
    const sub = 'Nguồn: hồ sơ cân trong Lưu trữ gắn hợp đồng (Danh mục), tờ khai hải quan' + stamp() + '. Thực giao = qua cân − xe trả về.';
    R.buildSheet(wb, 'Hợp đồng', 'TÌNH HÌNH THỰC HIỆN HỢP ĐỒNG — THEO PHIẾU CÂN', sub,
      [{ h: 'Hình thức', w: 12 }, { h: 'Số hợp đồng', w: 24 }, { h: 'Ngày ký', w: 12 }, { h: 'Bên mua / nhận', w: 30 }, { h: 'Kho xuất', w: 24 }, { h: 'Tàu / chuyến', w: 26 }, { h: 'Số hồ sơ', w: 9, n: NI }, { h: 'Số chuyến xe', w: 11, n: NI }, { h: 'KL qua cân (tấn)', w: 15, n: ND }, { h: 'Xe trả về', w: 9, n: NI }, { h: 'Thực giao (tấn)', w: 15, n: ND }, { h: 'KL hợp đồng (BDMT)', w: 16, n: ND }, { h: 'MT chứng thư − thực giao (tấn)', w: 18, n: ND }, { h: 'Cân từ ngày', w: 12 }, { h: 'Cân đến ngày', w: 12 }, { h: 'Chứng thư', w: 10 }, { h: 'Tờ khai đã thông quan', w: 12 }, { h: 'Thuế phải nộp (đ)', w: 16, n: NI }, { h: 'Còn phải nộp (đ)', w: 16, n: NI }, { h: 'Trạng thái', w: 16 }],
      list.map((g) => { const c = g.c, t = g.tot, cu = g.cust; return [typeLabel(g.f.type), g.f.no, vnDate(g.f.date), g.f.buyer, g.khos.join(', '), g.ships.join(', '), t.recs, t.trips, t.kg / 1000, t.retTrips, t.delKg / 1000, c ? n(c.contractQty) : null, g.gap, g.from, g.to, cu ? cu.tot.certs + '/' + cu.tot.details : '', cu ? cu.tot.cleared + '/' + cu.tot.decls : '', cu ? n(cu.tot.payable) : null, cu ? n(cu.tot.remaining) : null, g.f.statusLabel]; }), { total: true });
    R.buildSheet(wb, 'Theo chi tiết', 'THEO CHI TIẾT HỢP ĐỒNG (TÀU)', sub,
      [{ h: 'Số hợp đồng', w: 24 }, { h: 'Chi tiết hợp đồng (tàu)', w: 40 }, { h: 'Kho xuất', w: 24 }, { h: 'Số hồ sơ', w: 9, n: NI }, { h: 'Số chuyến xe', w: 11, n: NI }, { h: 'KL qua cân (tấn)', w: 15, n: ND }, { h: 'Xe trả về', w: 9, n: NI }, { h: 'Thực giao (tấn)', w: 15, n: ND }, { h: 'MT chứng thư (tấn)', w: 15, n: ND }, { h: 'MT − thực giao (tấn)', w: 15, n: ND }, { h: 'Cân từ ngày', w: 12 }, { h: 'Cân đến ngày', w: 12 }],
      list.flatMap((g) => g.lots.map((L) => [g.f.no, lotLabel(L), Array.from(new Set(L.recs.map(khoOf).filter(Boolean))).join(', '), L.recs.length, L.recs.length ? L.trips : null, L.recs.length ? L.kg / 1000 : null, L.recs.length ? L.retTrips : null, L.recs.length ? L.delKg / 1000 : null, L.c ? n(L.c.mt) : null, L.recs.length && L.c && hasNum(L.c.mt) ? L.c.mt - L.delKg / 1000 : null, L.from, L.to])), { total: true });
    await save(wb, 'TinhHinhHopDong_TheoPhieuCan.xlsx');
  }
  async function save(wb, name) {
    if (!await HAK.Word.Files.saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)) return;
    toast('Đã xuất: ' + name, 'success');
  }
  async function exportTrips() {
    const d = state.detail, rows = visibleTrips(); if (!d || !rows.length) { toast('Chưa có xe để xuất.', 'warning'); return; }
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report, wb = R.newWorkbook(), NI = '#,##0', ND = '#,##0.00';
    R.buildSheet(wb, 'Từng xe', 'CHI TIẾT XUẤT HÀNG TỪNG XE — ' + d.title.toUpperCase(), 'Nguồn: phiếu cân trong hồ sơ Lưu trữ. Xe trả về không tính vào thực giao.',
      [{ h: 'STT', w: 6, n: NI }, { h: 'Ngày', w: 12 }, { h: 'Giờ cân 1', w: 18 }, { h: 'Giờ cân 2', w: 18 }, { h: 'Số phiếu', w: 14 }, { h: 'Biển số', w: 12 }, { h: 'Tài xế', w: 20 }, { h: 'Đơn vị vận chuyển', w: 30 }, { h: 'Kho xuất', w: 20 }, { h: 'KL hàng (kg)', w: 13, n: NI }, { h: 'KL (tấn)', w: 11, n: ND }, { h: 'Hồ sơ / biên bản', w: 34 }, { h: 'Xe trả về', w: 9 }, { h: 'Số BKLS', w: 22 }, { h: 'Người cân', w: 16 }],
      rows.map((x, i) => [i + 1, x.date, x.t1, x.t2, x.ticket, x.plate, x.driver, x.carrier, x.kho, hasNum(x.kg) ? +x.kg : null, hasNum(x.kg) ? x.kg / 1000 : null, x.rec, x.ret ? 'x' : '', x.bkls, x.weigher]), { total: true });
    await save(wb, 'ChiTietXuatHang_' + String(d.g.f.no || 'HD').replace(/[^\w.-]+/g, '_') + '.xlsx');
  }
  const PC = (cols) => cols.map((c) => (typeof c === 'string' ? { h: c } : c));
  async function pdfSummary() {
    const list = filtered(); if (!list.length) return;
    const rows = [];
    list.forEach((g) => {
      const t = g.tot, cu = g.cust, c = g.c;
      rows.push({ cls: 'main', c: [g.f.no + ' · ' + typeLabel(g.f.type) + (g.f.date ? ' · ' + vnDate(g.f.date) : ''), g.f.buyer, g.khos.join(', '), g.ships.join(', '), int(t.recs), int(t.trips), ton(t.kg), int(t.retTrips), ton(t.delKg), c ? dec(c.contractQty, 0) : '', g.gap === null ? '' : dec(g.gap), cu ? cu.tot.cleared + '/' + cu.tot.decls : '', cu ? money(cu.tot.payable) : '', cu ? money(cu.tot.remaining) : '', g.f.statusLabel] });
      g.lots.forEach((L) => rows.push({ cls: 'sub', c: [lotLabel(L), '', Array.from(new Set(L.recs.map(khoOf).filter(Boolean))).join(', '), '', int(L.recs.length), L.recs.length ? int(L.trips) : '', L.recs.length ? ton(L.kg) : '', L.recs.length ? int(L.retTrips) : '', L.recs.length ? ton(L.delKg) : '', L.c && hasNum(L.c.mt) ? dec(L.c.mt) + ' MT' : '', L.recs.length && L.c && hasNum(L.c.mt) ? dec(L.c.mt - L.delKg / 1000) : '', '', '', '', L.recs.length ? '' : 'chưa có phiếu cân'] }));
    });
    const T = list.map((g) => g.tot);
    rows.push({ cls: 'total', c: ['TỔNG CỘNG (' + list.length + ' hợp đồng)', '', '', '', int(sum(T.map((t) => t.recs))), int(sum(T.map((t) => t.trips))), ton(sum(T.map((t) => t.kg))), int(sum(T.map((t) => t.retTrips))), ton(sum(T.map((t) => t.delKg))), '', '', '', '', '', ''] });
    await HAK.Customs.printReport({ file: 'TinhHinhHopDong_TheoPhieuCan', title: 'TÌNH HÌNH THỰC HIỆN HỢP ĐỒNG — THEO PHIẾU CÂN', sub: 'Số chuyến xe · khối lượng qua cân · kho xuất · chứng thư · tờ khai · thuế' + stamp(),
      tables: [{ cols: PC(['Hợp đồng / chi tiết', 'Bên mua', 'Kho xuất', 'Tàu', { h: 'Hồ sơ', n: true }, { h: 'Chuyến xe', n: true }, { h: 'Qua cân (tấn)', n: true }, { h: 'Xe trả về', n: true }, { h: 'Thực giao (tấn)', n: true }, { h: 'KL hợp đồng / MT', n: true }, { h: 'MT − thực giao', n: true }, 'Tờ khai', { h: 'Thuế phải nộp', n: true }, { h: 'Còn phải nộp', n: true }, 'Trạng thái']), rows }] });
  }
  async function pdfTrips() {
    const d = state.detail, rows = visibleTrips(); if (!d || !rows.length) { toast('Chưa có xe để in.', 'warning'); return; }
    const body = rows.map((x, i) => ({ cls: x.ret ? 'sub' : '', c: [i + 1, x.date, x.t1, x.t2, x.ticket, x.plate, x.driver, x.carrier, x.kho, int(x.kg), ton(x.kg), x.rec, x.ret ? 'x' : '', x.bkls] }));
    body.push({ cls: 'total', c: ['', 'TỔNG ' + rows.length + ' xe', '', '', '', '', '', '', '', int(sum(rows.map((x) => x.kg))), ton(sum(rows.map((x) => x.kg))), '', '', ''] });
    await HAK.Customs.printReport({ file: 'ChiTietXuatHang_' + String(d.g.f.no || 'HD').replace(/[^\w.-]+/g, '_'), title: 'CHI TIẾT XUẤT HÀNG TỪNG XE — ' + d.title, sub: 'Nguồn: phiếu cân trong hồ sơ Lưu trữ · dòng xe trả về có dấu x, không tính vào thực giao', tables: [{ cols: PC([{ h: 'STT', n: true }, 'Ngày', 'Giờ cân 1', 'Giờ cân 2', 'Số phiếu', 'Biển số', 'Tài xế', 'Đơn vị vận chuyển', 'Kho xuất', { h: 'KL (kg)', n: true }, { h: 'Tấn', n: true }, 'Hồ sơ', 'Trả về', 'Số BKLS']), rows: body }] });
  }

  function init() {
    const host = $('#page-contractstatus'); if (!host || host.dataset.bound) return; host.dataset.bound = '1';
    host.addEventListener('click', (e) => {
      const asg = e.target.closest('[data-csr-assign]');
      if (asg) { const g = filtered()[+asg.dataset.csrAssign]; if (g && g.c) openAssign({ type: g.c.type, contractId: g.c.id, recIds: [] }); return; }
      if (e.target.closest('#csrAssignBtn')) { const t = unTicked(); if (!t.length) return; const types = Array.from(new Set(t.map((x) => x.type))); if (types.length > 1) { toast('Chọn các đợt cùng một hình thức (Xuất khẩu, Ủy thác, Xuất bán hoặc Trao đổi) để gắn cùng lúc.', 'warning'); return; } openAssign({ type: types[0], recIds: t.map((x) => x.id) }); return; }
      const row = e.target.closest('[data-csr-g]'); if (row && !e.target.closest('a,button')) { showTrips(+row.dataset.csrG, row.dataset.csrL === undefined ? undefined : +row.dataset.csrL).catch((x) => toast(x.message || String(x), 'error')); return; }
      if (e.target.closest('#csrXls')) exportSummary().catch((x) => toast(x.message || String(x), 'error'));
      else if (e.target.closest('#csrPdf')) pdfSummary().catch((x) => toast(x.message || String(x), 'error'));
      else if (e.target.closest('#csrReload')) render();
    });
    host.addEventListener('change', (e) => {
      if (e.target.id === 'csrAllUn') document.querySelectorAll('#csrUnlinked .csr-un').forEach((x) => { x.checked = e.target.checked; });
      if (e.target.id === 'csrAllUn' || e.target.classList.contains('csr-un')) { const b = $('#csrAssignBtn'); if (b) b.disabled = !unTicked().length; }
    });
    document.addEventListener('click', (e) => { const u = e.target.closest('[data-csr-un]'); if (u) HAK.UI.confirmClick(u, () => unassign(u.dataset.csrUn).catch((x) => toast(x.message || String(x), 'error')), 'Gỡ?'); });
    root.addEventListener('hak:catalog', () => { if (!host.hidden) render(); });
  }
  HAK.ContractStatus = { render, init, load, state };
})(window);
