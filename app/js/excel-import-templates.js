/** Cấu hình tái sử dụng để nhập bảng cân. Chỉ lưu tên cột và tùy chọn đọc. */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.excel.import.v1';
  const fields = () => HAK.Excel.FIELDS;
  const labelKey = (text) =>
    String(text || '')
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  const read = () => validate(HAK.Store.get(KEY, { defaultName: '', profiles: [] }));
  function validate(value) {
    if (!value || !Array.isArray(value.profiles) || typeof value.defaultName !== 'string')
      throw Error('Danh sách mẫu nhập Excel không hợp lệ.');
    const names = new Set();
    const allowedFields = new Set(fields().map((f) => f.key));
    for (const p of value.profiles) {
      if (
        !p ||
        typeof p.name !== 'string' ||
        !p.name.trim() ||
        p.name.length > 80 ||
        names.has(p.name) ||
        !Number.isInteger(p.headerRow) ||
        p.headerRow < 1 ||
        p.headerRow > 1048576 ||
        !['kg', 't'].includes(p.weightUnit) ||
        !p.headers ||
        typeof p.headers !== 'object' ||
        Array.isArray(p.headers) ||
        !Object.entries(p.headers).every(([key, val]) => allowedFields.has(key) && typeof val === 'string' && val.trim())
      )
        throw Error('Mẫu nhập Excel có dữ liệu không hợp lệ.');
      if (!p.headers.plate || !(p.headers.date || p.headers.datetime1) || !(p.headers.net || (p.headers.gross && p.headers.tare)))
        throw Error('Mẫu cần có biển số, ngày cân và khối lượng hàng hoặc cả hai cột cân.');
      names.add(p.name);
    }
    if (value.defaultName && !names.has(value.defaultName)) throw Error('Không tìm thấy mẫu nhập Excel mặc định.');
    return value;
  }

  function profileFrom(name, ds, mapping, weightUnit) {
    const headers = {};
    const selected = new Set();
    for (const field of fields()) {
      const index = mapping[field.key];
      if (!Number.isInteger(index) || index < 0) continue;
      const header = ds.columns[index]?.header;
      const key = labelKey(header);
      if (!key || ds.columns.filter((c) => labelKey(c.header) === key).length !== 1)
        throw Error('Cột ' + field.label + ' cần có tiêu đề riêng để nhận diện lần sau.');
      if (selected.has(index)) throw Error('Mỗi cột Excel chỉ nên ghép với một trường của mẫu.');
      selected.add(index);
      headers[field.key] = header;
    }
    const profile = { name: name.trim(), headerRow: ds.headerExcelRow, weightUnit, headers };
    validate({ defaultName: '', profiles: [profile] });
    return profile;
  }

  function resolve(workbook, sheet, profile) {
    const inspect = (headerRow) => HAK.Excel.parseSheet(workbook, sheet, { headerRow, inspectOnly: true });
    const savedRow = inspect(profile.headerRow);
    const map = (ds) => {
      if (!ds.headerExcelRow) return null;
      const mapping = Object.fromEntries(fields().map((f) => [f.key, -1]));
      for (const [field, header] of Object.entries(profile.headers)) {
        const matches = ds.columns.filter((c) => labelKey(c.header) === labelKey(header));
        if (matches.length !== 1) return null;
        mapping[field] = matches[0].index;
      }
      return { sheet, headerRow: ds.headerExcelRow, mapping, weightUnit: profile.weightUnit };
    };
    return map(savedRow) || map(inspect());
  }

  let refresh = () => {};
  function init(panel) {
    const { esc, toast } = HAK.UI;
    panel.innerHTML = `
      <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div><label class="form-label" for="excelImportDefault">Mẫu đã lưu</label>
        <select class="form-select" id="excelImportDefault"></select></div>
        <button class="btn btn-outline-primary" id="excelImportSetDefault" type="button">Lưu mặc định</button>
        <button class="btn btn-outline-secondary" id="excelImportNew" type="button">Mẫu mới</button>
        <button class="btn btn-outline-secondary" id="excelImportEdit" type="button">Sửa mẫu đang chọn</button>
        <button class="btn btn-outline-danger" id="excelImportDelete" type="button">Xóa mẫu đang chọn</button>
      </div>
      <div id="excelImportActive" class="fw-semibold mb-1"></div>
      <p class="muted small">Mẫu mặc định dùng cho file mới. Khi tiêu đề đã ghép bị thiếu hoặc bị trùng, app yêu cầu sửa mẫu trước khi nhập.</p>
      <div class="row g-2 mb-3 align-items-end">
        <div class="col-sm-6"><label class="form-label" for="excelImportFile">Tệp Excel mẫu</label>
          <input class="form-control" id="excelImportFile" type="file" accept=".xlsx,.xls,.xlsm,.csv"></div>
        <div class="col-sm-6"><label class="form-label" for="excelImportSheet">Sheet</label>
          <select class="form-select" id="excelImportSheet" disabled></select></div>
        <div class="col-sm-4"><label class="form-label" for="excelImportHeader">Dòng tiêu đề</label>
          <input class="form-control" id="excelImportHeader" type="number" min="1" max="1048576" placeholder="Tự dò"></div>
        <div class="col-sm-4"><label class="form-label" for="excelImportUnit">Đơn vị khi file không ghi</label>
          <select class="form-select" id="excelImportUnit"><option value="kg">kg</option><option value="t">tấn</option></select></div>
        <div class="col-sm-4"><label class="form-label" for="excelImportName">Tên mẫu</label>
          <input class="form-control" id="excelImportName" maxlength="80" placeholder="VD: Bảng cân nhà máy"></div>
      </div>
      <div id="excelImportMapping" class="row row-cols-1 row-cols-lg-2 gx-4 gy-2"></div>
      <div class="d-flex flex-wrap gap-2 align-items-center mt-3">
        <button class="btn btn-outline-primary" id="excelImportPreview" type="button" disabled>Đọc thử</button>
        <button class="btn btn-primary" id="excelImportSave" type="button" disabled>Lưu mẫu</button>
        <div id="excelImportResult" role="status"></div>
      </div>`;
    const el = (name) => panel.querySelector('#excelImport' + name);
    let workbook = null;
    let editing = null;
    let sheetData = null;
    let readTicket = 0;
    async function save(value, message) {
      if (!HAK.Auth.isAdmin()) return;
      if (!HAK.Store.set(KEY, validate(value))) throw Error('Không lưu được mẫu Excel.');
      await HAK.Store.flush();
      refresh();
      toast(message, 'success');
    }
    refresh = () => {
      const { profiles, defaultName } = read();
      el('Default').innerHTML =
        '<option value="">Tự nhận diện</option>' +
        profiles.map((p) => '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>').join('');
      el('Default').value = defaultName;
      el('Active').textContent = 'Đang dùng: ' + (defaultName || 'Tự nhận diện');
      el('Delete').disabled = el('Edit').disabled = !el('Default').value;
    };
    refresh();
    const report = (message, error) => {
      el('Result').className = error ? 'text-danger' : 'text-success';
      el('Result').textContent = message;
    };
    const handle = (fn) => async () => {
      try {
        await fn();
      } catch (e) {
        report(e.message, true);
      }
    };
    function inspect() {
      sheetData = workbook
        ? HAK.Excel.parseSheet(workbook, el('Sheet').value, {
            headerRow: Number(el('Header').value) || null,
            inspectOnly: true,
          })
        : null;
      el('Preview').disabled = el('Save').disabled = !sheetData?.columns.length;
      el('Mapping').innerHTML = !sheetData?.columns.length
        ? ''
        : fields()
            .map(
              (f) => `
        <div class="col"><label class="form-label fw-semibold small mb-1" for="excelField-${f.key}">${esc(f.label)}</label>
        <select class="form-select form-select-sm" id="excelField-${f.key}" data-excel-field="${f.key}">
          <option value="-1">— Không ghép —</option>
          ${sheetData.columns.map((c) => `<option value="${c.index}"${sheetData.autoMapping[f.key] === c.index ? ' selected' : ''}>${esc(c.letter + ' · ' + c.label)}</option>`).join('')}
        </select></div>`
            )
            .join('');
      if (editing && sheetData?.columns.length) {
        for (const select of el('Mapping').querySelectorAll('[data-excel-field]')) {
          const key = labelKey(editing.headers[select.dataset.excelField]);
          const matches = sheetData.columns.filter((column) => key && labelKey(column.header) === key);
          select.value = matches.length === 1 ? String(matches[0].index) : '-1';
        }
      }
      report(
        sheetData?.errors[0] || (sheetData?.headerExcelRow ? 'Tiêu đề ở dòng ' + sheetData.headerExcelRow + '.' : ''),
        !!sheetData?.errors.length
      );
    }
    function preview() {
      const mapping = Object.fromEntries(
        Array.from(el('Mapping').querySelectorAll('[data-excel-field]'), (s) => [s.dataset.excelField, Number(s.value)])
      );
      const config = { sheet: el('Sheet').value, headerRow: sheetData.headerExcelRow, mapping, weightUnit: el('Unit').value };
      const { ds, dups } = HAK.ReadConfig.probeRead(workbook, config, HAK.Config.data.general.autoSwap);
      if (!ds.ok) throw Error(ds.errors.join('; '));
      if (dups.length) throw Error(HAK.ReadConfig.dupSummary(dups));
      report(
        ds.stats.trips +
          ' phiếu cân · ' +
          ds.stats.kg.toLocaleString('vi-VN') +
          ' kg.' +
          (ds.warnings.length ? ' ' + ds.warnings.join(' ') : ''),
        false
      );
      return mapping;
    }
    el('File').addEventListener(
      'change',
      handle(async () => {
        const ticket = ++readTicket;
        workbook = null;
        el('Sheet').innerHTML = '';
        el('Sheet').disabled = true;
        if (!editing) el('Header').value = '';
        inspect();
        const file = el('File').files[0];
        if (!file) return;
        const info = await HAK.Excel.readFile(file);
        if (ticket !== readTicket) return;
        workbook = info.workbook;
        el('Sheet').innerHTML = info.sheetNames.map((s) => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
        el('Sheet').disabled = false;
        inspect();
      })
    );
    el('Sheet').addEventListener('change', handle(inspect));
    el('Header').addEventListener('change', handle(inspect));
    el('Preview').addEventListener('click', handle(preview));
    el('Save').addEventListener(
      'click',
      handle(async () => {
        const profile = profileFrom(el('Name').value, sheetData, preview(), el('Unit').value);
        const { profiles, defaultName } = read();
        if (profiles.some((p) => p.name === profile.name) && !root.confirm('Ghi đè mẫu "' + profile.name + '"?')) return;
        await save({ profiles: [...profiles.filter((p) => p.name !== profile.name), profile], defaultName }, 'Đã lưu mẫu Excel.');
        editing = profile;
        el('Default').value = profile.name;
        el('Delete').disabled = el('Edit').disabled = false;
      })
    );
    el('Default').addEventListener('change', () => {
      el('Delete').disabled = el('Edit').disabled = !el('Default').value;
    });
    el('New').addEventListener(
      'click',
      handle(() => {
        editing = null;
        el('Name').value = '';
        el('Header').value = '';
        el('Unit').value = 'kg';
        inspect();
        el('Name').focus();
      })
    );
    el('Edit').addEventListener(
      'click',
      handle(() => {
        editing = read().profiles.find((profile) => profile.name === el('Default').value);
        if (!editing) return;
        el('Name').value = editing.name;
        el('Header').value = editing.headerRow;
        el('Unit').value = editing.weightUnit;
        if (workbook) inspect();
        else report('Chọn tệp Excel mẫu để xem và sửa cách ghép cột.', false);
      })
    );
    el('SetDefault').addEventListener(
      'click',
      handle(async () => {
        const { profiles } = read();
        await save({ profiles, defaultName: el('Default').value }, 'Đã lưu cách nhập mặc định.');
      })
    );
    el('Delete').addEventListener(
      'click',
      handle(async () => {
        const name = el('Default').value;
        if (!name || !root.confirm('Xóa mẫu "' + name + '"?')) return;
        const { profiles, defaultName } = read();
        await save(
          { profiles: profiles.filter((p) => p.name !== name), defaultName: name === defaultName ? '' : defaultName },
          'Đã xóa mẫu Excel.'
        );
      })
    );
  }

  HAK.ExcelImportTemplates = {
    init,
    validate,
    profileFrom,
    resolve,
    refresh: () => refresh(),
    defaultProfile() {
      const { defaultName, profiles } = read();
      return profiles.find((p) => p.name === defaultName) || null;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
