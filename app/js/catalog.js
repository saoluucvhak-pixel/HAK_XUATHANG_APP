/**
 * Catalog schema v3: contracts are parents; shipment/goods/execution rows are children.
 * Canonical parties: exporter, principal (agency), buyer. Legacy document APIs expose
 * a projection for the selected child, while old parent IDs retain their legacy alias.
 * Mutations persist as one catalog snapshot after verified pre-migration backup.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.catalog.v1';
  const M = HAK.ContractModel;
  let migrationBackup = null, persistedSnapshot = 'null';
  const U = () => HAK.Excel.util;
  const G = () => HAK.Generator;
  const state = { showArchived:false,showStopped:false,selectedParent: '', data: { v: 2, customers: [], contracts: [] }, tab: 'contracts', q: '', type: '', built: false, editing: null };

  /** Hình thức có hợp đồng + nhãn 2 bên theo từng hình thức. */
  const TYPES = {
    xuatkhau: { label: 'Xuất khẩu', a: 'Bên xuất khẩu (bên bán)', b: 'Khách hàng (bên mua)', cur: 'USD' },
    uythac: { label: 'Ủy thác XK', a: 'Bên ủy thác', b: 'Bên nhận ủy thác', cur: 'USD' },
    xuatban: { label: 'Xuất bán', a: 'Bên bán', b: 'Bên mua', cur: 'VND' },
    traodoi: { label: 'Trao đổi', a: 'Bên giao', b: 'Bên nhận', cur: 'VND' }
  };
  const KINDS = { ngoai: 'Nước ngoài', trongnuoc: 'Trong nước', noibo: 'Nội bộ' };

  /* ---------------------------------------------------------------
   * 1. Tiện ích
   * ------------------------------------------------------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const keyName = (s) => U().norm(s).replace(/[^a-z0-9]/g, '');
  const num = (v) => { const n = U().parseNum(v); return n === null || n === undefined || !isFinite(n) ? null : n; };
  const isoOf = (v) => { const p = U().parseDT(v); return p && p.hasDate ? p.y + '-' + pad(p.m) + '-' + pad(p.d) : ''; };
  const vnDate = (iso) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  /** Số TKHQ luôn giữ dạng CHUỖI đủ chữ số (Excel hay lưu thành số thực 307091039861.0). */
  const tkhqOf = (v) => (v === null || v === undefined || v === '' ? '' : typeof v === 'number' ? String(Math.round(v)) : String(v).replace(/\s+/g, '').trim());
  const fmtNum = (n, d) => (n === null || n === undefined || n === '' ? '' : G().fmtDec(+n, d));

  /* ---------------------------------------------------------------
   * 2. Dữ liệu
   * ------------------------------------------------------------- */
  function load() {
    const original = HAK.Store.get(KEY, null); persistedSnapshot = JSON.stringify(original);
    if (!original || !Array.isArray(original.customers) || !Array.isArray(original.contracts)) { state.data = {v:3,customers:[],contracts:[]}; return; }
    const normalized = M.copy(original);
    normalized.contracts.forEach(c => { if (!c.type) c.type = 'xuatkhau'; if (!c.currency) c.currency = (TYPES[c.type] || TYPES.xuatkhau).cur; });
    normalized.customers.forEach(c => { if (!c.kind) c.kind = c.companyId ? 'noibo' : 'ngoai'; });
    const result = M.migrate(normalized); state.data = result.data;
    if (result.changed) migrationBackup = M.copy(original);
  }
  // Mutations form one catalog snapshot. UI callers await persist before reporting success.
  const save = () => true;
  async function persist() {
    const backupKey = KEY + '.before-parent-child';
    await HAK.DB.open();
    if (migrationBackup) {
      if (HAK.DB.usable()) {
        await HAK.DB.kvPut(backupKey, migrationBackup);
        const check = await HAK.DB.get('kv', backupKey);
        if (!check || JSON.stringify(check.val) !== JSON.stringify(migrationBackup)) throw Error('Chưa xác minh được bản sao trước chuyển đổi.');
      } else {
        root.localStorage.setItem(backupKey, JSON.stringify(migrationBackup));
        if (root.localStorage.getItem(backupKey) !== JSON.stringify(migrationBackup)) throw Error('Chưa xác minh được bản sao trước chuyển đổi.');
      }
      HAK.Store.set(backupKey, migrationBackup, {dbCommitted:HAK.DB.usable()});
    }
    if (JSON.stringify(HAK.Store.get(KEY, null)) !== persistedSnapshot) throw Error('Danh mục đã thay đổi ở cửa sổ khác. Tải lại trang trước khi lưu.');
    if (HAK.DB.usable()) {
      const db = await HAK.DB.open();
      await new Promise((resolve,reject) => {
        const tx = db.transaction('kv','readwrite'), store = tx.objectStore('kv'), read = store.get(KEY);
        let conflict = false;
        read.onsuccess = () => {
          if (read.result && JSON.stringify(read.result.val) !== persistedSnapshot) { conflict = true; tx.abort(); return; }
          store.put({key:KEY,val:M.copy(state.data),ls:false,ts:Date.now()});
        };
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(Error(conflict ? 'Danh mục đã thay đổi. Mở lại trước khi lưu.' : 'Không ghi được danh mục.'));
      });
    }
    if (HAK.Store.set(KEY, M.copy(state.data), {dbCommitted:HAK.DB.usable()}) === false) throw Error('Không lưu được danh mục.');
    migrationBackup = null; persistedSnapshot = JSON.stringify(state.data);
  }
  const customers = () => state.data.customers;
  const contracts = (type) => state.data.contracts.filter(c => !c.deletedAt && (!type || c.type === type));
  const customer = (id) => customers().find((c) => c.id === id) || null;
  const contract = (id) => contracts().find((c) => c.id === id) || null;
  const byCompany = (companyId) => customers().find((c) => c.companyId === companyId) || null;
  /** Độ khô thực tế = KL giám định khô ÷ KL giám định tươi. */
  const dryActual = (c) => (c && c.mt > 0 && c.bdmt > 0 ? c.bdmt / c.mt : null);
  /** Nhãn ngắn 1 hợp đồng (ô chọn ở biên bản): Tàu · Số HĐ / TKHQ · Bên mua/nhận. */
  function label(c) {
    const cu = customer(c.customerId);
    return [c.ship || '(chưa có tàu)', c.detailLabel || '', c.no ? 'HĐ ' + c.no : (c.tkhq ? 'TKHQ ' + c.tkhq : ''), cu ? cu.name : ''].filter(Boolean).join(' · ');
  }
  /**
   * v2.6.2: hợp đồng "liên quan" các công ty `ids` khi bên bán/giao, bên mua/nhận hoặc bên giao hàng là công ty nội bộ thuộc `ids`.
   * Hợp đồng chưa gán bên nội bộ nào (vd nhập từ XUATHANG_DN chưa có bên bán) → coi là liên quan mọi công ty (không bị ẩn).
   */
  function relatedTo(c, ids) {
    if (!ids) return true;
    const cos = [c.exporterId, c.principalId, c.buyerId, c.sellerId, c.customerId, c.deliverId, ...(c.details || []).map(d => d.deliverId)].map((id) => { const cu = customer(id); return cu && cu.companyId; }).filter(Boolean);
    return !cos.length || cos.some((x) => ids.indexOf(x) >= 0);
  }
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.tkhq || '').localeCompare(a.tkhq || '');

  /** Công ty trong nhóm (Cài đặt → Công ty) luôn có mặt trong danh mục Khách hàng, thông tin theo Cài đặt. */
  function syncCompanies() {
    let changed = false;
    ((HAK.Config && HAK.Config.data && HAK.Config.data.companies) || []).forEach((co) => {
      const want = { name: String(co.name || '').trim(), address: String(co.address || '').trim(), tax: String(co.tax || '').trim() };
      if (!want.name) return;
      let c = byCompany(co.id);
      if (!c) {                                   // trùng tên với khách nhập tay trước đó → gắn liên kết thay vì tạo bản thứ 2
        c = customers().find((x) => !x.companyId && keyName(x.name) === keyName(want.name));
        if (c) { c.companyId = co.id; c.kind = 'noibo'; changed = true; }
      }
      if (!c) { customers().push(Object.assign({ id: uid('kh'), kind: 'noibo', companyId: co.id, country: 'Việt Nam', note: '' }, want)); changed = true; return; }
      Object.keys(want).forEach((k) => { if (c[k] !== want[k]) { c[k] = want[k]; changed = true; } });
    });
    if (changed) save();
  }

  /** Tìm / tạo khách hàng theo tên (không phân biệt hoa thường, dấu). Địa chỉ trống thì bổ sung từ dữ liệu mới. */
  function ensureCustomer(name, address, kind) {
    name = String(name || '').replace(/\s+/g, ' ').trim(); if (!name) return null;
    const k = keyName(name);
    let c = customers().find((x) => keyName(x.name) === k);
    if (!c) { c = { id: uid('kh'), kind: kind || 'ngoai', name, address: String(address || '').trim(), country: '', tax: '', note: '' }; customers().push(c); return { c, created: true }; }
    if (!c.address && address) c.address = String(address).trim();
    return { c, created: false };
  }

  function upsertCustomer(o) {
    const old = o.id ? customer(o.id) : null;
    if (old && old.companyId) {                   // công ty nội bộ: chỉ sửa quốc gia / ghi chú (tên, địa chỉ, MST theo Cài đặt)
      old.country = String(o.country || '').trim(); old.note = String(o.note || '').trim(); save(); return { rec: old };
    }
    const name = String(o.name || '').replace(/\s+/g, ' ').trim();
    if (!name) return { error: 'Chưa nhập tên khách hàng.' };
    const dup = customers().find((x) => x.id !== o.id && keyName(x.name) === keyName(name));
    if (dup) return { error: 'Đã có khách hàng "' + dup.name + '".' };
    const rec = { id: o.id || uid('kh'), kind: KINDS[o.kind] && o.kind !== 'noibo' ? o.kind : 'ngoai', name, address: String(o.address || '').trim(), country: String(o.country || '').trim(), tax: String(o.tax || '').trim(), note: String(o.note || '').trim() };
    const i = customers().findIndex((x) => x.id === rec.id);
    if (i >= 0) customers()[i] = rec; else customers().push(rec);
    save(); return { rec };
  }
  function removeCustomer(id) {
    const c = customer(id);
    if (c && c.companyId) return { error: 'Đây là công ty trong nhóm — xóa / sửa ở Cài đặt → Công ty.' };
    const used = state.data.contracts.filter(x => [x.exporterId,x.principalId,x.buyerId,x.sellerId,x.customerId,...(x.details||[]).map(d=>d.deliverId)].includes(id)).length;
    if (used) return { error: 'Khách hàng đang có trong ' + used + ' hợp đồng — xóa / đổi các hợp đồng đó trước.' };
    state.data.customers = customers().filter((x) => x.id !== id); save(); return {};
  }

  const CONTRACT_FIELDS = ['type', 'date', 'no', 'tkhq', 'ship', 'sellerId', 'customerId', 'product', 'priceUsd', 'currency', 'qty', 'dryFactory',
    'certNo', 'certDate', 'mt', 'bdmt', 'moisture', 'deliverId', 'receiverId', 'whId', 'fromDate', 'toDate', 'filterTrips', 'note'];
  /** Ô "Chi tiết thực hiện" (chứng thư) — nhập ở biểu mẫu riêng (tab 🧪); biểu mẫu hợp đồng chỉ gồm các ô còn lại. */
  const EXEC_FIELDS = ['certNo', 'certDate', 'mt', 'bdmt', 'moisture', 'deliverId', 'receiverId', 'whId', 'fromDate', 'toDate', 'filterTrips'];
  const INFO_FIELDS = CONTRACT_FIELDS.filter((k) => EXEC_FIELDS.indexOf(k) < 0);
  function cleanContract(o) {
    const r = M.parent(o);
    r.type = TYPES[r.type] ? r.type : 'xuatkhau'; r.date = isoOf(o.date) || '';
    r.contractProduct=String(o.contractProduct==null?r.contractProduct||'':o.contractProduct).trim();r.contractQty=num(o.contractQty===undefined?r.contractQty:o.contractQty);r.no = String(o.no || '').trim(); r.priceUsd = num(o.priceUsd); r.dryFactory = num(o.dryFactory);
    r.currency = o.currency === 'VND' ? 'VND' : 'USD'; r.note = String(o.note || '').trim();
    Object.assign(r, M.roles(o));
    r.contractFiles = Array.isArray(o.contractFiles) ? o.contractFiles.filter(x=>typeof x==='string') : [];
    if (!Array.isArray(o.details)) {
      const legacy=Object.assign({},r); delete legacy.details; r.details = M.migrate({v:2,customers:[],contracts:[legacy]}).data.contracts[0].details;
    } else r.details = o.details.map(d=>M.child(r.id,d));if(o.contractProduct===undefined)r.contractProduct=Array.from(new Set(M.active(r).map(d=>d.product).filter(Boolean))).join('; ');if(o.contractQty===undefined)r.contractQty=M.sum(r,'qty');
    for (const key of M.childFields) if (!['priceUsd','note','revision','deletedAt'].includes(key)) delete r[key];
    return r;
  }
  function validateContract(r) {
    if (r.dryFactory !== null && !(r.dryFactory > 0 && r.dryFactory < 1)) return 'Độ khô nhà máy phải trong khoảng 0 – 1.';
    return M.validate(r, state.data);
  }
  function upsertContract(o, expectedRevision) {
    try {const r=cleanContract(o),error=validateContract(r);if(error)return {error};const result=M.upsert(state.data,r,expectedRevision);state.data=result.data;return {rec:result.record};}
    catch(e){return {error:e.message};}
  }
  function removeContract(id) {
    const c = contract(id); if (!c) return {error:'Không tìm thấy hợp đồng.'};
    c.deletedAt = new Date().toISOString(); c.revision = (c.revision||0)+1; return {};
  }

  /* ---------------------------------------------------------------
   * 3. Nhập từ file tổng hợp "XUẤT HÀNG" (sheet danh mục lô, ví dụ NL_DH_XB)
   * ------------------------------------------------------------- */
  /** Nhận diện cột theo tiêu đề đã chuẩn hoá (không dấu, chữ thường). Thứ tự = độ ưu tiên. */
  const COLS = [
    ['dryFactory', /^do kho nha may/], ['fromDate', /tu ngay/], ['toDate', /den ngay/], ['certDate', /^ngay chung thu/], ['certNo', /chung thu/],
    ['moisture', /do am/], ['tkhq', /so tkhq|to khai/], ['custAddr', /^d(c|ia chi) khach/], ['customer', /^khach hang|^ten khach|^ben mua|^ben nhan/],
    ['seller', /^ben ban|^ben giao|^ben uy thac/], ['type', /^hinh thuc/],
    ['product', /ten hh|hang hoa|ten hang/], ['priceUsd', /don gia/], ['bdmt', /bdmt/], ['mt', /^kl mt$|^khoi luong mt|^kl tuoi|^mt$/],
    ['no', /so hop dong|^so hd/], ['date', /^ngay (don hang|hop dong|hd|ky)|^ngay$/], ['ship', /^tau|ten tau|chuyen tau/],
    ['filterTrips', /loc xe/], ['wh', /^kho xuat|^kho$/], ['note', /ghi chu/]
  ];
  function mapHeader(row) {
    const m = {};
    (row || []).forEach((v, c) => {
      const h = U().norm(v); if (!h) return;
      for (const [k, re] of COLS) { if (m[k] === undefined && re.test(h)) { m[k] = c; break; } }
    });
    return m;
  }
  function findWh(name) {
    const k = keyName(name); if (!k) return '';
    const w = (HAK.Config.data.warehouses || []).find((x) => keyName(x.name) === k || keyName(x.short) === k);
    return w ? w.id : '';
  }
  function typeOf(v) {
    const k = U().norm(v);
    if (!k) return 'xuatkhau';
    if (/uy thac/.test(k)) return 'uythac';
    if (/trao doi/.test(k)) return 'traodoi';
    if (/xuat ban|ban/.test(k)) return 'xuatban';
    return 'xuatkhau';
  }
  /** wb = workbook SheetJS. Trả về { sheet, rows, addedCustomers, addedContracts, updated, skipped } hoặc ném lỗi. */
  function importWorkbook(wb) {
    let found = null;
    for (const sn of wb.SheetNames) {
      const G2 = root.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
      for (let r = 0; r < Math.min(G2.length, 15); r++) {
        const m = mapHeader(G2[r]);
        if (m.tkhq !== undefined && m.ship !== undefined && m.customer !== undefined) { found = { sn, G: G2, hr: r, m }; break; }
      }
      if (found) break;
    }
    if (!found) throw new Error('Không tìm thấy sheet danh mục lô xuất (cần các cột "SỐ TKHQ", "TÀU", "KHÁCH HÀNG" — như sheet NL_DH_XB).');
    syncCompanies();
    const { G: rowsAll, hr, m } = found, cell = (row, k) => (m[k] === undefined ? null : row[m[k]]);
    const out = { sheet: found.sn, rows: 0, addedCustomers: 0, addedContracts: 0, updated: 0, skipped: 0 };
    rowsAll.slice(hr + 1).forEach((row) => {
      row = row || [];
      const tkhq = tkhqOf(cell(row, 'tkhq')), ship = String(cell(row, 'ship') || '').replace(/\s+/g, ' ').trim();
      if (!tkhq && !ship) return;
      out.rows++;
      const cu = ensureCustomer(cell(row, 'customer'), cell(row, 'custAddr'));
      if (cu && cu.created) out.addedCustomers++;
      const se = cell(row, 'seller') ? ensureCustomer(cell(row, 'seller'), '') : null;
      if (se && se.created) out.addedCustomers++;
      const inc = {
        type: m.type !== undefined ? typeOf(cell(row, 'type')) : undefined,
        date: cell(row, 'date'), no: cell(row, 'no'), tkhq, ship, customerId: cu ? cu.c.id : '', sellerId: se ? se.c.id : '', product: cell(row, 'product'),
        priceUsd: cell(row, 'priceUsd'), mt: cell(row, 'mt'), bdmt: cell(row, 'bdmt'), dryFactory: cell(row, 'dryFactory'),
        certNo: cell(row, 'certNo'), certDate: cell(row, 'certDate'), moisture: cell(row, 'moisture'),
        fromDate: cell(row, 'fromDate'), toDate: cell(row, 'toDate'), note: cell(row, 'note'),
        filterTrips: /^(y|yes|x|co|có|1|true)$/i.test(String(cell(row, 'filterTrips') || '').trim()), whId: findWh(cell(row, 'wh'))
      };
      const isoD = isoOf(inc.date);
      const old=contracts().find(c=>
        (inc.no&&c.no===String(inc.no).trim()&&(!inc.type||c.type===inc.type)) || M.active(c).some(d=>tkhq?d.tkhq===tkhq:!d.tkhq&&keyName(d.ship)===keyName(ship)&&c.date===isoD));
      const incomingRoles=M.roles(Object.assign({},inc,{type:inc.type||(old&&old.type)||'xuatkhau'}));
      const parent=old?M.copy(old):M.parent({type:inc.type||'xuatkhau',no:inc.no,date:isoD,currency:'USD',details:[]});
      ['date','no','type','priceUsd','dryFactory','note'].forEach(k=>{if(inc[k]!==undefined&&inc[k]!==null&&inc[k]!=='')parent[k]=inc[k];});
      Object.keys(incomingRoles).forEach(k=>{if(incomingRoles[k])parent[k]=incomingRoles[k];});
      const existing=M.active(parent).find(d=>tkhq?d.tkhq===tkhq&&(!inc.product||keyName(d.product)===keyName(inc.product)):!d.tkhq&&keyName(d.ship)===keyName(ship)&&keyName(d.product)===keyName(inc.product));
      const detail=existing?M.copy(existing):M.child(parent.id,{});
      M.childFields.forEach(k=>{const v=inc[k];if(v!==undefined&&v!==null&&v!==''&&!(k==='filterTrips'&&!v))detail[k]=['mt','bdmt','moisture','qty','priceUsd'].includes(k)?num(v):v;});
      detail.certDate=isoOf(detail.certDate)||'';detail.fromDate=isoOf(detail.fromDate)||'';detail.toDate=isoOf(detail.toDate)||'';
      const index=parent.details.findIndex(d=>d.id===detail.id);if(index<0)parent.details.push(detail);else parent.details[index]=detail;
      const result=upsertContract(parent,old?old.revision:undefined);if(result.error){out.skipped++;return;}if(old)out.updated++;else out.addedContracts++;
    });
    save();
    return out;
  }

  /* ---------------------------------------------------------------
   * 4. Giao diện trang "Danh mục"
   * ------------------------------------------------------------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => HAK.UI.esc(s);
  const custName = (id) => { const c = customer(id); return c ? c.name : ''; };
  const whName = (id) => { const w = id ? (HAK.Config.data.warehouses || []).find((x) => x.id === id) : null; return w ? (w.short || w.name) : ''; };
  function build() {
    const host = $('#catalogRoot'); if (!host || state.built) return;
    host.innerHTML =
      '<div class="card mb-3"><div class="card-body">' +
      '<div class="d-flex flex-wrap align-items-center gap-2 mb-3">' +
      '<div class="btn-group flex-wrap" role="group">' +
      '<button class="btn btn-outline-primary active" data-ctab="contracts" type="button">🚢 Hợp đồng &amp; thực hiện <span class="badge text-bg-secondary ms-1" id="catNContracts"></span></button>' +
      '<button class="btn btn-outline-primary" data-ctab="customs" type="button">🛃 Tờ khai hải quan</button>' +
      '<button class="btn btn-outline-primary" data-ctab="customers" type="button">👤 Khách hàng <span class="badge text-bg-secondary ms-1" id="catNCustomers"></span></button></div>' +
      '<div class="ms-auto d-flex flex-wrap gap-2"><button type="button" class="btn btn-outline-primary" data-goods-open>Danh mục hàng hóa</button>' +
      '<button class="btn btn-outline-secondary" type="button" data-archive-view>Đã lưu trữ</button>' +
      '<button class="btn btn-primary" id="catAdd" type="button">＋ Thêm</button>' +
      '<label class="btn btn-outline-secondary mb-0" title="File tổng hợp Xuất hàng (vd XUATHANG_DN.xlsx) — sheet có cột SỐ TKHQ / TÀU / KHÁCH HÀNG">⬆ Nhập từ file Xuất hàng<input type="file" id="catImport" accept=".xlsx,.xls,.xlsm" hidden></label>' +
      '</div></div>' +
      '<div id="customsRoot" class="d-none"></div><div id="catMain"><div id="catSmartFilter"></div><div class="row g-2 mb-2"><div class="col-md-4 d-none" id="catTypeWrap"><select class="form-select" id="catType"><option value="">Tất cả hình thức</option>' +
      Object.keys(TYPES).map((t) => '<option value="' + t + '">' + esc(TYPES[t].label) + '</option>').join('') + '</select></div>' +
      '<div class="col d-none"><input class="form-control" id="catSearch" placeholder="Tìm theo tàu, số hợp đồng, TKHQ, chứng thư, khách hàng…"></div>' +
      '<div class="col-auto d-flex align-items-center" id="catScopeWrap">' + (HAK.Auth && HAK.Auth.scopeSwitch ? HAK.Auth.scopeSwitch('catalog') : '') + '</div></div>' +
      '<div class="tbl-wrap"><table class="table table-hover align-middle mb-0"><thead id="catHead"></thead><tbody id="catBody"></tbody></table></div>' +
      '<div class="text-center muted py-4 d-none" id="catEmpty"></div>' +
      '<div id="catDetailsPanel" class="mt-3"></div><div class="form-text mt-2">Khi ký hợp đồng chỉ nhập thông tin chung. Khi giao hàng mới nhập <b>chi tiết hợp đồng (tàu · chứng thư · tờ khai)</b> để lưu tàu, TKHQ, chứng thư, tỷ giá và giá trị. ' +
      'Khi in biên bản, chọn đúng dòng chi tiết theo tàu, hàng hóa hoặc TKHQ. App chỉ đưa ra hợp đồng đúng hình thức của trang. Công ty trong nhóm tự có trong Khách hàng (nhãn <b>Nội bộ</b>, sửa ở Cài đặt → Công ty). ' +
      'Danh mục nằm trong <b>Sao lưu toàn bộ</b>.</div></div>' +
      '</div></div>' +
      '<div class="modal fade" id="catModal" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title" id="catModalTitle"></h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
      '<div class="modal-body"><div class="row g-3" id="catForm"></div><div class="text-danger small mt-2" id="catErr"></div></div>' +
      '<div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal" type="button">Hủy</button><button class="btn btn-primary" id="catSave" type="button">Lưu</button></div>' +
      '</div></div></div>';
    state.built = true;
    host.addEventListener('click', onClick);

    $('#catSearch').addEventListener('input', HAK.UI.debounce((e) => { state.q = e.target.value.trim(); renderRows(); }, 150));
    $('#catType').addEventListener('change', (e) => { state.type = e.target.value; renderRows(); });
    $('#catImport').addEventListener('change', onImport);
    root.addEventListener('hak:scope', (e) => { if (e.detail && e.detail.key === 'catalog') renderRows(); });
    $('#catSave').addEventListener('click', onSave);
    $('#catForm').addEventListener('input', onFormInput);
    $('#catForm').addEventListener('change', onFormInput);
  }

  const catalogViews={};
  function catalogSource(){const scope=HAK.Auth&&HAK.Auth.scopeIds?HAK.Auth.scopeIds('catalog'):null;return state.tab==='customers'?customers():state.data.contracts.filter(c=>(state.showArchived?!!c.deletedAt:!c.deletedAt)&&relatedTo(c,scope));}
  function catalogSmart(){
    const F=HAK.Filters,tab=state.tab;
    if(!catalogViews[tab]){
      const client=tab==='customers';
      catalogViews[tab]=F.mount('#catSmartFilter',{screenId:'catalog-'+tab,source:catalogSource,
       fields:client?[F.multi('kind','Loại khách hàng',()=>Object.keys(KINDS).map(value=>({value,label:KINDS[value]})),c=>c.kind)]:[
         F.multi('type','Hình thức',()=>Object.keys(TYPES).map(value=>({value,label:TYPES[value].label})),c=>c.type),
         F.multi('customerId','Bên mua / nhận',()=>customers().map(c=>({value:c.id,label:c.name})),c=>c.type==='uythac'?c.exporterId:c.buyerId)],
       matchQ:(c,q)=>F.core.hay(client?[c.name,c.address,c.country,c.tax]:[c.no,c.contractProduct,custName(c.exporterId),custName(c.principalId),custName(c.buyerId),...(c.details||[]).flatMap(d=>[d.ship,d.tkhq,d.product,d.certNo])]).includes(q),
       matchDate:client?undefined:(c,f,t)=>F.dateMatch(c.date,f,t),onApply:renderRows
      });
    }
    const v=catalogViews[tab],host=$('#catSmartFilter');if(!host.contains(v.el))host.replaceChildren(v.el);v.refresh();return v;
  }
  function renderRows() {
    const onCustoms = state.tab === 'customs';
    document.querySelectorAll('#catalogRoot [data-ctab]').forEach((b) => b.classList.toggle('active', b.dataset.ctab === state.tab));
    ['#catMain', '#catAdd', '[data-archive-view]', '[data-goods-open]', '#catImport'].forEach((s) => { const n = $(s); const t = n && (s === '#catImport' ? n.closest('label') : n); if (t) t.classList.toggle('d-none', onCustoms); });
    $('#customsRoot').classList.toggle('d-none', !onCustoms);
    if (onCustoms) { $('#catNContracts').textContent = contracts().length; $('#catNCustomers').textContent = customers().length; if (HAK.Customs) HAK.Customs.render(); return; }
    const smart=catalogSmart();
    $('#catNContracts').textContent = contracts().length; $('#catNCustomers').textContent = customers().length;
    document.querySelectorAll('#catalogRoot [data-ctab]').forEach((b) => b.classList.toggle('active', b.dataset.ctab === state.tab));
    $('#catTypeWrap').classList.add('d-none');
    $('#catScopeWrap').classList.toggle('d-none', state.tab === 'customers');
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('catalog') : null;   // v2.6.2: mặc định chỉ HĐ liên quan công ty đang làm
    $('#catAdd').classList.toggle('d-none', state.tab === 'exec');
    const archivedButton=$('[data-archive-view]');if(archivedButton){archivedButton.classList.toggle('d-none',state.tab==='customers');archivedButton.textContent=state.showArchived?'Đang xem lưu trữ — Xem đang dùng':'Đã lưu trữ';}
    const act = (id, noDel, exec) => '<td class="text-nowrap text-end"><div class="btn-group btn-group-sm"><button class="btn btn-outline-primary" data-edit="' + esc(id) + '" type="button">Sửa</button>' +
      (exec ? '<button class="btn btn-outline-primary" data-exec="' + esc(id) + '" type="button" title="Chi tiết hợp đồng (tàu · chứng thư · tờ khai)">🧪</button>' : '') +
      (noDel ? '' : '<button class="btn btn-outline-danger" data-del="' + esc(id) + '" type="button">🗑</button>') + '</div></td>';
    const typeBadge = (t) => '<span class="badge badge-soft">' + esc((TYPES[t] || {}).label || t) + '</span>';
    let head, rows, empty;
    if (state.tab !== 'customers') {
      const list = smart.filter(catalogSource()).rows.slice().sort(byDateDesc);
      if (!list.some(c=>c.id===state.selectedParent)) state.selectedParent=list[0]?list[0].id:'';
      head = '<tr><th>Hình thức</th><th>Ngày ký</th><th>Số HĐ</th><th>Tên hàng hóa</th><th>Bên xuất khẩu</th><th>Bên ủy thác</th><th>Bên mua</th><th class="num">Số dòng</th><th class="num">KL hợp đồng (BDMT)</th><th>Trạng thái</th><th></th></tr>';
      rows = list.map(c => '<tr class="' + (state.selectedParent===c.id?'table-active':'') + '"><td>' + typeBadge(c.type) + '</td><td>' + esc(vnDate(c.date)) + '</td><td>' + esc(c.no) + '</td><td>' + esc(c.contractProduct||'') + '</td><td>' + esc(custName(c.exporterId)) + '</td><td>' + esc(custName(c.principalId)) + '</td><td>' + esc(custName(c.buyerId)) + '</td><td class="num">' + M.active(c).length + '</td><td class="num">' + fmtNum(c.contractQty,2) + '</td><td>' + (HAK.Customs ? HAK.Customs.contractBadge(c.id) : '') + '</td><td class="text-end text-nowrap"><button type="button" class="btn btn-sm btn-primary" data-master="' + esc(c.id) + '">Chi tiết</button> <button type="button" class="btn btn-sm btn-outline-primary" data-edit="' + esc(c.id) + '"'+(c.deletedAt?' disabled':'')+'>Sửa HĐ</button> <button type="button" class="btn btn-sm btn-outline-secondary" '+(c.deletedAt?'data-parent-restore':'data-del')+'="' + esc(c.id) + '">'+(c.deletedAt?'Khôi phục':'Lưu trữ')+'</button></td></tr>').join('');
      empty = contracts().length ? 'Không có hợp đồng khớp bộ lọc.' + (scope ? ' Đang chỉ hiện hợp đồng liên quan công ty đang làm — bật <b>Xem tất cả công ty</b> để xem hết.' : '') : 'Chưa có hợp đồng. Bấm <b>＋ Thêm</b> hoặc <b>⬆ Nhập từ file Xuất hàng</b> (vd XUATHANG_DN.xlsx) để nạp sẵn danh sách lô.';
    } else {
      head = '<tr><th>Tên khách hàng</th><th>Loại</th><th>Địa chỉ</th><th>Quốc gia</th><th>MST / Mã số</th><th class="num">Số hợp đồng</th><th></th></tr>';
      const list = smart.filter(catalogSource()).rows.slice().sort((a, b) => (a.kind === 'noibo' ? 0 : 1) - (b.kind === 'noibo' ? 0 : 1) || a.name.localeCompare(b.name));
      rows = list.map((c) => '<tr><td class="fw-semibold">' + esc(c.name) + '</td><td><span class="badge badge-soft">' + esc(KINDS[c.kind] || '') + '</span></td><td class="small">' + esc(c.address) + '</td><td>' + esc(c.country) + '</td><td class="mono">' + esc(c.tax) + '</td>' +
        '<td class="num">' + contracts().filter(x=>[x.exporterId,x.principalId,x.buyerId,...(x.details||[]).map(d=>d.deliverId)].includes(c.id)).length + '</td>' + act(c.id, !!c.companyId) + '</tr>').join('');
      empty = customers().length ? 'Không có khách hàng khớp tìm kiếm.' : 'Chưa có khách hàng.';
    }
    $('#catHead').innerHTML = head; $('#catBody').innerHTML = rows;
    renderMasterDetail();
    $('#catEmpty').innerHTML = empty; $('#catEmpty').classList.toggle('d-none', !!rows);
  }

  /* ---------- Biểu mẫu thêm / sửa ---------- */
  // v2.12.7: ô số hiện dạng Việt (6.500 · 25.400 · 0,48); giá trị lưu vẫn là số (xem fv). Độ khô / độ ẩm là số thập phân thuần.
  const DEC_IDS = ['dryFactory', 'moisture'];
  const inp = (id, label, col, val, opt) => {
    opt = opt || {};
    const isNum = opt.type === 'number' && !opt.ro, mode = DEC_IDS.indexOf(id) >= 0 ? 'dec' : 'num';
    const raw = val === null || val === undefined ? '' : val;
    const shown = isNum && raw !== '' && HAK.NumFmt && HAK.NumFmt.parse(raw, mode) !== null ? HAK.NumFmt.txt(HAK.NumFmt.parse(raw, mode), mode) : raw;
    return '<div class="col-md-' + col + '"><label class="form-label" for="cf-' + id + '" id="cf-' + id + '-lbl">' + label + '</label>' +
      '<input class="form-control" id="cf-' + id + '" type="' + (isNum ? 'text' : (opt.type || 'text')) + '"' + (isNum ? ' data-numfmt="' + (DEC_IDS.indexOf(id) >= 0 ? 'dec' : 'num') + '" inputmode="decimal"' : (opt.step ? ' step="' + opt.step + '" inputmode="decimal"' : '')) + (opt.list ? ' list="' + opt.list + '"' : '') +
      (opt.ro ? ' readonly' : '') + ' value="' + esc(shown) + '" placeholder="' + esc(opt.ph || '') + '" autocomplete="off">' +
      (opt.help !== undefined ? '<div class="form-text" id="cf-' + id + '-help">' + opt.help + '</div>' : '') + '</div>';
  };
  const custSelect = (id, label, col, val, allowNew) => {
    const opts = customers().slice().sort((a, b) => (a.kind === 'noibo' ? 0 : 1) - (b.kind === 'noibo' ? 0 : 1) || a.name.localeCompare(b.name))
      .map((x) => '<option value="' + esc(x.id) + '"' + (x.id === val ? ' selected' : '') + '>' + esc(x.name) + (x.kind === 'noibo' ? ' (nội bộ)' : '') + '</option>').join('');
    return '<div class="col-md-' + col + '"><label class="form-label" for="cf-' + id + '" id="cf-' + id + '-lbl">' + label + '</label><select class="form-select" id="cf-' + id + '"><option value="">—</option>' + opts +
      (allowNew ? '<option value="__new">＋ Khách hàng mới…</option>' : '') + '</select>' +
      (allowNew ? '<div class="d-none mt-2" id="cf-' + id + '-new"><input class="form-control mb-1" id="cf-' + id + '-newName" placeholder="Tên khách hàng mới"><input class="form-control mb-1" id="cf-' + id + '-newAddr" placeholder="Địa chỉ"><input class="form-control" id="cf-' + id + '-newTax" placeholder="Mã số thuế (nếu có)"></div>' : '') + '</div>';
  };
  const secTitle = (t, id) => '<div class="col-12"' + (id ? ' id="' + id + '"' : '') + '><div class="sec-title mt-2 mb-0">' + t + '</div></div>';
  function renderMasterDetail() {
    const panel=$('#catDetailsPanel');if(!panel)return;if(state.tab==='customers'){panel.innerHTML='';return;}
    const visible=catalogSmart().filter(catalogSource()).rows;const c=visible.find(x=>x.id===state.selectedParent)||visible[0];state.selectedParent=c?c.id:'';if(!c){panel.innerHTML='';return;}
    const detailRows=state.showStopped?(c.details||[]):M.active(c),amounts=M.active(c).map(d=>M.valuation(c,d));
    const total=key=>{const values=amounts.map(x=>x[key]).filter(x=>x!=null);return values.length?values.reduce((a,b)=>a+b,0):null;};
    panel.innerHTML='<div class="border rounded p-3"><div class="d-flex flex-wrap gap-2 align-items-center mb-2"><h6 class="mb-0">Chi tiết hợp đồng (tàu · chứng thư · tờ khai) — '+esc(c.no||c.id)+'</h6>'+(HAK.Customs?HAK.Customs.contractBadge(c.id):'')+'<button type="button" class="btn btn-sm btn-primary ms-auto" data-detail-add="'+esc(c.id)+'"'+(c.deletedAt?' disabled':'')+'>＋ Thêm chi tiết hợp đồng</button></div><button type="button" class="btn btn-sm btn-outline-secondary mb-2" data-stopped-view>'+(state.showStopped?'Ẩn dòng ngừng dùng':'Xem dòng ngừng dùng')+'</button><p class="small muted">Chỉ thêm khi có giao hàng. Giá trị lấy KL khô trên chứng thư × đơn giá hợp đồng; tỷ giá nhập theo từng chi tiết.</p><div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th>Hàng hóa</th><th>Số TKHQ</th><th>Ngày mở TK</th><th class="num">Lần khai</th><th class="num">Thuế XK phải nộp</th><th>TT tờ khai</th><th>Tàu/chuyến</th><th>Số chứng thư</th><th class="num">MT</th><th class="num">BDMT thực hiện</th><th class="num">Tỷ giá VNĐ/USD</th><th class="num">Giá trị USD</th><th class="num">Giá trị VNĐ</th><th></th></tr></thead><tbody>'+detailRows.map(d=>{const v=M.valuation(c,d);return '<tr><td>'+esc(d.product||c.contractProduct||'—')+'</td><td class="mono">'+esc(d.tkhq||'')+'</td>'+(HAK.Customs?HAK.Customs.detailCells(c,d):'<td></td><td></td><td></td><td></td>')+'<td>'+esc(d.ship||'')+'</td><td>'+esc(d.certNo||'')+'</td><td class="num">'+fmtNum(d.mt,2)+'</td><td class="num">'+fmtNum(d.bdmt,2)+'</td><td class="num">'+fmtNum(d.exchangeRate,2)+'</td><td class="num">'+fmtNum(v.valueUsd,2)+'</td><td class="num">'+fmtNum(v.valueVnd,0)+'</td><td class="text-nowrap"><button type="button" class="btn btn-sm btn-outline-primary" data-detail-edit="'+esc(d.id)+'" data-parent="'+esc(c.id)+'"'+(c.deletedAt||d.deletedAt?' disabled':'')+'>Sửa / chứng thư</button> <button type="button" class="btn btn-sm btn-outline-secondary" '+(d.deletedAt?'data-detail-restore':'data-detail-archive')+'="'+esc(d.id)+'" data-parent="'+esc(c.id)+'"'+(c.deletedAt?' disabled':'')+'>'+(d.deletedAt?'Khôi phục':'Ngừng dùng')+'</button></td></tr>';}).join('')+'</tbody><tfoot><tr><th colspan="8">Tổng chi tiết đang dùng</th><th class="num">'+fmtNum(M.sum(c,'mt'),2)+'</th><th class="num">'+fmtNum(M.sum(c,'bdmt'),2)+'</th><th></th><th class="num">'+fmtNum(total('valueUsd'),2)+'</th><th class="num">'+fmtNum(total('valueVnd'),0)+'</th><th></th></tr></tfoot></table></div>'+(!detailRows.length?'<div class="muted p-2">Hợp đồng chưa có chi tiết (tàu · chứng thư · tờ khai). Bấm Thêm chi tiết hợp đồng khi có tàu / chứng thư.</div>':'')+(amounts.some(x=>x.valueUsd==null||x.valueVnd==null)?'<p class="small text-warning mt-2">Tổng giá trị chỉ cộng các ô đã tính được. Chi tiết thiếu KL chứng thư, đơn giá hoặc tỷ giá được để trống.</p>':'')+'</div>';
  }
  function goodsInput(id,label,col,value){
    const names=(state.data.products||[]).filter(x=>!x.deletedAt).map(x=>x.name).sort((a,b)=>a.localeCompare(b,'vi'));
    if(value&&!names.includes(value))names.unshift(value);
    return '<div class="col-md-'+col+'"><label class="form-label" for="cf-'+id+'">'+label+'</label><select class="form-select" id="cf-'+id+'"><option value="">'+(id==='product'?'— Theo hàng hóa hợp đồng —':'— Chọn hàng hóa từ danh mục —')+'</option>'+names.map(name=>'<option value="'+esc(name)+'"'+(name===value?' selected':'')+'>'+esc(name)+'</option>').join('')+'<option value="__new">＋ Thêm hàng hóa mới…</option></select><div id="cf-'+id+'-new" class="mt-2 d-none"><label class="form-label" for="cf-'+id+'-newName">Tên hàng hóa mới</label><input class="form-control" id="cf-'+id+'-newName" placeholder="Nhập tên để bổ sung vào danh mục khi lưu"></div><div class="form-text">Quản lý danh mục tại nút Danh mục hàng hóa trên màn hình hợp đồng.</div></div>';
  }
  function upsertProduct(value){try{const result=M.upsertGoods(state.data,value);state.data=result.data;return {rec:result.record};}catch(e){return {error:e.message};}}
  function openGoods(){
    const host=document.createElement('div');host.className='modal fade';host.tabIndex=-1;
    host.innerHTML='<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Danh mục hàng hóa</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div><div class="modal-body"><p class="small muted">Tên hàng được chọn khi ký hợp đồng và khi thực hiện. Đổi tên trong danh mục không sửa tên trên hồ sơ đã lưu.</p><input type="hidden" data-goods-id><label class="form-label" for="goods-name">Tên hàng hóa</label><input class="form-control mb-2" id="goods-name" data-goods-name maxlength="300"><div class="d-flex gap-2"><button type="button" class="btn btn-primary" data-goods-save>Lưu hàng hóa</button><button type="button" class="btn btn-outline-secondary" data-goods-clear>Nhập mới</button></div><div data-goods-error class="text-danger mt-2" role="alert"></div><div class="tbl-wrap mt-3"><table class="table table-sm"><thead><tr><th>Tên hàng</th><th>Đơn vị</th><th></th></tr></thead><tbody data-goods-rows></tbody></table></div></div></div></div>';
    const q=s=>host.querySelector(s);let busy=false;
    function draw(){q('[data-goods-rows]').innerHTML=(state.data.products||[]).map(g=>'<tr><td>'+esc(g.name)+(g.deletedAt?' <span class="muted">(ngừng dùng)</span>':'')+'</td><td>BDMT</td><td class="text-nowrap"><button type="button" class="btn btn-sm btn-outline-primary" data-goods-edit="'+esc(g.id)+'">Sửa</button> <button type="button" class="btn btn-sm btn-outline-secondary" data-goods-toggle="'+esc(g.id)+'">'+(g.deletedAt?'Khôi phục':'Ngừng dùng')+'</button></td></tr>').join('');}
    async function mutate(action){if(busy)return;busy=true;const before=M.copy(state.data);host.querySelectorAll('button').forEach(b=>b.disabled=true);try{action();await persist();q('[data-goods-error]').textContent='';draw();changed();}catch(e){state.data=before;q('[data-goods-error]').textContent=e.message;}finally{busy=false;host.querySelectorAll('button').forEach(b=>b.disabled=false);}}
    host.addEventListener('click',e=>{const edit=e.target.closest('[data-goods-edit]'),toggle=e.target.closest('[data-goods-toggle]');if(edit){const g=(state.data.products||[]).find(g=>g.id===edit.dataset.goodsEdit);if(g){q('[data-goods-id]').value=g.id;q('[data-goods-name]').value=g.name;}}if(toggle)mutate(()=>{const g=state.data.products.find(g=>g.id===toggle.dataset.goodsToggle);if(!g)throw Error('Không tìm thấy hàng hóa');if(g.deletedAt)delete g.deletedAt;else g.deletedAt=new Date().toISOString();});if(e.target.closest('[data-goods-clear]')){q('[data-goods-id]').value='';q('[data-goods-name]').value='';}if(e.target.closest('[data-goods-save]'))mutate(()=>{const result=upsertProduct({id:q('[data-goods-id]').value||undefined,name:q('[data-goods-name]').value});if(result.error)throw Error(result.error);q('[data-goods-id]').value=result.rec.id;});});
    document.body.append(host);draw();const modal=new bootstrap.Modal(host);host.addEventListener('hidden.bs.modal',()=>{modal.dispose();host.remove();renderRows();},{once:true});modal.show();
  }
    function openForm(kind,id) {
    const isC=kind!=='customers',rec=id?(isC?contract(id):customer(id)):null;
    const c=isC?M.parent(rec||{type:state.type||'xuatkhau',currency:'USD',dryFactory:.48,details:[]}):(rec||{kind:'ngoai'});
    state.editing={kind:isC?'contracts':'customers',id:c.id||'',revision:c.revision||0,draft:isC?M.copy(c):null};
    $('#catErr').textContent='';$('#catModalTitle').textContent=(rec?'Sửa ':'Thêm ')+(isC?'hợp đồng':'khách hàng');
    if(isC){
      $('#catForm').innerHTML=secTitle('Hợp đồng — thông tin chung')+
        '<div class="col-md-3"><label class="form-label" for="cf-type">Hình thức</label><select class="form-select" id="cf-type">'+Object.keys(TYPES).map(t=>'<option value="'+t+'"'+(t===c.type?' selected':'')+'>'+esc(TYPES[t].label)+'</option>').join('')+'</select></div>'+
        inp('no','Số hợp đồng',5,c.no)+inp('date','Ngày ký',4,c.date,{type:'date'})+goodsInput('contractProduct','Tên hàng hóa hợp đồng',8,c.contractProduct)+inp('contractQty','KL hợp đồng (BDMT)',4,c.contractQty,{type:'number',step:'any'})+
        custSelect('exporterId','Bên xuất khẩu / bán / nhận ủy thác',6,c.exporterId,true)+custSelect('principalId','Bên ủy thác (nếu có)',6,c.principalId,true)+custSelect('buyerId','Bên mua hàng',6,c.buyerId,true)+
        inp('priceUsd','Đơn giá hợp đồng / BDMT',3,c.priceUsd,{type:'number',step:'any'})+
        '<div class="col-md-3"><label class="form-label" for="cf-currency">Tiền tệ</label><select class="form-select" id="cf-currency"><option value="USD"'+(c.currency==='USD'?' selected':'')+'>USD</option><option value="VND"'+(c.currency==='VND'?' selected':'')+'>VND</option></select></div>'+
        inp('dryFactory','Độ khô nhà máy',3,c.dryFactory,{type:'number',step:'any'})+inp('note','Ghi chú hợp đồng',9,c.note);
      HAK.Documents.mount($('#catForm'),'contract',c.contractFiles||[],{customers});
    }else{
      const ro=!!c.companyId;
      $('#catForm').innerHTML=(ro?'<div class="col-12 alert alert-info">Công ty nội bộ: thông tin lấy từ Cài đặt.</div>':'')+
        inp('name','Tên khách hàng',9,c.name,{ro})+'<div class="col-md-3"><label class="form-label" for="cf-kind">Loại</label><select class="form-select" id="cf-kind"'+(ro?' disabled':'')+'>'+Object.keys(KINDS).filter(k=>ro||k!=='noibo').map(k=>'<option value="'+k+'"'+(k===c.kind?' selected':'')+'>'+KINDS[k]+'</option>').join('')+'</select></div>'+
        inp('address','Địa chỉ',12,c.address,{ro})+inp('country','Quốc gia',6,c.country)+inp('tax','MST / mã số',6,c.tax,{ro})+inp('note','Ghi chú',12,c.note);
    }
    onFormInput();bootstrap.Modal.getOrCreateInstance($('#catModal')).show();
  }
  function openExec(parentId,detailId) {
    const c=contract(parentId);if(!c)return;
    const existing=detailId?(c.details||[]).find(x=>x.id===detailId&&!x.deletedAt):null;if(detailId&&!existing)return;
    const d=existing?M.copy(existing):M.child(c.id,{});
    state.editing={kind:'exec',id:c.id,revision:c.revision||0,draft:M.copy(c),detail:d};
    $('#catErr').textContent='';$('#catModalTitle').textContent='Chi tiết hợp đồng (tàu · chứng thư · tờ khai) — '+(c.no||c.id);
    const whOpts='<option value="">—</option>'+(HAK.Config.data.warehouses||[]).map(w=>'<option value="'+esc(w.id)+'"'+(w.id===d.whId?' selected':'')+'>'+esc(w.name)+'</option>').join('');
    $('#catForm').innerHTML='<div class="col-12"><div class="border rounded p-2 small">Hợp đồng: <b>'+esc(c.no||c.id)+'</b> · Bên xuất khẩu: '+esc(custName(c.exporterId))+' · Bên ủy thác: '+esc(custName(c.principalId))+' · Bên mua: '+esc(custName(c.buyerId))+'</div></div>'+
      secTitle('Chi tiết hợp đồng')+goodsInput('product','Hàng hóa thực hiện (trống = theo hợp đồng)',12,d.product)+inp('tkhq','Số tờ khai HQ',6,d.tkhq)+inp('ship','Tàu / chuyến',6,d.ship)+
      '<div class="col-12 small muted">Đơn giá lấy từ hợp đồng: '+fmtNum(c.priceUsd,4)+' '+esc(c.currency||'USD')+'/BDMT. Giá trị tính theo KL khô thực tế trên chứng thư.</div>'+secTitle('Tờ khai hải quan')+(HAK.Customs?HAK.Customs.execPicker(c,d):'')+secTitle('Chứng thư và giá trị thực hiện')+inp('certNo','Số chứng thư',6,d.certNo)+inp('certDate','Ngày chứng thư',6,d.certDate,{type:'date'})+inp('mt','KL tươi (MT)',4,d.mt,{type:'number',step:'any'})+inp('bdmt','KL khô (BDMT)',4,d.bdmt,{type:'number',step:'any',help:''})+inp('moisture','Độ ẩm (%)',4,d.moisture,{type:'number',step:'any'})+
      inp('exchangeRate','Tỷ giá (VNĐ/USD)',4,d.exchangeRate,{type:'number',step:'any'})+inp('valueUsd','Giá trị USD',4,M.valuation(c,d).valueUsd==null?'':fmtNum(M.valuation(c,d).valueUsd,2),{ro:true})+inp('valueVnd','Giá trị VNĐ',4,M.valuation(c,d).valueVnd==null?'':fmtNum(M.valuation(c,d).valueVnd,0),{ro:true})+custSelect('deliverId','Bên giao trên chứng thư',6,d.deliverId,true)+custSelect('receiverId','Bên nhận trên chứng thư',6,d.receiverId,true)+'<div class="col-md-6"><label class="form-label" for="cf-whId">Kho xuất</label><select class="form-select" id="cf-whId">'+whOpts+'</select></div>'+inp('fromDate','Ngày cân từ',4,d.fromDate,{type:'date'})+inp('toDate','Ngày cân đến',4,d.toDate,{type:'date'})+'<div class="col-md-4"><label class="form-check mt-4"><input class="form-check-input" type="checkbox" id="cf-filterTrips"'+(d.filterTrips?' checked':'')+'> Lọc xe theo ngày cân</label></div>'+inp('detailNote','Ghi chú chi tiết',12,d.note);
    HAK.Documents.mount($('#catForm'),'certificate',d.certificateFiles||[],{customers});onFormInput();if(HAK.Customs)HAK.Customs.bindExec();bootstrap.Modal.getOrCreateInstance($('#catModal')).show();
  }
  function onFormInput(e) {
    const ed=state.editing;if(!ed)return;
    if(ed.kind==='contracts'||ed.kind==='exec'){
      ['contractProduct','product','exporterId','principalId','buyerId','deliverId','receiverId'].forEach(k=>{const node=$('#cf-'+k),wrap=$('#cf-'+k+'-new');if(node&&wrap)wrap.classList.toggle('d-none',node.value!=='__new');});
      if(e&&e.target.id==='cf-type')$('#cf-currency').value=(TYPES[$('#cf-type').value]||TYPES.xuatkhau).cur;
    }if(ed.kind==='exec'){const mt=num($('#cf-mt').value),bd=num($('#cf-bdmt').value),help=$('#cf-bdmt-help');if(help)help.textContent=mt>0&&bd>0?'Độ khô thực tế: '+G().fmtDec(bd/mt,4):'';const values=M.valuation(ed.draft,{bdmt:bd,exchangeRate:num($('#cf-exchangeRate').value)});$('#cf-valueUsd').value=values.valueUsd==null?'':fmtNum(values.valueUsd,2);$('#cf-valueVnd').value=values.valueVnd==null?'':fmtNum(values.valueVnd,0);}
  }
  const fv=id=>{const node=$('#cf-'+id);if(node&&['contractProduct','product'].includes(id)&&node.value==='__new'){const name=String($('#cf-'+id+'-newName').value).trim();if(!name)throw Error('Chưa nhập tên hàng hóa mới');return name;}if(!node)return '';if(node.type==='checkbox')return node.checked;
    if(node.dataset&&node.dataset.numfmt){const text=String(node.value).trim();if(text==='')return '';const n=HAK.NumFmt.parse(text,node.dataset.numfmt);if(n===null)throw Error('Ô "'+(($('#cf-'+id+'-lbl')||{}).textContent||id)+'": "'+text+'" không phải là số');return String(n);}
    return node.value;};
  async function onSave() {
    const ed=state.editing;if(!ed)return;
    const before=M.copy(state.data);$('#catSave').disabled=true;
    try{
      let res;
      if(ed.kind==='contracts'){
        const c=M.copy(ed.draft);['no','date','type','currency','note','dryFactory','priceUsd','contractProduct','contractQty','exporterId','principalId','buyerId'].forEach(k=>c[k]=fv(k));
        const base=cleanContract(c),error=validateContract(Object.assign({},base,{exporterId:'',principalId:'',buyerId:''}));if(error)throw Error(error);
        for(const key of ['exporterId','principalId','buyerId']){
          if(c[key]!=='__new')continue;
          const name=String(fv(key+'-newName')).trim(),tax=String(fv(key+'-newTax')).trim();if(!name)throw Error('Chưa nhập tên cho '+($('#cf-'+key+'-lbl').textContent));
          const found=HAK.ContractParser.matchParty({name,tax},customers());
          const sameName=customers().find(x=>keyName(x.name)===keyName(name));
          if(!found&&tax&&sameName&&sameName.tax&&sameName.tax.replace(/\D/g,'')!==tax.replace(/\D/g,''))throw Error('Tên khách hàng đã có mã số thuế khác. Kiểm tra lại bên liên quan.');
          const result=found?{c:found}:ensureCustomer(name,fv(key+'-newAddr'),key==='buyerId'?'ngoai':'trongnuoc');
          if(tax&&!result.c.tax&&!result.c.companyId)result.c.tax=tax;c[key]=result.c.id;
        }
        c.contractFiles=await HAK.Documents.commit();res=upsertContract(c,ed.revision);
      }else if(ed.kind==='exec'){
        const c=M.copy(ed.draft),d=M.copy(ed.detail);
        if((c.type==='xuatkhau'||c.type==='uythac')&&!($('#cf-customsId')||{}).value){
          const ask=typeof confirm==='function'?confirm:()=>true;
          if(!ask('⚠ Chưa chọn TỜ KHAI HẢI QUAN cho chứng thư / chi tiết này.\n\nHợp đồng Xuất khẩu / Ủy thác XK phải có tờ khai (thêm ở tab 🛃 Tờ khai hải quan) thì mới gắn được đợt giao hàng và tính thuế.\n\nBấm Hủy để quay lại chọn tờ khai.'))return;
          if(!ask('⚠ Xác nhận lần 2: vẫn LƯU khi chưa có tờ khai hải quan?\n\nChi tiết này sẽ chưa gắn được đợt giao hàng cho tới khi bổ sung tờ khai.'))return;
        }
        ['product','tkhq','ship','exchangeRate',...EXEC_FIELDS].forEach(k=>{const value=fv(k);d[k]=['exchangeRate','mt','bdmt','moisture'].includes(k)?(value===''?null:Number(value)):value;});d.note=fv('detailNote');d.revision=(d.revision||0)+1;
        for(const key of ['deliverId','receiverId'])if(d[key]==='__new'){const name=String(fv(key+'-newName')).trim(),tax=String(fv(key+'-newTax')).trim();if(!name)throw Error('Chưa nhập tên bên giao / nhận');const match=HAK.ContractParser.matchParty({name,tax},customers());const result=match||ensureCustomer(name,fv(key+'-newAddr'),key==='receiverId'?'ngoai':'trongnuoc').c;if(tax&&!result.tax&&!result.companyId)result.tax=tax;d[key]=result.id;}d.certificateFiles=await HAK.Documents.commit();const i=c.details.findIndex(x=>x.id===d.id);if(i<0)c.details.push(d);else c.details[i]=d;ed.linkTo={contract:c.id,detail:d.id,customs:($('#cf-customsId')||{}).value||''};
        res=upsertContract(c,ed.revision);
      }else res=upsertCustomer({id:ed.id,kind:fv('kind'),name:fv('name'),address:fv('address'),country:fv('country'),tax:fv('tax'),note:fv('note')});
      if(res.error)throw Error(res.error);await persist();
      if(ed.kind!=='customers')state.selectedParent=res.rec.id;
      if(ed.kind==='exec'&&ed.linkTo&&HAK.Customs){try{await HAK.Customs.link(ed.linkTo);}catch(error){HAK.UI.toast('Đã lưu chi tiết hợp đồng nhưng chưa gắn được tờ khai: '+error.message,'warning');}}
      bootstrap.Modal.getOrCreateInstance($('#catModal')).hide();state.editing=null;renderRows();changed();HAK.UI.toast('Đã lưu '+(ed.kind==='customers'?'khách hàng':ed.kind==='exec'?'chi tiết hợp đồng':'hợp đồng')+'.','success');
    }catch(e){state.data=before;$('#catErr').textContent='Chưa lưu: '+e.message;}
    finally{$('#catSave').disabled=false;}
  }
  async function onClick(e) {
    if(e.target.closest('[data-goods-open]')){openGoods();return;}
    if(e.target.closest('[data-archive-view]')){state.showArchived=!state.showArchived;state.selectedParent='';renderRows();return;}
    if(e.target.closest('[data-stopped-view]')){state.showStopped=!state.showStopped;renderMasterDetail();return;}
    const restore=e.target.closest('[data-parent-restore], [data-detail-restore]');
    if(restore){const before=M.copy(state.data);try{const parentId=restore.dataset.parentRestore||restore.dataset.parent,c=state.data.contracts.find(x=>x.id===parentId);if(!c)throw Error('Không tìm thấy hợp đồng.');const next=M.copy(c);if(restore.dataset.parentRestore)delete next.deletedAt;else{const d=next.details.find(x=>x.id===restore.dataset.detailRestore);if(!d)throw Error('Không tìm thấy chi tiết.');delete d.deletedAt;}const result=upsertContract(next,c.revision);if(result.error)throw Error(result.error);await persist();renderRows();changed();}catch(error){state.data=before;HAK.UI.toast(error.message,'error');}return;}

    const master=e.target.closest('[data-master]');if(master){state.selectedParent=master.dataset.master;renderRows();return;}
    const add=e.target.closest('[data-detail-add]');if(add){openExec(add.dataset.detailAdd);return;}
    const detail=e.target.closest('[data-detail-edit]');if(detail){openExec(detail.dataset.parent,detail.dataset.detailEdit);return;}
    const stop=e.target.closest('[data-detail-archive]');if(stop){
      const before=M.copy(state.data);
      try{const c=contract(stop.dataset.parent);if(!c)throw Error('Không tìm thấy hợp đồng');const next=M.archiveChild(c,stop.dataset.detailArchive),result=upsertContract(next,c.revision);if(result.error)throw Error(result.error);await persist();renderRows();changed();}
      catch(error){state.data=before;HAK.UI.toast(error.message,'error');}return;
    }

    const tab = e.target.closest('[data-ctab]');
    if (tab) { state.tab = tab.dataset.ctab; renderRows(); return; }
    if (e.target.closest('#catAdd')) { openForm(state.tab); return; }
    const ex = e.target.closest('[data-exec]');
    if (ex) { openExec(ex.dataset.exec); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openForm(state.tab === 'exec' ? 'contracts' : state.tab, ed.dataset.edit); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      HAK.UI.confirmClick(del, async () => {
        const before=M.copy(state.data);
        const r = state.tab === 'customers' ? removeCustomer(del.dataset.del) : removeContract(del.dataset.del);
        if (r.error) HAK.UI.toast(r.error, 'warning'); else { try { await persist(); renderRows(); changed(); HAK.UI.toast('Đã cập nhật danh mục.', 'info'); } catch(error) { state.data=before; HAK.UI.toast(error.message,'error'); } }
      }, 'Xóa?');
    }
  }
  async function onImport(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const { Loading, toast } = HAK.UI;
    Loading.show('Đang đọc "' + f.name + '"…');
    try {
      const info = await HAK.Excel.readFile(f);
      const before=M.copy(state.data); let r;
      try { r = importWorkbook(info.workbook); await persist(); } catch(error) { state.data=before; throw error; }
      state.tab = 'contracts'; renderRows(); changed();
      toast('Đã nhập sheet "' + r.sheet + '": ' + r.rows + ' lô — thêm ' + r.addedContracts + ' hợp đồng, cập nhật ' + r.updated + ', thêm ' + r.addedCustomers + ' khách hàng' +
        (r.skipped ? '; bỏ qua ' + r.skipped + ' dòng lỗi (trùng TKHQ / số liệu sai)' : '') + '.', r.skipped ? 'warning' : 'success');
    } catch (err) { console.error(err); toast(err.message || String(err), 'error'); }
    finally { Loading.hide(); }
  }
  /** Báo cho các phần khác (biên bản — Phase 2) biết danh mục vừa đổi. */
  const changed = () => { try { window.dispatchEvent(new CustomEvent('hak:catalog')); } catch (e) { /* bỏ qua */ } };

  function render() { syncCompanies(); build(); renderRows(); }
  function init() { load(); syncCompanies(); build(); if (HAK.NumFmt && $('#catForm')) HAK.NumFmt.attach($('#catForm')); }

  load();   // có dữ liệu ngay khi các module khác cần (trước cả init)
  HAK.Catalog = {
    TYPES, init, render, load, save:persist, persist, syncCompanies,
    customers, contracts: (type) => M.choices(state.data,type), parents: contracts, customer, contract: (id,opts) => M.resolve(state.data,id,opts), parent: contract, byCompany, label, dryActual, relatedTo,
    products:()=>state.data.products||[],upsertProduct,upsertCustomer, removeCustomer, upsertContract, removeContract, importWorkbook,
    util: { tkhqOf, isoOf, vnDate },
    core: { get: () => state.data, set: (d) => { state.data = d; }, persist, changed: () => changed(), render: () => renderRows(), customers }
  };
})(window);
