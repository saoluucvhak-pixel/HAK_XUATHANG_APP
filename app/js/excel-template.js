/**
 * excel-template.js — Quản lý Mẫu nhập Excel (Cài đặt → Mẫu nhập Excel).
 * Cho phép quản trị viên cấu hình mẫu phiếu cân theo từng nhà cung cấp:
 *  - Dòng tiêu đề
 *  - Ghép cột theo tên tiêu đề (vẫn nhận đúng khi cột đổi thứ tự)
 *  - Đơn vị dự phòng (kg / tấn)
 *  - Đọc thử và đối chiếu trước khi lưu
 *  - Đặt làm mặc định hoặc chọn Tự nhận diện
 *  - Độc lập với file Excel (file chỉ giữ trên máy người dùng lúc cấu hình).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.excel.templates.v1';

  const TEMPLATE_FIELDS = [
    { key: 'ticket', label: 'Số phiếu', req: false },
    { key: 'plate', label: 'Biển số xe', req: true },
    { key: 'date', label: 'Ngày cân (hoặc Ngày giờ cân)', req: true },
    { key: 'timeIn', label: 'Giờ cân vào (lần 1)', req: false },
    { key: 'timeOut', label: 'Giờ cân ra (lần 2)', req: false },
    { key: 'net', label: 'Khối lượng hàng', req: true, note: 'Bắt buộc nếu không có cả hai cột Cân 1 và Cân 2' },
    { key: 'tare', label: 'Cân lần 1 (xe không)', req: false },
    { key: 'gross', label: 'Cân lần 2 (có hàng)', req: false },
    { key: 'unit', label: 'Đơn vị tính (kg / tấn)', req: false },
    { key: 'wh', label: 'Kho nhận / xuất', req: false },
    { key: 'note', label: 'Nhãn / Ghi chú (tàu…)', req: false },
    { key: 'driver', label: 'Tài xế', req: false },
    { key: 'carrier', label: 'Đơn vị vận chuyển', req: false },
  ];

  function norm(s) {
    if (HAK.Excel && HAK.Excel.util && HAK.Excel.util.norm) return HAK.Excel.util.norm(s);
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9/ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const headerKey = (value) => norm(String(value ?? '').replace(/[()]/g, ' '));
  const withoutWeightUnit = (title) => title.replace(/ (kg|tan|t)$/, '');

  function store() {
    return HAK.Store;
  }

  const ExcelTemplate = {
    FIELDS: TEMPLATE_FIELDS,
    norm,

    load() {
      const def = { templates: [], defaultId: null };
      if (!store()) return def;
      const data = store().get(KEY, def);
      if (!data || typeof data !== 'object') return def;
      if (!Array.isArray(data.templates)) data.templates = [];
      return data;
    },

    saveData(data) {
      if (!store()) return false;
      return store().set(KEY, data);
    },

    list() {
      return this.load().templates || [];
    },

    get(id) {
      if (!id) return null;
      return this.list().find((t) => t.id === id) || null;
    },

    getDefaultId() {
      return this.load().defaultId || null;
    },

    getDefault() {
      const defId = this.getDefaultId();
      if (!defId) return null;
      return this.get(defId);
    },

    setDefault(id) {
      const data = this.load();
      data.defaultId = id && id !== 'auto' ? id : null;
      data.templates.forEach((t) => {
        t.isDefault = t.id === data.defaultId;
      });
      this.saveData(data);
      return data.defaultId;
    },

    save(tpl) {
      if (!tpl || typeof tpl !== 'object') throw new Error('Dữ liệu mẫu không hợp lệ.');
      const name = String(tpl.name || '').trim();
      if (!name) throw new Error('Vui lòng nhập tên mẫu phiếu cân.');

      const data = this.load();
      const now = Date.now();
      const id = tpl.id || 'tpl_' + now.toString(36) + Math.random().toString(36).slice(2, 6);

      const clean = {
        id,
        name,
        sheet: typeof tpl.sheet === 'string' ? tpl.sheet.trim() : '',
        headerRow: Math.max(1, parseInt(tpl.headerRow, 10) || 1),
        headerNames: Object.assign({}, tpl.headerNames || {}),
        columns: Object.assign({}, tpl.columns || {}),
        fallbackUnit: tpl.fallbackUnit === 'tan' ? 'tan' : 'kg',
        isDefault: !!tpl.isDefault,
        createdAt: tpl.createdAt || now,
        updatedAt: now,
      };

      const idx = data.templates.findIndex((t) => t.id === id);
      if (idx >= 0) {
        data.templates[idx] = clean;
      } else {
        data.templates.push(clean);
      }

      if (clean.isDefault || data.defaultId === id) {
        data.defaultId = id;
        data.templates.forEach((t) => {
          t.isDefault = t.id === id;
        });
      }

      this.saveData(data);
      return clean;
    },

    copy(id) {
      const orig = this.get(id);
      if (!orig) throw new Error('Không tìm thấy mẫu cần sao chép.');
      const copyTpl = {
        name: orig.name + ' (bản sao)',
        sheet: orig.sheet,
        headerRow: orig.headerRow,
        headerNames: Object.assign({}, orig.headerNames || {}),
        columns: Object.assign({}, orig.columns || {}),
        fallbackUnit: orig.fallbackUnit,
        isDefault: false,
      };
      return this.save(copyTpl);
    },

    remove(id) {
      const data = this.load();
      const idx = data.templates.findIndex((t) => t.id === id);
      if (idx < 0) return false;
      data.templates.splice(idx, 1);
      if (data.defaultId === id) {
        data.defaultId = null;
      }
      this.saveData(data);
      return true;
    },

    /**
     * So khớp mẫu với dòng tiêu đề của sheet.
     * Ghép theo TÊN TIÊU ĐỀ ĐÃ LƯU (headerNames) để giữ tính chính xác khi cột đổi thứ tự.
     * @param {Object} template Cấu hình mẫu
     * @param {Array<string>} headerCells Mảng các ô tiêu đề trên dòng headerRow
     * @returns {{ ok: boolean, mapping: Object, matchedHeaders: Object, missing: Array, duplicates: Array, errors: Array, warnings: Array }}
     */
    matchTemplate(template, headerCells) {
      if (!template || !headerCells || !headerCells.length) {
        return {
          ok: false,
          mapping: {},
          matchedHeaders: {},
          missing: [],
          duplicates: [],
          errors: ['Không có dòng tiêu đề.'],
          warnings: [],
        };
      }

      const mapping = {};
      const matchedHeaders = {};
      const missing = [];
      const duplicates = [];
      const errors = [];
      const warnings = [];

      const normalizedHeaders = headerCells.map((h, idx) => ({
        idx,
        raw: String(h == null ? '' : h).trim(),
        key: headerKey(h),
      }));

      const headerNames = template.headerNames || {};
      const configuredFields = new Set([...Object.keys(headerNames), ...Object.keys(template.columns || {})]);
      const assigned = new Map();

      for (const field of [...TEMPLATE_FIELDS, { key: 'datetime1' }]) {
        const fieldKey = field.key;
        if (!configuredFields.has(fieldKey)) continue;
        const targetHeader = headerNames[fieldKey];
        const targetKey = headerKey(targetHeader);
        const position = template.columns?.[fieldKey];
        let matches = [];
        if (targetKey) {
          matches = normalizedHeaders.filter((col) => col.key === targetKey);
          // Tiêu đề cột cân có thể ghi thêm đơn vị. Giữ các phần phân biệt như "tươi" và "khô".
          if (!matches.length && ['net', 'tare', 'gross'].includes(fieldKey)) {
            matches = normalizedHeaders.filter((col) => col.key && withoutWeightUnit(col.key) === withoutWeightUnit(targetKey));
          }
        } else if (!targetHeader && Number.isInteger(position) && normalizedHeaders[position]?.raw === '') {
          // Vị trí chỉ áp dụng cho cột không có tiêu đề mà người dùng đã chọn khi tạo mẫu.
          matches = [normalizedHeaders[position]];
        }
        if (matches.length > 1) {
          duplicates.push({ fieldKey, name: targetHeader, cols: matches.map((c) => c.idx) });
        }
        if (matches.length !== 1) {
          mapping[fieldKey] = -1;
          if (!matches.length) {
            missing.push({ fieldKey, name: targetHeader });
            warnings.push('Không tìm thấy cột "' + (targetHeader || field.label || fieldKey) + '" theo cấu hình mẫu.');
          }
          continue;
        }
        const chosen = matches[0];
        const previous = assigned.get(chosen.idx);
        if (previous) {
          errors.push(
            'Cột "' + (chosen.raw || chosen.idx + 1) + '" được ghép cho cả ' + previous + ' và ' + (field.label || fieldKey) + '.'
          );
        }
        assigned.set(chosen.idx, field.label || fieldKey);
        mapping[fieldKey] = chosen.idx;
        matchedHeaders[fieldKey] = chosen.raw;
      }

      // Kiểm tra các trường bắt buộc
      const has = (k) => mapping[k] >= 0;
      if (!has('plate')) {
        errors.push('Thiếu cột Biển số xe (mẫu yêu cầu tiêu đề: "' + (headerNames.plate || 'Biển số') + '").');
      }
      if (!has('date') && !has('datetime1')) {
        errors.push('Thiếu cột Ngày giờ cân (mẫu yêu cầu tiêu đề: "' + (headerNames.date || 'Ngày cân') + '").');
      }
      if (!has('net') && !(has('tare') && has('gross'))) {
        errors.push('Thiếu cột Khối lượng hàng (cần cột Khối lượng hoặc cả hai cột Cân lần 1 và Cân lần 2).');
      }
      if (duplicates.length) {
        duplicates.forEach((d) => {
          errors.push('Trùng tiêu đề "' + d.name + '" ở nhiều cột trong file Excel (cột ' + d.cols.map((c) => c + 1).join(', ') + ').');
        });
      }

      return {
        ok: errors.length === 0,
        mapping,
        matchedHeaders,
        missing,
        duplicates,
        errors,
        warnings,
      };
    },

    matchSheet(workbook, sheetName, template) {
      const ws = workbook.Sheets?.[sheetName];
      const range = root.XLSX.utils.decode_range(ws?.['!ref'] || 'A1');
      const row = (template.headerRow || 1) - 1;
      const headerCells =
        ws && row >= range.s.r && row <= range.e.r
          ? root.XLSX.utils.sheet_to_json(ws, {
              header: 1,
              raw: true,
              defval: null,
              blankrows: true,
              range: { s: { r: row, c: range.s.c }, e: { r: row, c: range.e.c } },
            })[0] || []
          : [];
      return { ...this.matchTemplate(template, headerCells), headerCells };
    },

    /**
     * Đọc thử một file mẫu với cấu hình mẫu.
     * @param {Object} workbook Workbook SheetJS
     * @param {string} sheetName Tên sheet
     * @param {Object} template Cấu hình mẫu
     * @param {boolean} autoSwap Tự hoán đổi cân lần 1/2
     * @returns {{ ok: boolean, ds: Object, match: Object, stats: Object, sampleRows: Array, warnings: Array, errors: Array, reconciliation: Object }}
     */
    probeTemplate(workbook, sheetName, template, autoSwap) {
      if (!workbook) return { ok: false, errors: ['Chưa chọn file Excel mẫu.'] };
      const sName = sheetName || (workbook.SheetNames && workbook.SheetNames[0]);
      const ws = workbook.Sheets && workbook.Sheets[sName];
      if (!ws) return { ok: false, errors: ['Không tìm thấy sheet "' + sName + '" trong file mẫu.'] };

      const hr1 = Math.max(1, parseInt(template.headerRow, 10) || 1);
      const match = this.matchSheet(workbook, sName, { ...template, headerRow: hr1 });

      let ds;
      try {
        ds = HAK.Excel.parseSheet(workbook, sName, {
          headerRow: hr1,
          mapping: match.mapping,
          fallbackUnit: template.fallbackUnit,
          autoSwap: !!autoSwap,
        });
      } catch (e) {
        ds = { ok: false, errors: [e.message || String(e)], rows: [], warnings: [] };
      }

      const allWarnings = [...(match.warnings || []), ...(ds.warnings || [])];
      const allErrors = [...(match.errors || []), ...(ds.errors || [])];

      let reconciliation = null;
      if (ds.meta && (ds.meta.declaredTrips !== null || ds.meta.declaredKg !== null)) {
        const declaredTrips = ds.meta.declaredTrips;
        const declaredKg = ds.meta.declaredKg;
        const parsedTrips =
          (ds.stats ? ds.stats.trips : 0) + (ds.cancelled ? ds.cancelled.length : 0) + (ds.excluded ? ds.excluded.length : 0);
        const parsedKg = (ds.stats ? ds.stats.kg : 0) + (ds.cancelledKg || 0) + (ds.excludedKg || 0);

        reconciliation = {
          declaredTrips,
          declaredKg,
          parsedTrips,
          parsedKg,
          diffTrips: declaredTrips !== null ? parsedTrips - declaredTrips : null,
          diffKg: declaredKg !== null ? parsedKg - declaredKg : null,
        };
      }

      return {
        ok: ds.ok && match.ok,
        ds,
        match,
        headerCells: match.headerCells,
        stats: ds.stats || null,
        sampleRows: ds.rows ? ds.rows.slice(0, 10) : [],
        warnings: allWarnings,
        errors: allErrors,
        reconciliation,
      };
    },

    /* ===============================================================
     * Giao diện Cài đặt → Mẫu nhập Excel
     * ============================================================= */
    _state: {
      editingId: null,
      tempWb: null,
      tempFileName: '',
      currentSheet: '',
      currentHeaderRow: 1,
      currentHeaders: [],
      probeResult: null,
    },

    initUI() {
      const container = document.getElementById('tab-excel-tpl');
      if (!container) return;
      this.renderUI();
    },

    renderUI() {
      const el = document.getElementById('tab-excel-tpl');
      if (!el) return;

      const data = this.load();
      const defaultId = data.defaultId;
      const templates = data.templates;

      const defaultTpl = defaultId ? templates.find((t) => t.id === defaultId) : null;
      const defaultText = defaultTpl
        ? '<span class="badge text-bg-success py-1 px-2 fs-6">Mẫu: ' + HAK.UI.esc(defaultTpl.name) + '</span>'
        : '<span class="badge text-bg-primary py-1 px-2 fs-6">Tự nhận diện (mặc định app)</span>';

      let html =
        '<div class="card mb-3">' +
        '  <div class="card-header d-flex flex-wrap align-items-center gap-2">' +
        '    <div class="fw-semibold">📊 Cấu hình Mẫu nhập Excel</div>' +
        '    <div class="ms-md-auto d-flex flex-wrap align-items-center gap-2">' +
        '      <span class="small muted">Mẫu mặc định đang dùng:</span> ' +
        defaultText +
        '      <button class="btn btn-sm btn-outline-success" type="button" data-sample-xlsx title="Tải file Excel mẫu chuẩn (gồm 4 sheet: Bảng cân, DS Xe - Tài xế, Mã ĐVVC, Hướng dẫn)">⬇ Tải file mẫu chuẩn</button>' +
        '      <button class="btn btn-sm btn-outline-secondary" id="tplSetAutoDefault" type="button" title="Đặt Tự nhận diện làm mặc định">⚙️ Dùng Tự nhận diện</button>' +
        '      <button class="btn btn-sm btn-primary" id="tplBtnNew" type="button">＋ Tạo mẫu mới</button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="card-body p-0">' +
        '    <div class="tbl-wrap" style="max-height:none">' +
        '      <table class="table align-middle mb-0 set-tbl">' +
        '        <thead>' +
        '          <tr>' +
        '            <th style="min-width:180px">Tên mẫu phiếu cân</th>' +
        '            <th>Dòng tiêu đề</th>' +
        '            <th>Cột đã ghép</th>' +
        '            <th>Đơn vị</th>' +
        '            <th>Mặc định</th>' +
        '            <th style="min-width:280px">Thao tác</th>' +
        '          </tr>' +
        '        </thead>' +
        '        <tbody id="tplTableBody">';

      if (!templates.length) {
        html +=
          '<tr><td colspan="6" class="text-center text-muted py-4">' +
          'Chưa có mẫu phiếu cân nào được cấu hình. Hệ thống đang dùng chế độ <b>Tự nhận diện</b> của app.<br>' +
          'Bấm <b>＋ Tạo mẫu mới</b> để cấu hình mẫu cho nhà cung cấp của bạn.</td></tr>';
      } else {
        templates.forEach((t) => {
          const isDef = t.id === defaultId;
          const mappedNames = Object.entries(t.headerNames || {})
            .filter(([, v]) => v)
            .map(([k, v]) => {
              const f = TEMPLATE_FIELDS.find((x) => x.key === k);
              return (f ? f.label : k) + ': <i>' + HAK.UI.esc(v) + '</i>';
            })
            .join(', ');

          html +=
            '<tr>' +
            '  <td><b>' +
            HAK.UI.esc(t.name) +
            '</b>' +
            (t.sheet ? '<div class="small muted">Sheet: ' + HAK.UI.esc(t.sheet) + '</div>' : '') +
            '</td>' +
            '  <td>Dòng ' +
            t.headerRow +
            '</td>' +
            '  <td class="small" style="max-width:320px">' +
            (mappedNames || '<span class="muted">(chưa ghép)</span>') +
            '</td>' +
            '  <td>' +
            (t.fallbackUnit === 'tan' ? '<span class="badge text-bg-warning">Tấn</span>' : '<span class="badge text-bg-info">kg</span>') +
            '</td>' +
            '  <td>' +
            (isDef
              ? '<span class="badge text-bg-success">★ Mặc định</span>'
              : '<button class="btn btn-xs btn-outline-success btn-set-default" data-id="' + t.id + '">Đặt làm mặc định</button>') +
            '</td>' +
            '  <td>' +
            '    <div class="btn-group btn-group-sm">' +
            '      <button class="btn btn-outline-success btn-tpl-dl" data-id="' +
            t.id +
            '" title="Tải file Excel mẫu (.xlsx) theo đúng các cột của mẫu này">📥 Tải mẫu</button>' +
            '      <button class="btn btn-outline-primary btn-tpl-edit" data-id="' +
            t.id +
            '" title="Sửa mẫu">✏️ Sửa</button>' +
            '      <button class="btn btn-outline-secondary btn-tpl-copy" data-id="' +
            t.id +
            '" title="Sao chép mẫu">📋 Sao chép</button>' +
            '      <button class="btn btn-outline-danger btn-tpl-del" data-id="' +
            t.id +
            '" title="Xóa mẫu">🗑️ Xóa</button>' +
            '    </div>' +
            '  </td>' +
            '</tr>';
        });
      }

      html +=
        '        </tbody>' +
        '      </table>' +
        '    </div>' +
        '  </div>' +
        '</div>' +
        '<div id="tplWizardCard" class="card d-none border-primary">' +
        '  <div class="card-header bg-primary text-white d-flex align-items-center">' +
        '    <span class="fw-semibold" id="tplWizardTitle">🛠️ Cấu hình Mẫu nhập Excel</span>' +
        '    <button type="button" class="btn-close btn-close-white ms-auto" id="tplWizardClose" aria-label="Đóng"></button>' +
        '  </div>' +
        '  <div class="card-body" id="tplWizardBody"></div>' +
        '</div>';

      el.innerHTML = html;
      this.bindListEvents();
    },

    bindListEvents() {
      const el = document.getElementById('tab-excel-tpl');
      if (!el) return;

      const btnNew = el.querySelector('#tplBtnNew');
      if (btnNew) btnNew.addEventListener('click', () => this.openWizard(null));

      const btnAuto = el.querySelector('#tplSetAutoDefault');
      if (btnAuto)
        btnAuto.addEventListener('click', () => {
          this.setDefault(null);
          HAK.UI.toast('Đã chuyển sang chế độ "Tự nhận diện" làm mặc định.', 'success');
          this.renderUI();
        });

      el.querySelectorAll('.btn-set-default').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.setDefault(id);
          const t = this.get(id);
          HAK.UI.toast('Đã đặt "' + (t ? t.name : '') + '" làm mẫu mặc định.', 'success');
          this.renderUI();
        });
      });

      el.querySelectorAll('.btn-tpl-dl').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          try {
            await this.downloadTemplateFile(id);
            HAK.UI.toast('Đang tạo và tải file Excel mẫu...', 'success');
          } catch (e) {
            HAK.UI.toast('Lỗi tải file mẫu: ' + e.message, 'error');
          }
        });
      });

      el.querySelectorAll('.btn-tpl-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openWizard(id);
        });
      });

      el.querySelectorAll('.btn-tpl-copy').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          try {
            const copied = this.copy(id);
            HAK.UI.toast('Đã nhân bản mẫu thành "' + copied.name + '".', 'success');
            this.renderUI();
          } catch (e) {
            HAK.UI.toast(e.message, 'error');
          }
        });
      });

      el.querySelectorAll('.btn-tpl-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const t = this.get(id);
          if (!t) return;
          if (confirm('Bạn có chắc muốn xóa mẫu "' + t.name + '"?')) {
            this.remove(id);
            HAK.UI.toast('Đã xóa mẫu "' + t.name + '".', 'info');
            this.renderUI();
          }
        });
      });

      const btnClose = el.querySelector('#tplWizardClose');
      if (btnClose)
        btnClose.addEventListener('click', () => {
          const card = el.querySelector('#tplWizardCard');
          if (card) card.classList.add('d-none');
        });
    },

    openWizard(templateId) {
      const card = document.getElementById('tplWizardCard');
      const body = document.getElementById('tplWizardBody');
      const title = document.getElementById('tplWizardTitle');
      if (!card || !body) return;

      const tpl = templateId ? this.get(templateId) : null;
      this._state.editingId = templateId || null;
      this._state.tempWb = null;
      this._state.tempFileName = '';
      this._state.currentSheet = tpl ? tpl.sheet || '' : '';
      this._state.currentHeaderRow = tpl ? tpl.headerRow || 1 : 1;
      this._state.currentHeaders = [];
      this._state.probeResult = null;

      title.textContent = tpl ? '✏️ Chỉnh sửa mẫu: ' + tpl.name : '＋ Tạo mới Mẫu nhập Excel';
      card.classList.remove('d-none');
      card.scrollIntoView({ behavior: 'smooth' });

      this.renderWizardStep(tpl);
    },

    renderWizardStep(tpl) {
      const body = document.getElementById('tplWizardBody');
      if (!body) return;

      const tName = tpl ? tpl.name : '';
      const fallbackUnit = tpl ? tpl.fallbackUnit || 'kg' : 'kg';
      const isDefault = tpl ? !!tpl.isDefault : false;

      let html =
        '<div class="wizard-steps">' +
        // Bước 1: Chọn file mẫu
        '  <div class="p-3 mb-3 border rounded bg-light-subtle">' +
        '    <h6 class="text-primary fw-bold mb-2">1. Chọn file Excel mẫu & Dòng tiêu đề</h6>' +
        '    <div class="row g-2 align-items-end">' +
        '      <div class="col-md-5">' +
        '        <label class="form-label small fw-semibold">File Excel mẫu (giữ trên máy của bạn, không tải lên server)</label>' +
        '        <input class="form-control form-control-sm" type="file" id="wizFileInput" accept=".xlsx,.xls,.xlsm,.csv">' +
        '        <div class="form-text small" id="wizFileStatus">' +
        (this._state.tempFileName ? 'Đang mở: ' + HAK.UI.esc(this._state.tempFileName) : 'Chọn file phiếu cân mẫu để tự quét tiêu đề') +
        '</div>' +
        '        <div class="small mt-1">Chưa có file mẫu? <a href="#" data-sample-xlsx class="text-success text-decoration-underline fw-semibold">⬇ Tải file Excel mẫu chuẩn</a></div>' +
        '      </div>' +
        '      <div class="col-md-3">' +
        '        <label class="form-label small fw-semibold">Sheet dữ liệu</label>' +
        '        <select class="form-select form-select-sm" id="wizSheetSelect"><option value="">' +
        (tpl && tpl.sheet ? HAK.UI.esc(tpl.sheet) : '— Mở file mẫu trước —') +
        '</option></select>' +
        '      </div>' +
        '      <div class="col-md-2">' +
        '        <label class="form-label small fw-semibold">Dòng tiêu đề</label>' +
        '        <input class="form-control form-control-sm" type="number" min="1" id="wizHeaderRow" value="' +
        this._state.currentHeaderRow +
        '">' +
        '      </div>' +
        '      <div class="col-md-2">' +
        '        <button class="btn btn-sm btn-outline-primary w-100" id="wizBtnScan" type="button">🔍 Quét tiêu đề</button>' +
        '      </div>' +
        '    </div>' +
        '    <div id="wizHeaderPreviewArea"></div>' +
        '  </div>' +
        // Bước 2: Ghép cột
        '  <div class="p-3 mb-3 border rounded bg-light-subtle">' +
        '    <h6 class="text-primary fw-bold mb-2">2. Ghép cột & Đơn vị tính</h6>' +
        '    <div id="wizHeaderAlert"></div>' +
        '    <div class="row g-2 mb-3">' +
        '      <div class="col-md-6">' +
        '        <label class="form-label small fw-semibold">Tên mẫu phiếu cân <span class="text-danger">*</span></label>' +
        '        <input class="form-control form-control-sm" id="wizTplName" value="' +
        HAK.UI.esc(tName) +
        '" placeholder="vd: Phiếu cân Nhà cung cấp Hải Vân">' +
        '      </div>' +
        '      <div class="col-md-3">' +
        '        <label class="form-label small fw-semibold">Đơn vị dự phòng (khi ô/tiêu đề không ghi)</label>' +
        '        <select class="form-select form-select-sm" id="wizFallbackUnit">' +
        '          <option value="kg"' +
        (fallbackUnit === 'kg' ? ' selected' : '') +
        '>kg (Mặc định)</option>' +
        '          <option value="tan"' +
        (fallbackUnit === 'tan' ? ' selected' : '') +
        '>tấn (nhân 1.000 về kg)</option>' +
        '        </select>' +
        '      </div>' +
        '      <div class="col-md-3 d-flex align-items-center pt-3">' +
        '        <div class="form-check">' +
        '          <input class="form-check-input" type="checkbox" id="wizIsDefault"' +
        (isDefault ? ' checked' : '') +
        '>' +
        '          <label class="form-check-label small fw-semibold" for="wizIsDefault">Đặt mẫu này làm mặc định</label>' +
        '        </div>' +
        '      </div>' +
        '    </div>' +
        '    <div class="table-responsive">' +
        '      <table class="table table-sm table-bordered align-middle mb-0">' +
        '        <thead class="table-light"><tr><th style="width:200px">Trường dữ liệu</th><th style="width:280px">Cột nguồn trong file mẫu</th><th>Tên tiêu đề lưu lại (để tìm khi cột đổi vị trí)</th></tr></thead>' +
        '        <tbody id="wizMappingBody">';

      const headerNames = tpl ? tpl.headerNames || {} : {};
      const columns = tpl ? tpl.columns || {} : {};

      TEMPLATE_FIELDS.forEach((f) => {
        const savedHeader = headerNames[f.key] || '';
        const savedCol = columns[f.key] !== undefined ? columns[f.key] : -1;
        html +=
          '<tr>' +
          '  <td>' +
          '    <b>' +
          HAK.UI.esc(f.label) +
          '</b>' +
          (f.req ? ' <span class="text-danger">*</span>' : '') +
          (f.note ? '<div class="small text-muted">' + HAK.UI.esc(f.note) + '</div>' : '') +
          '  </td>' +
          '  <td>' +
          '    <select class="form-select form-select-sm wiz-col-select" data-field="' +
          f.key +
          '">' +
          '      <option value="-1">— Chưa chọn cột —</option>' +
          (this._state.currentHeaders.length
            ? this._state.currentHeaders
                .map(
                  (h, i) =>
                    '<option value="' +
                    i +
                    '"' +
                    (savedCol === i ? ' selected' : '') +
                    '>' +
                    'Cột ' +
                    HAK.Excel.util.colName(i) +
                    ' · ' +
                    HAK.UI.esc(h || '(không tiêu đề)') +
                    '</option>'
                )
                .join('')
            : savedCol >= 0
              ? '<option value="' + savedCol + '" selected>Cột ' + (savedCol + 1) + ' (' + HAK.UI.esc(savedHeader || '') + ')</option>'
              : '') +
          '    </select>' +
          '  </td>' +
          '  <td>' +
          '    <input class="form-control form-control-sm wiz-hdr-input" data-field="' +
          f.key +
          '" value="' +
          HAK.UI.esc(savedHeader) +
          '" placeholder="Tiêu đề trên file Excel">' +
          '  </td>' +
          '</tr>';
      });

      html +=
        '        </tbody>' +
        '      </table>' +
        '    </div>' +
        '  </div>' +
        // Bước 3: Đọc thử & đối chiếu
        '  <div class="p-3 mb-3 border rounded bg-light-subtle">' +
        '    <div class="d-flex align-items-center mb-2">' +
        '      <h6 class="text-primary fw-bold mb-0">3. Đọc thử & Đối chiếu dữ liệu</h6>' +
        '      <button class="btn btn-sm btn-info ms-auto" id="wizBtnProbe" type="button">🔬 Đọc thử dữ liệu</button>' +
        '    </div>' +
        '    <div id="wizProbeResult">' +
        '      <div class="small text-muted py-2">Chọn file mẫu rồi bấm "Đọc thử dữ liệu" để kiểm tra trước khi lưu.</div>' +
        '    </div>' +
        '  </div>' +
        // Bước 4 & 5: Lưu & Đặt mặc định
        '  <div class="d-flex flex-wrap align-items-center gap-2">' +
        '    <button class="btn btn-primary" id="wizBtnSave" type="button">💾 Lưu mẫu</button>' +
        '    <button class="btn btn-outline-success" id="wizBtnDownloadTpl" type="button" title="Tải file Excel mẫu (.xlsx) theo cấu hình các cột đang thiết lập">📥 Tải file mẫu này</button>' +
        '    <button class="btn btn-outline-secondary" id="wizBtnCancel" type="button">Hủy</button>' +
        '    <div id="wizSaveMsg" class="small ms-2"></div>' +
        '  </div>' +
        '</div>';

      body.innerHTML = html;
      this.bindWizardEvents();
    },

    bindWizardEvents() {
      const body = document.getElementById('tplWizardBody');
      if (!body) return;

      const fileInput = body.querySelector('#wizFileInput');
      const sheetSelect = body.querySelector('#wizSheetSelect');
      const btnScan = body.querySelector('#wizBtnScan');
      const btnProbe = body.querySelector('#wizBtnProbe');
      const btnSave = body.querySelector('#wizBtnSave');
      const btnCancel = body.querySelector('#wizBtnCancel');

      // Khi người dùng chọn file Excel mẫu
      if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          try {
            const info = await HAK.Excel.readFile(file);
            this._state.tempWb = info.workbook;
            this._state.tempFileName = file.name;
            const status = body.querySelector('#wizFileStatus');
            if (status) status.textContent = 'Đã mở: ' + file.name + ' (' + (info.sheetNames || []).length + ' sheet)';

            sheetSelect.innerHTML = (info.sheetNames || [])
              .map((n, i) => '<option value="' + HAK.UI.esc(n) + '"' + (i === 0 ? ' selected' : '') + '>' + HAK.UI.esc(n) + '</option>')
              .join('');
            this._state.currentSheet = info.sheetNames[0] || '';

            // Tự động quét và tìm dòng tiêu đề
            this.scanHeaderRow(true);
          } catch (err) {
            HAK.UI.toast('Lỗi đọc file: ' + err.message, 'error');
          }
        });
      }

      if (sheetSelect) {
        sheetSelect.addEventListener('change', () => {
          this._state.currentSheet = sheetSelect.value;
          this.scanHeaderRow(true);
        });
      }

      if (btnScan) {
        btnScan.addEventListener('click', () => {
          this.scanHeaderRow(false);
        });
      }

      const rowInput = body.querySelector('#wizHeaderRow');
      if (rowInput) {
        let debounceTimer;
        rowInput.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            this.scanHeaderRow(false);
          }, 250);
        });
      }

      // Khi chọn cột trong dropdown -> tự điền tên tiêu đề
      body.querySelectorAll('.wiz-col-select').forEach((sel) => {
        sel.addEventListener('change', () => {
          const field = sel.getAttribute('data-field');
          const colIdx = parseInt(sel.value, 10);
          const hdrInput = body.querySelector('.wiz-hdr-input[data-field="' + field + '"]');
          if (hdrInput) hdrInput.value = this._state.currentHeaders[colIdx] || '';
        });
      });

      if (btnProbe) {
        btnProbe.addEventListener('click', () => {
          this.runProbe();
        });
      }

      if (btnSave) {
        btnSave.addEventListener('click', () => {
          this.saveWizard();
        });
      }

      const btnDownloadTpl = body.querySelector('#wizBtnDownloadTpl');
      if (btnDownloadTpl) {
        btnDownloadTpl.addEventListener('click', async () => {
          const cfg = this.getWizardConfig();
          try {
            await this.downloadTemplateFile(cfg);
            HAK.UI.toast('Đang tạo và tải file Excel mẫu...', 'success');
          } catch (e) {
            HAK.UI.toast('Lỗi tải file mẫu: ' + e.message, 'error');
          }
        });
      }

      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          const card = document.getElementById('tplWizardCard');
          if (card) card.classList.add('d-none');
        });
      }
    },

    scanHeaderRow(forceAutoDetect = false) {
      const wb = this._state.tempWb;
      if (!wb) {
        HAK.UI.toast('Vui lòng chọn file Excel mẫu trước.', 'warning');
        return;
      }
      const sheetName = this._state.currentSheet || (wb.SheetNames && wb.SheetNames[0]);
      const ws = wb.Sheets[sheetName];
      if (!ws) return;

      const G = HAK.Excel.getSheetGrid
        ? HAK.Excel.getSheetGrid(ws)
        : root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
      const rowInput = document.getElementById('wizHeaderRow');
      const { r: rowOff, c: colOff } = root.XLSX.utils.decode_range(ws['!ref'] || 'A1').s;
      let hr = parseInt(rowInput.value, 10);

      if (forceAutoDetect || !hr || hr < 1) {
        const found = HAK.Excel.findHeaderRow(G);
        if (found >= 0) {
          hr = rowOff + found + 1;
          if (rowInput) rowInput.value = hr;
        } else if (!hr || hr < 1) {
          hr = 1;
          if (rowInput) rowInput.value = 1;
        }
      }

      this._state.currentHeaderRow = hr;
      const headerCells = G[hr - 1 - rowOff] || [];
      this._state.currentHeaders = headerCells.map((c) => (c == null ? '' : String(c).trim()));

      // Cập nhật bảng xem trước các dòng đầu tiên
      const body = document.getElementById('tplWizardBody');
      if (!body) return;

      const previewEl = body.querySelector('#wizHeaderPreviewArea');
      if (previewEl) {
        const maxRows = Math.min(G.length, 12);
        let previewHtml =
          '<div class="card mt-2 border-secondary-subtle">' +
          '  <div class="card-header py-1 px-2 d-flex align-items-center bg-body-tertiary">' +
          '    <span class="small fw-semibold text-secondary">📋 Xem trước các dòng đầu tiên của sheet (bấm để chọn dòng tiêu đề)</span>' +
          '  </div>' +
          '  <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">' +
          '    <table class="table table-sm table-hover align-middle mb-0" style="font-size: 12px;">' +
          '      <thead class="table-light sticky-top"><tr><th style="width:65px">Dòng</th><th style="width:105px">Thao tác</th><th>Nội dung xem trước các ô trên dòng</th></tr></thead>' +
          '      <tbody>';

        for (let r = 0; r < maxRows; r++) {
          const actualRow = r + rowOff + 1;
          const rowData = G[r] || [];
          const isSelected = actualRow === hr;
          const rowText = rowData
            .map((c, ci) => (c == null || c === '' ? '' : HAK.Excel.util.colName(ci + colOff) + ': ' + String(c).trim()))
            .filter(Boolean)
            .slice(0, 10)
            .join(' | ');

          previewHtml +=
            '<tr class="' +
            (isSelected ? 'table-success fw-semibold' : '') +
            '">' +
            '  <td>Dòng ' +
            actualRow +
            '</td>' +
            '  <td>' +
            (isSelected
              ? '<span class="badge bg-success">Đang chọn</span>'
              : '<button type="button" class="btn btn-xs btn-outline-primary btn-pick-row py-0 px-1" data-row="' +
                actualRow +
                '">👉 Chọn dòng</button>') +
            '  </td>' +
            '  <td class="text-truncate" style="max-width: 500px;" title="' +
            HAK.UI.esc(rowText) +
            '">' +
            (rowText ? HAK.UI.esc(rowText) : '<span class="text-muted fst-italic">(dòng trống)</span>') +
            '</td>' +
            '</tr>';
        }

        previewHtml += '</tbody></table></div></div>';
        previewEl.innerHTML = previewHtml;

        previewEl.querySelectorAll('.btn-pick-row').forEach((btn) => {
          btn.addEventListener('click', () => {
            const pick = parseInt(btn.getAttribute('data-row'), 10);
            if (pick > 0) {
              if (rowInput) rowInput.value = pick;
              this.scanHeaderRow(false);
            }
          });
        });
      }

      // Đánh giá số cột có tiêu đề hợp lệ để cảnh báo người dùng nếu chọn sai dòng
      const validHeadersCount = this._state.currentHeaders.filter((h) => h && h.trim()).length;
      const alertEl = body.querySelector('#wizHeaderAlert');
      if (alertEl) {
        if (validHeadersCount === 0) {
          alertEl.innerHTML =
            '<div class="alert alert-warning py-2 px-3 small mb-2">' +
            '  <strong>⚠️ Dòng ' +
            hr +
            ' không có tên tiêu đề cột nào!</strong> Toàn bộ các cột đang là <i>(không tiêu đề)</i>.<br>' +
            '  Hãy xem bảng <b>"📋 Xem trước các dòng đầu tiên"</b> ở trên và bấm nút <b>"👉 Chọn dòng"</b> tại dòng chứa tên cột (thường là dòng 5, 6 hoặc 7 có chữ <i>Số phiếu, Ngày cân, Biển số...</i>).' +
            '</div>';
        } else if (validHeadersCount < 2) {
          alertEl.innerHTML =
            '<div class="alert alert-info py-2 px-3 small mb-2">' +
            '  ℹ️ Dòng ' +
            hr +
            ' chỉ có ' +
            validHeadersCount +
            ' cột có tên. Hãy kiểm tra lại dòng tiêu đề chính ở bảng xem trước phía trên.' +
            '</div>';
        } else {
          alertEl.innerHTML = '';
        }
      }

      // Tự động gợi ý ghép cột bằng detectMapping
      const sample = G.slice(Math.max(0, hr - rowOff), Math.max(0, hr - rowOff) + 100);
      const autoM = HAK.Excel.detectMapping(this._state.currentHeaders, sample);

      TEMPLATE_FIELDS.forEach((f) => {
        const sel = body.querySelector('.wiz-col-select[data-field="' + f.key + '"]');
        const hdr = body.querySelector('.wiz-hdr-input[data-field="' + f.key + '"]');
        if (!sel) return;

        let curVal = parseInt(sel.value, 10);
        if (curVal < 0 || !this._state.currentHeaders[curVal]) {
          if (autoM[f.key] !== undefined) {
            curVal = autoM[f.key];
          } else if (f.key === 'date' && autoM.datetime1 !== undefined) {
            curVal = autoM.datetime1;
          }
        }

        sel.innerHTML =
          '<option value="-1">— Chưa chọn cột —</option>' +
          this._state.currentHeaders
            .map(
              (h, i) =>
                '<option value="' +
                i +
                '"' +
                (curVal === i ? ' selected' : '') +
                '>' +
                'Cột ' +
                HAK.Excel.util.colName(i + colOff) +
                ' · ' +
                HAK.UI.esc(h || '(không tiêu đề)') +
                '</option>'
            )
            .join('');

        if (hdr && curVal >= 0 && this._state.currentHeaders[curVal]) {
          hdr.value = this._state.currentHeaders[curVal];
        }
      });

      HAK.UI.toast('Đã quét ' + this._state.currentHeaders.length + ' cột tiêu đề trên dòng ' + hr + '.', 'info');
    },

    getWizardConfig() {
      const body = document.getElementById('tplWizardBody');
      if (!body) return null;

      const name = (body.querySelector('#wizTplName').value || '').trim();
      const headerRow = parseInt(body.querySelector('#wizHeaderRow').value, 10) || 1;
      const fallbackUnit = body.querySelector('#wizFallbackUnit').value || 'kg';
      const isDefault = body.querySelector('#wizIsDefault').checked;

      const headerNames = {};
      const columns = {};

      TEMPLATE_FIELDS.forEach((f) => {
        const sel = body.querySelector('.wiz-col-select[data-field="' + f.key + '"]');
        const hdr = body.querySelector('.wiz-hdr-input[data-field="' + f.key + '"]');
        const colVal = sel ? parseInt(sel.value, 10) : -1;
        const hdrVal = hdr ? hdr.value.trim() : '';

        if (hdrVal) headerNames[f.key] = hdrVal;
        if (colVal >= 0) {
          columns[f.key] = colVal;
        }
      });

      return {
        id: this._state.editingId,
        name,
        sheet: this._state.currentSheet,
        headerRow,
        headerNames,
        columns,
        fallbackUnit,
        isDefault,
      };
    },

    runProbe() {
      const cfg = this.getWizardConfig();
      const resContainer = document.getElementById('wizProbeResult');
      if (!resContainer) return;

      if (!this._state.tempWb) {
        resContainer.innerHTML =
          '<div class="alert alert-warning py-2 mb-0">Chưa có file Excel mẫu để đọc thử. Hãy mở file Excel mẫu ở Bước 1.</div>';
        return;
      }

      const res = this.probeTemplate(
        this._state.tempWb,
        this._state.currentSheet,
        cfg,
        HAK.Config && HAK.Config.data && HAK.Config.data.general ? HAK.Config.data.general.autoSwap : true
      );
      this._state.probeResult = res;

      let html = '';
      if (!res.ok) {
        html += '<div class="alert alert-danger py-2 mb-2"><b>Không hợp lệ:</b><ul class="mb-0">';
        res.errors.forEach((e) => (html += '<li>' + HAK.UI.esc(e) + '</li>'));
        html += '</ul></div>';
      } else {
        html +=
          '<div class="alert alert-success py-2 mb-2">✓ Đọc thử hợp lệ: <b>' +
          (res.stats ? res.stats.trips : 0) +
          ' phiếu cân</b> · <b>' +
          (res.stats ? (res.stats.kg / 1000).toFixed(2) : 0) +
          ' tấn</b> (' +
          (res.stats ? res.stats.kg.toLocaleString('vi-VN') : 0) +
          ' kg).</div>';
      }

      if (res.reconciliation) {
        const r = res.reconciliation;
        const tripMatch = r.diffTrips === 0;
        const kgMatch = Math.abs(r.diffKg || 0) <= 1;
        html +=
          '<div class="alert ' +
          (tripMatch && kgMatch ? 'alert-info' : 'alert-warning') +
          ' py-2 mb-2">' +
          '<b>Đối chiếu với tiêu đề file mẫu:</b> ' +
          (r.declaredTrips !== null
            ? 'Công bố: ' +
              r.declaredTrips +
              ' xe | Thực đọc: ' +
              r.parsedTrips +
              ' xe (' +
              (tripMatch ? 'khớp' : 'lệch ' + r.diffTrips) +
              '). '
            : '') +
          (r.declaredKg !== null
            ? 'Công bố: ' +
              (r.declaredKg / 1000).toFixed(2) +
              ' t | Thực đọc: ' +
              (r.parsedKg / 1000).toFixed(2) +
              ' t (' +
              (kgMatch ? 'khớp' : 'lệch ' + (r.diffKg / 1000).toFixed(2) + ' t') +
              ').'
            : '') +
          '</div>';
      }

      if (res.warnings && res.warnings.length) {
        html += '<div class="alert alert-warning py-2 mb-2"><b>Cảnh báo (' + res.warnings.length + '):</b><ul class="mb-0 small">';
        res.warnings.slice(0, 5).forEach((w) => (html += '<li>' + HAK.UI.esc(w) + '</li>'));
        if (res.warnings.length > 5) html += '<li>… và ' + (res.warnings.length - 5) + ' cảnh báo khác</li>';
        html += '</ul></div>';
      }

      if (res.sampleRows && res.sampleRows.length) {
        html +=
          '<div class="small fw-semibold mb-1">Dữ liệu đọc thử (' +
          Math.min(res.sampleRows.length, 5) +
          ' dòng đầu):</div>' +
          '<div class="table-responsive" style="max-height:220px">' +
          '<table class="table table-sm table-striped align-middle mb-0" style="font-size:12px">' +
          '  <thead class="table-light"><tr><th>Dòng</th><th>Số phiếu</th><th>Biển số</th><th>Ngày giờ cân</th><th class="text-end">Cân 1 (kg)</th><th class="text-end">Cân 2 (kg)</th><th class="text-end">KL hàng (kg)</th><th>Kho</th><th>Ghi chú</th></tr></thead>' +
          '  <tbody>';
        res.sampleRows.slice(0, 5).forEach((r) => {
          html +=
            '<tr>' +
            '  <td>' +
            r.idx +
            '</td>' +
            '  <td><b>' +
            HAK.UI.esc(r.ticket || '') +
            '</b></td>' +
            '  <td>' +
            HAK.UI.esc(r.plate || '') +
            '</td>' +
            '  <td>' +
            HAK.UI.esc(r.time1 || r.dateStr || '') +
            '</td>' +
            '  <td class="text-end">' +
            (r.tare !== null ? r.tare.toLocaleString('vi-VN') : '') +
            '</td>' +
            '  <td class="text-end">' +
            (r.gross !== null ? r.gross.toLocaleString('vi-VN') : '') +
            '</td>' +
            '  <td class="text-end fw-semibold">' +
            (r.net !== null ? r.net.toLocaleString('vi-VN') : '') +
            '</td>' +
            '  <td>' +
            HAK.UI.esc(r.wh || '') +
            '</td>' +
            '  <td>' +
            HAK.UI.esc(r.note || '') +
            '</td>' +
            '</tr>';
        });
        html += '  </tbody></table></div>';
      }

      resContainer.innerHTML = html;
    },

    saveWizard() {
      const cfg = this.getWizardConfig();
      if (!cfg.name) {
        HAK.UI.toast('Vui lòng nhập tên mẫu phiếu cân.', 'warning');
        return;
      }

      // Kiểm tra ghép cột bắt buộc
      const hasPlate = cfg.headerNames.plate || cfg.columns.plate !== undefined;
      const hasDate = cfg.headerNames.date || cfg.columns.date !== undefined;
      const hasNet = cfg.headerNames.net || cfg.columns.net !== undefined;
      const hasTareGross =
        (cfg.headerNames.tare || cfg.columns.tare !== undefined) && (cfg.headerNames.gross || cfg.columns.gross !== undefined);

      if (!hasPlate) {
        HAK.UI.toast('Chưa ghép cột Biển số xe (bắt buộc).', 'error');
        return;
      }
      if (!hasDate) {
        HAK.UI.toast('Chưa ghép cột Ngày giờ cân (bắt buộc).', 'error');
        return;
      }
      if (!hasNet && !hasTareGross) {
        HAK.UI.toast('Chưa ghép cột Khối lượng hàng (cần Khối lượng hoặc cả Cân 1 và Cân 2).', 'error');
        return;
      }

      try {
        const saved = this.save(cfg);
        HAK.UI.toast('Đã lưu mẫu "' + saved.name + '".' + (saved.isDefault ? ' (Đã đặt làm mặc định)' : ''), 'success');
        const card = document.getElementById('tplWizardCard');
        if (card) card.classList.add('d-none');
        this.renderUI();
      } catch (err) {
        HAK.UI.toast('Không thể lưu: ' + err.message, 'error');
      }
    },

    buildTemplateWorkbook(template) {
      const X = root.XLSX;
      if (!X || !X.utils) throw new Error('Thư viện XLSX chưa được nạp.');

      const tpl = template || {};
      const sheetTitle = (tpl.sheet || 'BANG CAN').trim() || 'BANG CAN';
      const headerRowIdx = Math.max(1, parseInt(tpl.headerRow, 10) || 1);
      const isTan = tpl.fallbackUnit === 'tan';
      const unitStr = isTan ? 'tấn' : 'kg';

      const headerNames = tpl.headerNames || {};
      const columns = tpl.columns || {};
      const mappedEntries = Object.entries(headerNames).filter(([, name]) => name && String(name).trim());

      let maxColIdx = -1;
      mappedEntries.forEach(([key]) => {
        if (typeof columns[key] === 'number' && columns[key] >= 0) {
          if (columns[key] > maxColIdx) maxColIdx = columns[key];
        }
      });

      const headerRowArr = [];
      if (maxColIdx >= 0) {
        for (let c = 0; c <= maxColIdx; c++) headerRowArr.push('');
        mappedEntries.forEach(([key, name]) => {
          const col = columns[key];
          if (typeof col === 'number' && col >= 0) {
            headerRowArr[col] = String(name).trim();
          }
        });
      } else {
        TEMPLATE_FIELDS.forEach((f) => {
          if (headerNames[f.key]) headerRowArr.push(headerNames[f.key]);
        });
        if (!headerRowArr.length) {
          headerRowArr.push('Số phiếu', 'Biển số', 'Ngày cân', 'Khối lượng hàng', 'Đơn vị tính', 'Kho', 'Ghi chú');
        }
      }

      const sheet1Data = [];
      for (let r = 1; r < headerRowIdx; r++) {
        if (r === 1) {
          sheet1Data.push(['BẢNG KÊ PHIẾU CÂN - MẪU: ' + String(tpl.name || 'MẪU CHUẨN').toUpperCase()]);
        } else {
          sheet1Data.push([]);
        }
      }
      sheet1Data.push(headerRowArr);

      const sampleRowsData = [
        {
          ticket: '00101',
          plate: '51C-123.45',
          date: '26/11/2026 08:30',
          tare: isTan ? 12.5 : 12500,
          gross: isTan ? 28.0 : 28000,
          net: isTan ? 15.5 : 15500,
          unit: unitStr,
          wh: 'Kho A',
          note: 'Xuất kho đợt 1',
          driver: 'Nguyễn Văn An',
          carrier: 'HAK-VC01',
        },
        {
          ticket: '00102',
          plate: '60A-987.65',
          date: '26/11/2026 09:15',
          tare: isTan ? 11.2 : 11200,
          gross: isTan ? 25.4 : 25400,
          net: isTan ? 14.2 : 14200,
          unit: unitStr,
          wh: 'Kho B',
          note: 'Hàng xuất khẩu',
          driver: 'Trần Văn Bình',
          carrier: 'HAK-VC02',
        },
        {
          ticket: '00103',
          plate: '72B-456.78',
          date: '26/11/2026 10:00',
          tare: isTan ? 13.0 : 13000,
          gross: isTan ? 31.0 : 31000,
          net: isTan ? 18.0 : 18000,
          unit: unitStr,
          wh: 'Kho C',
          note: 'Niêm chì nguyên vẹn',
          driver: 'Lê Hoàng Cường',
          carrier: 'HAK-VC01',
        },
      ];

      sampleRowsData.forEach((sampleItem) => {
        const rowArr = [];
        if (maxColIdx >= 0) {
          for (let c = 0; c <= maxColIdx; c++) rowArr.push('');
          mappedEntries.forEach(([key]) => {
            const col = columns[key];
            if (typeof col === 'number' && col >= 0) {
              rowArr[col] = sampleItem[key] !== undefined ? sampleItem[key] : '';
            }
          });
        } else {
          TEMPLATE_FIELDS.forEach((f) => {
            if (headerNames[f.key]) {
              rowArr.push(sampleItem[f.key] !== undefined ? sampleItem[f.key] : '');
            }
          });
        }
        sheet1Data.push(rowArr);
      });

      const wb = X.utils.book_new();
      const ws1 = X.utils.aoa_to_sheet(sheet1Data);
      X.utils.book_append_sheet(wb, ws1, sheetTitle.slice(0, 31));

      // Sheet 2: DS XE - TAI XE
      const sheet2Data = [
        ['STT', 'Biển số xe', 'Họ tên tài xế', 'Số điện thoại', 'Số CCCD', 'Mã ĐVVC', 'Tên đơn vị vận chuyển', 'Ghi chú'],
        [1, '51C-123.45', 'Nguyễn Văn An', '0903123456', '079085001234', 'HAK-VC01', 'Vận tải HAK Miền Nam', 'Xe 15 tấn thùng kín'],
        [2, '60A-987.65', 'Trần Văn Bình', '0918765432', '079086002345', 'HAK-VC02', 'Vận tải Đồng Nai Express', 'Xe 15 tấn'],
        [3, '72B-456.78', 'Lê Hoàng Cường', '0987654321', '079087003456', 'HAK-VC01', 'Vận tải HAK Miền Nam', 'Xe 18 tấn bạt'],
      ];
      const ws2 = X.utils.aoa_to_sheet(sheet2Data);
      X.utils.book_append_sheet(wb, ws2, 'DS XE - TAI XE');

      // Sheet 3: HUONG DAN
      const sheet3Data = [
        ['HƯỚNG DẪN SỬ DỤNG FILE MẪU EXCEL NHẬP PHIẾU CÂN HAK'],
        [''],
        ['1. THÔNG TIN CẤU HÌNH MẪU ÁP DỤNG:'],
        ['- Tên mẫu cấu hình:', tpl.name || 'Mặc định'],
        ['- Sheet dữ liệu:', sheetTitle],
        ['- Dòng tiêu đề:', 'Dòng số ' + headerRowIdx],
        ['- Đơn vị tính dự phòng:', unitStr],
        [''],
        ['2. NGUYÊN TẮC NHẬP LIỆU:'],
        ['- Điền dữ liệu từ dòng kế tiếp ngay sau dòng tiêu đề.'],
        ['- Cột biển số xe phải có đủ để ứng dụng nhận diện và gán xe.'],
        ['- Khối lượng có thể ghi số kg hoặc số tấn theo đúng đơn vị cấu hình.'],
        ['- Mã số phiếu có thể chứa các số 0 ở đầu (ví dụ: 00101, 00102), hệ thống sẽ giữ nguyên vẹn.'],
        ['- Sheet "DS XE - TAI XE" để khai báo trước tài xế, SĐT và ĐVVC của từng biển số.'],
        [''],
        ['3. ĐƯA VÀO HỆ THỐNG:'],
        ['- Lưu file Excel này sau khi trạm cân hoặc thủ kho đã điền xong.'],
        ['- Mở trang Nhập liệu của phần mềm Quản lý xuất hàng HAK và kéo thả file vào ô đợt cân.'],
        ['- Hệ thống sẽ tự động đối chiếu với cấu hình mẫu "' + (tpl.name || '') + '" để đọc chính xác 100%.'],
      ];
      const ws3 = X.utils.aoa_to_sheet(sheet3Data);
      X.utils.book_append_sheet(wb, ws3, 'HUONG DAN');

      return wb;
    },

    async downloadTemplateFile(target) {
      let tpl = null;
      if (typeof target === 'string') {
        tpl = this.get(target);
      } else if (target && typeof target === 'object') {
        tpl = target;
      }

      if (!tpl) {
        if (typeof root.downloadSampleXlsx === 'function') {
          return root.downloadSampleXlsx();
        }
        throw new Error('Không tìm thấy mẫu hoặc hàm tải mẫu chuẩn.');
      }

      const X = root.XLSX;
      if (!X || !X.utils || !X.write) {
        throw new Error('Thư viện XLSX chưa sẵn sàng để tạo file mẫu.');
      }

      const wb = this.buildTemplateWorkbook(tpl);
      const wbout = X.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const slug =
        String(tpl.name || 'Mau_Nhap')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .replace(/[^a-zA-Z0-9_-]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'Mau_Nhap';
      const fileName = 'Mau_PhieuCan_' + slug + '.xlsx';

      if (HAK.Word && HAK.Word.Files && typeof HAK.Word.Files.saveBlob === 'function') {
        return await HAK.Word.Files.saveBlob(blob, fileName);
      }

      if (typeof document !== 'undefined') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
        return true;
      }
      return blob;
    },
  };

  HAK.ExcelTemplate = ExcelTemplate;
  if (typeof module === 'object' && module.exports) module.exports = ExcelTemplate;
})(typeof window !== 'undefined' ? window : globalThis);
