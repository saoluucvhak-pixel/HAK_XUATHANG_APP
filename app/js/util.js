/**
 * util.js — hàm tiện ích và lớp lược đồ + ép kiểu dùng chung khi nhập dữ liệu.
 * Nạp TRƯỚC các module khác (xem index.html).
 * Trong Node (kiểm thử) các module nạp qua require('./util.js') khi HAK.Util chưa có.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  /** Có phải số hữu hạn (không tính null / '' / undefined)? */
  const hasNum = (v) => v !== null && v !== undefined && v !== '' && isFinite(+v);
  /** 'yyyy-mm-dd…' → 'dd/mm/yyyy' ('' nếu không phải ngày ISO). */
  const vnDate = (iso) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');

  const SAFE_ID_RE = /^[A-Za-z0-9_.:|-]{1,128}$/;
  const isPlainObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const asNum = (v, def) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def === undefined ? 0 : def;
  };
  const asOptNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const asId = (v) => {
    const s = String(v == null ? '' : v).trim();
    return SAFE_ID_RE.test(s) ? s : '';
  };
  // Loại bỏ ký tự điều khiển XML 1.0 không hợp lệ (giữ \t \n \r)
  // eslint-disable-next-line no-control-regex
  const XML_CTRL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  const stripXmlCtrl = (s) => String(s == null ? '' : s).replace(XML_CTRL_RE, '');

  function cleanArchiveMeta(m) {
    if (!isPlainObj(m)) return null;
    const id = asId(m.id);
    const type = asId(m.type);
    const updatedAt = Number(m.updatedAt);
    if (!id || !type || !Number.isFinite(updatedAt) || updatedAt <= 0) return null;
    const out = Object.assign({}, m, {
      id,
      type,
      updatedAt,
      trips: asNum(m.trips, 0),
      kg: asNum(m.kg, 0),
      size: asNum(m.size, 0),
      retTrips: asNum(m.retTrips, 0),
      retKg: asNum(m.retKg, 0),
      nonPosTrips: asNum(m.nonPosTrips, 0),
      nonPosKg: asNum(m.nonPosKg, 0),
      modes: Array.isArray(m.modes) ? m.modes.map(asId).filter(Boolean) : [],
    });
    if (m.contract !== undefined && m.contract !== null && m.contract !== '') {
      const c = asId(m.contract);
      out.contract = c || '';
    }
    if (m.version !== undefined) out.version = asNum(m.version, 1);
    return out;
  }

  function cleanIssuedRec(r) {
    if (!isPlainObj(r)) return null;
    const id = asId(r.id);
    if (!id) return null;
    const out = Object.assign({}, r, {
      id,
      at: asNum(r.at, Date.now()),
      trips: asNum(r.trips, 0),
      kg: asNum(r.kg, 0),
    });
    if (r.kind === 'pxk' || r.pxkFrom !== undefined || r.pxkTo !== undefined) {
      out.pxkFrom = Math.max(0, Math.trunc(asNum(r.pxkFrom, 0)));
      out.pxkTo = Math.max(0, Math.trunc(asNum(r.pxkTo, 0)));
    }
    return out;
  }

  function cleanBatchMeta(m) {
    if (!isPlainObj(m)) return null;
    const id = asId(m.id);
    if (!id) return null;
    const out = Object.assign({}, m, {
      id,
      rev: asNum(m.rev, 0),
      count: asNum(m.count, 0),
      trips: asNum(m.trips, 0),
      kg: asNum(m.kg, 0),
      totalKg: asNum(m.totalKg, 0),
    });
    if (isPlainObj(m.veh)) {
      out.veh = Object.assign({}, m.veh, { count: Math.max(0, Math.trunc(asNum(m.veh.count, 0))) });
    }
    return out;
  }

  function cleanAuthStore(raw) {
    if (!isPlainObj(raw) || !Array.isArray(raw.users) || !raw.users.length) {
      throw new Error('Dữ liệu tài khoản không hợp lệ (thiếu danh sách tài khoản).');
    }
    const users = raw.users.map((u, i) => {
      if (!isPlainObj(u)) throw new Error('Tài khoản thứ ' + (i + 1) + ' không hợp lệ.');
      const id = asId(u.id);
      if (!id) throw new Error('Mã tài khoản không hợp lệ.');
      const username = String(u.username || '').trim();
      if (!username) throw new Error('Tên đăng nhập không hợp lệ.');
      if (u.role !== 'admin' && u.role !== 'staff') throw new Error('Vai trò tài khoản không hợp lệ.');
      if (typeof u.hash !== 'string' || typeof u.salt !== 'string' || !u.hash || !u.salt) {
        throw new Error('Thông tin xác thực tài khoản bị thiếu hoặc hỏng.');
      }
      const companies = Array.isArray(u.companies) ? u.companies.map(asId).filter(Boolean) : [];
      return Object.assign({}, u, { id, username, companies, disabled: !!u.disabled });
    });
    if (!users.some((u) => u.role === 'admin' && !u.disabled)) {
      throw new Error('Dữ liệu tài khoản phải có ít nhất một tài khoản Quản trị đang hoạt động.');
    }
    return Object.assign({}, raw, { users });
  }

  function validateConfigData(d, strict) {
    if (!isPlainObj(d)) throw new Error('File không đúng định dạng cấu hình.');
    if (strict && (!Array.isArray(d.companies) || !Array.isArray(d.warehouses))) {
      throw new Error('File không đúng định dạng cấu hình (thiếu danh sách công ty/kho).');
    }
    const out = Object.assign({}, d);
    if (d.companies !== undefined) {
      if (!Array.isArray(d.companies) || !d.companies.length) throw new Error('Cấu hình phải có ít nhất 1 công ty.');
      out.companies = d.companies.map((c, i) => {
        if (!isPlainObj(c) || !asId(c.id) || typeof c.name !== 'string' || !c.name.trim()) {
          throw new Error('Công ty thứ ' + (i + 1) + ' không hợp lệ (thiếu mã hoặc tên).');
        }
        return Object.assign({}, c, { id: asId(c.id), name: c.name.trim() });
      });
    }
    if (d.warehouses !== undefined) {
      if (!Array.isArray(d.warehouses)) throw new Error('Danh sách kho không hợp lệ.');
      out.warehouses = d.warehouses.map((w, i) => {
        if (!isPlainObj(w) || !asId(w.id) || typeof w.name !== 'string' || !w.name.trim()) {
          throw new Error('Kho thứ ' + (i + 1) + ' không hợp lệ (thiếu mã hoặc tên).');
        }
        return Object.assign({}, w, { id: asId(w.id), name: w.name.trim() });
      });
    }
    if (d.general !== undefined && !isPlainObj(d.general)) {
      throw new Error('Mục cấu hình chung không hợp lệ.');
    }
    if (d.carrierCodes !== undefined && (!Array.isArray(d.carrierCodes) || d.carrierCodes.some((x) => !isPlainObj(x)))) {
      throw new Error('Bảng mã đơn vị vận chuyển không hợp lệ.');
    }
    return out;
  }

  function validateGsyncConfig(v) {
    if (!isPlainObj(v)) throw new Error('Cấu hình Google Sheet không hợp lệ.');
    if (v.cos !== undefined) {
      if (!isPlainObj(v.cos)) throw new Error('Cấu hình Google Sheet theo công ty không hợp lệ.');
      for (const cid of Object.keys(v.cos)) {
        const entry = v.cos[cid];
        if (!isPlainObj(entry)) throw new Error('Cấu hình Google Sheet cho "' + cid + '" không hợp lệ.');
        if (entry.url) {
          const u = String(entry.url).trim();
          if (!/^https:\/\/[A-Za-z0-9.-]+/.test(u)) {
            throw new Error('URL Google Sheet không hợp lệ (chỉ chấp nhận https://).');
          }
        }
      }
    }
    return v;
  }

  const ALLOWED_BACKUP_KEYS = new Set([
    'hak.config.v1',
    'hak.catalog.v1',
    'hak.auth.v1',
    'hak.auth.lastco',
    'hak.gsync.v2',
    'hak.workingYear',
    'hak.design.theme',
    'hak.yearbook.v1',
    'hak.sf.presets',
  ]);
  function isAllowedBackupKey(k) {
    if (typeof k !== 'string' || k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
    if (ALLOWED_BACKUP_KEYS.has(k)) return true;
    if (k.startsWith('hak.sf.presets@') || k.startsWith('hak.tpl.')) return true;
    return false;
  }

  function validateBackupKey(k, v) {
    if (!isAllowedBackupKey(k)) return false;
    if (k === 'hak.config.v1') validateConfigData(v);
    else if (k === 'hak.auth.v1') cleanAuthStore(v);
    else if (k === 'hak.gsync.v2') validateGsyncConfig(v);
    else if (k === 'hak.auth.lastco') {
      if (v !== '' && v !== '*' && v !== null) {
        if (isPlainObj(v)) {
          for (const uk of Object.keys(v)) {
            if (!asId(uk) || (v[uk] !== '' && v[uk] !== '*' && !asId(v[uk]))) {
              throw new Error('Công ty đang chọn không hợp lệ.');
            }
          }
        } else if (!asId(v)) {
          throw new Error('Công ty đang chọn không hợp lệ.');
        }
      }
    } else if (k === 'hak.workingYear') {
      if (v !== null && v !== '' && (!Number.isInteger(Number(v)) || Number(v) < 2000 || Number(v) > 2100)) {
        throw new Error('Năm làm việc trong sao lưu không hợp lệ.');
      }
    } else if (k === 'hak.design.theme') {
      if (v !== null && typeof v !== 'string' && !isPlainObj(v)) throw new Error('Cấu hình giao diện không hợp lệ.');
    } else if (k === 'hak.sf.presets' || k.startsWith('hak.sf.presets@')) {
      if (v !== null && !isPlainObj(v)) throw new Error('Bộ lọc đã lưu không hợp lệ.');
    }
    return true;
  }

  function checkZipLimits(zip, opts) {
    opts = opts || {};
    const maxFile = opts.maxFile || 150 * 1024 * 1024;
    const maxTotal = opts.maxTotal || 250 * 1024 * 1024;
    const files = (zip && zip.files) || {};
    let total = 0;
    for (const name of Object.keys(files)) {
      const f = files[name];
      if (!f || f.dir) continue;
      const uSize = f._data && typeof f._data.uncompressedSize === 'number' ? f._data.uncompressedSize : 0;
      if (uSize > maxFile) {
        throw new Error('File bên trong gói nén quá lớn (' + Math.round(uSize / 1048576) + ' MB, vượt giới hạn cho phép).');
      }
      total += Math.max(0, uSize);
      if (total > maxTotal) {
        throw new Error('Tổng dung lượng giải nén vượt giới hạn cho phép (' + Math.round(maxTotal / 1048576) + ' MB).');
      }
    }
    return total;
  }

  HAK.Util = {
    hasNum,
    vnDate,
    asNum,
    asOptNum,
    asId,
    stripXmlCtrl,
    cleanArchiveMeta,
    cleanIssuedRec,
    cleanBatchMeta,
    cleanAuthStore,
    validateConfigData,
    validateGsyncConfig,
    isAllowedBackupKey,
    validateBackupKey,
    checkZipLimits,
  };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Util;
})(typeof window !== 'undefined' ? window : globalThis);
