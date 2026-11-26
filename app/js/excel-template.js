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
    { key: 'date', label: 'Ngày giờ cân / Ngày cân', req: true },
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
        n: norm(h),
      }));

      const headerNames = template.headerNames || {};
      const usedCols = new Set();

      for (const [fieldKey, targetHeader] of Object.entries(headerNames)) {
        if (!targetHeader || !String(targetHeader).trim()) continue;
        const targetNorm = norm(targetHeader);
        if (!targetNorm) continue;

        // Tìm cột trùng tên hoàn toàn trước
        const exactMatches = normalizedHeaders.filter((col) => col.n && col.n === targetNorm);
        let chosen = null;

        if (exactMatches.length === 1) {
          chosen = exactMatches[0];
        } else if (exactMatches.length > 1) {
          duplicates.push({ fieldKey, name: targetHeader, cols: exactMatches.map((c) => c.idx) });
          chosen = exactMatches[0]; // tạm chọn cột đầu
        } else {
          // Tìm theo chuỗi con nếu không có khớp hoàn toàn
          const partialMatches = normalizedHeaders.filter((col) => col.n && (col.n.includes(targetNorm) || targetNorm.includes(col.n)));
          if (partialMatches.length === 1) {
            chosen = partialMatches[0];
          } else if (partialMatches.length > 1) {
            duplicates.push({ fieldKey, name: targetHeader, cols: partialMatches.map((c) => c.idx) });
            chosen = partialMatches[0];
          } else {
            // Không thấy theo tên tiêu đề → thử kiểm tra chỉ số cột cũ nếu còn hợp lệ
            const fallbackCol = template.columns ? template.columns[fieldKey] : undefined;
            if (typeof fallbackCol === 'number' && fallbackCol >= 0 && fallbackCol < headerCells.length) {
              chosen = normalizedHeaders[fallbackCol];
              warnings.push(
                'Cột cho "' + targetHeader + '" không tìm thấy theo tên, tạm dùng vị trí cột cũ (cột ' + (fallbackCol + 1) + ').'
              );
            } else {
              missing.push({ fieldKey, name: targetHeader });
            }
          }
        }

        if (chosen) {
          mapping[fieldKey] = chosen.idx;
          matchedHeaders[fieldKey] = chosen.raw;
          usedCols.add(chosen.idx);
        }
      }

      // Kiểm tra các trường bắt buộc
      const has = (k) => mapping[k] !== undefined;
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

      const range = root.XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const rowOff = range.s.r;
      const G = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });

      const hr1 = Math.max(1, parseInt(template.headerRow, 10) || 1);
      const hrIdx = hr1 - 1 - rowOff;
      if (hrIdx < 0 || hrIdx >= G.length) {
        return { ok: false, errors: ['Dòng tiêu đề ' + hr1 + ' vượt quá số dòng của sheet.'] };
      }

      const headerCells = G[hrIdx] || [];
      const match = this.matchTemplate(template, headerCells);

      // Nếu người dùng đang chỉnh mapping tay trên wizard, cho phép override mapping
      const effectiveMapping = Object.assign({}, match.mapping, template.overrideMapping || {});

      let ds;
      try {
        ds = HAK.Excel.parseSheet(workbook, sName, {
          headerRow: hr1,
          mapping: effectiveMapping,
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
        headerCells,
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
        '            <th style="min-width:210px">Thao tác</th>' +
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
        '  </div>' +
        // Bước 2: Ghép cột
        '  <div class="p-3 mb-3 border rounded bg-light-subtle">' +
        '    <h6 class="text-primary fw-bold mb-2">2. Ghép cột & Đơn vị tính</h6>' +
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
                    String.fromCharCode(65 + i) +
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
        '  <div class="d-flex align-items-center gap-2">' +
        '    <button class="btn btn-primary" id="wizBtnSave" type="button">💾 Lưu mẫu</button>' +
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

            // Tự động quét tiêu đề
            this.scanHeaderRow();
          } catch (err) {
            HAK.UI.toast('Lỗi đọc file: ' + err.message, 'error');
          }
        });
      }

      if (sheetSelect) {
        sheetSelect.addEventListener('change', () => {
          this._state.currentSheet = sheetSelect.value;
          this.scanHeaderRow();
        });
      }

      if (btnScan) {
        btnScan.addEventListener('click', () => {
          this.scanHeaderRow();
        });
      }

      // Khi chọn cột trong dropdown -> tự điền tên tiêu đề
      body.querySelectorAll('.wiz-col-select').forEach((sel) => {
        sel.addEventListener('change', () => {
          const field = sel.getAttribute('data-field');
          const colIdx = parseInt(sel.value, 10);
          const hdrInput = body.querySelector('.wiz-hdr-input[data-field="' + field + '"]');
          if (hdrInput && colIdx >= 0 && this._state.currentHeaders[colIdx]) {
            hdrInput.value = this._state.currentHeaders[colIdx];
          }
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

      if (btnCancel) {
        btnCancel.addEventListener('click', () => {
          const card = document.getElementById('tplWizardCard');
          if (card) card.classList.add('d-none');
        });
      }
    },

    scanHeaderRow() {
      const wb = this._state.tempWb;
      if (!wb) {
        HAK.UI.toast('Vui lòng chọn file Excel mẫu trước.', 'warning');
        return;
      }
      const sheetName = this._state.currentSheet || (wb.SheetNames && wb.SheetNames[0]);
      const ws = wb.Sheets[sheetName];
      if (!ws) return;

      const G = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
      const rowInput = document.getElementById('wizHeaderRow');
      let hr = parseInt(rowInput.value, 10) || 1;

      // Tìm dòng tiêu đề tốt nhất nếu chưa nhập
      if (!hr || hr < 1) {
        const found = HAK.Excel.findHeaderRow(G);
        hr = found >= 0 ? found + 1 : 1;
        rowInput.value = hr;
      }

      this._state.currentHeaderRow = hr;
      const headerCells = G[hr - 1] || [];
      this._state.currentHeaders = headerCells.map((c) => (c == null ? '' : String(c).trim()));

      // Tự động gợi ý ghép cột bằng detectMapping
      const sample = G.slice(hr, hr + 100);
      const autoM = HAK.Excel.detectMapping(this._state.currentHeaders, sample);

      // Cập nhật lại các dropdown cột và tiêu đề
      const body = document.getElementById('tplWizardBody');
      if (!body) return;

      TEMPLATE_FIELDS.forEach((f) => {
        const sel = body.querySelector('.wiz-col-select[data-field="' + f.key + '"]');
        const hdr = body.querySelector('.wiz-hdr-input[data-field="' + f.key + '"]');
        if (!sel) return;

        let curVal = parseInt(sel.value, 10);
        if (curVal < 0) {
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
                String.fromCharCode(65 + i) +
                ' · ' +
                HAK.UI.esc(h || '(không tiêu đề)') +
                '</option>'
            )
            .join('');

        if (hdr && curVal >= 0 && this._state.currentHeaders[curVal]) {
          if (!hdr.value.trim()) hdr.value = this._state.currentHeaders[curVal];
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
      const overrideMapping = {};

      TEMPLATE_FIELDS.forEach((f) => {
        const sel = body.querySelector('.wiz-col-select[data-field="' + f.key + '"]');
        const hdr = body.querySelector('.wiz-hdr-input[data-field="' + f.key + '"]');
        const colVal = sel ? parseInt(sel.value, 10) : -1;
        const hdrVal = hdr ? hdr.value.trim() : '';

        if (hdrVal) headerNames[f.key] = hdrVal;
        if (colVal >= 0) {
          columns[f.key] = colVal;
          overrideMapping[f.key] = colVal;
        }
      });

      return {
        id: this._state.editingId,
        name,
        sheet: this._state.currentSheet,
        headerRow,
        headerNames,
        columns,
        overrideMapping,
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
  };

  HAK.ExcelTemplate = ExcelTemplate;
  if (typeof module === 'object' && module.exports) module.exports = ExcelTemplate;
})(typeof window !== 'undefined' ? window : globalThis);
