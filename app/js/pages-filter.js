/**
 * pages-filter.js — Bộ lọc phạm vi dữ liệu và tóm tắt trực tiếp
 * Tách từ pages.js (v2.20), KHÔNG đổi hành vi: pages.js truyền hàm/biến dùng chung qua ctx.
 * Phải nạp trước pages.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  HAK.PagesFilter = function (ctx) {
    const {
      HAK,
      $,
      esc,
      G,
      fmtInt,
      pageBkls,
      DOCS,
      ST,
      cfg,
      getDs,
      fid,
      isDirty,
      fieldDef,
      contractValues,
      fieldValue,
      ctFillKey,
      selectedContract,
      applyContract,
    } = ctx;
    // Hàm dùng chung: gọi qua ctx tại thời điểm dùng (giữ nguyên ngữ nghĩa khi pages.js/test gán lại hàm)
    const renderZones = (...a) => ctx.renderZones(...a),
      renderConv = (...a) => ctx.renderConv(...a),
      collect = (...a) => ctx.collect(...a),
      bklsHint = (...a) => ctx.bklsHint(...a),
      omittedInfo = (...a) => ctx.omittedInfo(...a);
    /* ===============================================================
     * Bộ lọc + tóm tắt trực tiếp
     * ============================================================= */
    const smartViews = {};
    function documentSmart(type) {
      const F = HAK.Filters,
        st = ST[type];
      const options = (key) =>
        Array.from(new Set(((getDs(type) || {}).rows || []).map((r) => r[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
      if (!smartViews[type]) {
        const c = F.tripConfig(options);
        smartViews[type] = F.mount(
          '#smart-' + type,
          Object.assign({}, c, {
            screenId: 'document-' + type,
            source: () =>
              G().filterRows((getDs(type) || {}).rows || [], {
                files: st.filter.files,
                exclude: st.filter.exclude,
                groups: st.filter.groups,
                omit: Array.from(st.omit.keys()),
              }),
            quickFields: ['q', 'plate', 'carrier'],
            onApply: (state) => {
              st.filter.smart = state;
              st.filter.from = state.tu;
              st.filter.to = state.den;
              $('#from-' + type).value = state.tu;
              $('#to-' + type).value = state.den;
              updateSummary(type);
            },
            onReset: () => {
              st.filter.from = '';
              st.filter.to = '';
            },
            summary: (r) => [{ label: 'Khối lượng', value: G().fmtTon(r.rows.reduce((a, x) => a + (+x.net || 0), 0)) + ' tấn' }],
          })
        );
      }
      const state = Object.assign({}, st.filter.smart || F.core.empty(), { tu: st.filter.from || '', den: st.filter.to || '' });
      smartViews[type].setState(state);
      return smartViews[type];
    }
    function renderFilter(type) {
      const ds = getDs(type),
        box = $('#chips-' + type);
      renderConv(type);
      documentSmart(type);
      $('#noData-' + type).classList.toggle('d-none', !!ds);
      $('#gen-' + type).disabled = !ds;
      $('#pdf-' + type).disabled = !ds;
      $('#xls-' + type).disabled = !ds;
      if ($('#btnQuickPackage-' + type)) $('#btnQuickPackage-' + type).disabled = !ds;
      if ($('#btnQuickZip-' + type)) $('#btnQuickZip-' + type).disabled = !ds;
      if (pageBkls(type)) $('#bkls-' + type).disabled = !ds;
      if (!ds) {
        box.innerHTML = '';
        return;
      }
      if (!ST[type].draftRestored && HAK.Store) {
        const df = HAK.Store.get('hak.draftFilter.' + type, null);
        if (df) {
          if (df.from && !ST[type].filter.from) ST[type].filter.from = df.from;
          if (df.to && !ST[type].filter.to) ST[type].filter.to = df.to;
          if (Array.isArray(df.pick) && !ST[type].filter.pick) ST[type].filter.pick = df.pick;
          if (Array.isArray(df.omit) && (!ST[type].omit || !ST[type].omit.size)) ST[type].omit = new Set(df.omit);
        }
        ST[type].draftRestored = true;
      }
      const groups = ds.stats.groups;
      if (!ST[type].filter.groups) ST[type].filter.groups = new Set(groups.map((g) => g.label));
      // Cột ghi chú/nhãn của Excel chỉ là ghi nháp → KHÔNG dùng làm điều kiện lọc (tập nhãn luôn đầy đủ = lấy toàn bộ dòng).
      box.innerHTML = '';
      const iso = (ts) => {
        const t = HAK.Excel.util.tsToParts(ts);
        return t.y + '-' + String(t.m).padStart(2, '0') + '-' + String(t.d).padStart(2, '0');
      };
      ['from', 'to'].forEach((k) => {
        const el = $('#' + k + '-' + type);
        el.value = ST[type].filter[k] || '';
        if (ds.stats.minTs !== null) {
          el.min = iso(ds.stats.minTs);
          el.max = iso(ds.stats.maxTs);
        }
      });
      [
        ['tf', 'timeFrom'],
        ['tt', 'timeTo'],
        ['kf', 'ticketFrom'],
        ['kt', 'ticketTo'],
      ].forEach(([pre, key]) => {
        const el = $('#' + pre + '-' + type);
        if (el) el.value = ST[type].filter[key] || '';
      }); // tách phiếu trong ngày
    }

    function currentRows(type) {
      const ds = getDs(type);
      if (!ds) return [];
      const p = collect(type);
      return G().filterRows(ds.rows, p.filter);
    }

    function matchShipRows(type) {
      const ds = getDs(type);
      const shipName = ($('#' + fid(type, 'ship'))?.value || '').trim();
      const norm = HAK.Excel.util.norm;
      const ship = norm(shipName);
      if (!ds?.rows || ship.length < 2) return { shipName, eligible: [], matched: [] };
      const filter = { ...collect(type).filter, pick: null };
      const eligible = G().filterRows(ds.rows, filter);
      // So tên theo ranh giới từ để "Tàu 1" không khớp "Tàu 10".
      const hasShip = (text) => (' ' + norm(text) + ' ').includes(' ' + ship + ' ');
      return { shipName, eligible, matched: eligible.filter((row) => hasShip(row.wh) || hasShip(row.note)) };
    }

    /** Kiểm tra số liệu chứng thư ngay trên form: lỗi, lệch công thức, ô khác Danh mục (cần lý do). */
    function certCheck(type) {
      const el = $('#' + fid(type, 'moisture'));
      if (!el || !HAK.Cert) return;
      let box = $('#certCk-' + type);
      if (!box) {
        box = document.createElement('div');
        box.id = 'certCk-' + type;
        box.className = 'col-12 small';
        const col = el.closest('[class*="col-"]') || el.parentElement;
        (col.parentElement || col).appendChild(box);
      }
      const v = (id) => fieldValue(type, fieldDef(type, id)),
        ck = HAK.Cert.check({ mt: v('certWet'), bdmt: v('certDry'), moisture: v('moisture') }),
        linked = ST[type].snapshotParams ? null : selectedContract(type),
        html = [];
      ck.errors.forEach((e) => html.push('<div class="text-danger">⛔ ' + esc(e) + '</div>'));
      ck.warnings.forEach((w) => html.push('<div class="text-warning-emphasis">⚠ ' + esc(w) + '</div>'));
      ck.notes.forEach((w) => html.push('<div class="muted">ℹ Thiếu số liệu đối chiếu: ' + esc(w) + '</div>'));
      if (linked) {
        const used = {};
        HAK.Cert.FIELDS.forEach(([id]) => {
          used[id] = v(id);
        });
        const ov = HAK.Cert.overrides(HAK.Cert.fromDetail(linked), used);
        if (ov.length)
          html.push(
            '<div class="text-info-emphasis">✎ Khác Danh mục (nguồn: Chi tiết hợp đồng → Chứng thư): ' +
              ov
                .map(
                  (o) =>
                    esc(o.label) +
                    ' — Danh mục <b>' +
                    esc(o.catalog === '' || o.catalog === null ? '(trống)' : o.catalog) +
                    '</b>, chứng từ <b>' +
                    esc(o.used === '' || o.used === null ? '(trống)' : o.used) +
                    '</b>'
                )
                .join('; ') +
              (v('certReason') ? '' : ' — nhập <b>lý do điều chỉnh</b> bên dưới (hoặc sửa ở Danh mục để mọi chứng từ dùng chung).') +
              '</div>'
          );
      }
      box.innerHTML = html.join('');
    }
    /**
     * Thanh "Đang làm việc trên": công ty · đợt cân (nguồn dữ liệu) · hợp đồng · phạm vi phiếu · trạng thái lưu — để luôn biết tài liệu đang mở lấy từ đâu.
     * Ba nguồn tách bạch: (1) đợt Excel ĐANG NẠP (Nhập liệu) · (2) HỒ SƠ NĂM đã lưu (Lưu hồ sơ / Xem năm cũ) · (3) hồ sơ trong LƯU TRỮ — nguồn của Báo cáo (tự ghi khi xuất Word / PDF / Excel).
     */
    /** Một dòng chữ để đối chiếu trước/sau khi lưu hoặc xuất: công ty · tàu · số phiếu · phiếu bỏ · xe trả về · tấn thực giao (cùng tập phiếu với màn hình và file xuất). */
    function scopeSummary(type) {
      const ds = getDs(type),
        st = ST[type];
      if (!ds) return '';
      const rows = currentRows(type),
        cid = (() => {
          const el = $('#' + fid(type, 'giaoId'));
          return el ? el.value : '';
        })(),
        co = cid ? (cfg().companies || []).find((c) => c.id === cid) : null,
        shipEl = $('#' + fid(type, 'ship'));
      const ret = DOCS[type].extra === 'returned' ? rows.filter((r) => st.returned.has(G().retKey(r))) : [],
        retKg = ret.reduce((n, r) => n + r.net, 0),
        sum = G().summarize(rows);
      return [
        co ? co.short || co.name : null,
        shipEl && shipEl.value.trim() ? 'tàu ' + shipEl.value.trim() : null,
        fmtInt(rows.length) + ' phiếu',
        st.omit.size ? 'bỏ ' + st.omit.size : null,
        ret.length ? ret.length + ' xe trả về' : null,
        'thực giao ' + G().fmtTon(sum.kg - retKg) + ' tấn',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    function renderContext(type) {
      const bar = $('#ctxBar-' + type);
      if (!bar) return;
      const st = ST[type],
        ds = getDs(type),
        act = HAK.Yearbook && HAK.Yearbook.active ? HAK.Yearbook.active(type) : null,
        p = [];
      const cid = (() => {
          const el = $('#' + fid(type, 'giaoId'));
          return el ? el.value : '';
        })(),
        co = cid ? (cfg().companies || []).find((c) => c.id === cid) : null;
      p.push('<b>Công ty:</b> ' + esc(co ? co.short || co.name : 'chưa chọn'));
      {
        const shipEl = $('#' + fid(type, 'ship'));
        if (shipEl) p.push('<b>Tàu / chuyến:</b> ' + esc(shipEl.value.trim() || 'chưa nhập'));
      }
      let src;
      if (st.savedDs)
        src =
          '<b>Nguồn:</b> hồ sơ năm đã lưu' +
          (act ? ' (năm ' + esc(act.year) + ' · phiên bản ' + esc(act.revision) + ')' : '') +
          ' — <span class="muted">không dùng Excel đang nạp</span>';
      else {
        const sl = HAK.App && HAK.App.slots && HAK.App.slots[type],
          bs = sl && sl.batches ? sl.batches : [];
        src =
          '<b>Đợt cân:</b> ' +
          (bs.length
            ? esc(
                bs.length +
                  ' đợt Excel đang nạp (' +
                  bs
                    .slice(0, 3)
                    .map((b) => b.fileName)
                    .join(', ') +
                  (bs.length > 3 ? ', …' : '') +
                  ')'
              )
            : '<span class="text-warning">chưa nạp Excel</span>');
      }
      p.push(src);
      const c = st.snapshotParams ? null : selectedContract(type),
        snap = st.snapshotParams;
      let hd = 'chưa chọn (nhập tay)';
      if (c) hd = HAK.Catalog.label(c);
      else if (snap && (snap.contractDetailId || snap.contractNo)) {
        const h = snap.contractDetailId && HAK.Catalog ? HAK.Catalog.contract(snap.contractDetailId, { history: true }) : null;
        hd =
          (h ? HAK.Catalog.label(h) : snap.contractNo || snap.contractDetailId) +
          ' (bản đã lưu' +
          (h && h.deletedAt ? ' · ⚠ hợp đồng / chi tiết đã ngừng dùng' : '') +
          ')';
      }
      p.push('<b>Hợp đồng:</b> ' + esc(hd));
      if (ds) {
        const all = ds.rows.length,
          rows = currentRows(type),
          f = st.filter,
          extra = [];
        if (f.from || f.to) extra.push('ngày ' + (f.from || '…') + ' → ' + (f.to || '…'));
        const sp = G().filterSplitText(f);
        if (sp)
          extra.push(
            sp
              .replace(/chỉ \d+ phiếu được chọn riêng/, '')
              .replace(/ · $/, '')
              .trim()
          );
        if (st.omit.size) extra.push('bỏ ' + st.omit.size + ' phiếu');
        if (st.returned.size) extra.push(st.returned.size + ' xe trả về');
        p.push(
          '<b>Phạm vi lập chứng từ:</b> ' +
            fmtInt(rows.length) +
            ' / ' +
            fmtInt(all) +
            ' phiếu' +
            ((f.pick || []).length ? ' · chọn riêng ' + f.pick.length : '') +
            (extra.filter(Boolean).length ? ' (' + esc(extra.filter(Boolean).join(' · ')) + ')' : '')
        );
        {
          const sum = G().summarize(rows),
            retKg = DOCS[type].extra === 'returned' ? rows.filter((r) => st.returned.has(G().retKey(r))).reduce((n, r) => n + r.net, 0) : 0;
          p.push(
            '<b>Thực giao:</b> ' + G().fmtTon(sum.kg - retKg) + ' tấn' + (retKg ? ' (đã trừ xe trả về ' + G().fmtTon(retKg) + ' tấn)' : '')
          );
        }
      }
      const dirty = isDirty(type);
      p.push(
        '<b>Trạng thái:</b> ' +
          (st.ro
            ? '<span class="badge text-bg-secondary">Chỉ xem năm đã đóng</span>'
            : dirty
              ? '<span class="badge text-bg-warning">● Chưa lưu thay đổi</span>'
              : act
                ? '<span class="badge text-bg-success">✔ Đã lưu hồ sơ năm</span>'
                : '<span class="badge text-bg-light border">Hồ sơ mới — chưa lưu</span>')
      );
      bar.innerHTML = p.join(' <span class="muted">·</span> ');

      if (ds) {
        const rows = currentRows(type),
          sum = G().summarize(rows),
          retKg = DOCS[type].extra === 'returned' ? rows.filter((r) => st.returned.has(G().retKey(r))).reduce((n, r) => n + r.net, 0) : 0,
          deliveredTon = (sum.kg - retKg) / 1000;

        // 1. Tiến độ hợp đồng (Progress Bar)
        const cqStr = $('#' + fid(type, 'contractQty')) ? $('#' + fid(type, 'contractQty')).value : '';
        const cq = HAK.Excel && HAK.Excel.util && HAK.Excel.util.parseNum ? HAK.Excel.util.parseNum(cqStr) : parseFloat(cqStr);
        let progressHtml = '';
        if (cq && cq > 0) {
          const pct = Math.round((deliveredTon / cq) * 100);
          const diffTon = deliveredTon - cq;
          const pCls = pct > 105 ? 'bg-danger' : pct >= 95 ? 'bg-success' : 'bg-primary';
          const statusTxt =
            diffTon > 0
              ? 'Vượt HĐ: +' + G().fmtTon(diffTon * 1000) + ' tấn'
              : diffTon === 0
                ? 'Đủ 100% hợp đồng'
                : 'Còn thiếu: ' + G().fmtTon(-diffTon * 1000) + ' tấn';
          let toleranceHtml = '';
          if (cq > 0 && Math.abs(pct - 100) > 5) {
            const isOver10 = Math.abs(pct - 100) > 10;
            const tolCls = isOver10 ? 'alert-danger' : 'alert-warning';
            toleranceHtml =
              '<div class="alert ' +
              tolCls +
              ' py-1 px-2 mt-1 mb-0 small d-flex align-items-center gap-1">' +
              '  <span>' +
              (isOver10 ? '⛔' : '⚠️') +
              ' <b>Lệch dung sai Hải quan:</b> Khối lượng thực xuất đang lệch <b>' +
              Math.abs(pct - 100) +
              '%</b> so với số lượng đăng ký tờ khai (' +
              G().fmtTon(cq * 1000) +
              ' tấn). Quy định thông quan thông thường yêu cầu dung sai trong khoảng ±5% ~ ±10%.</span>' +
              '</div>';
          }
          progressHtml =
            '<div class="mt-2 pt-2 border-top">' +
            '  <div class="d-flex justify-content-between small mb-1">' +
            '    <span><b>📊 Tiến độ thực hiện hợp đồng:</b> ' +
            G().fmtTon(deliveredTon * 1000) +
            ' / ' +
            G().fmtTon(cq * 1000) +
            ' tấn (' +
            pct +
            '%)</span>' +
            '    <span class="' +
            (diffTon > 0 ? 'text-danger fw-bold' : pct >= 95 ? 'text-success fw-bold' : 'text-primary fw-semibold') +
            '">' +
            statusTxt +
            '</span>' +
            '  </div>' +
            '  <div class="progress" style="height: 10px;">' +
            '    <div class="progress-bar ' +
            pCls +
            '" role="progressbar" style="width: ' +
            Math.min(pct, 100) +
            '%" aria-valuenow="' +
            pct +
            '" aria-valuemin="0" aria-valuemax="100"></div>' +
            '  </div>' +
            toleranceHtml +
            '</div>';
        }

        // 2. Gợi ý phân bổ thông minh theo tàu (Smart Matching)
        let matchBanner = '';
        const { shipName, eligible, matched } = matchShipRows(type);
        const matchedKeys = new Set(matched.map(G().omitKey));
        const alreadyApplied = matched.length === rows.length && rows.every((row) => matchedKeys.has(G().omitKey(row)));
        if (matched.length > 0 && matched.length < eligible.length && !alreadyApplied) {
          const mKg = matched.reduce((a, r) => a + (r.net || 0), 0);
          matchBanner =
            '<div class="alert alert-info py-1 px-2 d-flex justify-content-between align-items-center mt-2 mb-0 small">' +
            '  <span>⚡ <b>Phân bổ thông minh:</b> Phát hiện <b>' +
            matched.length +
            '</b> phiếu cân ghi nhận cho tàu "' +
            esc(shipName) +
            '" (' +
            G().fmtTon(mKg) +
            ' tấn).</span>' +
            '  <button class="btn btn-xs btn-primary py-0 px-2 fw-semibold" type="button" data-smart-match-ship="' +
            type +
            '">👉 Chỉ chọn ' +
            matched.length +
            ' phiếu này</button>' +
            '</div>';
        }

        // 3. Cảnh báo trùng chéo phiếu cân với các hồ sơ khác
        let dupBanner = '';
        if (HAK.Yearbook && HAK.Yearbook.checkDuplicates) {
          const currentRecId = act ? act.id : null;
          const dups = HAK.Yearbook.checkDuplicates(currentRecId, rows);
          if (dups.length > 0) {
            const dupKg = dups.reduce((a, d) => a + (d.row.net || 0), 0);
            const firstDoc = dups[0].usedIn[0] || 'hồ sơ khác';
            dupBanner =
              '<div class="alert alert-warning py-1 px-2 d-flex justify-content-between align-items-center mt-2 mb-0 small">' +
              '  <span>⚠️ <b>Cảnh báo trùng lặp:</b> Phát hiện <b>' +
              dups.length +
              '</b> phiếu cân (' +
              G().fmtTon(dupKg) +
              ' tấn) đã nằm trong ' +
              esc(firstDoc) +
              (dups.length > 1 ? ', …' : '') +
              '.</span>' +
              '  <button class="btn btn-xs btn-outline-warning text-dark py-0 px-2 fw-semibold" type="button" data-omit-dups="' +
              type +
              '">Bỏ chọn các phiếu trùng</button>' +
              '</div>';
          }
        }

        // 4. Cảnh báo phiếu cân bất thường / quá tải (Data Integrity Guardrail)
        let anomalyBanner = '';
        if (HAK.Weigh && HAK.Weigh.detectAnomalies) {
          const anom = HAK.Weigh.detectAnomalies(rows);
          if (anom.total > 0) {
            const detailArr = [];
            if (anom.overweightCount) detailArr.push(anom.overweightCount + ' xe >45T');
            if (anom.underweightCount) detailArr.push(anom.underweightCount + ' xe <500kg');
            if (anom.rapidCount) detailArr.push(anom.rapidCount + ' xe lặp <15p');
            anomalyBanner =
              '<div class="alert alert-warning py-1 px-2 d-flex justify-content-between align-items-center mt-2 mb-0 small">' +
              '  <span>🔍 <b>Cảnh báo phiếu cân bất thường:</b> Phát hiện <b>' +
              anom.total +
              '</b> phiếu nghi vấn (' +
              detailArr.join(', ') +
              ').</span>' +
              '  <button class="btn btn-xs btn-outline-dark py-0 px-2 fw-semibold" type="button" data-view-anomalies="' +
              type +
              '">Chi tiết cảnh báo</button>' +
              '</div>';
          }
        }

        bar.innerHTML += progressHtml + matchBanner + dupBanner + anomalyBanner;
      }
    }
    /**
     * Danh mục đổi lúc đang lập hồ sơ: so các ô điền từ hợp đồng (giá trị lần điền gần nhất) với Danh mục hiện tại.
     * Trả về [{ id, label, old, nv, edited }] — edited = người dùng đã sửa tay ô đó (khi áp dụng sẽ được GIỮ, không ghi đè).
     */
    function catalogDiff(type) {
      const c = ST[type].snapshotParams ? null : selectedContract(type);
      if (!c) return [];
      const last = HAK.Store.get(ctFillKey(type), {}) || {},
        v = contractValues(type, c).v,
        out = [];
      Object.keys(v).forEach((id) => {
        if (last[id] === undefined) return;
        const f = fieldDef(type, id),
          cur = String(fieldValue(type, f) || '').trim(),
          nv = String(v[id]).trim(),
          old = String(last[id] || '').trim();
        if (nv !== old && nv !== cur) out.push({ id, label: f.label, old, nv, edited: cur !== old, cur });
      });
      return out;
    }
    function renderCatalogNotice(type) {
      const box = $('#ctMsg-' + type);
      if (!box || ST[type].snapshotParams) return;
      const d = catalogDiff(type),
        sig = JSON.stringify(d.map((x) => [x.id, x.nv]));
      if (!d.length || ST[type].ctIgnored === sig) {
        if (box.dataset.notice) {
          box.innerHTML = '';
          delete box.dataset.notice;
        }
        return;
      }
      box.dataset.notice = '1';
      box.innerHTML =
        '<div class="alert alert-warning py-2 small mb-2"><b>⚠ Danh mục đã thay đổi</b> trong lúc đang lập hồ sơ. Xem các ô sẽ cập nhật rồi chọn:' +
        '<table class="table table-sm mb-1 mt-1"><thead><tr><th>Ô</th><th>Đang dùng</th><th>Danh mục mới</th><th></th></tr></thead><tbody>' +
        d
          .map(
            (x) =>
              '<tr><td>' +
              esc(x.label) +
              '</td><td>' +
              esc(x.edited ? x.cur : x.old) +
              (x.edited ? ' <span class="badge text-bg-info">bạn đã nhập tay</span>' : '') +
              '</td><td><b>' +
              esc(x.nv) +
              '</b></td><td>' +
              (x.edited ? '<span class="muted">giữ giá trị nhập tay</span>' : 'sẽ cập nhật') +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table><button class="btn btn-sm btn-warning" data-ct-apply="' +
        type +
        '" type="button">Áp dụng cập nhật</button> <button class="btn btn-sm btn-outline-secondary" data-ct-ignore="' +
        type +
        '" type="button">Giữ nguyên các ô hiện tại</button>' +
        '<div class="muted mt-1">Ô bạn đã nhập tay luôn được giữ. Hồ sơ đã lưu dùng bản chụp nên không đổi theo Danh mục.</div></div>';
      box.querySelector('[data-ct-apply]').addEventListener('click', () => {
        delete box.dataset.notice;
        ST[type].ctIgnored = '';
        applyContract(type);
        renderContext(type);
      });
      box.querySelector('[data-ct-ignore]').addEventListener('click', () => {
        ST[type].ctIgnored = sig;
        box.innerHTML = '';
        delete box.dataset.notice;
      });
    }
    /** Vì sao phạm vi lập chứng từ ra 0 phiếu: áp từng điều kiện cộng dồn, báo điều kiện làm số phiếu về 0 (+ dải ngày thực có trong dữ liệu). */
    function explainZero(type) {
      const ds = getDs(type);
      if (!ds || !ds.rows.length) return '';
      const st = ST[type],
        f = st.filter,
        G_ = G(),
        total = ds.rows.length,
        base = { files: f.files, exclude: f.exclude, groups: f.groups };
      const stages = [
        ['khoảng ngày', { from: f.from, to: f.to }],
        ['giờ cân', { timeFrom: f.timeFrom, timeTo: f.timeTo }],
        ['số phiếu từ–đến', { ticketFrom: f.ticketFrom, ticketTo: f.ticketTo }],
        ['phiếu chọn riêng', { pick: f.pick }],
        ['bộ lọc nâng cao (tìm kiếm / biển số / ĐVVC)', { smart: f.smart }],
        ['phiếu đã bỏ', { omit: Array.from(st.omit.keys()) }],
      ];
      let acc = Object.assign({}, base);
      if (G_.filterRows(ds.rows, acc).length === 0)
        return 'Dữ liệu đang nạp có ' + fmtInt(total) + ' phiếu nhưng phạm vi đợt / nhãn đã loại hết.';
      for (const [name, part] of stages) {
        const next = Object.assign({}, acc, part),
          n = G_.filterRows(ds.rows, next).length;
        if (n === 0) {
          const mm =
            ds.stats && ds.stats.minTs !== null && ds.stats.minTs !== undefined
              ? ' Dữ liệu có phiếu cân từ ' + dmyOf(ds.stats.minTs) + ' đến ' + dmyOf(ds.stats.maxTs) + '.'
              : '';
          return (
            'Không có phiếu nào vì điều kiện "' +
            name +
            '": trước điều kiện này còn ' +
            fmtInt(G_.filterRows(ds.rows, acc).length) +
            ' / ' +
            fmtInt(total) +
            ' phiếu, sau điều kiện còn 0.' +
            mm
          );
        }
        acc = next;
      }
      return '';
    }
    const dmyOf = (ts) => {
      const t = HAK.Excel.util.tsToParts(ts);
      return String(t.d).padStart(2, '0') + '/' + String(t.m).padStart(2, '0') + '/' + t.y;
    };
    /** Điều kiện lọc nâng cao đã LƯU / đang dùng mà dữ liệu hiện tại không còn (đổi công ty, loại, đợt, năm): [{ label, value }]. */
    function expiredConditions(type) {
      const ds = getDs(type),
        sm = ST[type].filter.smart;
      if (!ds || !sm || !sm.sel) return [];
      const out = [],
        have = { plate: new Set(ds.rows.map((r) => r.plate)), carrier: new Set(ds.rows.map((r) => r.carrier)) },
        lab = { plate: 'Biển số', carrier: 'Đơn vị vận chuyển' };
      Object.keys(sm.sel).forEach((k) => {
        if (!have[k]) return;
        (sm.sel[k] || []).forEach((v) => {
          if (!have[k].has(v)) out.push({ label: lab[k] || k, value: v });
        });
      });
      return out;
    }
    function renderZeroWhy(type) {
      const box = $('#zeroWhy-' + type);
      if (!box) return;
      const ds = getDs(type),
        rows = ds ? currentRows(type) : [],
        exp = ds ? expiredConditions(type) : [],
        parts = [];
      if (exp.length)
        parts.push(
          'Điều kiện đã hết hiệu lực (không có trong dữ liệu hiện tại): ' +
            exp
              .slice(0, 5)
              .map((x) => x.label + ' "' + x.value + '"')
              .join(', ') +
            (exp.length > 5 ? ', …' : '') +
            ' — bấm "Đặt lại bộ lọc" hoặc sửa bộ lọc.'
        );
      if (ds && !rows.length) {
        const z = explainZero(type);
        if (z) parts.push(z);
      }
      box.classList.toggle('d-none', !parts.length);
      box.textContent = parts.join(' ');
    }
    function updateSummary(type) {
      renderZeroWhy(type);
      renderContext(type);
      certCheck(type);
      if (pageBkls(type)) bklsHint(type);
      const ds = getDs(type);
      const list = $('#sumList-' + type);
      if (!ds) {
        $('#sumTrips-' + type).textContent = '0';
        $('#sumTons-' + type).textContent = '0';
        list.innerHTML = '';
        renderZones(type, null);
        return;
      }
      if (smartViews[type]) documentSmart(type);
      const rows = currentRows(type),
        sum = G().summarize(rows);
      $('#sumTrips-' + type).textContent = fmtInt(sum.trips);
      $('#sumTons-' + type).textContent = G().fmtTon(sum.kg);
      const li = (a, b) => '<li><span>' + esc(a) + '</span><b>' + esc(b) + '</b></li>';
      let html =
        li('Thời gian', rows.length ? sum.from + ' → ' + sum.to : '—') +
        li('Số xe (biển số)', fmtInt(sum.vehicles)) +
        li('Tổng kg', fmtInt(sum.kg) + ' kg');
      if (DOCS[type].extra === 'returned') {
        const ret = rows.filter((r) => ST[type].returned.has(G().retKey(r)));
        const rk = ret.reduce((a, r) => a + r.net, 0);
        html +=
          li('Xe trả về', ret.length ? ret.length + ' xe · ' + G().fmtTon(rk) + ' t' : 'Không có') +
          li('Thực giao', G().fmtTon(sum.kg - rk) + ' tấn');
        const el = $('#retSummary-' + type);
        el.textContent = ST[type].returned.size
          ? 'Đã chọn ' +
            ST[type].returned.size +
            ' xe' +
            (ret.length !== ST[type].returned.size ? ' (' + ret.length + ' xe nằm trong phạm vi hiện tại)' : '')
          : 'Chưa chọn — mặc định "Không có xe trả về".';
      }
      if (type === 'dieuchuyen') html += li('Khối lượng làm tròn', G().fmtTonRound(sum.kg) + ' tấn');
      const om = omittedInfo(type);
      if (om.n) html += li('Đã bỏ', om.n + ' phiếu · −' + G().fmtTon(om.kg) + ' tấn');
      const pk = ST[type].filter.pick || [],
        ps = $('#pickSummary-' + type);
      if (ps)
        ps.textContent = pk.length
          ? 'Đã chọn riêng ' + pk.length + ' phiếu — hồ sơ chỉ gồm các phiếu này.'
          : 'Chưa chọn riêng — lấy theo phạm vi ở trên.';
      const os = $('#omitSummary-' + type);
      if (os)
        os.textContent = om.n ? 'Đã bỏ ' + om.n + ' phiếu (−' + G().fmtTon(om.kg) + ' tấn) — coi như không có.' : 'Chưa bỏ phiếu nào.';
      const warnRows = rows.filter((r) => r.warn && r.warn.length).length;
      if (warnRows) html += li('Dòng có cảnh báo', warnRows + ' dòng');
      list.innerHTML = html;
      $('#genHint-' + type).textContent = rows.length ? 'Sẽ tạo: ' + fileHint(type) : '';
      renderZones(type, rows);
    }
    function fileHint(type) {
      return {
        guikho: 'BienBanGuiKho_MMYYYY.docx',
        xuatkhogui: 'XuatKhoGui_<TênTàu>.docx',
        xuatkhau: 'XuatKhau_<TênTàu>.docx',
        xuatban: 'XuatBan_MMYYYY.docx',
        uythac: 'UyThac_<TênTàu>.docx',
        dieuchuyen: 'QuyetDinh_… + DieuChuyen_TMMYYYY.docx',
        traodoi: 'TraoDoi_MMYYYY.docx',
      }[type];
    }

    return {
      documentSmart,
      renderFilter,
      currentRows,
      matchShipRows,
      scopeSummary,
      renderContext,
      catalogDiff,
      renderCatalogNotice,
      explainZero,
      expiredConditions,
      updateSummary,
    };
  };
})(window);
