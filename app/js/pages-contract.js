/**
 * pages-contract.js — Chọn hợp đồng từ Danh mục — điền ô form, xung đột, làm mới
 * Tách từ pages.js (v2.20), KHÔNG đổi hành vi: pages.js truyền hàm/biến dùng chung qua ctx.
 * Phải nạp trước pages.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  HAK.PagesContract = function (ctx) {
    const { HAK, $, esc, toast, BKLS_TYPES, DOCS, ST, cfg, getDs, fid, WH_CUSTOM } = ctx;
    // Hàm dùng chung: gọi qua ctx tại thời điểm dùng (giữ nguyên ngữ nghĩa khi pages.js/test gán lại hàm)
    const whAttrList = (...a) => ctx.whAttrList(...a),
      whoptValue = (...a) => ctx.whoptValue(...a),
      toggleCustomWh = (...a) => ctx.toggleCustomWh(...a),
      saveForm = (...a) => ctx.saveForm(...a),
      currentRows = (...a) => ctx.currentRows(...a),
      renderCatalogNotice = (...a) => ctx.renderCatalogNotice(...a),
      updateSummary = (...a) => ctx.updateSummary(...a);
    /* ===============================================================
     * 📑 Chọn hợp đồng từ Danh mục (v2.5 Phase 2 — phương án A):
     * chọn 1 lần → điền vào các ô sẵn có (vẫn sửa tay được). Ô đang có chữ NHẬP TAY khác hợp đồng → hỏi trước khi ghi đè.
     * "Nhập tay" = khác rỗng, khác mặc định, khác giá trị app đã điền lần trước (lưu ở hak.ctfill.<loại>).
     * ============================================================= */
    const hasCatalog = () => !!(HAK.Catalog && HAK.Catalog.TYPES);
    const fieldDef = (type, id) => {
      for (const g of DOCS[type].groups) {
        const f = g.fields.find((x) => x.id === id);
        if (f) return f;
      }
      return null;
    };
    function contractOptions(type, sel) {
      const list = hasCatalog()
        ? HAK.Catalog.contracts(type)
            .slice()
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ship || '').localeCompare(a.ship || ''))
        : [];
      const tl = hasCatalog() && HAK.Catalog.TYPES[type] ? HAK.Catalog.TYPES[type].label : '';
      // Xuất khẩu / Ủy thác: chỉ chọn được chi tiết đã có TÀU và TỜ KHAI hải quan (chưa có tờ khai thì chưa thực hiện được hợp đồng); Xuất bán / Trao đổi không cần.
      const gate = (c) => {
        try {
          const rd = HAK.CustomsModel.detailReady(HAK.Catalog.parent(c.parentId), c, HAK.Customs ? HAK.Customs.activeDecls() : []);
          return rd.ok ? '' : ' — chưa có ' + rd.missing.join(' + ') + ' (nhập ở Danh mục)';
        } catch (e) {
          return '';
        }
      };
      const opt = (c) => {
        const g = gate(c);
        return (
          '<option value="' +
          esc(c.id) +
          '"' +
          (c.id === sel ? ' selected' : '') +
          (g && c.id !== sel ? ' disabled' : '') +
          '>' +
          esc(HAK.Catalog.label(c) + (c.date ? ' · ' + HAK.Catalog.util.vnDate(c.date) : '') + g) +
          '</option>'
        );
      };
      const head =
        '<option value="">' +
        esc(list.length ? '— Không dùng danh mục (nhập tay) —' : '— Chưa có hợp đồng ' + tl + ' trong Danh mục —') +
        '</option>';
      // v2.25.0 (quyết định 36 — tách hẳn theo công ty): chỉ hợp đồng liên quan công ty đang làm; hợp đồng công ty khác chỉ hiện (nhóm riêng)
      // khi bật "Xem tất cả công ty" ở Danh mục. Hợp đồng ĐÃ gắn với hồ sơ đang mở (sel) luôn giữ để không mất liên kết cũ.
      const co = HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '';
      if (!co || !HAK.Catalog.relatedTo) return head + list.map(opt).join('');
      const scope = HAK.Auth.scopeIds ? HAK.Auth.scopeIds('catalog') : [co];
      const mine = list.filter((c) => HAK.Catalog.relatedTo(c, [co])),
        other = list.filter((c) => mine.indexOf(c) < 0 && (c.id === sel || HAK.Catalog.relatedTo(c, scope)));
      const cn = (cfg().companies.find((x) => x.id === co) || {}).short || co;
      return (
        head +
        (mine.length ? '<optgroup label="Hợp đồng của ' + esc(cn) + '">' + mine.map(opt).join('') + '</optgroup>' : '') +
        (other.length ? '<optgroup label="Hợp đồng công ty khác">' + other.map(opt).join('') + '</optgroup>' : '')
      );
    }
    /** Số → chữ kiểu Việt ("13.010,81"); đúng 3 chữ số lẻ thì thêm 0 để parseNum không hiểu nhầm là phần nghìn ("54,1230"). */
    function numTxt(n) {
      if (n === null || n === undefined || n === '' || !isFinite(+n)) return '';
      const s = String(+n),
        neg = s[0] === '-',
        [i, d] = s.replace('-', '').split('.');
      return (neg ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d ? ',' + (d.length === 3 ? d + '0' : d) : '');
    }
    /** Hợp đồng → { v: {idÔ: giá trị}, notes: [], filter: {from,to}|null } — chỉ các ô CÓ trên trang `type`. */
    function contractValues(type, c) {
      const K = HAK.Catalog,
        v = {},
        notes = [];
      const has = (id) => !!fieldDef(type, id);
      const coOf = (cu) => (cu && cu.companyId && cfg().companies.some((x) => x.id === cu.companyId) ? cu.companyId : '');
      const own = (id, val) => {
        if (has(id)) v[id] = val === null || val === undefined ? '' : String(val);
      }; // ô "thuộc" hợp đồng: không có số liệu → để trống (tránh sót số của hợp đồng trước)
      const pick = (id, val) => {
        if (has(id) && val) v[id] = String(val);
      }; // ô chọn (công ty, kho): chỉ đổi khi hợp đồng có
      const seller = K.customer(c.sellerId),
        buyer = K.customer(c.customerId),
        deliver = K.customer(c.deliverId);
      own('ship', c.ship);
      own('contractNo', c.no);
      own('contractDate', c.date);
      own('contractQty', numTxt(c.qty));
      own('certNo', c.certNo);
      own('certDate', c.certDate);
      own('certWet', numTxt(c.mt));
      own('certDry', numTxt(c.bdmt));
      own('moisture', numTxt(c.moisture));
      const lbl = (id) => (fieldDef(type, id) || {}).label || id;
      const giao = coOf(seller) || coOf(deliver);
      if (has('giaoId')) {
        if (giao) pick('giaoId', giao);
        else if (seller) notes.push('"' + seller.name + '" không phải công ty trong nhóm → ô "' + lbl('giaoId') + '" giữ nguyên.');
      }
      const nhan = coOf(buyer);
      if (has('nhanId')) {
        if (nhan) pick('nhanId', nhan);
        else if (buyer)
          notes.push(
            '"' +
              buyer.name +
              '" không phải công ty trong nhóm → ô "' +
              lbl('nhanId') +
              '" giữ nguyên' +
              (has('bklsBenMuaTen') ? '; đã điền vào Bên mua trên BKLS.' : '.')
          );
      }
      if (has('bklsBenMuaTen')) {
        if (BKLS_TYPES[type] && nhan)
          ['bklsBenMuaTen', 'bklsBenMuaMst', 'bklsBenMuaDc', 'bklsBenMuaDt', 'bklsBenMuaEmail'].forEach((k) => own(k, '')); // để trống = BKLS tự lấy theo Bên nhận/Bên mua
        else if (buyer) {
          const co = nhan ? HAK.Config.company(nhan) : null;
          own('bklsBenMuaTen', buyer.name);
          own('bklsBenMuaMst', buyer.tax);
          own('bklsBenMuaDc', buyer.address);
          own('bklsBenMuaDt', co ? co.phone : '');
          own('bklsBenMuaEmail', co ? co.email : '');
        }
      }
      if (c.dryFactory > 0) pick('bklsHeSo', String(c.dryFactory));
      if (c.whId && cfg().warehouses.some((w) => w.id === c.whId)) {
        pick('khoGiaoId', c.whId);
        if (has('wh'))
          own(
            'wh',
            HAK.Config.whAttr(
              cfg().warehouses.find((w) => w.id === c.whId),
              'label'
            )
          );
      }
      if (has('unitPrice') && c.priceUsd !== null && c.priceUsd !== undefined) {
        if (c.currency === 'VND') own('unitPrice', numTxt(c.priceUsd));
        else notes.push('Đơn giá hợp đồng tính ' + (c.currency || 'USD') + ' — biên bản in đồng/tấn nên không điền ô Đơn giá.');
      }
      const filter =
        c.filterTrips && (c.fromDate || c.toDate || c.fromTime || c.toTime || c.ticketFrom || c.ticketTo)
          ? {
              from: c.fromDate || '',
              to: c.toDate || '',
              timeFrom: c.fromTime || '',
              timeTo: c.toTime || '',
              ticketFrom: c.ticketFrom || '',
              ticketTo: c.ticketTo || '',
            }
          : null;
      return { v, notes, filter };
    }
    /** Giá trị hiện tại / gán giá trị cho 1 ô form theo kiểu ô. */
    function fieldValue(type, f) {
      const el = $('#' + fid(type, f.id));
      if (!el) return '';
      return f.type === 'whopt' ? whoptValue(el) : el.value;
    }
    function setField(type, f, val) {
      const el = $('#' + fid(type, f.id));
      if (!el) return;
      if (f.type === 'check') {
        el.checked = !!val;
      } else if (f.type === 'whopt') {
        const t = document.getElementById(el.id + '__txt'),
          inList = !val || whAttrList(f.attr).indexOf(val) >= 0;
        el.value = inList ? val : WH_CUSTOM;
        if (t) {
          t.value = inList ? '' : val;
          t.classList.toggle('d-none', inList);
        }
      } else if (f.type === 'company' || f.type === 'warehouse') {
        if (Array.from(el.options).some((o) => o.value === val)) el.value = val;
        if (f.type === 'warehouse') toggleCustomWh(el);
      } else el.value = val;
    }
    /** Ô mà hồ sơ đang mở KHÔNG có giá trị → đưa về mặc định (trống / bỏ tick), để hồ sơ trước không "để sót" dữ liệu sang hồ sơ sau. */
    function resetField(type, f, node) {
      if (f.type === 'check') {
        node.checked = !!f.def;
        return;
      }
      if (node.tagName === 'SELECT') {
        const want = f.def !== undefined ? String(f.def) : '',
          opts = Array.from(node.options || []),
          hit = opts.find((o) => o.value === want);
        if (hit) node.value = want;
        else if (opts.length) node.selectedIndex = 0;
        return;
      }
      setField(type, f, f.def !== undefined ? f.def : '');
    }
    const ctFillKey = (type) => 'hak.ctfill.' + type;
    /** Áp khoảng ngày cân của hợp đồng (nếu hợp đồng bật "Lọc xe theo khoảng ngày cân"). */
    function applyContractFilter(type, flt) {
      if (!flt) return false;
      ST[type].filter.from = flt.from;
      ST[type].filter.to = flt.to;
      $('#from-' + type).value = flt.from;
      $('#to-' + type).value = flt.to;
      [
        ['tf', 'timeFrom'],
        ['tt', 'timeTo'],
        ['kf', 'ticketFrom'],
        ['kt', 'ticketTo'],
      ].forEach(([pre, key]) => {
        ST[type].filter[key] = flt[key] || '';
        const el = $('#' + pre + '-' + type);
        if (el) el.value = flt[key] || '';
      }); // chi tiết hợp đồng (tàu) nào lọc theo giờ / số phiếu riêng thì điền luôn
      return true;
    }
    function selectedContract(type) {
      const sel = $('#' + fid(type, 'contractId'));
      return sel && sel.value && hasCatalog() ? HAK.Catalog.contract(sel.value) : null;
    }
    function applyContract(type) {
      const box = $('#ctMsg-' + type);
      if (!box) return;
      ST[type].ctPending = null;
      const c = selectedContract(type);
      if (!c) {
        box.innerHTML = '';
        return;
      }
      const { v, notes, filter } = contractValues(type, c);
      const last = HAK.Store.get(ctFillKey(type), {}) || {};
      const done = [],
        conflicts = [];
      Object.keys(v).forEach((id) => {
        const f = fieldDef(type, id),
          cur = String(fieldValue(type, f) || '').trim(),
          nv = v[id];
        if (cur === nv.trim()) {
          last[id] = nv;
          return;
        }
        const def = f.def !== undefined && f.type !== 'check' ? String(f.def) : '';
        if (!cur || cur === def || cur === String(last[id] || '').trim()) {
          setField(type, f, nv);
          last[id] = nv;
          done.push(f.label);
        } else conflicts.push({ f, cur, nv });
      });
      HAK.Store.set(ctFillKey(type), last);
      if (done.length && fieldDef(type, 'certReason')) setField(type, fieldDef(type, 'certReason'), ''); // đổi số liệu theo hợp đồng mới → lý do điều chỉnh cũ không còn đúng
      const flt = applyContractFilter(type, filter);
      saveForm(type);
      updateSummary(type);
      ST[type].ctPending = conflicts.length ? conflicts : null;
      renderContractMsg(type, c, done.length, notes, flt ? filter : null);
    }
    function renderContractMsg(type, c, nDone, notes, flt) {
      const box = $('#ctMsg-' + type),
        cf = ST[type].ctPending || [];
      const vnD = HAK.Catalog.util.vnDate;
      let h =
        '<div class="small text-success">✔ ' +
        (nDone ? 'Đã điền ' + nDone + ' ô' : 'Các ô đã khớp') +
        ' theo hợp đồng <b>' +
        esc(HAK.Catalog.label(c)) +
        '</b>.' +
        (flt ? ' Đã lọc ngày cân ' + esc(vnD(flt.from) || '…') + ' → ' + esc(vnD(flt.to) || '…') + '.' : '') +
        '</div>';
      if (flt && getDs(type) && !currentRows(type).length)
        h +=
          '<div class="small text-danger">⚠ File cân đang nạp không có phiếu nào trong khoảng ngày của hợp đồng — kiểm tra lại file, hoặc bấm "Đặt lại bộ lọc" để lấy toàn bộ.</div>';
      if (notes.length) h += '<div class="small text-muted">' + notes.map((n) => 'ℹ ' + esc(n)).join('<br>') + '</div>';
      if (cf.length)
        h +=
          '<div class="alert alert-warning py-2 px-3 mt-2 mb-0 small"><b>' +
          cf.length +
          ' ô đang có dữ liệu nhập tay khác hợp đồng:</b><ul class="alert-list mb-2">' +
          cf
            .map(
              (x) =>
                '<li>' +
                esc(x.f.label) +
                ': <span class="mono">' +
                esc(x.cur) +
                '</span> → <span class="mono">' +
                esc(x.nv || '(để trống)') +
                '</span></li>'
            )
            .join('') +
          '</ul>' +
          '<div class="d-flex flex-wrap gap-2"><button class="btn btn-sm btn-warning" type="button" data-ct-act="over">Dùng số liệu hợp đồng</button>' +
          '<button class="btn btn-sm btn-outline-secondary" type="button" data-ct-act="keep">Giữ như đang nhập</button></div></div>';
      box.innerHTML = h;
    }
    function resolveConflicts(type, overwrite) {
      const cf = ST[type].ctPending || [],
        last = HAK.Store.get(ctFillKey(type), {}) || {};
      if (overwrite) {
        cf.forEach((x) => {
          setField(type, x.f, x.nv);
          last[x.f.id] = x.nv;
        });
        HAK.Store.set(ctFillKey(type), last);
        saveForm(type);
        updateSummary(type);
      }
      ST[type].ctPending = null;
      const alertBox = $('#ctMsg-' + type + ' .alert');
      if (alertBox) alertBox.remove();
      toast(overwrite ? 'Đã ghi ' + cf.length + ' ô theo hợp đồng.' : 'Giữ nguyên ' + cf.length + ' ô đang nhập tay.', 'info');
    }
    /** Danh mục vừa đổi / mở lại trang → dựng lại danh sách hợp đồng (giữ lựa chọn nếu còn). */
    function refreshContracts(type) {
      const sel = ST[type].built ? $('#' + fid(type, 'contractId')) : null;
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = contractOptions(type, cur);
      if (sel.value !== cur) {
        saveForm(type);
        const b = $('#ctMsg-' + type);
        if (b) b.innerHTML = '';
      } else renderCatalogNotice(type); // Danh mục đổi (BDMT, chứng thư…) khi đang lập: báo + cho xem giá trị cũ / mới trước khi áp dụng
    }

    return {
      fieldDef,
      contractOptions,
      contractValues,
      fieldValue,
      setField,
      resetField,
      ctFillKey,
      applyContractFilter,
      selectedContract,
      applyContract,
      resolveConflicts,
      refreshContracts,
    };
  };
})(window);
