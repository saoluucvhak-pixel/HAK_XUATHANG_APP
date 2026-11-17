/**
 * pages-modals.js — các hộp thoại của 4 trang lập hồ sơ: Bỏ phiếu cân, Chọn phiếu theo số, Xe trả về.
 * Tách từ pages.js (v2.19.6), KHÔNG đổi hành vi: pages.js truyền vào các hàm/biến dùng chung qua ctx.
 * Phải nạp trước pages.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  HAK.PagesModals = function (ctx) {
    const { G, ST, $, esc, toast, debounce, fmtInt, getDs } = ctx;
    // Hàm dùng chung gọi qua ctx tại thời điểm dùng (giữ nguyên ngữ nghĩa khi pages.js gán lại hàm)
    const collect = (...a) => ctx.collect(...a), currentRows = (...a) => ctx.currentRows(...a), updateSummary = (...a) => ctx.updateSummary(...a);
    /* ===============================================================
     * Bỏ phiếu cân (v2.12): phiếu bị bỏ coi như không có. Khóa = G.omitKey (số phiếu|biển số|giờ cân vào);
     * lưu kèm lý do + người + giờ trong p.filter.omitLog để truy vết.
     * ============================================================= */
    /** Các dòng của phạm vi hiện tại NHƯNG chưa trừ phiếu đã bỏ (để hiện lại cho khôi phục). */
    function rowsWithOmitted(type) {
      const ds = getDs(type); if (!ds) return [];
      const p = collect(type), f = Object.assign({}, p.filter); delete f.omit; delete f.omitLog;
      return G().filterRows(ds.rows, f);
    }
    function omittedInfo(type) {
      const om = ST[type].omit; if (!om.size) return { n: 0, kg: 0 };
      if (ST[type].savedDs) { const v = Array.from(om.values()); return { n: v.length, kg: v.reduce((x, e) => x + (+e.kg || 0), 0) }; }   // hồ sơ đã lưu: dòng bỏ không còn trong dữ liệu → đếm theo nhật ký
      const hit = rowsWithOmitted(type).filter((r) => om.has(G().omitKey(r)));
      return { n: hit.length, kg: hit.reduce((a, r) => a + (+r.net || 0), 0) };
    }
    /* ---- Chọn phiếu cân của tàu này (khi 2 tàu cân xen kẽ trong ngày): hồ sơ chỉ gồm các phiếu đã tick ---- */
    const PICK_PAGE = 300;
    let pickType = null, pickAssigned = new Map(), pickState = 'loading', pickToken = 0, pickAmb = [];
    const pickCache = new Map();
    /**
     * Phiếu nào đã nằm trong hồ sơ Lưu trữ khác (cùng công ty, ngày cân giao nhau) → nhãn tàu / hồ sơ để khỏi gán trùng.
     * Trạng thái: loading (đang kiểm tra) · ok (đọc xong: có / chưa gán) · error (chưa xác minh được — KHÔNG được coi là "chưa gán").
     * token chống kết quả tải chậm của hộp chọn TRƯỚC cập nhật nhầm vào hộp chọn HIỆN TẠI.
     */
    async function loadPickAssigned(type, token) {
      const map = new Map();
      if (!HAK.Archive || !HAK.Report || !HAK.Weigh) return map;
      const p = collect(type), rows = rowsForPick(type), tss = rows.map((r) => r.ts1).filter((x) => x !== null && x !== undefined);
      if (!tss.length) return map;
      const lo = Math.min.apply(null, tss), hi = Math.max.apply(null, tss) + 86400000, dmy = (s) => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null; };
      const metas = (await HAK.Archive.list()).filter((m) => (m.cid || '') === (p.giaoId || '') && dmy(m.from) !== null && dmy(m.from) <= hi && (dmy(m.to) === null ? dmy(m.from) : dmy(m.to)) + 86399999 >= lo);
      if (!metas.length || token !== pickToken) return map;
      const tk = await HAK.Report.prepareTickets(metas, pickCache, true);
      metas.forEach((m) => {
        if (!tk.has(m.id)) { map.set('__failed__' + m.id, [{ ship: m.ship || '', title: m.title || m.id, id: m.id }]); return; }   // hồ sơ không đọc được phiếu → chưa xác minh được
        tk.get(m.id).forEach((t) => {
          if (!t.id) return; const k = t.id.replace(/#\d+$/, ''), arr = map.get(k) || []; arr.push({ ship: m.ship || '', title: m.title || m.id, id: m.id }); map.set(k, arr);
        });
      });
      return map;
    }
    const identOf = (r) => { const cid = (collect(pickType) || {}).giaoId || ''; return HAK.Weigh ? HAK.Weigh.identity(r, cid) : null; };
    const pickChips = (r) => {
      if (pickState === 'loading') return '<span class="badge text-bg-secondary">Đang kiểm tra…</span>';
      const k = identOf(r), a = k ? pickAssigned.get(k) : null;
      if (a && a.length) return a.map((x) => '<a href="#" class="badge text-bg-warning text-decoration-none" data-open-src="' + esc(x.id) + '" title="Mở hồ sơ nguồn: ' + esc(x.title) + '">Đã gán · ' + esc(x.ship || 'không rõ tàu') + '</a>').join(' ');
      if (pickState === 'error') return '<span class="badge text-bg-danger" title="Không đọc được các hồ sơ đã lưu — chưa biết phiếu này đã gán chưa">⚠ Chưa xác minh được</span>';
      if (!k) return '<span class="badge text-bg-light border" title="Thiếu số phiếu / giờ / biển số để nhận diện">Chưa xác minh được</span>';
      if (Array.from(pickAssigned.keys()).some((x) => x.indexOf('__failed__') === 0)) return '<span class="badge text-bg-light border" title="Có hồ sơ đã lưu không đọc được phiếu">Chưa gán (chưa đủ chắc)</span>';
      return '<span class="badge text-bg-light border">Chưa gán</span>';
    };
    function rowsForPick(type) {
      const ds = getDs(type); if (!ds) return [];
      const p = collect(type), f = Object.assign({}, p.filter); delete f.pick;
      return G().filterRows(ds.rows, f);
    }
    const pickMatch = (r, q) => !q || String(r.ticket || '').toLowerCase().includes(q) || String(r.plate || '').toLowerCase().includes(q);
    /** Các dòng ĐANG hiển thị trong bảng (đã lọc tìm kiếm, tối đa PICK_PAGE dòng đầu) và toàn bộ kết quả. */
    function pickView() {
      const q = $('#pickSearch').value.trim().toLowerCase(), all = rowsForPick(pickType).filter((r) => pickMatch(r, q));
      return { all, shown: all.slice(0, PICK_PAGE) };
    }
    /** Phân giải một số phiếu dán vào: khớp ĐẦY ĐỦ trước; chỉ khớp đuôi khi có đúng MỘT kết quả; nhiều kết quả → để người dùng xác nhận. */
    function resolveTicket(rows, token) {
      const t = String(token).trim().toLowerCase(); if (!t) return { kind: 'none', hits: [] };
      const exact = rows.filter((r) => String(r.ticket || '').trim().toLowerCase() === t);
      if (exact.length === 1) return { kind: 'one', hits: exact };
      if (exact.length > 1) return { kind: 'many', hits: exact };
      const tail = rows.filter((r) => String(r.ticket || '').toLowerCase().endsWith(t));
      if (tail.length === 1) return { kind: 'one', hits: tail };
      return { kind: tail.length ? 'many' : 'none', hits: tail };
    }
    function ensurePickModal() {
      if ($('#pickModal')) return;
      const m = document.createElement('div'); m.className = 'modal fade'; m.id = 'pickModal'; m.tabIndex = -1;
      m.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Chọn phiếu cân của tàu này</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
        '<div class="modal-body"><p class="small muted">Tick các phiếu <b>thuộc tàu này</b>. Hồ sơ chỉ gồm các phiếu đã chọn (không tick gì = lấy theo phạm vi ngày / giờ / số phiếu). Các phiếu còn lại dành cho hồ sơ của tàu kia. Danh sách chỉ hiện phiếu nằm trong phạm vi ngày / giờ / số phiếu đang đặt ở trên — muốn chọn trong cả ngày thì để trống giờ và số phiếu.</p>' +
        '<div class="alert alert-warning py-1 small d-none" id="pickWarn"></div>' +
        '<div class="row g-2 mb-2"><div class="col-md-4"><input id="pickSearch" class="form-control form-control-sm" placeholder="Tìm số phiếu / biển số…" autocomplete="off"></div>' +
        '<div class="col-md-8 d-flex flex-wrap gap-2"><button class="btn btn-sm btn-outline-primary" id="pickAllShown" type="button">Chọn các dòng đang hiển thị</button><button class="btn btn-sm btn-outline-primary d-none" id="pickAllResults" type="button">Chọn tất cả kết quả</button><button class="btn btn-sm btn-outline-secondary" id="pickNone" type="button">Bỏ chọn hết</button></div></div>' +
        '<div class="mb-2"><textarea id="pickPaste" class="form-control form-control-sm" rows="2" placeholder="Hoặc dán danh sách số phiếu của tàu này (cách nhau bằng dấu cách / phẩy / xuống dòng)"></textarea><button class="btn btn-sm btn-outline-primary mt-1" id="pickApply" type="button">Chọn theo danh sách đã dán</button> <span class="small" id="pickPasteMsg"></span><div id="pickAmb" class="mt-2"></div></div>' +
        '<div class="tbl-wrap"><table class="table table-sm"><thead><tr><th>Chọn</th><th>Số phiếu</th><th>Giờ cân 1</th><th>Biển số</th><th class="num">KL (kg)</th><th>Trạng thái gán</th></tr></thead><tbody id="pickBody"></tbody></table></div><div class="small muted" id="pickInfo"></div></div>' +
        '<div class="modal-footer"><span class="me-auto small" id="pickCount"></span><button class="btn btn-primary" data-bs-dismiss="modal" type="button">Xong</button></div></div></div>';
      document.body.appendChild(m);
      const cur = () => (ST[pickType].filter.pick || []);
      const setPick = (arr) => { ST[pickType].filter.pick = arr; renderPickList(); updateSummary(pickType); };
      const addKeys = (rows) => { const s = new Set(cur()), K = G().omitKey; let n = 0; rows.forEach((r) => { if (!s.has(K(r))) { s.add(K(r)); n++; } }); setPick(Array.from(s)); return n; };
      $('#pickSearch').addEventListener('input', debounce(renderPickList, 150));
      $('#pickBody').addEventListener('change', (e) => {
        const cb = e.target.closest('input[data-key]'); if (!cb) return;
        const s = new Set(cur()); if (cb.checked) s.add(cb.dataset.key); else s.delete(cb.dataset.key); setPick(Array.from(s));
      });
      $('#pickBody').addEventListener('click', (e) => { const a = e.target.closest('[data-open-src]'); if (a) { e.preventDefault(); openPickSource(a.dataset.openSrc); } });
      $('#pickNone').addEventListener('click', () => setPick([]));
      $('#pickAllShown').addEventListener('click', () => { const v = pickView(), n = addKeys(v.shown); $('#pickPasteMsg').innerHTML = '<span class="text-success">Đã chọn ' + n + ' / ' + v.shown.length + ' dòng đang hiển thị.</span>'; });
      $('#pickAllResults').addEventListener('click', () => { const v = pickView(), n = addKeys(v.all); $('#pickPasteMsg').innerHTML = '<span class="text-success">Đã chọn ' + n + ' phiếu (toàn bộ ' + v.all.length + ' kết quả).</span>'; });
      $('#pickApply').addEventListener('click', () => {
        const tokens = $('#pickPaste').value.split(/[\s,;]+/).filter(Boolean), rows = rowsForPick(pickType); let auto = [], miss = []; pickAmb = [];
        tokens.forEach((t) => { const r = resolveTicket(rows, t); if (r.kind === 'one') auto = auto.concat(r.hits); else if (r.kind === 'many') pickAmb.push({ token: t, hits: r.hits }); else miss.push(t); });
        const added = addKeys(auto);
        $('#pickPasteMsg').innerHTML = '<span class="' + (miss.length || pickAmb.length ? 'text-warning' : 'text-success') + '">Đã chọn ' + added + ' phiếu' + (miss.length ? '; không tìm thấy: ' + esc(miss.join(', ')) : '') + (pickAmb.length ? '; ' + pickAmb.length + ' số khớp NHIỀU phiếu — xác nhận bên dưới' : '') + '</span>';
        renderPickAmb();
      });
      $('#pickAmb').addEventListener('click', (e) => {
        if (!e.target.closest('#pickAmbOk')) return;
        const keys = new Set(Array.from(document.querySelectorAll('#pickAmb input[data-key]:checked')).map((x) => x.dataset.key)), K = G().omitKey;
        const rows = pickAmb.flatMap((a) => a.hits).filter((r) => keys.has(K(r))); const n = addKeys(rows); pickAmb = []; renderPickAmb(); $('#pickPasteMsg').innerHTML = '<span class="text-success">Đã chọn thêm ' + n + ' phiếu theo xác nhận.</span>';
      });
    }
    function renderPickAmb() {
      const box = $('#pickAmb'); if (!box) return;
      if (!pickAmb.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="border rounded p-2 small"><b>Số phiếu khớp nhiều dòng — tick đúng phiếu của tàu này rồi bấm Xác nhận:</b><table class="table table-sm mb-1"><tbody>' +
        pickAmb.map((a) => '<tr class="table-light"><td colspan="5">Số dán: <b>' + esc(a.token) + '</b></td></tr>' + a.hits.map((r) => '<tr><td><input class="form-check-input" type="checkbox" data-key="' + esc(G().omitKey(r)) + '"></td><td class="mono">' + esc(r.ticket) + '</td><td>' + esc(r.time1) + '</td><td>' + esc(r.plate) + '</td><td>' + pickChips(r) + '</td></tr>').join('')).join('') +
        '</tbody></table><button class="btn btn-sm btn-primary" id="pickAmbOk" type="button">Xác nhận các phiếu đã tick</button></div>';
    }
    function renderPickList() {
      const v = pickView(), rows = rowsForPick(pickType), on = new Set(ST[pickType].filter.pick || []), K = G().omitKey;
      $('#pickBody').innerHTML = v.shown.map((r) => '<tr' + (on.has(K(r)) ? ' class="table-success"' : '') + '><td><input class="form-check-input" type="checkbox" data-key="' + esc(K(r)) + '"' + (on.has(K(r)) ? ' checked' : '') + '></td><td class="mono">' + esc(r.ticket || '(dòng ' + r.idx + ')') + '</td><td>' + esc(r.time1) + '</td><td>' + esc(r.plate) + '</td><td class="num">' + fmtInt(r.net) + '</td><td class="small">' + pickChips(r) + '</td></tr>').join('');
      const more = v.all.length > v.shown.length;
      $('#pickInfo').textContent = 'Hiển thị ' + v.shown.length + ' / ' + v.all.length + ' phiếu trong phạm vi' + (more ? ' — gõ tìm kiếm để thu hẹp, hoặc bấm "Chọn tất cả kết quả".' : '.');
      $('#pickAllResults').classList.toggle('d-none', !more); $('#pickAllResults').textContent = 'Chọn tất cả ' + v.all.length + ' kết quả';
      $('#pickAllShown').textContent = 'Chọn ' + v.shown.length + ' dòng đang hiển thị';
      const kg = rows.filter((r) => on.has(K(r))).reduce((a, r) => a + (+r.net || 0), 0);
      $('#pickCount').textContent = on.size ? 'Đã chọn ' + on.size + ' phiếu · ' + G().fmtTon(kg) + ' tấn' : 'Chưa chọn phiếu nào';
      // Phiếu đã chọn nhưng đã có ở hồ sơ khác → cảnh báo ngay trong hộp chọn
      const dup = pickDupCount(); const w = $('#pickWarn');
      w.classList.toggle('d-none', !dup); w.textContent = dup ? '⚠ ' + dup + ' phiếu đã chọn đang thuộc hồ sơ khác (nhãn vàng) — bấm nhãn để mở hồ sơ nguồn. Nếu lưu, phiếu sẽ bị tính ở cả hai hồ sơ cho tới khi xử lý.' : '';
    }
    /** Số phiếu ĐANG CHỌN mà hồ sơ khác đã có (dùng để cảnh báo trước khi lưu). */
    function pickDupCount() {
      if (pickState !== 'ok' || !ST[pickType]) return 0;
      const on = new Set(ST[pickType].filter.pick || []), K = G().omitKey; let n = 0;
      rowsForPick(pickType).forEach((r) => { if (on.has(K(r))) { const k = identOf(r); if (k && (pickAssigned.get(k) || []).length) n++; } });
      return n;
    }
    function openPickSource(id) {
      const m = $('#pickModal'); if (m && window.bootstrap) bootstrap.Modal.getOrCreateInstance(m).hide();
      if (HAK.Archive && HAK.Archive.focus) HAK.Archive.focus(id); else location.hash = '#/archive';
    }
    function openPickModal(type) {
      if (!getDs(type)) { toast('Chưa có dữ liệu Excel.', 'error'); return; }
      if (ST[type].ro) { toast('Hồ sơ đang ở chế độ chỉ xem, không chọn phiếu được.', 'warning'); return; }
      ensurePickModal(); pickType = type; pickAmb = []; const token = ++pickToken;      // mỗi lần mở hộp chọn = một phiên kiểm tra mới
      pickAssigned = new Map(); pickState = 'loading';
      $('#pickSearch').value = ''; $('#pickPasteMsg').textContent = ''; $('#pickPaste').value = ''; renderPickAmb();
      renderPickList(); bootstrap.Modal.getOrCreateInstance($('#pickModal')).show();
      loadPickAssigned(type, token).then((map) => { if (token !== pickToken || pickType !== type) return; pickAssigned = map; pickState = 'ok'; })
        .catch((e) => { console.warn('Không đọc được các hồ sơ đã gán phiếu', e); if (token === pickToken) pickState = 'error'; })
        .finally(() => { if (token === pickToken && pickType === type) renderPickList(); });
    }
    /** Trước khi lưu hồ sơ: có phiếu chọn riêng đang thuộc hồ sơ khác → hỏi xác nhận (true = tiếp tục). */
    async function confirmPickConflicts(type) {
      const pk = ST[type].filter.pick || []; if (!pk.length || !HAK.Archive || !HAK.Weigh) return true;
      let map; try { pickType = type; map = await loadPickAssigned(type, pickToken); } catch (e) { return true; }
      pickAssigned = map; pickState = 'ok';
      const n = pickDupCount(); if (!n) return true;
      return confirm('⚠ ' + n + ' phiếu bạn đã chọn đang thuộc hồ sơ khác trong Lưu trữ.\n\nNếu lưu, các phiếu này sẽ được tính ở cả hai hồ sơ (báo cáo sẽ cảnh báo trùng).\n\nBấm OK để vẫn lưu; Hủy để quay lại chỉnh phiếu.');
    }
    let omitType = null;
    function ensureOmitModal() {
      if ($('#omitModal')) return;
      const m = document.createElement('div');
      m.className = 'modal fade'; m.id = 'omitModal'; m.tabIndex = -1;
      m.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Bỏ phiếu cân</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
        '<div class="modal-body"><p class="small muted">Tick phiếu muốn <b>bỏ</b>: phiếu đó coi như không có (không tính vào tổng, biên bản, BKLS, báo cáo). Bỏ tick để khôi phục.</p>' +
        '<div class="row g-2 mb-2"><div class="col-md-6"><input id="omitSearch" class="form-control form-control-sm" placeholder="Tìm số phiếu / biển số…" autocomplete="off"></div>' +
        '<div class="col-md-6"><input id="omitReason" class="form-control form-control-sm" placeholder="Lý do bỏ (nhập nhầm / cân thử / hủy…) — áp cho phiếu tick mới" autocomplete="off"></div></div>' +
        '<div class="tbl-wrap"><table class="table table-sm"><thead><tr><th>Bỏ</th><th>Số phiếu</th><th>Giờ cân 1</th><th>Biển số</th><th class="num">KL (kg)</th><th>Lý do</th></tr></thead><tbody id="omitBody"></tbody></table></div>' +
        '<div class="small muted" id="omitInfo"></div></div>' +
        '<div class="modal-footer"><span class="me-auto small" id="omitCount"></span><button class="btn btn-outline-secondary" id="omitClear" type="button">Khôi phục tất cả</button><button class="btn btn-primary" data-bs-dismiss="modal" type="button">Xong</button></div></div></div>';
      document.body.appendChild(m);
      $('#omitSearch').addEventListener('input', debounce(renderOmitList, 150));
      $('#omitBody').addEventListener('change', (e) => {
        const cb = e.target.closest('input[data-key]'); if (!cb) return;
        const st = ST[omitType], row = rowsWithOmitted(omitType).find((r) => G().omitKey(r) === cb.dataset.key);
        if (cb.checked && row) st.omit.set(cb.dataset.key, { key: cb.dataset.key, ticket: row.ticket || '', plate: row.plate, kg: row.net, reason: $('#omitReason').value.trim(), at: Date.now(), by: HAK.Auth && HAK.Auth.who ? HAK.Auth.who() : '' });
        else st.omit.delete(cb.dataset.key);
        renderOmitList(); updateSummary(omitType);
      });
      $('#omitClear').addEventListener('click', () => { ST[omitType].omit.clear(); renderOmitList(); updateSummary(omitType); });
    }
    function renderOmitList() {
      const rows = rowsWithOmitted(omitType), q = $('#omitSearch').value.trim().toLowerCase(), om = ST[omitType].omit, K = G().omitKey;
      let shown = rows.filter((r) => !q || String(r.ticket || '').toLowerCase().includes(q) || String(r.plate || '').toLowerCase().includes(q));
      const total = shown.length;
      shown = shown.slice(0, 300);   // giữ thứ tự gốc: tick không làm dòng nhảy chỗ
      $('#omitBody').innerHTML = shown.map((r) => {
        const k = K(r), on = om.has(k);
        return '<tr' + (on ? ' class="opacity-50"' : '') + '><td><input class="form-check-input" type="checkbox" data-key="' + esc(k) + '"' + (on ? ' checked' : '') + '></td>' +
          '<td class="mono">' + (on ? '<s>' : '') + esc(r.ticket || '(dòng ' + r.idx + ')') + (on ? '</s>' : '') + '</td><td>' + esc(r.time1) + '</td><td>' + esc(r.plate) + '</td><td class="num">' + fmtInt(r.net) + '</td><td class="small">' + esc(on ? om.get(k).reason || '' : '') + '</td></tr>';
      }).join('');
      $('#omitInfo').textContent = 'Hiển thị ' + shown.length + ' / ' + total + ' phiếu' + (total > 300 ? ' — gõ tìm kiếm để thu hẹp.' : '.');
      const info = omittedInfo(omitType);
      $('#omitCount').textContent = info.n ? 'Đã bỏ ' + info.n + ' phiếu · −' + G().fmtTon(info.kg) + ' tấn' : 'Chưa bỏ phiếu nào';
    }
    function openOmitModal(type) {
      if (!getDs(type)) { toast('Chưa có dữ liệu Excel.', 'error'); return; }
      if (ST[type].ro) { toast('Hồ sơ đang ở chế độ chỉ xem, không bỏ phiếu được.', 'warning'); return; }
      ensureOmitModal(); omitType = type;
      $('#omitSearch').value = ''; $('#omitReason').value = '';
      renderOmitList();
      bootstrap.Modal.getOrCreateInstance($('#omitModal')).show();
    }

    /* ===============================================================
     * Modal chọn xe trả về (Ủy thác)
     * ============================================================= */
    let retType = 'uythac';
    function openReturnModal(type) {
      if (type) retType = type;
      const ds = getDs(type);
      if (!ds) { toast('Chưa có dữ liệu Excel.', 'error'); return; }
      $('#retSearch').value = ''; $('#retPasteMsg').textContent = ''; $('#retPaste').value = '';
      renderReturnList();
      bootstrap.Modal.getOrCreateInstance($('#returnModal')).show();
    }
    function renderReturnList() {
      const rows = currentRows(retType), q = $('#retSearch').value.trim().toLowerCase();
      const set = ST[retType].returned;
      let shown = rows.filter((r) => !q || r.ticket.toLowerCase().includes(q) || r.plate.toLowerCase().includes(q));
      const total = shown.length;
      // hiển thị các xe đã chọn lên đầu để dễ kiểm tra
      const K = G().retKey;
      shown = shown.sort((a, b) => (set.has(K(b)) ? 1 : 0) - (set.has(K(a)) ? 1 : 0)).slice(0, 300);
      $('#retBody').innerHTML = shown.map((r) =>
        '<tr><td><input class="form-check-input" type="checkbox" data-key="' + esc(K(r)) + '"' + (set.has(K(r)) ? ' checked' : '') + '></td>' +
        '<td class="mono">' + esc(r.ticket || '(dòng ' + r.idx + ')') + '</td><td>' + esc(r.time1) + '</td><td>' + esc(r.plate) + '</td><td class="num">' + fmtInt(r.net) + '</td></tr>').join('');
      $('#retInfo').textContent = 'Hiển thị ' + shown.length + ' / ' + total + ' phiếu' + (total > 300 ? ' — gõ tìm kiếm để thu hẹp.' : '.');
      $('#retCount').textContent = 'Đã chọn: ' + set.size + ' xe';
    }
    function initReturnModal() {
      $('#retSearch').addEventListener('input', debounce(renderReturnList, 150));
      $('#retBody').addEventListener('change', (e) => {
        const cb = e.target.closest('input[data-key]'); if (!cb) return;
        const s = ST[retType].returned, i = cb.dataset.key;
        if (cb.checked) s.add(i); else s.delete(i);
        $('#retCount').textContent = 'Đã chọn: ' + s.size + ' xe'; updateSummary(retType);
      });
      $('#retClear').addEventListener('click', () => { ST[retType].returned.clear(); renderReturnList(); updateSummary(retType); });
      $('#retApply').addEventListener('click', () => {
        const tokens = $('#retPaste').value.split(/[\s,;]+/).filter(Boolean);
        const rows = currentRows(retType), miss = [];
        let add = 0;
        tokens.forEach((t) => {
          const hit = rows.filter((r) => r.ticket === t || r.ticket.startsWith(t + '/'));
          if (!hit.length) miss.push(t); else hit.forEach((r) => { const k = G().retKey(r); if (!ST[retType].returned.has(k)) { ST[retType].returned.add(k); add++; } });
        });
        $('#retPasteMsg').innerHTML = '<span class="' + (miss.length ? 'text-warning' : 'text-success') + '">Đã thêm ' + add + ' xe' + (miss.length ? '; không tìm thấy: ' + esc(miss.join(', ')) : '') + '</span>';
        renderReturnList(); updateSummary(retType);
      });
    }

    return { PICK_PAGE, confirmPickConflicts, initReturnModal, omittedInfo, openOmitModal, openPickModal, openReturnModal, pickView, resolveTicket };
  };
})(window);
