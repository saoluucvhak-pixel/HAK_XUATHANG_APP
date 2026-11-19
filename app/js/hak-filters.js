/* HAK app adapter for the vendored HAK_SMART_FILTER UI and headless engine. */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {}),
    SF = root.HAKSmartFilter.core;
  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'text') e.textContent = v;
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v);
    });
    (kids || []).filter(Boolean).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }
  let UI;
  const api = () =>
    UI ||
    (UI = root.HAKUI.smartFilter.create({
      h,
      btn: (text, cls, action, title) => {
        const b = h('button', { type: 'button', class: 'b ' + (cls || ''), text, title: title || text });
        b.addEventListener('click', action);
        return b;
      },
      toast: (s) => HAK.UI.toast(s, 'warning'),
      storage: () => presetStorage, // bền như mọi khóa hak.* (HAK.Store → kv của SQLite / IndexedDB); KHÔNG ghi thẳng localStorage (hydrate SQLite sẽ xóa)
      dateField: (iso, attrs) => h('input', Object.assign({ type: 'date', value: iso || '' }, attrs)),
      dateIso: (el) => (!el.validity.valid ? null : el.value),
      askText: (title, label, opt, done) => {
        // A nested dialog keeps the draft filter and its focus intact.
        const d = h('dialog', { class: 'hak-preset-dialog', 'aria-label': title });
        const name = h('input', { type: 'text', class: 'form-control', maxlength: '80', 'aria-label': label });
        const error = h('div', { class: 'text-danger small', role: 'alert' });
        const close = () => {
          d.close();
          d.remove();
        };
        const save = h('button', { type: 'button', class: 'btn btn-primary', text: 'Lưu' });
        save.addEventListener('click', () => {
          if (!name.value.trim()) {
            error.textContent = 'Nhập tên bộ lọc.';
            name.focus();
            return;
          }
          const v = name.value;
          close();
          done(v);
        });
        const cancel = h('button', { type: 'button', class: 'btn btn-outline-secondary', text: 'Hủy' });
        cancel.addEventListener('click', close);
        d.append(
          h('h3', { class: 'h5', text: title }),
          h('label', { text: label }, [name]),
          error,
          h('div', { class: 'd-flex justify-content-end gap-2 mt-3' }, [cancel, save])
        );
        document.body.append(d);
        d.showModal();
        name.focus();
        d.addEventListener('close', () => d.remove());
      },
    }));
  function assertState(state) {
    for (const key of ['tu', 'den'])
      if (state[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(state[key]) || SF.parseVN(state[key]) !== state[key]))
        throw new RangeError('Ngày lọc không hợp lệ.');
    const issue = SF.dateProblem(state);
    if (issue) throw new RangeError('Từ ngày phải nhỏ hơn hoặc bằng đến ngày.');
  }
  function multi(key, label, options, value) {
    return { key, label, type: 'multi', options, match: (r, sel) => SF.inSet(sel, value(r)) };
  }
  function day(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).toISOString().slice(0, 10) : '';
    return SF.parseVN(String(value || '').trim()) || '';
  }
  function dateMatch(value, from, to) {
    const d = day(value);
    return !!d && (!from || d >= from) && (!to || d <= to);
  }
  /**
   * Kho bộ lọc đã lưu cho thư viện Smart Filter — v2.25.0 (mục 32, quyết định 36): TÁCH THEO TÀI KHOẢN + CÔNG TY.
   * Thư viện đọc / ghi khóa chung "hak.sf.presets" (và bản sao "hak.sf.presets.bak.*"); adapter đổi sang khóa riêng
   * "hak.sf.presets@<mã tài khoản>@<công ty đang làm>" (+ đuôi bak). GHI qua HAK.Store (vào kv của SQLite / IndexedDB, có trong sao lưu).
   * Kho dùng chung của bản cũ KHÔNG bị xóa; chỉ tài khoản QUẢN TRỊ được chép nó vào kho riêng ở lần đọc đầu (nhân viên bắt đầu từ kho trống,
   * không thấy tên / điều kiện bộ lọc của người khác). Chưa đăng nhập (màn đăng nhập) → dùng khóa chung như cũ.
   */
  const SF_BASE = 'hak.sf.presets';
  function presetKey(k, who, co) {
    k = String(k);
    if (k.indexOf(SF_BASE) !== 0 || !who || !co) return k;
    return SF_BASE + '@' + who + '@' + co + k.slice(SF_BASE.length);
  }
  function presetOwner() {
    const A = HAK.Auth,
      u = A && A.current ? A.current() : null;
    return {
      who: u && u.id ? String(u.id) : '',
      co: A && A.company ? String(A.company() || '') : '',
      admin: !!(A && A.isAdmin && A.isAdmin()),
    };
  }
  const rawGet = (k) => {
    try {
      const v = root.localStorage.getItem(k);
      if (v !== null) return v;
    } catch (e) {
      /* localStorage bị chặn: đọc từ bộ nhớ của Store */
    }
    const g = HAK.Store ? HAK.Store.get(k, null) : null;
    return g === null || g === undefined ? null : typeof g === 'string' ? g : JSON.stringify(g);
  };
  const rawSet = (k, v) => {
    let val;
    try {
      val = JSON.parse(v);
    } catch (e) {
      val = String(v); // bản sao kho hỏng (văn bản thô) được giữ nguyên chữ
    }
    if (!HAK.Store || HAK.Store.set(k, val) === false) throw new Error('Không lưu được trên máy này');
  };
  const presetStorage = {
    getItem(k) {
      const o = presetOwner(),
        mine = presetKey(k, o.who, o.co);
      let v = rawGet(mine);
      if (v === null && mine !== k && k === SF_BASE && o.admin) {
        const legacy = rawGet(SF_BASE); // bản cũ dùng chung → chép cho quản trị một lần, giữ nguyên bản gốc
        if (legacy !== null) {
          try {
            rawSet(mine, legacy);
          } catch (e) {
            /* chưa chép được: vẫn hiển thị, lần sau thử lại */
          }
          v = legacy;
        }
      }
      return v;
    },
    setItem(k, v) {
      const o = presetOwner();
      rawSet(presetKey(k, o.who, o.co), v);
    },
  };
  function mount(host, opt) {
    const el = typeof host === 'string' ? document.querySelector(host) : host;
    if (!el) throw Error('Missing filter host: ' + host);
    const cfg = { screenId: opt.screenId, fields: opt.fields || [], matchQ: opt.matchQ, matchDate: opt.matchDate };
    const engine = root.HAKSmartFilter.createFilter(cfg, { initialState: opt.initialState });
    let view;
    const change = () => {
      if (opt.onApply) opt.onApply(engine.getState());
    };
    const set = (s) => {
      try {
        assertState(s);
        engine.setState(s);
      } catch (e) {
        HAK.UI.toast(e.message, 'warning');
        return false;
      }
      return true;
    };
    const read = () => {
      const rows = opt.source ? opt.source() : [];
      const r = engine.filter(rows);
      if (opt.summary) r.summary = opt.summary(r);
      return r;
    };
    const uiCfg = Object.assign({}, cfg, {
      quickFields: opt.quickFields || ['q'].concat(cfg.fields.slice(0, 2).map((f) => f.key)),
      advancedFields: ['q'].concat(
        opt.matchDate ? ['dates'] : [],
        cfg.fields.map((f) => f.key)
      ),
      periods: () =>
        Array.from(
          new Set(
            (opt.source ? opt.source() : [])
              .map((r) => day(r.dateStr || r.from || r.date || r.at || r.updatedAt))
              .filter(Boolean)
              .map((d) => d.slice(0, 7))
          )
        )
          .sort()
          .reverse()
          .map((value) => ({ value, label: value.slice(5) + '/' + value.slice(0, 4) })),
      searchPlaceholder: opt.searchPlaceholder || 'Tìm không dấu…',
      state: { get: engine.getState, set },
      dataSource: read,
      summary: opt.summary || ((r) => [{ label: 'Bộ lọc', value: SF.activeCount(r.state) }]),
      onApply: change,
      onReset: opt.onReset,
    });
    view = api().mount(uiCfg);
    el.replaceChildren(view.el);
    return {
      filter: (rows) => engine.filter(rows),
      getState: engine.getState,
      setState: (s, notify) => {
        if (set(s)) {
          if (notify) change();
          view.refresh();
          return true;
        }
        return false;
      },
      refresh: () => view.refresh(),
      describe: engine.describe,
      el: view.el,
    };
  }

  const tripFields = (options) => [
    multi(
      'plate',
      'Biển số',
      () => options('plate'),
      (r) => r.plate
    ),
    multi(
      'carrier',
      'Đơn vị vận chuyển',
      () => options('carrier'),
      (r) => r.carrier
    ),
    { key: 'warnings', label: 'Chỉ dòng có cảnh báo', type: 'bool', match: (r) => !!(r.warn && r.warn.length) },
  ];
  /** Khớp biển số theo khóa chuẩn hóa (quy tắc 26): "43C11111" ≡ "43c-111.11" ≡ "43C 111 11" — cùng khóa với Tìm kiếm chung. */
  const plateKey = (v) => SF.fold(v == null ? '' : String(v)).replace(/[^a-z0-9]+/g, '');
  const plateHit = (plate, q) => {
    const k = plateKey(q);
    return !!k && plateKey(plate).includes(k);
  };
  function tripConfig(options) {
    return {
      screenId: 'trips',
      fields: tripFields(options || (() => [])),
      matchQ: (r, q) => SF.hay([r.ticket, r.plate, r.driver, r.carrier, r.note, r.weigher]).includes(q) || plateHit(r.plate, q),
      matchDate: (r, f, t) => dateMatch(r.dateStr || r.ts1, f, t),
    };
  }
  function trips(rows, state) {
    assertState(state);
    const allowed = { sel: ['plate', 'carrier'], one: [], flag: ['warnings'] };
    for (const kind of Object.keys(allowed))
      for (const key of Object.keys(state[kind] || {}))
        if (!allowed[kind].includes(key)) throw new RangeError('Điều kiện lọc không được hỗ trợ: ' + key);
    return root.HAKSmartFilter.createFilter(tripConfig(), { initialState: state }).filter(rows).rows;
  }
  HAK.Filters = { mount, multi, day, dateMatch, assertState, core: SF, tripConfig, trips, plateHit, presetStorage, presetKey };
})(typeof window !== 'undefined' ? window : globalThis);
