/**
 * ui.js — Tiện ích giao diện dùng chung: toast, loading, thanh tiến độ, escape HTML, chủ đề sáng/tối.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------- Toast ---------- */
  const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  const GENERIC =
    'Đã xảy ra lỗi ngoài dự kiến. Thử lại; nếu vẫn lỗi, ghi lại thao tác vừa làm và báo người hỗ trợ (chi tiết kỹ thuật ở Console, phím F12).';
  /**
   * Thông báo lỗi dành cho người dùng: thông báo tiếng Việt do app viết giữ nguyên; thông báo THÔ của trình duyệt / JavaScript (tiếng Anh, "Cannot read properties…", khung stack,
   * đường dẫn tệp, mã ERR_…, "[object Object]") KHÔNG hiện ra — thay bằng câu chung, bản gốc ghi ở Console.
   */
  function friendly(msg) {
    const s = String(msg == null ? '' : msg);
    const leaks =
      /\bat [\w$.<>[\] ]+ \(|\bat (file|https?):\/|file:\/\/|[\w-]+\.(js|cjs|mjs):\d+|\bERR_[A-Z_]+|\[object |\bundefined\b|\bNaN\b/.test(
        s
      );
    const rawEnglish = !VI.test(s) && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s) && /^[\x20-\x7E\s]*$/.test(s) && s.length > 12;
    return leaks || rawEnglish ? GENERIC : s;
  }
  function toast(msg, type, ms) {
    type = type || 'info';
    if (type === 'error' || type === 'warning') {
      const shown = friendly(msg);
      if (shown !== String(msg == null ? '' : msg)) {
        try {
          console.error('[thông báo lỗi gốc]', msg);
        } catch (e) {
          /* không có console */
        }
        msg = shown;
      }
    }
    const cls = { success: 'text-bg-success', error: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-primary' }[type];
    const el = document.createElement('div');
    el.className = 'toast align-items-center border-0 ' + cls;
    el.setAttribute('role', 'alert');
    el.innerHTML =
      '<div class="d-flex"><div class="toast-body">' +
      esc(msg) +
      '</div>' +
      '<button type="button" class="btn-close ' +
      (type === 'warning' ? '' : 'btn-close-white') +
      ' me-2 m-auto" data-bs-dismiss="toast"></button></div>';
    $('#toasts').appendChild(el);
    const t = new bootstrap.Toast(el, { delay: ms || (type === 'error' ? 8000 : 4500) });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  /* ---------- Loading overlay + thanh tiến độ trên cùng ---------- */
  let topTimer = null;
  const Loading = {
    show(msg) {
      $('#loading').classList.remove('d-none');
      this.set(0, msg || 'Đang xử lý…');
    },
    set(pct, msg) {
      if (msg) $('#loadingMsg').textContent = msg;
      pct = Math.max(0, Math.min(100, pct || 0));
      $('#loadingBar').style.width = pct + '%';
      $('#loadingPct').textContent = Math.round(pct) + '%';
      Loading.top(pct);
    },
    hide() {
      $('#loading').classList.add('d-none');
      Loading.top(100);
    },
    top(pct) {
      const bar = $('#topProgress .bar');
      clearTimeout(topTimer);
      bar.style.width = pct + '%';
      if (pct >= 100)
        topTimer = setTimeout(() => {
          bar.style.width = '0%';
        }, 500);
    },
  };

  /* ---------- Chủ đề ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute('data-bs-theme', t);
    HAK.Store.set('hak.theme', t);
  }
  function toggleTheme() {
    setTheme(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
  }

  /** Nút "bấm 2 lần để xác nhận" (tránh dùng hộp thoại confirm của trình duyệt). */
  function confirmClick(btn, action, label) {
    if (btn.dataset.armed === '1') {
      clearTimeout(btn._t);
      btn.dataset.armed = '';
      btn.innerHTML = btn.dataset.orig;
      action();
      return;
    }
    btn.dataset.armed = '1';
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = label || 'Bấm lần nữa để xác nhận';
    btn._t = setTimeout(() => {
      btn.dataset.armed = '';
      btn.innerHTML = btn.dataset.orig;
    }, 3500);
  }

  const debounce = (fn, ms) => {
    let t;
    return function () {
      const a = arguments,
        c = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(c, a), ms || 200);
    };
  };
  const todayISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ---------- Nạp thư viện khi cần (không nạp sẵn lúc mở app để khởi động nhanh) ---------- */
  const loaded = {};
  /** Chèn <script src> một lần; lỗi thì cho phép thử lại lần sau. */
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((res, rej) => {
        const s = document.createElement('script');
        const timer = setTimeout(() => {
          s.remove();
          delete loaded[src];
          rej(new Error('Nạp thư viện quá 15 giây: ' + src + '. Mở lại app bằng lối tắt bản cài.'));
        }, 15000);
        s.src = src;
        s.onload = () => {
          clearTimeout(timer);
          res();
        };
        s.onerror = () => {
          clearTimeout(timer);
          s.remove();
          delete loaded[src];
          rej(new Error('Không nạp được ' + src));
        };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }
  /** Thư viện nặng chỉ dùng ở vài chức năng: [biến toàn cục kiểm tra, file]. */
  const LIBS = {
    exceljs: ['ExcelJS', 'libs/exceljs.min.js'], // Xuất Excel lưu trữ, Báo cáo tổng hợp (~0,9 MB)
    docxPreview: ['docx', 'libs/docx-preview.min.js'], // Tải PDF biên bản (dựng trang từ Word)
  };
  async function needLib(name) {
    const L = LIBS[name];
    if (L && !root[L[0]]) await loadScript(L[1]);
  }

  /* ---------- Trả tiêu điểm về nút đã mở hộp thoại (người dùng bàn phím không bị mất vị trí) ---------- */
  const openers = new WeakMap();
  if (typeof document !== 'undefined') {
    document.addEventListener('show.bs.modal', (e) => {
      const a = document.activeElement;
      if (a && a !== document.body && !e.target.contains(a)) openers.set(e.target, a);
    });
    document.addEventListener('hidden.bs.modal', (e) => {
      const a = openers.get(e.target);
      openers.delete(e.target);
      // hộp thoại khác (chồng lên) vẫn đang mở thì để hộp đó giữ tiêu điểm
      if (document.querySelector('.modal.show')) return;
      if (a && document.contains(a) && !a.disabled && a.getClientRects().length) {
        try {
          a.focus({ preventScroll: true });
        } catch (err) {
          /* phần tử không nhận tiêu điểm */
        }
      }
    });
  }
  HAK.UI = { $, $$, esc, toast, friendly, Loading, setTheme, toggleTheme, confirmClick, debounce, todayISO, loadScript, needLib };
})(window);
