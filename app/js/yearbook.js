(function (root) {
  'use strict';
  const H = (root.HAK = root.HAK || {}),
    KEY = 'hak.yearbook.v1',
    copy = (x) => JSON.parse(JSON.stringify(x)),
    TYPES = ['guikho', 'xuatkhogui', 'xuatkhau', 'uythac', 'dieuchuyen', 'traodoi', 'xuatban'];
  const empty = () => ({ v: 1, revision: 0, records: [] });
  function yearOf(m) {
    if (Number.isInteger(m.year) && m.year >= 1900 && m.year <= 2200) return m.year;
    const s = String(m.from || '');
    const hit = /^\d{1,2}\/\d{1,2}\/(\d{4})/.exec(s) || /^(\d{4})-/.exec(s);
    return hit ? +hit[1] : null;
  }
  function validate(r) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      !/^[\w-]{1,160}$/.test(r.id) ||
      !TYPES.includes(r.type) ||
      !Number.isInteger(r.year) ||
      r.year < 1900 ||
      r.year > 2200 ||
      !Number.isInteger(r.revision) ||
      r.revision < 1 ||
      !r.params ||
      !Array.isArray(r.rows) ||
      !r.rows.length ||
      !Number.isFinite(r.updatedAt)
    )
      throw Error('Hồ sơ năm không hợp lệ.');
    if (r.rows.some((x) => !x || typeof x !== 'object' || !Number.isFinite(x.net))) throw Error('Dữ liệu phiếu cân không hợp lệ.');
    if (r.context) {
      if (r.context.config && (!Array.isArray(r.context.config.companies) || !Array.isArray(r.context.config.warehouses)))
        throw Error('Cấu hình hồ sơ không hợp lệ.');
      for (const f of r.context.attachments || [])
        if (!f || typeof f.id !== 'string' || typeof f.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.base64))
          throw Error('PDF kèm hồ sơ không hợp lệ.');
    }
    return r;
  }
  function merge(state, incoming) {
    const out = copy(state),
      ids = new Set();
    for (const item of incoming) {
      validate(item);
      if (ids.has(item.id)) throw Error('Trùng mã hồ sơ trong bản sao lưu.');
      ids.add(item.id);
      const at = out.records.findIndex((x) => x.id === item.id);
      if (at < 0) out.records.push(copy(item));
      else if (JSON.stringify(out.records[at]) !== JSON.stringify(item)) {
        const old = out.records[at];
        if (item.revision === old.revision) throw Error('Hai bản hồ sơ cùng phiên bản nhưng khác dữ liệu. Chưa khôi phục.');
        if (item.revision > old.revision) out.records[at] = copy(item);
      }
    }
    return out;
  }
  let cachedState = null;
  async function read() {
    if (!H.DB.usable()) throw Error('Cần IndexedDB hoặc SQLite để lưu hồ sơ lâu dài; không lưu tạm vào RAM.');
    const v = await H.DB.kvGet(KEY);
    cachedState = v === undefined ? empty() : v;
    return cachedState;
  }
  async function commit(expected, change) {
    if (!H.DB.usable()) throw Error('Không mở được kho dữ liệu.');
    const stale = 'Hồ sơ đã thay đổi ở cửa sổ khác. Mở lại trước khi lưu.';
    const raw = await H.DB.kvGet(KEY),
      before = raw === undefined ? empty() : raw;
    if (before.revision !== expected) throw Error(stale);
    const next = change(copy(before));
    next.records.forEach(validate);
    next.revision = before.revision + 1;
    // kiểm lại phiên bản NGAY khi ghi (cửa sổ khác chen giữa lúc đọc và ghi → từ chối)
    await H.DB.kvCas(KEY, (cur) => ((cur === undefined ? empty() : cur).revision !== before.revision ? stale : null), next);
    cachedState = next;
    return next;
  }
  let workingYear = new Date().getFullYear(),
    active = {},
    busy = false,
    offlineView = null,
    needsReload = false;
  try {
    workingYear = +H.Store.get('hak.workingYear', 0) || workingYear;
  } catch (e) {}
  function setYear(y) {
    if (!Number.isInteger(+y) || y < 1900 || y > 2200) throw Error('Năm không hợp lệ.');
    workingYear = +y;
    try {
      H.Store.set('hak.workingYear', +y); // qua HAK.Store: bền trên SQLite / IndexedDB và có trong sao lưu
    } catch (e) {}
    const el = document.getElementById('hakWorkingYear');
    if (el) el.value = y;
  }
  const visible = (r) => {
    const scope = H.Auth && H.Auth.scopeIds ? H.Auth.scopeIds('archive') : null;
    return !scope || scope.includes(r.params.giaoId || '');
  };
  async function context(params) {
    const catalog = copy(H.Store.get('hak.catalog.v1', { v: 3, contracts: [], customers: [], products: [] }));
    const linked = H.Catalog.contract(params.contractId || '', { history: true });
    catalog.contracts = catalog.contracts.filter(
      (c) => c.id === params.parentContractId || (linked && c.id === linked.parentId) || c.id === params.contractId
    );
    const ids = new Set();
    catalog.contracts.forEach((c) => {
      (c.contractFiles || []).forEach((x) => ids.add(typeof x === 'string' ? x : x.id));
      (c.details || []).forEach((d) => {
        if (d.sourcePdfId) ids.add(d.sourcePdfId);
        (d.certificateFiles || []).forEach((x) => ids.add(typeof x === 'string' ? x : x.id));
      });
    });
    const attachments = (await Promise.all(Array.from(ids).map((id) => H.DB.get('attachments', id)))).filter(Boolean);
    const parties = new Set();
    catalog.contracts.forEach((c) => {
      ['exporterId', 'principalId', 'buyerId'].forEach((k) => parties.add(c[k]));
      (c.details || []).forEach((d) => ['deliverId', 'receiverId'].forEach((k) => parties.add(d[k])));
    });
    catalog.customers = (catalog.customers || []).filter((c) => parties.has(c.id));
    return { config: copy(H.Config.data), custom: copy(H.Config.custom), catalog, attachments };
  }
  /**
   * Lưu hồ sơ năm. opts.reason: lý do sửa — BẮT BUỘC khi sửa nội dung của hồ sơ ĐÃ XUẤT (có phiếu / thông số khác bản đã xuất); thiếu → lỗi code 'reason-required'.
   * Mỗi lần sửa giữ lại bản cũ trong versions (kèm trạng thái, lý do, người sửa, thời điểm) để mở / in lại đúng bản đã lưu (openVersion).
   */
  async function save(type, exported, opts) {
    if (needsReload) throw Error('Năm đã đóng. Tải lại ứng dụng trước khi làm việc.');
    if (active[type] && active[type].readonly)
      throw Error(
        active[type].versionView
          ? 'Đang xem một phiên bản cũ (chỉ xem). Mở bản hiện hành trong Sổ hồ sơ năm để sửa.'
          : 'Năm đã đóng đang chỉ xem. Khôi phục năm nếu cần sửa.'
      );
    if (busy) throw Error('Đang lưu hồ sơ.');
    busy = true;
    try {
      const view = H.Pages.snapshot(type);
      if (!view.rows.length) throw Error('Chưa có phiếu cân trong phạm vi chọn.');
      if (!visible({ params: view.params })) throw Error('Hồ sơ không thuộc phạm vi công ty được phép.');
      const current = active[type];
      if (current && current.year !== workingYear) throw Error('Đang mở hồ sơ năm ' + current.year + '. Chọn đúng năm hoặc Thêm mới.');
      const state = await read();
      if (current && current.storeRevision !== state.revision) throw Error('Kho hồ sơ đã thay đổi. Mở lại hồ sơ trước khi lưu.');
      const old = current ? state.records.find((x) => x.id === current.id) : null;
      if (current && (!old || old.revision !== current.revision)) throw Error('Phiên bản hồ sơ đã thay đổi.');
      const changed =
        !!old && (JSON.stringify(old.rows) !== JSON.stringify(view.rows) || JSON.stringify(old.params) !== JSON.stringify(view.params));
      const reason = String((opts && opts.reason) || '').trim();
      if (old && old.status === 'exported' && changed && !reason)
        throw Object.assign(Error('Hồ sơ này đã xuất chứng từ. Ghi lý do trước khi sửa để lưu thành phiên bản mới.'), {
          code: 'reason-required',
        });
      const ctx = current && current.context ? current.context : await context(view.params);
      const now = Date.now();
      const who = (H.Auth && H.Auth.who && H.Auth.who()) || '';
      const record = {
        id: old ? old.id : 'y-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 9),
        type,
        year: workingYear,
        revision: old ? old.revision + 1 : 1,
        createdAt: old ? old.createdAt : now,
        updatedAt: now,
        title: view.params.ship || view.params.contractNo || H.Pages.DOCS[type].title,
        params: view.params,
        rows: view.rows,
        context: ctx,
        status: exported ? 'exported' : 'draft',
        versions: old
          ? [
              ...(old.versions || []),
              {
                revision: old.revision,
                updatedAt: old.updatedAt,
                status: old.status || 'draft',
                params: old.params,
                rows: old.rows,
                supersededBy: { revision: old.revision + 1, at: now, by: who, reason: reason || '', changed },
              },
            ]
          : [],
      };
      validate(record);
      const next = await commit(state.revision, (s) => {
        const at = s.records.findIndex((x) => x.id === record.id);
        if (at < 0) s.records.push(record);
        else s.records[at] = record;
        return s;
      });
      active[type] = { ...record, storeRevision: next.revision };
      if (H.Audit)
        H.Audit.log({
          action: !old ? 'tạo hồ sơ' : old.status === 'exported' && changed ? 'sửa hồ sơ đã xuất' : exported ? 'xuất hồ sơ' : 'sửa hồ sơ',
          entity: 'yearbook',
          id: record.id,
          field: 'revision',
          before: old ? String(old.revision) : null,
          after: String(record.revision),
          reason: reason || null,
          company: (view.params && (view.params.giaoId || view.params.cid)) || null,
        });
      H.UI.toast('Đã lưu hồ sơ năm ' + workingYear + '.', 'success');
      return record;
    } finally {
      busy = false;
    }
  }
  function underContext(record, fn) {
    const config = H.Config.data,
      custom = H.Config.custom;
    try {
      if (record && record.context) {
        H.Config.data = record.context.config || config;
        H.Config.custom = record.context.custom || custom;
      }
      return fn();
    } finally {
      H.Config.data = config;
      H.Config.custom = custom;
    }
  }
  function leaveOffline() {
    offlineView = null;
    for (const t of Object.keys(active))
      if (active[t].readonly) {
        if (H.Pages.unloadSnapshot) H.Pages.unloadSnapshot(t);
        delete active[t];
      }
  }
  /** Lưu; nếu là hồ sơ đã xuất bị sửa thì hỏi lý do (bắt buộc) rồi lưu thành phiên bản mới. Hủy / để trống → không lưu. */
  async function saveAsk(type, exported) {
    try {
      return await save(type, exported);
    } catch (e) {
      if (!(e && e.code === 'reason-required')) throw e;
      const asked = H.Yearbook.askReason ? await H.Yearbook.askReason(e.message) : null;
      const reason = String(asked || '').trim();
      if (!reason) throw Object.assign(Error('Chưa lưu: cần ghi lý do khi sửa hồ sơ đã xuất.'), { code: 'reason-cancelled' });
      return save(type, exported, { reason });
    }
  }
  /** Mở lại đúng một phiên bản cũ của hồ sơ ở chế độ CHỈ XEM (xuất / in lại đúng bản đã lưu; không ghi vào kho). rev = số bản; bản hiện hành cũng mở được. */
  async function openVersion(id, rev) {
    const state = await read(),
      r = state.records.find((x) => x.id === id);
    if (!r || !visible(r)) throw Error('Hồ sơ không còn hoạt động.');
    const v = rev === r.revision ? r : (r.versions || []).find((x) => x.revision === rev);
    if (!v) throw Error('Không có bản ' + rev + ' của hồ sơ này.');
    if (H.Pages.guardLeave && !(await H.Pages.guardLeave(r.type))) return false;
    const view = {
      ...copy(r),
      params: copy(v.params),
      rows: copy(v.rows),
      revision: v.revision,
      updatedAt: v.updatedAt,
      status: v.status || r.status,
    };
    setYear(r.year);
    active[r.type] = { ...view, storeRevision: state.revision, readonly: true, versionView: true };
    H.Pages.openSnapshot(view);
    H.Pages.readOnly(r.type, true);
    const note = root.document && root.document.getElementById('year-note-' + r.type);
    if (note)
      note.textContent =
        'Đang xem bản ' +
        v.revision +
        (v === r ? ' (hiện hành)' : ' — phiên bản cũ') +
        ' · Chỉ xem, có thể xuất / in lại đúng bản này; không ghi vào kho.';
    root.location.hash = '/' + r.type;
    return true;
  }
  async function open(id) {
    const state = await read(),
      offline = offlineView && offlineView.records.find((x) => x.id === id),
      r = offline || state.records.find((x) => x.id === id);
    if (!r || (!offline && r.deletedAt) || !visible(r)) throw Error('Hồ sơ không còn hoạt động.');
    if (H.Pages.guardLeave && !(await H.Pages.guardLeave(r.type))) return false;
    setYear(r.year);
    active[r.type] = { ...copy(r), storeRevision: state.revision, readonly: !!offline };
    H.Pages.openSnapshot(r);
    if (offline) H.Pages.readOnly(r.type, true);
    root.location.hash = '/' + r.type;
  }

  async function toggle(id) {
    const state = await read();
    await commit(state.revision, (s) => {
      const r = s.records.find((x) => x.id === id);
      if (!r || !visible(r)) throw Error('Không tìm thấy hồ sơ.');
      if (r.deletedAt) delete r.deletedAt;
      else r.deletedAt = Date.now();
      r.revision++;
      r.updatedAt = Date.now();
      return s;
    });
  }
  async function backup() {
    const s = await read(),
      records = s.records.filter((r) => r.year === workingYear && visible(r));
    if (!records.length) throw Error('Năm này chưa có hồ sơ.');
    const text = JSON.stringify({ app: 'hak-yearbook', v: 1, year: workingYear, records });
    if (typeof root.JSZip === 'function') {
      const zip = new root.JSZip();
      zip.file('HoSoNam.json', text);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      return H.Word.Files.saveBlob(blob, 'HAK_HoSo_' + workingYear + '.zip');
    }
    return H.Word.Files.saveBlob(new Blob([text], { type: 'application/json' }), 'HAK_HoSo_' + workingYear + '.json');
  }
  async function importState(incoming) {
    const records = Array.isArray(incoming) ? incoming : incoming?.records;
    if (!Array.isArray(records)) throw Error('Dữ liệu sổ hồ sơ trong bản sao lưu không hợp lệ.');
    const state = await read();
    return commit(state.revision, (current) => merge(current, records));
  }
  async function restore(file) {
    const j = H.Backup && H.Backup.readJson ? await H.Backup.readJson(file) : JSON.parse(await file.text());
    if (
      !j ||
      j.app !== 'hak-yearbook' ||
      ![1, 2].includes(j.v) ||
      !Number.isInteger(j.year) ||
      !Array.isArray(j.records) ||
      j.records.some((r) => r.year !== j.year)
    )
      throw Error('Không phải bản sao lưu năm hợp lệ.');
    const state = await read();
    const records = j.v === 2 ? (await H.YearClose.readFile(file)).records : j.records;
    const checked = merge(state, records);
    await commit(state.revision, () => checked);
    offlineView = null;
    setYear(j.year);
    return records.length;
  }
  async function copyLegacy() {
    const all = await H.Archive.list(),
      state = await read(),
      records = [];
    for (const m of all) {
      if (!visible({ params: { giaoId: m.cid || '' } }) || yearOf(m) !== workingYear || state.records.some((r) => r.legacyId === m.id))
        continue;
      const data = await H.Archive.load(m.id);
      records.push({
        id: 'legacy-' + m.id,
        legacyId: m.id,
        type: data.type,
        year: workingYear,
        revision: 1,
        createdAt: m.createdAt || Date.now(),
        updatedAt: m.updatedAt || Date.now(),
        title: m.title,
        params: data.params,
        rows: data.rows,
        context: Object.assign(await context(data.params), { custom: data.custom || {} }),
        status: 'legacy',
        versions: [],
      });
    }
    if (records.length) await commit(state.revision, (s) => merge(s, records));
    return records.length;
  }
  const esc = (s) => H.UI.esc(String(s ?? ''));
  async function show() {
    const existing = document.getElementById('hakYearModal');
    if (existing) return;
    const host = document.createElement('div');
    host.id = 'hakYearModal';
    host.className = 'modal fade';
    host.tabIndex = -1;
    host.setAttribute('aria-labelledby', 'hakYearTitle');
    host.innerHTML =
      '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 id="hakYearTitle">Sổ hồ sơ theo năm</h5><button class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div><div class="modal-body"><div class="d-flex flex-wrap gap-2 mb-3"><label>Năm <input type="number" min="1900" max="2200" value="' +
      workingYear +
      '" class="form-control" data-year></label><button class="btn btn-outline-primary" data-backup>Sao lưu năm</button><button class="btn btn-outline-danger" data-close>Đóng năm ra file và dọn kho</button><label class="btn btn-outline-primary">Mở file năm cũ (chỉ xem)<input type="file" accept=".json,.zip" data-preview hidden></label><button class="btn btn-outline-secondary" data-live>Về kho đang làm việc</button><label class="btn btn-outline-secondary">Khôi phục năm<input type="file" accept=".json,.zip" data-restore hidden></label><button class="btn btn-outline-secondary" data-legacy>Đưa bản sao hồ sơ cũ vào năm này</button></div><p class="small muted">Lưu độc lập với file đã xuất. Hồ sơ đã lưu có dữ liệu cân và thông tin tại thời điểm lưu. Bản sao hồ sơ cũ dùng cấu hình hiện tại nếu bản gốc chưa có cấu hình. Hồ sơ lưu trữ vẫn có thể khôi phục.</p><div data-closed class="mb-2"></div><p role="status" data-status></p><div class="tbl-wrap"><table class="table"><thead><tr><th>Hồ sơ</th><th>Loại</th><th>Cập nhật</th><th>Trạng thái</th><th></th></tr></thead><tbody data-rows></tbody></table></div></div></div></div>';
    document.body.append(host);
    const modal = bootstrap.Modal.getOrCreateInstance(host),
      status = host.querySelector('[data-status]');
    async function draw() {
      const s = await read();
      const isOffline = offlineView && offlineView.year === workingYear;
      host.querySelector('[data-closed]').innerHTML = isOffline
        ? '<div class="alert alert-info">Đang xem riêng file năm ' +
          workingYear +
          '. Không nhập dữ liệu vào kho làm việc. Muốn sửa, dùng Khôi phục năm.<button class="btn btn-sm btn-outline-primary ms-2" data-raw>File cân gốc</button></div>'
        : (s.closed || [])
            .filter((x) => x.year === workingYear)
            .map(
              (x) =>
                '<div class="alert alert-secondary text-break">Năm ' +
                x.year +
                ' · ' +
                (x.pending ? 'File đã kiểm tra; dọn kho chưa hoàn tất' : 'Đã đóng') +
                ' · ' +
                esc(x.path) +
                '<button class="btn btn-sm btn-outline-primary ms-2" data-closed-sha="' +
                esc(x.sha256) +
                '">Chọn file để xem</button>' +
                (x.pending
                  ? '<button class="btn btn-sm btn-warning ms-2" data-resume-close="' +
                    x.year +
                    '" data-resume-sha="' +
                    esc(x.sha256) +
                    '">Tiếp tục đóng năm</button>'
                  : '') +
                '</div>'
            )
            .join('');
      host.querySelector('[data-rows]').innerHTML =
        (isOffline ? offlineView.records : s.records)
          .filter((r) => r.year === workingYear && visible(r))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map(
            (r) =>
              '<tr><td>' +
              esc(r.title) +
              '<div class="small muted">' +
              r.rows.length +
              ' phiếu · bản ' +
              r.revision +
              '</div></td><td>' +
              esc(H.Pages.DOCS[r.type].title) +
              '</td><td>' +
              new Date(r.updatedAt).toLocaleString('vi-VN') +
              '</td><td>' +
              (r.deletedAt ? 'Đã lưu trữ' : r.status === 'exported' ? 'Đã xuất' : r.status === 'legacy' ? 'Bản sao cũ' : 'Đã lưu') +
              '</td><td class="text-nowrap">' +
              (isOffline || !r.deletedAt
                ? '<button class="btn btn-sm btn-primary" data-open="' +
                  esc(r.id) +
                  '">' +
                  (isOffline ? 'Xem hồ sơ' : 'Mở / Sửa') +
                  '</button> <button class="btn btn-sm btn-outline-primary" data-files="' +
                  esc(r.id) +
                  '">PDF kèm theo</button> ' +
                  ((r.versions || []).length
                    ? '<button class="btn btn-sm btn-outline-secondary" data-versions="' +
                      esc(r.id) +
                      '">Phiên bản (' +
                      ((r.versions || []).length + 1) +
                      ')</button> '
                    : '')
                : '') +
              (!isOffline
                ? '<button class="btn btn-sm btn-outline-secondary" data-toggle="' +
                  esc(r.id) +
                  '">' +
                  (r.deletedAt ? 'Khôi phục' : 'Lưu trữ') +
                  '</button>'
                : '') +
              '</td></tr>'
          )
          .join('') ||
        '<tr><td colspan="5">Năm này chưa có hồ sơ. Dùng Lưu hồ sơ trên màn lập chứng từ hoặc đưa bản sao hồ sơ cũ vào.</td></tr>';
    }
    async function run(fn) {
      try {
        host.querySelectorAll('button').forEach((b) => (b.disabled = true));
        await fn();
      } catch (e) {
        status.textContent = e.message;
      } finally {
        host.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    }
    host.querySelector('[data-year]').onchange = (e) =>
      run(async () => {
        setYear(+e.target.value);
        if (offlineView && offlineView.year !== workingYear) leaveOffline();
        await draw();
      });
    host.querySelector('[data-backup]').onclick = () =>
      run(async () => {
        if (await backup()) status.textContent = 'Đã sao lưu năm ' + workingYear;
      });
    host.querySelector('[data-restore]').onchange = (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file)
        run(async () => {
          status.textContent = 'Đã khôi phục ' + (await restore(file)) + ' hồ sơ (gộp, giữ bản mới hơn).';
          host.querySelector('[data-year]').value = workingYear;
          await draw();
        });
    };
    host.querySelector('[data-legacy]').onclick = () =>
      run(async () => {
        status.textContent = 'Đã đưa ' + (await copyLegacy()) + ' bản sao vào sổ năm. Bản gốc giữ nguyên.';
        await draw();
      });
    let expectedFile = null;
    host.querySelector('[data-close]').onclick = () =>
      run(async () => {
        const result = await H.YearClose.closeYear(workingYear);
        if (!result.canceled) {
          modal.hide();
          if (H.reloadAfterWrites) H.reloadAfterWrites();
          else root.location.reload();
        }
      });
    host.querySelector('[data-preview]').onchange = (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file)
        run(async () => {
          const loaded = await H.YearClose.readFile(file, expectedFile);
          leaveOffline();
          offlineView = loaded;
          expectedFile = null;
          setYear(offlineView.year);
          host.querySelector('[data-year]').value = workingYear;
          await draw();
        });
    };
    host.querySelector('[data-live]').onclick = () =>
      run(async () => {
        leaveOffline();
        await draw();
      });
    host.onclick = (e) => {
      if (e.target.dataset.resumeClose) {
        const year = +e.target.dataset.resumeClose,
          sha = e.target.dataset.resumeSha,
          input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = () => {
          const file = input.files[0];
          if (file)
            run(async () => {
              const r = await H.YearClose.resumeClose(year, file, sha);
              if (r.needsReview) {
                const d = r.diffs;
                status.textContent =
                  'CHƯA dọn: có dữ liệu đã thay đổi sau khi đóng dở nên file ZIP không chứa bản mới — cần đối chiếu: ' +
                  d.changedRecords
                    .map((x) => x.title + ' (file v' + x.zipRevision + ' / hiện tại v' + x.liveRevision + ')')
                    .concat(
                      d.changedBatches.map((x) => x.name),
                      d.changedArchive.map((x) => x.title)
                    )
                    .join('; ') +
                  '. Lưu lại bản đúng rồi bấm Đóng năm để tạo file ZIP mới.';
              } else if (r.resumed) {
                status.textContent =
                  'Đã dọn xong năm ' +
                  year +
                  ': ' +
                  r.records +
                  ' hồ sơ, ' +
                  r.archive +
                  ' hồ sơ Lưu trữ cũ, ' +
                  r.batches +
                  ' đợt cân (kỳ vọng ' +
                  r.expected.records +
                  ' / ' +
                  r.expected.archive +
                  ' / ' +
                  r.expected.batches +
                  ').' +
                  (r.leftover.records.length || r.leftover.batches.length
                    ? ' Còn lại ' +
                      r.leftover.records.length +
                      ' hồ sơ và ' +
                      r.leftover.batches.length +
                      ' đợt mới phát sinh sau khi đóng dở — chưa nằm trong file ZIP, hãy đóng năm lại để lưu.'
                    : '');
                await draw();
              } else status.textContent = 'Không có năm nào đang đóng dở.';
            });
        };
        input.click();
        return;
      }
      if (e.target.dataset.closedSha)
        run(async () => {
          expectedFile = (await read()).closed.find((x) => x.sha256 === e.target.dataset.closedSha);
          host.querySelector('[data-preview]').click();
        });
      if (e.target.hasAttribute('data-raw')) {
        status.replaceChildren();
        for (const file of (offlineView && offlineView.batches) || []) {
          const button = document.createElement('button');
          button.className = 'btn btn-sm btn-outline-primary me-2';
          button.textContent = file.meta.fileName;
          button.onclick = async () => {
            const bytes = Uint8Array.from(atob(file.b64), (c) => c.charCodeAt(0));
            await H.Word.Files.saveBlob(new Blob([bytes]), file.meta.fileName);
          };
          status.append(button);
        }
        if (!status.children.length) status.textContent = 'File năm không có Excel gốc; dữ liệu cân nằm trong từng hồ sơ.';
      }
      const id = e.target.dataset.open,
        t = e.target.dataset.toggle,
        f = e.target.dataset.files,
        vr = e.target.dataset.versions;
      if (vr)
        run(async () => {
          const all = offlineView && offlineView.year === workingYear ? offlineView.records : (await read()).records;
          const r = all.find((x) => x.id === vr && visible(x));
          status.replaceChildren();
          if (!r) return void (status.textContent = 'Hồ sơ không còn hoạt động.');
          const label = (v) => (v.status === 'exported' ? 'Đã xuất' : v.status === 'legacy' ? 'Bản sao cũ' : 'Đã lưu');
          const list = [
            ...(r.versions || []).map((v) => ({ ...v, current: false })),
            { revision: r.revision, updatedAt: r.updatedAt, status: r.status, rows: r.rows, current: true },
          ].reverse();
          const ul = document.createElement('ul');
          ul.className = 'list-unstyled small mb-0';
          list.forEach((v) => {
            const li = document.createElement('li');
            li.className = 'mb-1';
            const by = v.supersededBy;
            li.append(
              'Bản ' +
                v.revision +
                (v.current ? ' (hiện hành)' : '') +
                ' · ' +
                new Date(v.updatedAt).toLocaleString('vi-VN') +
                ' · ' +
                label(v) +
                ' · ' +
                (v.rows || []).length +
                ' phiếu'
            );
            if (by && by.reason) li.append(' · bị thay ở bản ' + by.revision + (by.by ? ' bởi ' + by.by : '') + ' — lý do: ' + by.reason);
            const b = document.createElement('button');
            b.className = 'btn btn-sm btn-outline-primary ms-2';
            b.textContent = 'Xem / in lại bản này';
            b.onclick = () =>
              run(async () => {
                if (await openVersion(r.id, v.revision)) modal.hide();
              });
            li.append(b);
            ul.append(li);
          });
          status.append(ul);
        });
      if (f)
        run(async () => {
          const all = offlineView && offlineView.year === workingYear ? offlineView.records : (await read()).records;
          const r = all.find((x) => x.id === f && visible(x));
          const files = (r && r.context && r.context.attachments) || [];
          status.replaceChildren();
          if (!files.length) status.textContent = 'Hồ sơ này chưa lưu PDF đính kèm.';
          for (const file of files) {
            const b = document.createElement('button');
            b.className = 'btn btn-sm btn-outline-primary me-2';
            b.textContent = file.name || 'PDF';
            b.onclick = async () => {
              const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
              await H.Word.Files.saveBlob(new Blob([bytes], { type: 'application/pdf' }), file.name || 'DinhKem.pdf');
            };
            status.append(b);
          }
        });
      if (id)
        run(async () => {
          if (!confirm('Mở hồ sơ đã lưu? Thông tin chưa lưu trên biểu mẫu cùng loại sẽ được thay bằng hồ sơ này.')) return;
          await open(id);
          modal.hide();
        });
      if (t)
        run(async () => {
          await toggle(t);
          await draw();
        });
    };
    host.addEventListener('hidden.bs.modal', () => {
      modal.dispose();
      host.remove();
    });
    modal.show();
    await run(draw);
  }
  function init() {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const label = document.createElement('label');
    label.className = 'd-flex align-items-center gap-2';
    label.textContent = 'Năm';
    const input = document.createElement('input');
    input.id = 'hakWorkingYear';
    input.type = 'number';
    input.min = 1900;
    input.max = 2200;
    input.value = workingYear;
    input.className = 'form-control form-control-sm';
    input.style.width = '90px';
    input.setAttribute('aria-label', 'Năm làm việc');
    input.onchange = () => {
      try {
        setYear(+input.value);
      } catch (e) {
        H.UI.toast(e.message, 'error');
      }
    };
    label.append(input);
    const button = document.createElement('button');
    button.className = 'btn btn-sm btn-outline-primary';
    button.textContent = 'Sổ hồ sơ năm';
    button.onclick = show;
    bar.append(label, button);
  }
  H.Yearbook = {
    yearOf,
    release(year) {
      needsReload = true;
      offlineView = null;
      for (const t of Object.keys(active)) if (active[t].year === year) delete active[t];
    },
    archiveRecord: toggle,
    importState,
    validateBundle: (records) => merge(empty(), records),
    save,
    saveAsk,
    askReason: async (msg) => (root.prompt ? root.prompt(msg + '\n\nLý do sửa (bắt buộc):') : null),
    openVersion,
    open,
    show,
    backup,
    restore,
    copyLegacy,
    read,
    commit,
    underContext,
    get year() {
      return workingYear;
    },
    active: (type) => active[type],
    clear: (type) => {
      delete active[type];
    },
    setCache(s) {
      cachedState = s;
    },
    checkDuplicates(currentRecordId, rows, recordsList) {
      const records = Array.isArray(recordsList)
        ? recordsList
        : (cachedState && cachedState.records) || (offlineView && offlineView.records) || [];
      if (!Array.isArray(rows) || !rows.length || !records.length) return [];
      const usedMap = new Map();
      const keyOf = (row) => {
        if (!row.plate || (!row.ticket && row.ts1 == null && !row.time1)) return null;
        return H.Generator.omitKey(row);
      };
      records.forEach((rec) => {
        if (rec.id === currentRecordId || !visible(rec)) return;
        (rec.rows || []).forEach((r) => {
          const k = keyOf(r);
          if (k !== null) {
            if (!usedMap.has(k)) usedMap.set(k, []);
            usedMap.get(k).push(rec.title || rec.id);
          }
        });
      });
      const duplicates = [];
      rows.forEach((r) => {
        const k = keyOf(r);
        if (usedMap.has(k)) {
          duplicates.push({ row: r, usedIn: usedMap.get(k) });
        }
      });
      return duplicates;
    },
    setYear,
  };
  if (typeof module !== 'undefined') module.exports = { yearOf, validate, merge, empty };
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
