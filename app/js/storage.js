/**
 * storage.js — HAK.Storage: chọn nguồn dữ liệu chính (backend) lúc khởi động và nói chuyện với HAKDocs-SQLite.
 *
 *   mode 'idb'    : IndexedDB của trình duyệt (portable, hoặc Windows chưa di trú).
 *   mode 'sqlite' : cơ sở dữ liệu SQLite do HAKDocs giữ trong thư mục dữ liệu người dùng — NGUỒN CHÍNH. localStorage chỉ còn là bản đệm (cache) được nạp lại từ SQLite mỗi lần mở app.
 *   mode 'blocked': lần trước đã dùng SQLite nhưng lần này không kết nối / không đọc được → CHẶN, không lặng lẽ quay về IndexedDB cũ (tránh sửa nhầm nguồn).
 *
 * Quyết định dựa trên cờ do MÁY CHỦ giữ (meta.active_backend), không dựa trên cờ ở trình duyệt; trình duyệt chỉ nhớ một "gợi ý" (hak-storage-mode, không tiền tố hak.)
 * để phát hiện trường hợp đã dùng SQLite mà nay mất kết nối. Mã bảo vệ (HAK_DOCS_TOKEN) chỉ đi qua header, không ghi log / không lưu.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const HINT = 'hak-storage-mode';
  const S = {
    mode: 'idb',
    _p: null,
    status: null, // phản hồi /db/status lần khởi động (có file, dataDir, schema, size…)
    error: null,
    available: false, // HAKDocs-SQLite trả lời (dùng cho màn di trú)
    session: null,
    scope: null,
    user: '',
  };
  const url = () => (root.HAK_DB_URL || 'http://127.0.0.1:31879').replace(/\/$/, '');
  const token = () => root.HAK_DOCS_TOKEN || '';
  const hint = {
    get() {
      try {
        return root.localStorage.getItem(HINT);
      } catch (e) {
        return null;
      }
    },
    set(v) {
      try {
        if (v) root.localStorage.setItem(HINT, v);
        else root.localStorage.removeItem(HINT);
      } catch (e) {
        /* bị chặn */
      }
    },
  };

  /** Gọi HAKDocs. Lỗi: Error có .code ('conflict' | 'fk' | 'unique' | 'scope' | 'unreachable' …), .status, .detail; .conflict = true khi xung đột phiên bản. */
  async function call(path, body, opt) {
    opt = opt || {};
    const headers = { 'X-HAK-Client': 'documents-v1', 'X-HAK-Token': token() };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (S.session && !opt.noSession) headers['X-HAK-Session'] = S.session;
    let r;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null,
      timer = ctl ? setTimeout(() => ctl.abort(), opt.timeout || 120000) : null;
    try {
      // Yêu cầu CHỈ ĐỌC (đọc bảng, kiểm tra; KHÔNG áp dụng cho thăm dò trạng thái) gặp lỗi mạng tạm thời (vd Windows hết bộ đệm socket: ERR_NO_BUFFER_SPACE) thì thử lại ngắn.
      // Yêu cầu GHI không thử lại: không biết đã tới máy chủ chưa → tránh ghi trùng (khóa lạc quan chỉ chặn ghi đè, không chặn thêm mới).
      const readOnly = path === '/db/query' || path === '/db/check';
      for (let attempt = 0; ; attempt++) {
        try {
          r = await fetch(url() + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: ctl ? ctl.signal : undefined,
          });
          break;
        } catch (e) {
          if (!readOnly || attempt >= 3 || (e && e.name === 'AbortError')) throw e;
          await new Promise((ok) => setTimeout(ok, 150 * (attempt + 1)));
        }
      }
    } catch (e) {
      throw Object.assign(new Error('Không kết nối được cơ sở dữ liệu SQLite (HAKDocs). Hãy mở app bằng lối tắt HAK.'), {
        code: 'unreachable',
        cause: e,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    let j = null;
    try {
      j = await r.json();
    } catch (e) {
      /* thân không phải JSON */
    }
    if (!r.ok) {
      const er = (j && j.error) || {};
      throw Object.assign(new Error(er.message || 'Cơ sở dữ liệu trả lỗi ' + r.status), {
        code: er.code || 'io',
        status: r.status,
        detail: er,
        conflict: er.code === 'conflict',
      });
    }
    return j;
  }

  async function openSession(scope, user) {
    if (S.session) await call('/db/session/close', {}).catch(() => {});
    S.session = null;
    const j = await call('/db/session', { scope, user: user || '' }, { noSession: true });
    S.session = j.session;
    S.scope = scope;
    S.user = user || '';
    return j;
  }

  // Khóa mà BẢN CŨ ghi thẳng localStorage (không qua HAK.Store) nên chưa có trong kv: khi nâng cấp phải GIỮ giá trị cũ rồi đẩy vào kv,
  // nếu không hydrate() xóa mất (bộ lọc đã lưu, Năm làm việc, giao diện). Khóa đã có trong kv thì kv thắng (SQLite là nguồn chính).
  const LEGACY_DIRECT = (k) =>
    k === 'hak.sf.presets' ||
    k === 'hak.rf.presets' ||
    k === 'hak.workingYear' ||
    k === 'hak.design.theme' ||
    k.indexOf('hak.sf.presets.bak.') === 0;
  /** Nạp lại localStorage TỪ SQLite (SQLite là nguồn chính): xóa khóa hak.* cũ trong localStorage rồi ghi theo kv. Khóa cũ chưa có trong kv (LEGACY_DIRECT) được giữ lại ở S.orphans để init đẩy vào kv. */
  async function hydrate() {
    const rows = (await call('/db/query', { table: 'kv' })).rows;
    const have = new Set(rows.map((r) => r.key));
    let ls;
    S.orphans = [];
    try {
      ls = root.localStorage;
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (k && k.indexOf('hak.') === 0) {
          if (!have.has(k) && LEGACY_DIRECT(k)) S.orphans.push([k, ls.getItem(k)]);
          ls.removeItem(k);
        }
      }
      for (const r of rows) if (r.key.indexOf('hak.') === 0) ls.setItem(r.key, r.val);
      for (const [k, v] of S.orphans) ls.setItem(k, v); // giữ nguyên trong localStorage (cache) trong lúc chờ đẩy vào kv
    } catch (e) {
      /* localStorage bị chặn: Store dùng RAM, vẫn đọc được qua kv */
    }
    return rows.length;
  }
  /** Đẩy các khóa cũ (S.orphans) vào kv qua HAK.Store — sau khi chế độ SQLite đã bật (HAK.DB ghi vào SQLite). */
  function adoptOrphans() {
    const list = S.orphans || [];
    S.orphans = [];
    if (!list.length || !root.HAK || !root.HAK.Store) return 0;
    let n = 0;
    for (const [k, raw] of list) {
      let val;
      try {
        val = JSON.parse(raw);
      } catch (e) {
        val = raw;
      }
      try {
        if (root.HAK.Store.set(k, val) !== false) n++;
      } catch (e) {
        /* giữ trong localStorage, thử lại lần mở sau */
      }
    }
    return n;
  }

  async function init() {
    const expected = hint.get() === 'sqlite';
    // Chỉ thăm dò HAKDocs khi CÓ MÃ BẢO VỆ (HAKDocs đã chạy và ghi native/hakdocs-token.js — bản cài Windows) hoặc lần trước đã dùng SQLite (để chặn đúng).
    // Bản HTML / portable: tệp mã còn trống → không gọi mạng, không có lỗi "ERR_CONNECTION_REFUSED" trong console mỗi lần mở.
    if (!token() && !expected) {
      S.available = false;
      return S;
    }
    let st = null;
    try {
      st = await call('/db/status', undefined, { noSession: true, timeout: 4000 });
    } catch (e) {
      S.available = false;
      if (expected) {
        S.mode = 'blocked';
        S.error =
          'Lần trước app dùng cơ sở dữ liệu SQLite nhưng lần này không kết nối được (' +
          e.message +
          '). Để tránh sửa nhầm dữ liệu cũ, app dừng lại.';
      }
      return S;
    }
    S.available = true;
    S.status = st;
    if (st.active === 'sqlite') {
      try {
        await openSession(null, 'boot');
        await hydrate();
        S.mode = 'sqlite';
        hint.set('sqlite');
        adoptOrphans();
      } catch (e) {
        S.mode = 'blocked';
        S.error = 'Không đọc được cơ sở dữ liệu SQLite: ' + e.message;
      }
    } else if (expected) {
      S.mode = 'blocked';
      S.error =
        'Lần trước app dùng SQLite nhưng cơ sở dữ liệu hiện chưa được kích hoạt (có thể đã bị thay bằng tệp khác). App dừng để tránh sửa nhầm nguồn.';
    }
    return S;
  }

  S.call = call;
  S.openSession = openSession;
  S.hydrate = hydrate;
  S.adoptOrphans = adoptOrphans;
  S.hint = hint;
  S.url = url;
  S.isSqlite = () => S.mode === 'sqlite';
  /** Chỉ dùng trong kiểm thử: quên trạng thái đã khởi tạo để chạy lại init() với cấu hình mới. */
  S._reset = () => {
    S._p = null;
    S.mode = 'idb';
    S.status = null;
    S.error = null;
    S.available = false;
    S.session = null;
  };
  S.start = () => (S._p = S._p || init().then((x) => (S.paint(), x)));
  S.whenReady = () => S.start();
  /** Dừng mọi thao tác dữ liệu khi bị chặn. */
  S.assertOpen = () => {
    if (S.mode === 'blocked') throw Object.assign(new Error(S.error || 'Nguồn dữ liệu đang bị chặn.'), { code: 'blocked' });
  };
  /** Tên và nơi lưu để hiển thị cho người dùng. */
  /** Ghi nơi lưu dữ liệu lên giao diện (nhãn ở thanh bên + gợi ý đường dẫn) — để người dùng luôn biết đang sửa nguồn nào. */
  S.paint = () => {
    if (typeof document === 'undefined') return;
    const d = S.describe(),
      label = S.mode === 'sqlite' ? 'SQLite' : S.mode === 'blocked' ? 'BỊ CHẶN' : 'Trình duyệt';
    document.querySelectorAll('[data-hak-storage]').forEach((el) => {
      el.textContent = label;
      el.title = d.backend + (d.where ? ' — ' + d.where : '') + (d.note ? '. ' + d.note : '');
      el.className = S.mode === 'blocked' ? 'text-danger' : S.mode === 'sqlite' ? 'text-success' : '';
      if (el.parentElement) el.parentElement.hidden = false;
    });
  };
  /** Màn chặn toàn trang khi nguồn dữ liệu không dùng được (không cho thao tác trên nguồn sai). */
  S.showBlocked = () => {
    if (typeof document === 'undefined') return;
    const box = document.createElement('div');
    box.id = 'storageBlocked';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-labelledby', 'storageBlockedTitle');
    box.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:var(--bs-body-bg,#fff);color:var(--bs-body-color,#212529);display:flex;align-items:center;justify-content:center;padding:24px';
    const card = document.createElement('div');
    card.style.cssText = 'max-width:640px;width:100%';
    const h = document.createElement('h1');
    h.id = 'storageBlockedTitle';
    h.className = 'h4 text-danger';
    h.textContent = '⛔ Không mở được nơi lưu dữ liệu';
    const p = document.createElement('p');
    p.textContent = S.error || 'Nguồn dữ liệu đang bị chặn.';
    const q = document.createElement('p');
    q.className = 'text-muted';
    q.textContent =
      'Dữ liệu của bạn chưa bị mất. Đóng cửa sổ này, mở lại app bằng lối tắt HAK trên Desktop / Start rồi thử lại. Nếu vẫn lỗi, dùng bản sao lưu .zip gần nhất (Cài đặt → Sao lưu) hoặc liên hệ người hỗ trợ.';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-primary';
    b.textContent = 'Thử kết nối lại';
    b.addEventListener('click', () => location.reload());
    card.append(h, p, q, b);
    box.append(card);
    document.body.append(box);
    b.focus();
  };
  S.describe = () =>
    S.mode === 'sqlite'
      ? {
          backend: 'SQLite (HAKDocs)',
          where: (S.status && S.status.file) || '',
          note: 'Dữ liệu nằm ngoài thư mục cài đặt và không phụ thuộc trình duyệt.',
        }
      : S.mode === 'blocked'
        ? { backend: 'Bị chặn', where: '', note: S.error || '' }
        : {
            backend: root.indexedDB ? 'IndexedDB (trình duyệt)' : 'RAM tạm',
            where: 'Hồ sơ trình duyệt hiện tại (file://)',
            note: 'Dữ liệu gắn với trình duyệt / profile đang mở.',
          };

  HAK.Storage = S;
  if (typeof document !== 'undefined') S.start(); // trình duyệt: tự khởi động; Node (test) gọi start() sau khi cấu hình HAK_DB_URL
})(typeof window !== 'undefined' ? window : globalThis);
