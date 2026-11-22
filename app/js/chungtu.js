/**
 * chungtu.js — Chứng từ xuất hàng: lập PXKKVCNB (Excel import Bkav) cho MỘT ĐỢT đã nhập ở mục Nhập liệu.
 *  - Dữ liệu lấy từ HAK.App.slots[hình thức].batches (mỗi đợt = 1 file Excel cân) → không đọc lại Excel, dùng lại bộ đọc + danh sách xe.
 *  - Công ty / kho / "Về việc | Lý do" lấy từ Cài đặt (HAK.Config), không hardcode lần nữa.
 *  - Bảng kê lâm sản (BKLS, Word/PDF, xử lý ở bkls.js) nay lập ở trang "Tạo biên bản" (xem js/pages.js — generateBkls()),
 *    không còn ở trang này. HAK.CHUNGTU[type].bkls vẫn giữ để dashboard.js biết loại nào cần nhắc "chưa lập BKLS".
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { $, $$, esc, toast, debounce } = HAK.UI;
  const G = HAK.Generator;
  const C = () => HAK.Config;
  const KEY = 'hak.form.chungtu';
  const CUSTOM = '__custom';

  /** Các cột của file import Bkav eHoadon (BTF.eHD v1.00) — đúng thứ tự file mẫu PXKKVCNB. */
  const PXK_HEADER = HAK.Pxk.HEADER;

  const st = { type: '', batchName: '', vals: {} }; // vals[hình thức] = giá trị các ô của form
  let built = false;

  const cfg = () => C().data;
  const DOCS = () => HAK.Pages.DOCS;
  const CT = (t) => HAK.CHUNGTU[t];
  const pad6 = HAK.Pxk.pad6;
  const isKhoXuat = (w) => w.type === 'Kho xuất' || w.type === 'Kho gửi';

  /* ---------------- Dữ liệu đợt ---------------- */
  function batches() {
    const sl = HAK.App.slots[st.type];
    return sl ? sl.batches.filter((b) => b.ds && b.ds.ok) : [];
  }
  function curBatch() {
    const list = batches();
    return list.find((b) => b.fileName === st.batchName) || list[0] || null;
  }

  /* ---------------- Giá trị mặc định ---------------- */
  function khoAddressOf(companyId) {
    const co = cfg().companies.find((c) => c.id === companyId);
    if (!co) return '';
    const w = cfg().warehouses.find((x) => x.id === C().companyAttr(co, 'khoXuat'));
    return w ? w.address || w.name : '';
  }
  function defaultsFor(type) {
    const ops = C().operations(),
      op = ops[CT(type).op] || ops[0] || { veViec: '', lyDo: '' };
    const port = cfg().warehouses.find((w) => w.id === 'w_ts');
    const cid = (cfg().companies.find((c) => c.id === 'hak') || cfg().companies[0]).id;
    return {
      cua: cid,
      veViec: op.veViec,
      lyDo: op.lyDo,
      xuatKhoTai: khoAddressOf(cid),
      nhapKho: CT(type).op === 0 && port ? port.name : '',
      maHang: 'DG',
      tenHang: 'Dăm gỗ keo lai PEFC Controlled Sources',
      dvt: 'Tấn',
      donViVC: '',
      idBatDau: '',
      canCuLenh: '',
      tenDonVi: '',
      contractId: '',
    };
  }

  /* ---------------- Dựng form ---------------- */
  function comboHtml(id, label, opts, col, help) {
    return (
      '<div class="col-md-' +
      col +
      '"><label class="form-label" for="ct-' +
      id +
      '">' +
      label +
      '</label>' +
      '<select class="form-select" id="ct-' +
      id +
      '" data-combo="' +
      id +
      '"></select>' +
      '<input type="text" class="form-control mt-2 d-none" id="ct-' +
      id +
      '__txt" placeholder="Nhập nội dung khác…" autocomplete="off">' +
      (help ? '<div class="form-text">' + help + '</div>' : '') +
      '</div>'
    );
  }
  function textHtml(id, label, col, opts) {
    opts = opts || {};
    return (
      '<div class="col-md-' +
      col +
      '"><label class="form-label" for="ct-' +
      id +
      '">' +
      label +
      '</label>' +
      '<input type="' +
      (opts.number ? 'number' : 'text') +
      '" class="form-control" id="ct-' +
      id +
      '"' +
      (opts.number ? (opts.step ? ' min="0" step="' + opts.step + '"' : ' min="0" max="999999" step="1"') : '') +
      (opts.list ? ' list="' + opts.list + '"' : '') +
      ' placeholder="' +
      esc(opts.ph || '') +
      '" autocomplete="off">' +
      (opts.help
        ? '<div class="form-text" id="ct-' + id + '-help">' + opts.help + '</div>'
        : '<div class="form-text d-none" id="ct-' + id + '-help"></div>') +
      '</div>'
    );
  }
  function buildForm() {
    $('#ctForm').innerHTML =
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">③ Thông tin chung</div><div class="row g-3">' +
      '<div class="col-md-12"><label class="form-label" for="ct-cua">Của (bên xuất)</label><select class="form-select" id="ct-cua"></select>' +
      '<div class="form-text" id="ct-cua-info"></div></div>' +
      comboHtml('veViec', 'Về việc', null, 6) +
      comboHtml('lyDo', 'Lý do xuất kho', null, 6) +
      comboHtml('xuatKhoTai', 'Xuất kho tại (địa chỉ)', null, 12, 'Chọn bên xuất sẽ tự gợi ý kho xuất tương ứng.') +
      comboHtml('nhapKho', 'Nhập kho tại', null, 12) +
      '</div></div></div>' +
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">④ Thông tin đợt</div><div class="row g-3">' +
      '<div class="col-12"><label class="form-label" for="ct-contractId">Hợp đồng (điền vào cột HopDongSo)</label><select class="form-select" id="ct-contractId"></select><div class="form-text" id="ct-contractHelp"></div></div>' +
      textHtml('idBatDau', 'Số phiếu PXK bắt đầu', 4, { number: true, ph: 'VD: 81900 (tối đa 6 chữ số)' }) +
      textHtml('canCuLenh', 'Căn cứ lệnh (CanCuLenh)', 4, { ph: 'VD: IWC/HAKVT26-1793' }) +
      textHtml('tenDonVi', 'Tên đơn vị (cột TenDonVi)', 4, { list: 'ctDonVi', ph: 'Đơn vị nhận hàng' }) +
      '<datalist id="ctDonVi"></datalist>' +
      '<div class="col-12"><div class="small muted" id="ct-idHint"></div></div>' +
      '</div></div></div>' +
      '<div class="card mb-3"><div class="card-body"><div class="sec-title">Hàng hóa &amp; vận chuyển</div><div class="row g-3">' +
      textHtml('maHang', 'Mã hàng (MaHang)', 3) +
      textHtml('tenHang', 'Tên hàng hóa dịch vụ', 5) +
      textHtml('dvt', 'Đơn vị tính', 4) +
      textHtml('donViVC', 'Đơn vị vận chuyển (dự phòng khi xe không có trong danh sách)', 12) +
      '</div></div></div>';
    built = true;
  }

  /** Nạp lại danh sách lựa chọn (công ty / kho / nghiệp vụ) theo Cài đặt. */
  function fillOptions() {
    const co = cfg().companies;
    $('#ct-cua').innerHTML = co.map((c) => '<option value="' + esc(c.id) + '">' + esc(C().companyAttr(c, 'cua')) + '</option>').join('');
    $('#ctDonVi').innerHTML = co.map((c) => '<option value="' + esc(c.name) + '">').join('');
    const ops = C().operations(),
      seen = (arr) => arr.filter((v, i) => v && arr.indexOf(v) === i);
    const opts = {
      veViec: seen(ops.map((o) => o.veViec)).map((v) => [v, v]),
      lyDo: seen(ops.map((o) => o.lyDo)).map((v) => [v, v]),
      xuatKhoTai: cfg()
        .warehouses.filter((w) => isKhoXuat(w) && w.address)
        .map((w) => [w.address, w.name + ' — ' + w.address]),
      nhapKho: cfg()
        .warehouses.filter((w) => !isKhoXuat(w))
        .map((w) => [w.name, w.name]),
    };
    $$('#ctForm [data-combo]').forEach((sel) => {
      const cur = getCombo(sel.dataset.combo);
      sel.innerHTML =
        '<option value="">— Chọn từ danh sách —</option>' +
        opts[sel.dataset.combo].map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('') +
        '<option value="' +
        CUSTOM +
        '">✎ Khác — nhập tay…</option>';
      setCombo(sel.dataset.combo, cur);
    });
  }
  /** Ô "Hợp đồng": hợp đồng đúng hình thức của trang. Xuất khẩu / Ủy thác chỉ chọn được khi đã có tàu + tờ khai hải quan; trung chuyển thì để trống. */
  function fillContracts() {
    const sel = $('#ct-contractId');
    if (!sel) return;
    const cur = sel.value,
      K = HAK.Catalog,
      list = K && st.type ? K.contracts(st.type) : [];
    const decls = HAK.Customs ? HAK.Customs.activeDecls() : [];
    const gate = (c) => {
      try {
        const rd = HAK.CustomsModel.detailReady(K.parent(c.parentId), c, decls);
        return rd.ok ? '' : ' — chưa có ' + rd.missing.join(' + ');
      } catch (e) {
        return '';
      }
    };
    sel.innerHTML =
      '<option value="">— Không gắn hợp đồng (trung chuyển / chưa bán) —</option>' +
      list
        .map((c) => {
          const g = gate(c);
          return '<option value="' + esc(c.id) + '"' + (g && c.id !== cur ? ' disabled' : '') + '>' + esc(K.label(c) + g) + '</option>';
        })
        .join('');
    if (Array.prototype.some.call(sel.options, (o) => o.value === cur)) sel.value = cur;
    $('#ct-contractHelp').textContent =
      st.type === 'xuatkhau' || st.type === 'uythac'
        ? 'Hợp đồng Xuất khẩu / Ủy thác phải có tàu và tờ khai hải quan (nhập ở Danh mục) mới chọn được. Số hợp đồng được điền vào cột HopDongSo của mọi phiếu.'
        : 'Số hợp đồng được điền vào cột HopDongSo của mọi phiếu. Để trống nếu là trung chuyển / chưa bán.';
  }
  function getCombo(id) {
    const s = $('#ct-' + id);
    if (!s) return '';
    return s.value === CUSTOM ? ($('#ct-' + id + '__txt').value || '').trim() : s.value;
  }
  function setCombo(id, val) {
    const s = $('#ct-' + id),
      t = $('#ct-' + id + '__txt');
    if (!s) return;
    val = val || '';
    const has = val !== '' && Array.prototype.some.call(s.options, (o) => o.value === val && o.value !== CUSTOM);
    if (has) {
      s.value = val;
      t.classList.add('d-none');
      t.value = '';
    } else if (val) {
      s.value = CUSTOM;
      t.value = val;
      t.classList.remove('d-none');
    } else {
      s.value = '';
      t.classList.add('d-none');
      t.value = '';
    }
  }

  const COMBOS = ['veViec', 'lyDo', 'xuatKhoTai', 'nhapKho'],
    TEXTS = ['maHang', 'tenHang', 'dvt', 'donViVC', 'idBatDau', 'canCuLenh', 'tenDonVi', 'contractId'];
  function readVals() {
    const v = { cua: $('#ct-cua').value };
    COMBOS.forEach((k) => {
      v[k] = getCombo(k);
    });
    TEXTS.forEach((k) => {
      v[k] = ($('#ct-' + k).value || '').trim();
    });
    return v;
  }
  /** v2.6.2: công ty làm việc = "Của (bên xuất)" mặc định mỗi lần mở app (vẫn đổi được); đổi bên xuất thì "Xuất kho tại" theo kho của công ty. */
  function withCompany(v) {
    const co = HAK.Auth && HAK.Auth.company ? HAK.Auth.company() : '';
    if (co && v.cua !== co && cfg().companies.some((c) => c.id === co)) {
      v.cua = co;
      v.xuatKhoTai = khoAddressOf(co);
    }
    return v;
  }
  function applyVals(v) {
    if (Array.prototype.some.call($('#ct-cua').options, (o) => o.value === v.cua)) $('#ct-cua').value = v.cua;
    COMBOS.forEach((k) => setCombo(k, v[k]));
    TEXTS.forEach((k) => {
      $('#ct-' + k).value = v[k] == null ? '' : v[k];
    });
    updateCuaInfo();
  }
  function updateCuaInfo() {
    const c = cfg().companies.find((x) => x.id === $('#ct-cua').value);
    $('#ct-cua-info').textContent = c ? 'MST ' + (c.tax || '—') + ' · ' + (c.address || '') : '';
  }

  /* ---------------- Lưu / nạp trạng thái ---------------- */

  /* ---------------- Điền bổ sung số hợp đồng vào file phiếu xuất kho đã tạo ---------------- */
  function fillFixContracts() {
    const sel = $('#ctFixContract');
    if (!sel || !HAK.Catalog) return;
    const K = HAK.Catalog,
      cur = sel.value,
      decls = HAK.Customs ? HAK.Customs.activeDecls() : [];
    // v2.25.0 (quyết định 36): chỉ hợp đồng liên quan công ty đang làm (bật "Xem tất cả công ty" ở Danh mục để thấy công ty khác)
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('catalog') : null;
    const list = K.parents()
      .filter((c) => ['xuatkhau', 'uythac', 'xuatban', 'traodoi'].indexOf(c.type) >= 0)
      .filter((c) => c.id === cur || !K.relatedTo || K.relatedTo(c, scope))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const cust = (id) => {
      const x = K.customer(id);
      return x ? x.name : '';
    };
    sel.innerHTML =
      '<option value="">— Chọn hợp đồng —</option>' +
      list
        .map((c) => {
          const rd = HAK.CustomsModel.readiness(c, decls),
            ship = (HAK.ContractModel.active(c).find((d) => d.ship) || {}).ship || '';
          return (
            '<option value="' +
            esc(c.id) +
            '"' +
            (rd.ok ? '' : ' disabled') +
            '>' +
            esc(
              (c.no || c.id) +
                (cust(c.buyerId) ? ' · ' + cust(c.buyerId) : '') +
                (ship ? ' · ' + ship : '') +
                (rd.ok ? '' : ' — thiếu: ' + rd.missing.join(' + '))
            ) +
            '</option>'
          );
        })
        .join('');
    if (Array.prototype.some.call(sel.options, (o) => o.value === cur)) sel.value = cur;
  }
  const fixReady = () => {
    const b = $('#ctFixRun');
    if (b) b.disabled = !($('#ctFixFiles').files.length && $('#ctFixContract').value);
  };
  /** Điền HopDongSo cho từng file: chỉ dòng trống (hoặc tất cả khi tick ghi đè); lưu thành file mới, không sửa file gốc. */
  async function runFix() {
    const files = Array.from($('#ctFixFiles').files),
      c = HAK.Catalog.parent($('#ctFixContract').value),
      all = $('#ctFixAll').checked,
      out = $('#ctFixResult');
    if (!files.length || !c) return;
    const no = c.no || '',
      lines = [],
      btn = $('#ctFixRun');
    btn.disabled = true;
    out.innerHTML = '';
    try {
      for (const f of files) {
        try {
          const wb = root.XLSX.read(await f.arrayBuffer(), { type: 'array' }),
            name = wb.SheetNames.indexOf('PXK') >= 0 ? 'PXK' : wb.SheetNames[0],
            ws = wb.Sheets[name];
          const aoa = root.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
          const { filled, kept } = HAK.Pxk.fillHopDong(aoa, no, all);
          wb.Sheets[name] = root.XLSX.utils.aoa_to_sheet(aoa);
          const blob = new Blob([root.XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
          const outName = f.name.replace(/\.xlsx?$/i, '') + '_DaDienHD.xlsx';
          const saved = await HAK.Word.Files.saveBlob(blob, outName);
          if (saved) {
            lines.push(
              '✔ <b>' +
                esc(f.name) +
                '</b> → ' +
                esc(outName) +
                ': điền ' +
                G.fmtInt(filled) +
                ' dòng' +
                (kept ? ', giữ nguyên ' + G.fmtInt(kept) + ' dòng đã có số hợp đồng' : '') +
                '.'
            );
            const rec = HAK.Issued && HAK.Issued.list.find((x) => x.kind === 'pxk' && x.fileName === f.name);
            if (rec) {
              rec.contract = '';
              rec.contractNo = no;
              await HAK.Issued.update(rec);
            }
          } else lines.push('• <b>' + esc(f.name) + '</b>: đã hủy lưu.');
        } catch (e) {
          lines.push('<span class="text-danger">✖ <b>' + esc(f.name) + '</b>: ' + esc(e.message || String(e)) + '</span>');
        }
      }
    } finally {
      out.innerHTML = lines.join('<br>');
      fixReady();
    }
  }
  function persist() {
    if (st.type && built) st.vals[st.type] = readVals();
    HAK.Store.set(KEY, { type: st.type, batchName: st.batchName, vals: st.vals, last: st.last || null });
  }
  const persistSoon = debounce(persist, 300);

  /* ---------------- Hiển thị ---------------- */
  function renderTypes() {
    $('#ctTypes').innerHTML = Object.keys(HAK.CHUNGTU)
      .map((k) => {
        const d = DOCS()[k],
          sl = HAK.App.slots[k],
          n = sl ? sl.batches.filter((b) => b.ds && b.ds.ok).length : 0;
        return (
          '<button type="button" class="btn ' +
          (st.type === k ? 'btn-primary' : 'btn-outline-secondary') +
          '" data-ct="' +
          k +
          '">' +
          d.icon +
          ' ' +
          esc(d.title) +
          (n ? ' <span class="badge text-bg-success ms-1">' + n + ' đợt</span>' : '') +
          '</button>'
        );
      })
      .join('');
    $('#ctTypeHint').textContent = st.type
      ? 'Trang này chỉ lập PXKKVCNB. Bảng kê lâm sản (BKLS) lập ở trang "Tạo biên bản" của hình thức tương ứng.'
      : '';
  }
  function render() {
    if (!HAK.App || !built) return;
    renderLog();
    fillFixContracts();
    fillOptions();
    fillContracts();
    renderTypes();
    $('#ctNoType').classList.toggle('d-none', !!st.type);
    const noData = !!st.type && !batches().length;
    $('#ctNoData').classList.toggle('d-none', !noData);
    if (st.type) $('#ctGoData').dataset.filetype = st.type;
    $('#ctBody').classList.toggle('d-none', !st.type || noData);
    if (!st.type || noData) return;
    const list = batches();
    if (!list.some((b) => b.fileName === st.batchName)) st.batchName = list[0].fileName;
    $('#ctBatch').innerHTML = list
      .map(
        (b) =>
          '<option value="' +
          esc(b.fileName) +
          '"' +
          (b.fileName === st.batchName ? ' selected' : '') +
          '>' +
          esc(b.fileName) +
          ' — ' +
          G.fmtInt(b.ds.stats.trips) +
          ' xe · ' +
          G.fmtTon(b.ds.stats.kg) +
          ' tấn</option>'
      )
      .join('');
    $('#ct-idBatDau-help').classList.add('d-none');
    updateSummary();
  }

  function updateSummary() {
    const b = curBatch();
    if (!b) return;
    const ds = b.ds,
      s = ds.stats,
      v = readVals();
    $('#ctBatchInfo').textContent =
      (s.from ? 'Ngày cân: ' + s.from + (s.to && s.to !== s.from ? ' → ' + s.to : '') : '') + ' · sheet "' + b.sheet + '"';
    $('#ctTrips').textContent = G.fmtInt(s.trips);
    $('#ctTons').textContent = G.fmtTon(s.kg);
    const start = parseInt(v.idBatDau, 10),
      okStart = Number.isFinite(start);
    const noDriver = ds.rows.filter((r) => !r.driver).length;
    $('#ctSumList').innerHTML =
      '<li><span>Số xe (biển số)</span><b>' +
      G.fmtInt(s.plates) +
      '</b></li>' +
      '<li><span>Phiếu PXK</span><b>' +
      (okStart ? pad6(start) + ' → ' + pad6(start + s.trips - 1) : '—') +
      '</b></li>' +
      '<li><span>Chưa có tài xế</span><b>' +
      G.fmtInt(noDriver) +
      '</b></li>';
    const lp = HAK.Issued && HAK.Issued.lastPxk(v.cua),
      last = lp ? { from: lp.pxkFrom, to: lp.pxkTo } : st.last;
    const hint = $('#ct-idHint');
    hint.innerHTML = last
      ? 'Lần tạo gần nhất: <b>' +
        pad6(last.from) +
        ' → ' +
        pad6(last.to) +
        '</b>. ' +
        '<a href="#" id="ctUseNext">Bắt đầu tiếp từ ' +
        pad6(last.to + 1) +
        '</a>'
      : '';
    const a = $('#ctUseNext');
    if (a)
      a.addEventListener('click', (e) => {
        e.preventDefault();
        $('#ct-idBatDau').value = String(last.to + 1);
        persistSoon();
        updateSummary();
      });
    const msgs = [];
    if (noDriver && !(ds.vehicleInfo && ds.vehicleInfo.total))
      msgs.push(
        'Đợt này chưa có danh sách xe & tài xế (Nhập liệu → dòng đợt → 🚚) — cột người vận chuyển / đơn vị vận chuyển sẽ để trống hoặc dùng "đơn vị vận chuyển dự phòng".'
      );
    else if (ds.vehicleInfo && ds.vehicleInfo.missing.length)
      msgs.push(
        '🚚 ' +
          ds.vehicleInfo.missing.length +
          ' biển số chưa có trong danh sách xe: ' +
          ds.vehicleInfo.missing.slice(0, 8).join(', ') +
          (ds.vehicleInfo.missing.length > 8 ? ' …' : '') +
          '.'
      );
    const zero = ds.rows.filter((r) => !(r.net > 0)).length;
    if (zero) msgs.push(zero + ' xe có khối lượng bằng 0 sẽ ra 0 tấn trên PXK.');
    $('#ctMsgs').innerHTML = msgs.length
      ? '<div class="alert alert-warning py-2 mb-0"><ul class="alert-list">' +
        msgs.map((m) => '<li>' + esc(m) + '</li>').join('') +
        '</ul></div>'
      : '';
    $('#ctHint').textContent = 'Sẽ tạo: PXKKVCNB_' + slug(DOCS()[st.type].title) + '_….xlsx';
  }
  const slug = (t) =>
    String(t)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]+/g, '');

  /* ---------------- Kiểm tra trước khi tạo ---------------- */
  /** mode 'pxk' | 'bkls' — mỗi loại chứng từ chỉ đòi các ô nó dùng. */
  function validate(v, n, mode) {
    const problems = [];
    const flag = (id, bad, label, isCombo) => {
      const el = $('#ct-' + id),
        tx = isCombo ? $('#ct-' + id + '__txt') : null;
      [el, tx].forEach((x) => {
        if (x) x.classList.toggle('is-invalid', !!bad);
      });
      if (bad) problems.push({ label, el: tx && !tx.classList.contains('d-none') ? tx : el });
    };
    const start = parseInt(v.idBatDau, 10);
    flag(
      'idBatDau',
      !Number.isFinite(start) || start < 0 || start + n - 1 > 999999,
      Number.isFinite(start) ? 'Số phiếu PXK phải từ 0 và đủ chỗ cho ' + n + ' phiếu (tối đa 999999)' : 'Số phiếu PXK bắt đầu'
    );
    flag('canCuLenh', CT(st.type).bkls && !v.canCuLenh, 'Căn cứ lệnh');
    flag('veViec', !v.veViec, 'Về việc', true);
    flag('lyDo', !v.lyDo, 'Lý do xuất kho', true);
    flag('maHang', !v.maHang, 'Mã hàng');
    flag('tenHang', !v.tenHang, 'Tên hàng hóa');
    flag('dvt', !v.dvt, 'Đơn vị tính');
    flag('cua', !v.cua, 'Của (bên xuất)');
    flag('xuatKhoTai', !v.xuatKhoTai, 'Xuất kho tại', true);
    flag('nhapKho', !v.nhapKho, 'Nhập kho tại', true);
    return problems;
  }

  /* ---------------- Sinh PXKKVCNB ---------------- */
  /** rows = dòng phiếu cân của đợt (ds.rows); trả về { blob, count, from, to }. */
  function buildPxk(rows, v) {
    const co = cfg().companies.find((c) => c.id === v.cua);
    const cua = co ? C().companyAttr(co, 'cua') : '';
    const ct = v.contractId && HAK.Catalog ? HAK.Catalog.contract(v.contractId, { history: true }) : null,
      hopDong = ct ? ct.no || '' : '';
    const px = HAK.Pxk.aoa(rows, v, { cua, hopDong });
    const ws = root.XLSX.utils.aoa_to_sheet(px.aoa),
      wb = root.XLSX.utils.book_new();
    root.XLSX.utils.book_append_sheet(wb, ws, 'PXK');
    const buf = root.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return {
      blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      count: px.count,
      from: px.from,
      to: px.to,
    };
  }

  /* ---------------- Nhật ký chứng từ & cảnh báo trùng số ---------------- */
  const fmtDT = (t) => {
    const d = new Date(t),
      p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  const coName = (id) => {
    const c = cfg().companies.find((x) => x.id === id);
    return c ? c.short || c.name : id;
  };
  function conflictText(cs) {
    return (
      cs
        .slice(0, 3)
        .map((c) => {
          const r = c.rec,
            d = DOCS()[r.type],
            t = d ? d.title : r.type;
          if (c.why === 'overlap')
            return (
              'dải ' +
              pad6(r.pxkFrom) +
              '–' +
              pad6(r.pxkTo) +
              ' đã lập ngày ' +
              fmtDT(r.at) +
              ' (' +
              esc(t) +
              ', đợt "' +
              esc(r.batch) +
              '")'
            );
          if (c.why === 'again') return 'đợt này đã lập PXK ngày ' + fmtDT(r.at) + ' với dải ' + pad6(r.pxkFrom) + '–' + pad6(r.pxkTo);
          return 'số ' + esc(r.soBkls) + ' đã dùng ngày ' + fmtDT(r.at) + ' cho đợt "' + esc(r.batch) + '" (' + esc(t) + ')';
        })
        .join('; ') + (cs.length > 3 ? ' …' : '')
    );
  }
  const BTN_LABEL = { ctPxk: '📊 Tạo PXKKVCNB (Excel)' };
  function restoreLabels() {
    Object.keys(BTN_LABEL).forEach((id) => {
      const b = $('#' + id);
      if (b) {
        b.textContent = BTN_LABEL[id];
        b.classList.remove('btn-warning');
      }
    });
  }
  function resetDup() {
    if (!st.dupKey) return;
    st.dupKey = '';
    restoreLabels();
  }
  /** Có xung đột → báo và đổi nút thành "bấm lại để vẫn tạo"; trả true nếu cần DỪNG lần bấm này. */
  function confirmDup(key, btnId, cs) {
    if (!cs.length || st.dupKey === key) {
      st.dupKey = '';
      restoreLabels();
      return false;
    }
    st.dupKey = key;
    const b = $('#' + btnId);
    b.textContent = '⚠ Trùng số — bấm lại để vẫn tạo';
    b.classList.add('btn-warning');
    toast('⚠ Có thể trùng chứng từ đã lập: ' + conflictText(cs) + '. Bấm nút lần nữa nếu vẫn muốn tạo.', 'warning');
    return true;
  }
  let logSmart;
  function renderLog() {
    if (!HAK.Issued) return;
    const all = HAK.Issued.scoped('archive'),
      F = HAK.Filters;
    if (!logSmart)
      logSmart = F.mount('#ctLogFilter', {
        screenId: 'document-log',
        source: () => HAK.Issued.scoped('archive'),
        fields: [
          F.multi(
            'kind',
            'Chứng từ',
            [
              { value: 'pxk', label: 'PXKKVCNB' },
              { value: 'bkls', label: 'BKLS' },
            ],
            (r) => r.kind
          ),
          F.multi(
            'type',
            'Hình thức',
            () => Object.keys(DOCS()).map((value) => ({ value, label: DOCS()[value].title })),
            (r) => r.type
          ),
        ],
        matchQ: (r, q) =>
          F.core.hay([r.batch, r.by, r.soBkls, r.benMua, r.tenDonVi, r.fileName, pad6(r.pxkFrom), pad6(r.pxkTo)]).includes(q),
        matchDate: (r, f, t) => F.dateMatch(r.at, f, t),
        onApply: renderLog,
      });
    const filtered = logSmart.filter(all).rows;
    logSmart.refresh();
    const rows = filtered.slice(0, 200);
    $('#ctLogCount').textContent = all.length
      ? '· ' +
        filtered.length +
        ' / ' +
        all.length +
        ' lần lập' +
        (filtered.length > rows.length ? ' (hiện ' + rows.length + ' gần nhất)' : '')
      : '';
    $('#ctLogBody').innerHTML = rows.length
      ? rows
          .map((r) => {
            const d = DOCS()[r.type];
            return (
              '<tr><td>' +
              fmtDT(r.at) +
              '</td><td>' +
              (r.kind === 'pxk' ? 'PXKKVCNB' : 'BKLS') +
              '</td><td>' +
              (d ? esc(d.title) : esc(r.type)) +
              '</td><td>' +
              esc(coName(r.cid)) +
              '</td><td class="text-break">' +
              esc(r.batch) +
              '</td>' +
              '<td class="mono">' +
              (r.kind === 'pxk'
                ? pad6(r.pxkFrom) + ' → ' + pad6(r.pxkTo)
                : esc(r.soBkls) + (r.benMua ? '<div class="muted small">' + esc(r.benMua) + '</div>' : '')) +
              '</td>' +
              '<td class="num">' +
              G.fmtInt(r.trips) +
              '</td><td class="num">' +
              G.fmtTon(r.kg) +
              '</td><td class="small">' +
              (r.by ? esc(r.by) : '<span class="muted">(trước v2.6)</span>') +
              '</td><td class="text-nowrap">' +
              (r.kind === 'pxk'
                ? '<button class="btn btn-sm btn-outline-primary me-1" type="button" data-redo-log="' +
                  esc(r.id) +
                  '" title="Nạp lại đợt, số phiếu bắt đầu và hợp đồng vào form để tạo lại">↻ Tạo lại</button><button class="btn btn-sm btn-outline-success me-1" type="button" data-save-log="' +
                  esc(r.id) +
                  '" title="Tạo lại file với đúng thông số lần trước và lưu ngay">💾 Lưu</button>'
                : '') +
              '<button class="btn btn-sm btn-outline-danger" type="button" data-del-log="' +
              esc(r.id) +
              '" title="Xóa dòng nhật ký">✕</button></td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="10" class="muted">Không có chứng từ khớp bộ lọc.</td></tr>';
  }
  const logBase = (kind, b, v, s) => ({
    kind,
    type: st.type,
    cid: v.cua,
    cua: coName(v.cua),
    batch: b.fileName,
    from: s.from,
    to: s.to,
    trips: s.trips,
    kg: s.kg,
    canCuLenh: v.canCuLenh,
    contract: v.contractId || '',
    contractNo: (v.contractId && HAK.Catalog && (HAK.Catalog.contract(v.contractId, { history: true }) || {}).no) || '',
  });

  async function onPxk(ev, opt) {
    opt = opt || {};
    const b = curBatch();
    if (!b) {
      toast('Chưa có đợt để lập chứng từ.', 'error');
      return;
    }
    const rows = b.ds.rows,
      v = readVals();
    const problems = validate(v, rows.length, 'pxk');
    if (problems.length) {
      toast('Chưa thể tạo file — cần bổ sung/sửa: ' + problems.map((p) => p.label).join('; ') + '.', 'warning');
      const first = problems.find((p) => p.el);
      if (first) first.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const start0 = parseInt(v.idBatDau, 10);
    if (
      !opt.resave &&
      HAK.Issued &&
      confirmDup(
        'pxk|' + v.cua + '|' + start0 + '|' + b.fileName,
        'ctPxk',
        HAK.Issued.checkPxk({ cid: v.cua, from: start0, to: start0 + rows.length - 1, type: st.type, batch: b.fileName })
      )
    )
      return;
    let res;
    try {
      res = buildPxk(rows, v);
    } catch (e) {
      console.error(e);
      toast('Lỗi khi tạo PXKKVCNB: ' + e.message, 'error');
      return;
    }
    const s = b.ds.stats;
    let name =
      'PXKKVCNB_' +
      slug(DOCS()[st.type].title) +
      '_' +
      String(s.from).replace(/\//g, '') +
      (s.to && s.to !== s.from ? '-' + String(s.to).replace(/\//g, '') : '') +
      '.xlsx';
    if (opt.fileName) name = opt.fileName;
    if (!(await HAK.Word.Files.saveBlob(res.blob, name))) return;
    if (opt.resave) {
      toast('Đã lưu lại ' + name + ' (' + G.fmtInt(res.count) + ' phiếu, ' + pad6(res.from) + ' → ' + pad6(res.to) + ').', 'success');
      return;
    } // lưu lại: không thêm dòng nhật ký mới
    st.last = { from: res.from, to: res.to };
    if (HAK.Issued)
      HAK.Issued.add(
        Object.assign(logBase('pxk', b, v, s), { pxkFrom: res.from, pxkTo: res.to, tenDonVi: v.tenDonVi, fileName: name, vals: v })
      ).then(renderLog);
    persist();
    updateSummary();
    toast('Đã tạo ' + name + ' (' + G.fmtInt(res.count) + ' phiếu, ' + pad6(res.from) + ' → ' + pad6(res.to) + ').', 'success');
  }

  /* ---------------- Sự kiện ---------------- */

  /** Nạp lại thông số một lần lập PXK trong nhật ký (đợt cân, số phiếu bắt đầu, hợp đồng, …) vào form. */
  function loadRec(rec) {
    if (!CT(rec.type)) {
      toast('Hình thức "' + rec.type + '" không còn.', 'warning');
      return false;
    }
    switchType(rec.type);
    const b = batches().find((x) => x.fileName === rec.batch);
    if (!b) {
      toast('Đợt "' + rec.batch + '" không còn trong mục Nhập liệu — nhập lại file cân của đợt đó rồi thử lại.', 'warning');
      return false;
    }
    st.batchName = b.fileName;
    render();
    const vals = rec.vals
      ? Object.assign({}, rec.vals)
      : {
          cua: rec.cid,
          canCuLenh: rec.canCuLenh || '',
          tenDonVi: rec.tenDonVi || '',
          idBatDau: String(rec.pxkFrom == null ? '' : rec.pxkFrom),
          contractId: rec.contract || '',
        };
    applyVals(Object.assign(defaultsFor(rec.type), st.vals[rec.type] || {}, vals));
    resetDup();
    updateSummary();
    persist();
    return true;
  }
  async function redoLog(id, save) {
    const rec = HAK.Issued.list.find((x) => x.id === id);
    if (!rec) return;
    if (!loadRec(rec)) return;
    if (save && rec.vals) {
      await onPxk(null, { resave: true, fileName: rec.fileName });
      return;
    }
    $('#ctForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(
      save
        ? 'Nhật ký cũ chưa lưu đủ thông số nên chưa lưu thẳng được — đã nạp lại đợt, số phiếu bắt đầu và hợp đồng, kiểm tra rồi bấm "Tạo PXKKVCNB".'
        : 'Đã nạp lại thông số lần lập ' + fmtDT(rec.at) + ' — kiểm tra rồi bấm "Tạo PXKKVCNB" (bấm thêm lần nữa khi có cảnh báo trùng).',
      'info'
    );
  }
  function switchType(t) {
    if (!CT(t)) return;
    if (st.type && built) st.vals[st.type] = readVals();
    st.type = t;
    st.batchName = '';
    resetDup();
    render();
    applyVals(withCompany(Object.assign(defaultsFor(t), st.vals[t] || {})));
    updateSummary();
    persist();
  }
  function init() {
    buildForm();
    const saved = HAK.Store.get(KEY, null) || {};
    st.vals = saved.vals || {};
    st.last = saved.last || null;
    st.batchName = saved.batchName || '';
    const t = saved.type && CT(saved.type) ? saved.type : '';
    st.type = t;
    render();
    if (t) applyVals(withCompany(Object.assign(defaultsFor(t), st.vals[t] || {})));
    $('#ctFixFiles').addEventListener('change', fixReady);
    $('#ctFixContract').addEventListener('change', fixReady);
    $('#ctFixRun').addEventListener('click', () => runFix().catch((e) => toast(e.message || String(e), 'error')));
    $('#ctTypes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ct]');
      if (b) switchType(b.dataset.ct);
    });
    $('#ctBatch').addEventListener('change', (e) => {
      resetDup();
      st.batchName = e.target.value;
      persist();
      updateSummary();
    });
    const form = $('#ctForm');
    form.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.combo) {
        const id = el.dataset.combo,
          tx = $('#ct-' + id + '__txt');
        tx.classList.toggle('d-none', el.value !== CUSTOM);
        if (el.value === CUSTOM) tx.focus();
        if (id === 'veViec') {
          // chọn "Về việc" → gợi ý "Lý do xuất kho" tương ứng
          const op = C()
            .operations()
            .find((o) => o.veViec === el.value);
          if (op) setCombo('lyDo', op.lyDo);
        }
      }
      if (el.id === 'ct-cua') {
        setCombo('xuatKhoTai', khoAddressOf(el.value));
        updateCuaInfo();
      }
      if (el.id === 'ct-contractId' && el.value && !$('#ct-canCuLenh').value.trim()) {
        const k = HAK.Catalog.contract(el.value, { history: true });
        if (k && k.no) $('#ct-canCuLenh').value = k.no;
      } // Căn cứ lệnh để trống → gợi ý theo số hợp đồng
      el.classList.remove('is-invalid');
      resetDup();
      persistSoon();
      updateSummary();
    });
    form.addEventListener('input', (e) => {
      e.target.classList.remove('is-invalid');
      resetDup();
      persistSoon();
      updateSummary();
    });
    $('#ctLogBody').addEventListener('click', (e) => {
      const rd = e.target.closest('[data-redo-log],[data-save-log]');
      if (rd) {
        redoLog(rd.dataset.redoLog || rd.dataset.saveLog, !!rd.dataset.saveLog).catch((x) => toast(x.message || String(x), 'error'));
        return;
      }
      const d = e.target.closest('[data-del-log]');
      if (!d) return;
      HAK.UI.confirmClick(
        d,
        () =>
          HAK.Issued.remove(d.dataset.delLog).then(() => {
            renderLog();
            updateSummary();
          }),
        'Xóa?'
      );
    });
    window.addEventListener('hak:flush', persist);
    $('#ctPxk').addEventListener('click', onPxk);
  }

  HAK.Chungtu = {
    init,
    render,
    buildPxk,
    PXK_HEADER,
    get type() {
      return st.type;
    },
  };
})(window);
