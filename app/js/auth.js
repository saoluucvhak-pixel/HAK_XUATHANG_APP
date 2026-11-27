/** Đăng nhập tùy chọn và công ty làm việc của ứng dụng offline. */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const KEY = 'hak.auth.v1',
    SKEY = 'hak.session',
    ITER = 2000;
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ---------------- SHA-256 (thuần JS — chạy như nhau trên mọi máy, kể cả khi mở từ file://) ---------------- */
  const K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
    0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
    0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
    0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  function sha256hex(str) {
    const bytes = unescape(encodeURIComponent(str)),
      n = bytes.length;
    const words = new Array(((n + 9 + 63) >> 6) << 4).fill(0);
    for (let i = 0; i < n; i++) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i & 3) * 8);
    words[n >> 2] |= 0x80 << (24 - (n & 3) * 8);
    words[words.length - 1] = n * 8;
    let h0 = 0x6a09e667,
      h1 = 0xbb67ae85,
      h2 = 0x3c6ef372,
      h3 = 0xa54ff53a,
      h4 = 0x510e527f,
      h5 = 0x9b05688c,
      h6 = 0x1f83d9ab,
      h7 = 0x5be0cd19;
    const w = new Array(64),
      ror = (x, r) => (x >>> r) | (x << (32 - r));
    for (let j = 0; j < words.length; j += 16) {
      for (let i = 0; i < 64; i++) {
        if (i < 16) w[i] = words[j + i] | 0;
        else {
          const a = w[i - 15],
            b = w[i - 2];
          w[i] = (w[i - 16] + (ror(a, 7) ^ ror(a, 18) ^ (a >>> 3)) + w[i - 7] + (ror(b, 17) ^ ror(b, 19) ^ (b >>> 10))) | 0;
        }
      }
      let a = h0,
        b = h1,
        c = h2,
        d = h3,
        e = h4,
        f = h5,
        g = h6,
        h = h7;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
        const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
      h5 = (h5 + f) | 0;
      h6 = (h6 + g) | 0;
      h7 = (h7 + h) | 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function hashPw(pw, salt) {
    let h = sha256hex(salt + ':' + pw);
    for (let i = 0; i < ITER; i++) h = sha256hex(h + salt);
    return h;
  }
  function rand(n, abc) {
    abc = abc || 'abcdefghijkmnpqrstuvwxyz23456789';
    const a = new Uint8Array(n);
    (root.crypto || root.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => abc[b % abc.length]).join('');
  }
  const newRecoveryCode = () => rand(12, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789').replace(/(.{4})(?=.)/g, '$1-');
  const normCode = (s) =>
    String(s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  const normUser = (s) =>
    String(s || '')
      .trim()
      .toLowerCase();

  const LASTCO = 'hak.auth.lastco',
    SCOPE = 'hak.scope.v1';
  const rawData = () => HAK.Store.get(KEY, undefined);
  const data = () => rawData() || { users: [] };
  const station = () => {
    const st = data().station;
    return st && Array.isArray(st.cos) && st.cos.length ? st.cos.slice() : null;
  };
  const companies = () => (HAK.Config && HAK.Config.data && HAK.Config.data.companies) || [];
  function allowedCos() {
    const st = station();
    return companies()
      .map((c) => c.id)
      .filter((id) => !st || st.includes(id));
  }
  let cur = null,
    curCo = '',
    loggedIn = false;
  const sessGet = () => {
    try {
      return JSON.parse(root.sessionStorage.getItem(SKEY) || 'null');
    } catch (e) {
      return null;
    }
  };
  const sessSet = (value) => {
    try {
      if (value) root.sessionStorage.setItem(SKEY, JSON.stringify(value));
      else root.sessionStorage.removeItem(SKEY);
    } catch (e) {
      /* Storage can be blocked. */
    }
  };
  const reload = () => (HAK.reloadAfterWrites ? HAK.reloadAfterWrites() : location.reload());

  async function save(expected, next) {
    if (HAK.Store.flush) await HAK.Store.flush();
    if (HAK.DB && HAK.DB.usable()) {
      const sqlite = HAK.Storage && HAK.Storage.mode === 'sqlite';
      await HAK.DB.kvCas(
        KEY,
        (current) =>
          JSON.stringify(current) === JSON.stringify(expected) || (!sqlite && current === undefined)
            ? null
            : 'Cài đặt đăng nhập đã thay đổi ở cửa sổ khác. Hãy tải lại ứng dụng.',
        next
      );
      HAK.Store.set(KEY, next, { dbCommitted: true });
    } else {
      if (JSON.stringify(rawData()) !== JSON.stringify(expected)) throw new Error('Cài đặt đăng nhập đã thay đổi. Hãy tải lại ứng dụng.');
      if (HAK.Store.set(KEY, next) === false) throw new Error('Không lưu được cấu hình đăng nhập.');
    }
  }

  function modeData(previous, mode, account, rec) {
    const id = account ? account.id : previous.profileId || 'u' + newStamp();
    const next = { v: 2, mode, profileId: id, users: account ? [account] : [] };
    if (rec) next.rec = rec;
    if (previous.station) next.station = previous.station;
    return next;
  }

  // Older administrator credentials may be verified once to migrate the machine. Former staff accounts never grant access.
  const legacyLogin = (d) => d.v !== 2 && Array.isArray(d.users) && d.users.some((u) => u.role === 'admin');
  const loginUser = (d, name, recovery = false) =>
    (d.users || []).find((u) => u.username === name && (d.v === 2 || u.role === 'admin') && (recovery || !u.disabled));
  const newStamp = () => rand(24);
  function migratedAccount(u) {
    const { id, username, name, salt, hash, alg, iter } = u;
    return { id, username, name, salt, hash, alg, iter, stamp: newStamp() };
  }

  /* v2.16.2: băm mới = PBKDF2-SHA-256 (WebCrypto, 210.000 vòng) → { alg:'p2', iter, salt, hash }. Bản ghi cũ (SHA-256 × 2.000 vòng, không có alg) vẫn đăng nhập được
   * và được băm lại sang PBKDF2 ngay lần đăng nhập đúng kế tiếp. Trình duyệt không có WebCrypto → rơi về băm cũ (vẫn dùng được). */
  const PW_ITER = 210000,
    subtleHas = () => !!(root.crypto && root.crypto.subtle && root.TextEncoder);
  async function pbkdf2hex(secret, salt, iter) {
    const enc = new TextEncoder(),
      key = await root.crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await root.crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter },
      key,
      256
    );
    return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function hashRec(secret) {
    const salt = rand(16);
    return subtleHas()
      ? { alg: 'p2', iter: PW_ITER, salt, hash: await pbkdf2hex(secret, salt, PW_ITER) }
      : { salt, hash: hashPw(secret, salt) };
  }
  async function verifyRec(rec, secret) {
    if (!rec || !rec.salt || !rec.hash) return false;
    if (rec.alg === 'p2') return subtleHas() && (await pbkdf2hex(secret, rec.salt, rec.iter || PW_ITER)) === rec.hash;
    return hashPw(secret, rec.salt) === rec.hash;
  }
  const isLegacy = (rec) => !!(rec && rec.salt && rec.alg !== 'p2');
  async function setPassword(u, pw) {
    delete u.alg;
    delete u.iter;
    Object.assign(u, await hashRec(pw));
  }
  const checkPw = (u, pw) => verifyRec(u, pw);
  function pwProblem(pw) {
    return String(pw || '').length < 6 ? 'Mật khẩu tối thiểu 6 ký tự.' : '';
  }
  async function setRecovery(d) {
    const code = newRecoveryCode();
    d.rec = await hashRec(normCode(code));
    return code;
  }

  const b64Bytes = (s) => {
    const bin = atob(
      String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '') + '==='.slice((String(s).replace(/\s+/g, '').length + 3) % 4)
    );
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  async function importPub(b64) {
    const raw = b64Bytes(b64);
    if (raw.length !== 65 || raw[0] !== 4)
      throw new Error('Khóa công khai không đúng (cần 65 byte, dạng base64 lấy từ công cụ khôi phục).');
    return root.crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  /** Kiểm tra mã phản hồi — trả '' nếu hợp lệ, ngược lại là lý do. */
  async function checkReset(pubB64, chal, user, code) {
    let b;
    try {
      b = b64Bytes(String(code || '').trim());
    } catch (e) {
      return 'Mã phản hồi không đúng định dạng.';
    }
    if (b.length !== 68) return 'Mã phản hồi không đúng định dạng (thiếu / thừa ký tự).';
    const exp = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3],
      now = Date.now() / 1000;
    if (exp < now) return 'Mã phản hồi đã hết hạn — xin mã mới.';
    if (exp > now + 2 * 86400) return 'Mã phản hồi không hợp lệ (hạn dùng bất thường — kiểm tra đồng hồ máy).';
    const key = await importPub(pubB64);
    const ok = await root.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      b.slice(4),
      new TextEncoder().encode('HAK-RESET|1|' + chal + '|' + user + '|' + exp)
    );
    return ok ? '' : 'Mã phản hồi không khớp mã yêu cầu / tên đăng nhập của máy này.';
  }

  /* ---------------- v2.7.3 MẬT KHẨU CHỦ CỦA NHÓM (Thủy chốt phương án A, 07/10/2026) ----------------
   * 1 câu mật khẩu dài cho cả nhóm, đi kèm Gói cấu hình như khóa nhóm → quên mật khẩu Quản trị ở bất kỳ máy nào: tự đặt lại ngay trong app
   * (không cần file .key / công cụ exe). Máy chỉ lưu d.master = { salt, iter, hash: PBKDF2-SHA256(câu đã chuẩn hóa), fp, at } — không lưu câu gốc.
   * Chuẩn hóa: NFC, gộp khoảng trắng, bỏ khoảng trắng 2 đầu (PHÂN BIỆT hoa / thường). Sai 5 lần → khóa 30 giây (như đăng nhập). */
  const MP_ITER = 310000;
  const normMaster = (s) =>
    String(s || '')
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim();
  const toB64 = (u8) => btoa(String.fromCharCode.apply(null, Array.from(u8)));
  async function masterHash(pass, saltB64, iter) {
    const key = await root.crypto.subtle.importKey('raw', new TextEncoder().encode(normMaster(pass)), 'PBKDF2', false, ['deriveBits']);
    const bits = await root.crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64Bytes(saltB64), iterations: iter || MP_ITER },
      key,
      256
    );
    return toB64(new Uint8Array(bits));
  }
  async function checkMaster(m, pass) {
    return !!(m && m.salt && m.hash) && (await masterHash(pass, m.salt, m.iter)) === m.hash;
  }
  /* ---------------- Màn hình chặn (đăng nhập / tạo quản trị / khôi phục) ---------------- */
  let gate = null,
    resolveGate = null,
    fails = 0,
    lockUntil = 0;
  function showGate(html) {
    if (!gate) {
      gate = document.createElement('div');
      gate.id = 'authGate';
      gate.className = 'auth-gate';
      document.body.appendChild(gate);
    }
    document.body.classList.add('auth-locked');
    gate.innerHTML =
      '<div class="auth-card card"><div class="card-body p-4">' +
      '<div class="d-flex align-items-center gap-3 mb-3"><div class="sb-logo">HAK</div><div><div class="fw-bold">QUẢN LÝ XUẤT HÀNG</div><div class="small muted">HAK Group · chạy offline trên máy này</div></div></div>' +
      html +
      '</div></div>';
    const f = gate.querySelector('input');
    if (f) f.focus();
  }
  function hideGate() {
    if (gate) {
      gate.remove();
      gate = null;
    }
    document.body.classList.remove('auth-locked');
  }
  const err = (t) => {
    const e = gate && gate.querySelector('.auth-err');
    if (e) e.textContent = t || '';
  };
  const field = (id, label, type, extra) =>
    '<div class="mb-2"><label class="form-label" for="' +
    id +
    '">' +
    label +
    '</label><input class="form-control" id="' +
    id +
    '" type="' +
    (type || 'text') +
    '" autocomplete="off"' +
    (extra || '') +
    '></div>';

  function formHandler(form, action) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button[type=submit]');
      if (button.disabled) return;
      const controls = [...gate.querySelectorAll('button, input[type=file]')].filter((control) => !control.disabled);
      controls.forEach((control) => {
        control.disabled = true;
      });
      err('');
      try {
        await action();
      } catch (e2) {
        err(e2.message || 'Không lưu được cấu hình đăng nhập. Hãy thử lại.');
      } finally {
        controls.forEach((control) => {
          control.disabled = false;
        });
      }
    });
  }

  function checkAttempts() {
    if (Date.now() < lockUntil) throw new Error('Sai nhiều lần. Thử lại sau ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' giây.');
  }
  function rejected(message) {
    if (++fails >= 5) {
      lockUntil = Date.now() + 30000;
      fails = 0;
    }
    throw new Error(message);
  }
  function newPassword(form) {
    const pw = form.querySelector('#auPw').value;
    const problem = pwProblem(pw);
    if (problem) throw new Error(problem);
    if (pw !== form.querySelector('#auPw2').value) throw new Error('Hai lần nhập mật khẩu không khớp.');
    return pw;
  }
  function accountForm() {
    return (
      '<form id="authForm">' +
      field('auName', 'Họ tên') +
      field('auUser', 'Tên đăng nhập') +
      field('auPw', 'Mật khẩu (ít nhất 6 ký tự)', 'password') +
      field('auPw2', 'Nhập lại mật khẩu', 'password') +
      '<div class="auth-err text-danger small mb-2" role="status"></div><button class="btn btn-primary w-100" type="submit">Tạo tài khoản</button></form>'
    );
  }

  function screenSetup(firstRun) {
    showGate(
      '<h5 class="mb-2">' +
        (firstRun ? 'Chọn chế độ sử dụng' : 'Bật đăng nhập bằng tài khoản') +
        '</h5>' +
        (firstRun
          ? '<button class="btn btn-outline-primary w-100 mb-3" type="button" id="auSingle">Bỏ qua · Một người sử dụng</button><h6>Sử dụng tài khoản đăng nhập</h6>'
          : '') +
        accountForm() +
        (firstRun && HAK.Backup && HAK.Backup.packRead
          ? '<div class="mt-3"><label class="small link-primary">Nhập gói cấu hình<input type="file" id="auPack" accept=".json,application/json" hidden></label></div>'
          : '') +
        (!firstRun ? '<button class="btn btn-outline-secondary w-100 mt-2" type="button" id="auCancel">Hủy</button>' : '')
    );
    const form = $('#authForm');
    const single = $('#auSingle');
    const picker = $('#auPack');
    if (picker)
      picker.addEventListener('change', async (e) => {
        if (!e.target.files[0]) return;
        try {
          const file = e.target.files[0];
          screenPack(await HAK.Backup.packRead(file), file.name);
        } catch (x) {
          err(x.message);
        }
      });
    const close = $('#auCancel');
    if (close) close.addEventListener('click', hideGate);
    const expected = rawData();
    if (single)
      single.addEventListener('click', async () => {
        single.disabled = true;
        form.querySelector('button').disabled = true;
        if (picker) picker.disabled = true;
        try {
          const next = modeData(expected || {}, 'single');
          await save(expected, next);
          enterSingle(next);
        } catch (e) {
          err(e.message);
          single.disabled = false;
          form.querySelector('button').disabled = false;
          if (picker) picker.disabled = false;
        }
      });
    formHandler(form, async () => {
      const name = $('#auName').value.trim(),
        username = normUser($('#auUser').value);
      if (!name || name.length > 80) throw new Error('Nhập họ tên từ 1 đến 80 ký tự.');
      if (!/^[a-z0-9._-]{2,32}$/.test(username)) throw new Error('Tên đăng nhập 2–32 ký tự, gồm chữ không dấu, số hoặc dấu . _ -.');
      const password = newPassword(form);
      const account = { id: (expected && expected.profileId) || 'u' + newStamp(), username, name, stamp: newStamp() };
      await setPassword(account, password);
      const next = modeData(expected || {}, 'account', account);
      const code = await setRecovery(next);
      await save(expected, next);
      screenRecovery(code, () => {
        if (firstRun) login(account);
        else {
          cur = account;
          loggedIn = true;
          enter(curCo);
          renderAccount();
        }
      });
    });
  }

  /** v2.6.4: xem trước + áp dụng gói cấu hình ngay ở lần cài đầu (chưa có Quản trị). */
  function screenPack(j, name) {
    showGate(
      '<h5 class="mb-1">📦 Gói cấu hình cài đặt</h5><div class="small muted mb-2">' +
        esc(name) +
        '</div>' +
        HAK.Backup.packSummaryHtml(j) +
        '<div class="small muted mb-3">Sau khi áp dụng, app tải lại để bạn tiếp tục chọn chế độ sử dụng.</div>' +
        '<button class="btn btn-primary w-100" type="button" id="auPkApply">Áp dụng gói</button><div class="auth-err text-danger small mt-2" role="status"></div><div class="text-center mt-3"><a href="#" class="small" id="auBack">← Quay lại</a></div>'
    );
    $('#auBack').addEventListener('click', (e) => {
      e.preventDefault();
      screenSetup(true);
    });
    $('#auPkApply').addEventListener('click', async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      try {
        HAK.UI.toast(HAK.Backup.packMsg(await HAK.Backup.packApply(j)), 'success');
        await reload();
      } catch (x) {
        err(x.message);
      } finally {
        button.disabled = false;
      }
    });
  }
  function screenRecovery(code, next) {
    showGate(
      '<h5 class="mb-1">🔑 Mã khôi phục</h5><div class="small mb-3">Cất mã này để đặt lại mật khẩu khi cần. Mã chỉ hiển thị ở bước này.</div>' +
        '<div class="auth-code mono text-center mb-3">' +
        esc(code) +
        '</div>' +
        '<div class="d-flex gap-2 mb-3"><button class="btn btn-outline-primary flex-fill" type="button" id="auCopy">📋 Sao chép</button><button class="btn btn-outline-primary flex-fill" type="button" id="auSave">⬇ Tải file .txt</button></div>' +
        '<div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="auKept"><label class="form-check-label" for="auKept">Tôi đã cất mã khôi phục</label></div>' +
        '<button class="btn btn-primary w-100" type="button" id="auNext" disabled>Tiếp tục</button>'
    );
    const txt =
      'HAK - QUAN LY XUAT HANG\r\nMa khoi phuc tai khoan: ' + code + '\r\nTao luc: ' + new Date().toLocaleString('vi-VN') + '\r\n';
    $('#auCopy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        HAK.UI.toast('Đã sao chép mã khôi phục.', 'success');
      } catch (e) {
        HAK.UI.toast('Không sao chép được — hãy tải file .txt.', 'warning');
      }
    });
    $('#auSave').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
      a.download = 'HAK_MaKhoiPhuc.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('#auKept').addEventListener('change', (e) => {
      $('#auNext').disabled = !e.target.checked;
    });
    $('#auNext').addEventListener('click', next);
  }

  function screenLogin() {
    const d = data();
    showGate(
      '<h5 class="mb-3">Đăng nhập</h5>' +
        (legacyLogin(d) ? '<p class="small muted">Đăng nhập bằng tài khoản Quản trị cũ để chuyển sang chế độ một tài khoản.</p>' : '') +
        '<form id="authForm">' +
        field('auUser', 'Tên đăng nhập') +
        field('auPw', 'Mật khẩu', 'password') +
        '<div class="auth-err text-danger small mb-2" role="status"></div><button class="btn btn-primary w-100" type="submit">Đăng nhập</button></form>' +
        '<button class="btn btn-link w-100 mt-2" type="button" id="auForgot">Quên mật khẩu?</button>'
    );
    formHandler($('#authForm'), async () => {
      checkAttempts();
      const old = rawData();
      const account = loginUser(old || {}, normUser($('#auUser').value));
      const password = $('#auPw').value;
      if (!(await checkPw(account, password))) {
        $('#auPw').value = '';
        rejected('Sai tên đăng nhập hoặc mật khẩu.');
      }
      fails = 0;
      if (!legacyLogin(old)) return login(account);
      const next = migratedAccount(account);
      if (isLegacy(next) && subtleHas()) await setPassword(next, password);
      const state = modeData(old, 'account', next);
      const code = await setRecovery(state);
      await save(old, state);
      screenRecovery(code, () => login(next));
    });
    $('#auForgot').addEventListener('click', () => screenForgot('code'));
  }

  function screenForgot(method) {
    const old = rawData();
    const legacy = legacyLogin(old);
    const master = legacy && old.master;
    const group = legacy && old.groupPub;
    // A challenge is bound to this recovery screen and expires with it.
    const challenge = method === 'group' ? rand(12, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') : '';
    const label = method === 'master' ? 'Mật khẩu chủ của nhóm' : method === 'group' ? 'Mã phản hồi' : 'Mã khôi phục';
    showGate(
      '<h5 class="mb-3">Đặt lại mật khẩu</h5>' +
        (challenge
          ? '<p class="small">Gửi mã yêu cầu và tên Quản trị cho người giữ công cụ khôi phục cũ.</p><div class="auth-code mono text-center mb-2">' +
            esc(challenge) +
            '</div>'
          : '') +
        '<form id="authForm">' +
        field('auUser', 'Tên đăng nhập') +
        field('auCode', label, method === 'master' ? 'password' : 'text') +
        field('auPw', 'Mật khẩu mới (ít nhất 6 ký tự)', 'password') +
        field('auPw2', 'Nhập lại mật khẩu mới', 'password') +
        '<div class="auth-err text-danger small mb-2" role="status"></div><button class="btn btn-primary w-100" type="submit">Đặt lại mật khẩu</button></form>' +
        (method !== 'code' ? '<button class="btn btn-link" id="auCodeMode" type="button">Dùng mã khôi phục</button>' : '') +
        (master && method !== 'master' ? '<button class="btn btn-link" id="auMaster" type="button">Dùng mật khẩu chủ cũ</button>' : '') +
        (group && method !== 'group' ? '<button class="btn btn-link" id="auTool" type="button">Dùng công cụ khôi phục cũ</button>' : '') +
        '<button class="btn btn-link w-100" id="auBack" type="button">Quay lại đăng nhập</button>'
    );
    const options = { auCodeMode: 'code', auMaster: 'master', auTool: 'group' };
    for (const [id, option] of Object.entries(options)) {
      const button = $('#' + id);
      if (button) button.addEventListener('click', () => screenForgot(option));
    }
    $('#auBack').addEventListener('click', screenLogin);
    formHandler($('#authForm'), async () => {
      checkAttempts();
      const user = normUser($('#auUser').value),
        account = loginUser(old, user, true);
      const secret = $('#auCode').value,
        password = newPassword($('#authForm'));
      let valid = false;
      if (account) {
        if (method === 'master') valid = await checkMaster(master, secret);
        else if (method === 'group') valid = !(await checkReset(group.key, challenge, user, secret));
        else valid = await verifyRec(old.rec, normCode(secret));
      }
      if (!valid) rejected('Tên đăng nhập hoặc thông tin khôi phục không đúng.');
      const next = migratedAccount(account);
      await setPassword(next, password);
      const state = modeData(old, 'account', next);
      const recovery = await setRecovery(state);
      await save(old, state);
      fails = 0;
      screenRecovery(recovery, () => login(next));
    });
  }

  function paintIdentity() {
    const box = $('#topUser'),
      co = companies().find((c) => c.id === curCo);
    document.body.dataset.company = curCo;
    if (!box) return;
    box.innerHTML =
      (co
        ? '<button class="btn btn-sm btn-primary text-truncate" style="max-width:220px" id="btnCompany" type="button" title="Công ty làm việc: ' +
          esc(co.name) +
          '">🏢 ' +
          esc(co.short || co.name) +
          (allowedCos().length > 1 ? ' ▾' : '') +
          '</button>'
        : '') +
      (loggedIn
        ? '<span class="badge badge-soft rounded-pill text-truncate d-none d-sm-inline" style="max-width:180px">👤 ' +
          esc(cur.name) +
          '</span><button class="btn btn-sm btn-outline-secondary" id="btnLogout" type="button" aria-label="Đăng xuất">🔒<span class="d-none d-md-inline"> Đăng xuất</span></button>'
        : '');
    const button = $('#btnCompany');
    if (button && allowedCos().length > 1) button.addEventListener('click', () => screenCompany(true));
    if (loggedIn) $('#btnLogout').addEventListener('click', logout);
  }

  function rememberCompany(co) {
    sessSet({ uid: cur.id, stamp: cur.stamp, co });
    const last = HAK.Store.get(LASTCO, {}) || {};
    if (last[cur.id] !== co) HAK.Store.set(LASTCO, { ...last, [cur.id]: co });
  }
  function enter(co) {
    curCo = co;
    rememberCompany(co);
    hideGate();
    paintIdentity();
    if (resolveGate) {
      const done = resolveGate;
      resolveGate = null;
      done(cur);
    }
  }

  function login(account) {
    cur = account;
    loggedIn = true;
    const allowed = allowedCos();
    if (allowed.length > 1) screenCompany(false);
    else enter(allowed[0] || '');
  }

  function enterSingle(d) {
    cur = { id: d.profileId, name: 'Một người sử dụng' };
    loggedIn = false;
    const allowed = allowedCos(),
      session = sessGet(),
      last = (HAK.Store.get(LASTCO, {}) || {})[cur.id];
    const preferred = session && session.uid === cur.id ? session.co : last;
    enter(allowed.includes(preferred) ? preferred : allowed[0] || '');
  }

  /** Màn chọn công ty làm việc. switching = đang trong app bấm "đổi công ty" (có nút Hủy, chọn xong tải lại app). */
  function screenCompany(switching) {
    const allowed = allowedCos(),
      last = (HAK.Store.get(LASTCO, {}) || {})[cur.id];
    const pre = switching ? curCo : allowed.indexOf(last) >= 0 ? last : allowed[0];
    const cos = companies().filter((c) => allowed.indexOf(c.id) >= 0);
    showGate(
      '<h5 class="mb-1">Chọn công ty làm việc</h5><div class="small muted mb-3">Công ty chọn ở đây là <b>bên xuất</b> (ô "Của" / chủ lâm sản) mặc định ở mọi trang; Danh mục, Lưu trữ, Báo cáo mặc định lọc theo công ty này.</div>' +
        '<div class="d-grid gap-2" id="auCos">' +
        cos
          .map(
            (c) =>
              '<button type="button" class="btn text-start auth-co' +
              (c.id === pre ? ' active' : '') +
              '" data-co="' +
              esc(c.id) +
              '">' +
              '<div class="fw-semibold">' +
              esc(c.short ? c.short + ' — ' + c.name : c.name) +
              (c.id === last && !switching ? ' <span class="badge badge-soft ms-1">lần trước</span>' : '') +
              (switching && c.id === curCo ? ' <span class="badge badge-soft ms-1">đang làm</span>' : '') +
              '</div>' +
              '<div class="small muted">' +
              esc([c.tax ? 'MST ' + c.tax : '', c.address].filter(Boolean).join(' · ')) +
              '</div></button>'
          )
          .join('') +
        '</div>' +
        (switching
          ? '<div class="small muted mt-3">Đổi công ty sẽ tải lại app — dữ liệu đã nạp (đợt Excel, form, danh mục…) vẫn giữ.</div><button class="btn btn-outline-secondary w-100 mt-2" type="button" id="auCancel">Hủy</button>'
          : '')
    );
    const act = gate.querySelector('.auth-co.active');
    if (act) act.focus();
    gate.querySelector('#auCos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-co]');
      if (!b) return;
      if (!switching) return enter(b.dataset.co);
      if (b.dataset.co === curCo) {
        hideGate();
        return;
      }
      rememberCompany(b.dataset.co);
      reload();
    });
    if (switching) gate.querySelector('#auCancel').addEventListener('click', hideGate);
  }

  function logout() {
    sessSet(null);
    cur = null;
    loggedIn = false;
    showGate('<p class="mb-0">Đang đăng xuất…</p>');
    reload();
  }

  async function applyInstallerChoice(expected) {
    const seed = root.HAK_INSTALL_LOGIN;
    if (!seed) return;
    if ((!expected || (expected.v !== 2 && !legacyLogin(expected))) && seed.state) {
      HAK.Util.validateBackupKey(KEY, seed.state);
      await save(expected, { ...seed.state, ...(expected && expected.station ? { station: expected.station } : {}) });
    }
    // SQLite and browser persistence have both finished before the native helper discards the bootstrap verifier.
    if (HAK.Storage && root.HAK_DOCS_TOKEN)
      await HAK.Storage.call('/install-login/consumed', { id: seed.id }, { timeout: 3000 }).catch(() => {});
  }

  async function require() {
    try {
      await applyInstallerChoice(rawData());
    } catch (e) {
      showGate(
        '<h5>Chưa lưu được chế độ sử dụng</h5><p role="alert">' +
          esc(e.message) +
          '</p>' +
          '<button class="btn btn-primary" type="button" id="auRetry">Thử lại</button>'
      );
      $('#auRetry').addEventListener('click', reload);
      return new Promise(() => {});
    }
    const d = data();
    if (d.v === 2) {
      try {
        HAK.Util.validateBackupKey(KEY, d);
      } catch (e) {
        showGate('<h5>Không đọc được cấu hình đăng nhập</h5><p role="alert">' + esc(e.message) + '</p>');
        return new Promise(() => {});
      }
    }
    if (d.v === 2 && d.mode === 'single') return enterSingle(d);
    const session = sessGet(),
      account = d.v === 2 && d.mode === 'account' && d.users[0];
    if (account && session && session.uid === account.id && session.stamp === account.stamp) {
      const allowed = allowedCos();
      if (allowed.includes(session.co) || !allowed.length) {
        cur = account;
        loggedIn = true;
        return enter(allowed.includes(session.co) ? session.co : '');
      }
    }
    return new Promise((resolve) => {
      resolveGate = resolve;
      if (account && session && session.uid === account.id && session.stamp === account.stamp) login(account);
      else if ((d.v === 2 && d.mode === 'account') || legacyLogin(d)) screenLogin();
      else screenSetup(true);
    });
  }

  function renderAccount() {
    const box = $('#authAccount');
    if (!box || !cur) return;
    const keepAuth = $('#bkKeepAuth');
    if (keepAuth) {
      keepAuth.disabled = loggedIn;
      if (loggedIn) keepAuth.checked = true;
    }
    box.innerHTML =
      '<div class="card"><div class="card-header">Chế độ sử dụng</div><div class="card-body">' +
      (loggedIn
        ? '<p>Sử dụng tài khoản đăng nhập · <strong>' +
          esc(cur.username) +
          '</strong></p>' +
          '<div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-primary" type="button" id="acPassword">Đổi mật khẩu</button>' +
          '<button class="btn btn-outline-secondary" type="button" id="acDisable">Chuyển sang một người sử dụng</button></div>'
        : '<p>Một người sử dụng · Mở ứng dụng trực tiếp.</p><button class="btn btn-primary" type="button" id="acEnable">Sử dụng tài khoản đăng nhập</button>') +
      '</div></div>';
    if (loggedIn) {
      $('#acPassword').addEventListener('click', () => screenAccountChange(false));
      $('#acDisable').addEventListener('click', () => screenAccountChange(true));
    } else $('#acEnable').addEventListener('click', () => screenSetup(false));
  }

  function screenAccountChange(disable) {
    showGate(
      '<h5 class="mb-3">' +
        (disable ? 'Chuyển sang một người sử dụng' : 'Đổi mật khẩu') +
        '</h5><form id="authForm">' +
        field('auUser', 'Tên đăng nhập hiện tại') +
        field('auCurrent', 'Mật khẩu hiện tại', 'password') +
        (disable ? '' : field('auPw', 'Mật khẩu mới (ít nhất 6 ký tự)', 'password') + field('auPw2', 'Nhập lại mật khẩu mới', 'password')) +
        '<div class="auth-err text-danger small mb-2" role="status"></div><button class="btn btn-primary w-100" type="submit">Xác nhận</button></form>' +
        '<button class="btn btn-outline-secondary w-100 mt-2" type="button" id="auCancel">Hủy</button>'
    );
    const form = $('#authForm'),
      close = $('#auCancel'),
      expected = rawData();
    close.addEventListener('click', hideGate);
    formHandler(form, async () => {
      checkAttempts();
      const account = loginUser(expected, normUser($('#auUser').value));
      if (!(account && account.id === cur.id && (await checkPw(account, $('#auCurrent').value))))
        rejected('Sai tên đăng nhập hoặc mật khẩu.');
      fails = 0;
      if (disable) {
        const next = modeData(expected, 'single');
        await save(expected, next);
        sessSet(null);
        enterSingle(next);
      } else {
        const next = { ...account, stamp: newStamp() };
        await setPassword(next, newPassword(form));
        await save(expected, modeData(expected, 'account', next, expected.rec));
        cur = next;
        enter(curCo);
      }
      renderAccount();
      HAK.UI.toast(disable ? 'Đã chuyển sang một người sử dụng.' : 'Đã đổi mật khẩu.', 'success');
    });
  }

  /* ---------------- Phạm vi dữ liệu theo công ty (Danh mục / Lưu trữ / Báo cáo) ---------------- */
  const scopeAll = (key) => !!(HAK.Store.get(SCOPE, {}) || {})[key];
  /** Danh sách id công ty để lọc, hoặc null = không lọc. Mặc định: chỉ công ty đang làm; bật "Xem tất cả" → mọi công ty của máy. */
  function scopeIds(key) {
    if (!cur) return null;
    if (!curCo) return station() ? [] : null;
    if (!scopeAll(key)) return [curCo];
    return station() ? allowedCos() : null; // máy trạm: "tất cả" = các công ty của máy
  }
  /** Công tắc "Xem tất cả công ty" (HTML) — thay đổi phát sự kiện 'hak:scope' {key}. */
  function scopeSwitch(key) {
    if (!cur || !curCo) return '';
    const co = companies().find((c) => c.id === curCo),
      id = 'scope-' + key;
    return (
      '<div class="form-check form-switch mb-0 text-nowrap" title="Tắt = chỉ dữ liệu liên quan ' +
      esc(co ? co.name : '') +
      '"><input class="form-check-input" type="checkbox" id="' +
      id +
      '" data-scope="' +
      esc(key) +
      '"' +
      (scopeAll(key) ? ' checked' : '') +
      '>' +
      '<label class="form-check-label small" for="' +
      id +
      '">Xem tất cả công ty</label></div>'
    );
  }
  document.addEventListener('change', (e) => {
    const el = e.target.closest && e.target.closest('[data-scope]');
    if (!el) return;
    const s = HAK.Store.get(SCOPE, {}) || {};
    s[el.dataset.scope] = el.checked;
    HAK.Store.set(SCOPE, s);
    root.dispatchEvent(new CustomEvent('hak:scope', { detail: { key: el.dataset.scope } }));
  });
  /** Công ty (id) của 1 hồ sơ Lưu trữ: meta.cid (từ v2.6.2), hồ sơ cũ → dò theo tên rút gọn bên giao (meta.giao). */
  function companyOfMeta(m) {
    if (m.cid) return m.cid;
    const g = String(m.giao || '')
      .trim()
      .toLowerCase();
    if (!g) return '';
    const c = companies().find(
      (x) =>
        String(x.short || '')
          .trim()
          .toLowerCase() === g ||
        String(x.name || '')
          .trim()
          .toLowerCase() === g
    );
    return c ? c.id : '';
  }

  function packOut(ids) {
    return { station: ids ? { cos: ids.slice() } : null };
  }
  async function packIn(p) {
    const expected = rawData();
    const next = { ...data() };
    const cos = packStation(p);
    if (cos) next.station = { cos, at: Date.now() };
    else delete next.station;
    await save(expected, next);
    return cos;
  }
  function packStation(p) {
    const ids = p && p.station && p.station.cos;
    return Array.isArray(ids) && ids.length ? ids.slice() : null;
  }

  HAK.Auth = {
    require,
    init() {
      renderAccount();
      root.addEventListener('storage', (e) => {
        if (e.key !== KEY || e.newValue === e.oldValue || !cur) return;
        const state = data();
        if (state.mode === 'account' && (!loggedIn || state.users[0]?.stamp !== cur.stamp)) {
          showGate('<p class="mb-0">Chế độ đăng nhập đã thay đổi. Đang tải lại…</p>');
          reload();
        } else if (state.mode === 'single' && loggedIn) reload();
      });
    },
    logout,
    current: () => cur,
    usesAccount: () => loggedIn,
    isAdmin: () => !!cur,
    who: () => (loggedIn && cur ? cur.name + ' (' + cur.username + ')' : ''),
    company: () => curCo,
    allowedCompanies: allowedCos,
    scopeIds,
    scopeSwitch,
    companyOfMeta,
    packOut,
    packIn,
    packStation,
    stationCos: station,
    _checkReset: checkReset,
    _sha256: sha256hex,
    _hash: hashPw,
    _hashRec: hashRec,
    _verifyRec: verifyRec,
    _isLegacy: isLegacy,
  };
})(window);
