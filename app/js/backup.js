/**
 * backup.js — HAK.Backup: an toàn dữ liệu.
 *   boot()    : chạy trước khi dựng giao diện — khôi phục các khóa còn thiếu / lỗi thời của localStorage từ bản sao IndexedDB (HAK.DB "kv").
 *   sao lưu / khôi phục TOÀN BỘ ra 1 file .json: cài đặt, danh sách xe, mẫu Word, form, các đợt Excel đã nhập, nhật ký chứng từ + toàn bộ hồ sơ Lưu trữ.
 *   tab "Sao lưu & khôi phục" ở Cài đặt; báo lỗi khi không lưu được; lưu nốt form khi đóng trang.
 *   v2.7.5: sao lưu toàn bộ dạng .zip (nén, khôi phục nhận cả .zip lẫn .json cũ) · 🔁 tự sao lưu mỗi ngày vào 1 thư mục, giữ N bản mới nhất
 *           (File System Access API, Chrome/Edge) · health(): "Sức khỏe dữ liệu" cho Tổng quan.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const APP = 'hak-bienban-backup',
    LAST_KEY = 'hak.backup.last',
    DIR_KEY = 'backupDir',
    AUTO_KEY = 'hak.autobk',
    SQL_KEY = 'hak.sqlbk.v1', // cấu hình tự sao lưu SQLite — gắn với thư mục / máy này → không mang đi theo sao lưu
    AUTO_DIR = 'autoDir';
  const $ = (s) => document.querySelector(s);
  const toast = (m, t) => HAK.UI && HAK.UI.toast(m, t);
  const esc = (s) => (HAK.UI ? HAK.UI.esc(s) : String(s));
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
  const fmtBytes = (b) =>
    b == null
      ? '—'
      : b < 1048576
        ? Math.max(1, Math.round(b / 1024)) + ' KB'
        : b < 1073741824
          ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB'
          : (b / 1073741824).toFixed(1).replace('.', ',') + ' GB';
  const fmtDT = (t) => {
    const d = new Date(t),
      p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ---------------- Thư mục sao lưu mặc định (File System Access API — chỉ Chrome/Edge) ---------------- */
  function dirPickerSupported() {
    return typeof root.showSaveFilePicker === 'function' && typeof root.showDirectoryPicker === 'function';
  }
  async function getSavedDir() {
    try {
      return (await HAK.DB.get('handles', DIR_KEY)) || null;
    } catch (e) {
      return null;
    }
  }
  async function setSavedDir(h) {
    try {
      if (h) await HAK.DB.put('handles', h, DIR_KEY);
      else await HAK.DB.del('handles', DIR_KEY);
    } catch (e) {
      /* bỏ qua */
    }
  }
  async function pickDefaultDir() {
    const h = await root.showDirectoryPicker({ id: 'hak-backup-dir', mode: 'read' });
    await setSavedDir(h);
    return h;
  }
  /**
   * Lưu 1 blob sao lưu. Có hỗ trợ File System Access API → luôn hiện hộp thoại "Lưu file" của trình duyệt,
   * mở sẵn tại thư mục mặc định đã chọn (nếu có) để không phải chọn lại mỗi lần.
   * Không hỗ trợ (Firefox/Safari), hoặc thư mục đã chọn không còn dùng được → rơi về cách tải xuống hiện có (không đổi).
   */
  async function saveBackupBlob(blob, name) {
    if (dirPickerSupported()) {
      const dir = await getSavedDir();
      const opts = {
        suggestedName: name,
        types: [
          /\.zip$/i.test(name)
            ? { description: 'Sao lưu nén ZIP', accept: { 'application/zip': ['.zip'] } }
            : { description: 'Sao lưu JSON', accept: { 'application/json': ['.json'] } },
        ],
      };
      if (dir) opts.startIn = dir;
      try {
        const handle = await root.showSaveFilePicker(opts);
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') throw e; // người dùng bấm Hủy trong hộp thoại — báo lên trên, không rơi về cách khác
        if (dir) {
          await setSavedDir(null);
          toast('Thư mục sao lưu mặc định không còn dùng được — đã bỏ chọn, đang lưu theo cách tải xuống thường.', 'warning');
        }
      }
    }
    if (!(await HAK.Word.Files.saveBlob(blob, name))) {
      const e = new Error('Chưa lưu bản sao lưu.');
      e.name = 'AbortError';
      throw e;
    }
  }

  /* ---------------- Khởi động: khôi phục từ bản sao ngầm ---------------- */
  async function boot() {
    let n = 0;
    try {
      const recs = await withTimeout(HAK.DB.kvAll(), 2500);
      for (const r of recs) {
        if (!r || !r.key || r.key === 'hak.yearbook.v1') continue;
        let inLs = null;
        try {
          inLs = root.localStorage.getItem(r.key);
        } catch (e) {
          /* bị chặn */
        }
        if (inLs === null || r.ls === false) {
          // thiếu ở localStorage, hoặc lần ghi gần nhất không vào được localStorage (bản trong LS đã cũ)
          HAK.Store.set(r.key, r.val);
          n++;
        }
      }
      const have = new Set(recs.map((r) => r && r.key));
      HAK.Store.keys().forEach((k) => {
        if (!have.has(k))
          HAK.DB.kvPut(k, HAK.Store.get(k, null), true).catch(() => {
            /* bỏ qua */
          });
      }); // dữ liệu có từ bản cũ → tạo bản sao dự phòng
      if (n) {
        if (HAK.Config) HAK.Config.load();
        if (HAK.Vehicles) HAK.Vehicles.loadSaved();
      }
    } catch (e) {
      console.warn('Không đọc được bản sao IndexedDB:', e);
    }
    boot.restored = n;
    return n;
  }
  boot.restored = 0;

  /* ---------------- Sao lưu / khôi phục toàn bộ ---------------- */
  async function collect() {
    const keys = {};
    HAK.Store.keys().forEach((k) => {
      if (k !== LAST_KEY && k !== AUTO_KEY && k !== SQL_KEY && k !== PRE_KEY) keys[k] = HAK.Store.get(k, null);
    }); // v2.7.5: cài đặt tự sao lưu gắn với thư mục của máy này → không mang đi
    const items = HAK.Archive ? await HAK.Archive.collectItems() : [];
    const batches = HAK.Batches ? await HAK.Batches.exportAll() : [];
    const issued = HAK.Issued ? await HAK.DB.getAll('issued') : [];
    return {
      yearbook: HAK.Yearbook ? await HAK.Yearbook.read() : null,
      keys,
      items,
      batches,
      issued,
      attachments: await HAK.DB.getAll('attachments'),
      bklsTemplates: await HAK.DB.getAll('bklsTemplates'),
    };
  }
  async function sha256Text(text) {
    const c =
      root.crypto && root.crypto.subtle ? root.crypto.subtle : typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    if (!c) return null;
    const bytes = new TextEncoder().encode(String(text));
    return Array.from(new Uint8Array(await c.digest('SHA-256', bytes)), (v) => v.toString(16).padStart(2, '0')).join('');
  }
  /** Dựng nội dung sao lưu từ kết quả collect() (toàn bộ) hoặc BackupMonth.select() (theo tháng — có thêm "scope"). MỘT bộ dựng file cho cả hai. */
  async function serialize(coll) {
    const { yearbook, keys, items, batches, issued, attachments, bklsTemplates, scope } = coll;
    const keysJson = JSON.stringify(keys);
    const itemStrs = items.map((it) => JSON.stringify(it));
    const batchStrs = batches.map((it) => JSON.stringify(it));
    const issuedJson = JSON.stringify(issued);
    const attJson = JSON.stringify(attachments);
    const tplJson = JSON.stringify(bklsTemplates);
    const ybJson = JSON.stringify(yearbook);
    const secStr = {
      keys: keysJson,
      archive: '[' + itemStrs.join(',') + ']',
      batches: '[' + batchStrs.join(',') + ']',
      issued: issuedJson,
      attachments: attJson,
      bklsTemplates: tplJson,
      yearbook: ybJson,
    };
    const sha256 = {};
    for (const k of Object.keys(secStr)) {
      const h = await sha256Text(secStr[k]);
      if (h) sha256[k] = h;
    }
    const manifest = {
      v: 1,
      counts: {
        keys: Object.keys(keys).length,
        archive: items.length,
        batches: batches.length,
        issued: issued.length,
        attachments: attachments.length,
        bklsTemplates: bklsTemplates.length,
      },
      sha256,
    };
    const parts = [
      '{"app":"' +
        APP +
        '","v":1,"exportedAt":"' +
        new Date().toISOString() +
        '"' +
        (scope ? ',"scope":' + JSON.stringify(scope) : '') +
        ',"keys":',
      keysJson,
      ',"archive":[',
    ];
    itemStrs.forEach((s, i) => {
      parts.push((i ? ',' : '') + s);
    });
    parts.push('],"batches":[');
    batchStrs.forEach((s, i) => {
      parts.push((i ? ',' : '') + s);
    });
    parts.push(
      '],"issued":',
      issuedJson,
      ',"attachments":',
      attJson,
      ',"bklsTemplates":',
      tplJson,
      ',"yearbook":',
      ybJson,
      ',"manifest":',
      JSON.stringify(manifest),
      '}'
    );
    return {
      parts,
      keys: Object.keys(keys).length,
      archive: items.length,
      batches: batches.length,
      issued: issued.length,
      scope: scope || null,
      manifest,
    };
  }
  /** Dựng nội dung sao lưu toàn bộ (mảng chuỗi JSON — không nối thành 1 chuỗi lớn) + số đếm. */
  async function buildFull() {
    return serialize(await collect());
  }
  /** Sao lưu THEO THÁNG (quy tắc 33–35): cùng collect() + serialize() với sao lưu toàn bộ, chỉ lọc thêm theo tháng ("2026-02"). */
  async function buildMonth(ym) {
    if (!HAK.BackupMonth) throw new Error('Chưa nạp bộ sao lưu theo tháng.');
    const sel = await HAK.BackupMonth.select(await collect(), ym, { decode: HAK.Archive && HAK.Archive.decode });
    return serialize(sel);
  }
  /** Các tháng có dữ liệu để chọn khi sao lưu theo tháng (chỉ đọc mục lục hồ sơ + nhật ký chứng từ, không giải nén hồ sơ). */
  async function listMonths() {
    const metas = HAK.Archive ? await HAK.Archive.list() : [];
    const issued = HAK.Issued ? await HAK.DB.getAll('issued') : [];
    return HAK.BackupMonth.months({ items: metas.map((meta) => ({ meta })), issued });
  }
  /** Loại file sao lưu: 'full' (toàn bộ) · 'month' (theo tháng) · 'year' (Sổ hồ sơ năm) · 'archive' (Lưu trữ bản cũ) · '' (không nhận ra). */
  function kindOf(j) {
    if (!j || typeof j !== 'object') return '';
    if (j.app === 'hak-bienban-archive' && Array.isArray(j.items)) return 'archive';
    if (j.app === 'hak-yearbook') return 'year';
    if (j.app === APP) return j.scope && j.scope.kind === 'month' ? 'month' : 'full';
    return '';
  }
  /** v2.7.5: nén thành .zip (1 file HAK_SaoLuuToanBo.json bên trong — Windows mở được). Không có JSZip → null (lưu .json như cũ). */
  const ZIP_INNER = 'HAK_SaoLuuToanBo.json';
  async function zipParts(parts) {
    if (typeof root.JSZip !== 'function') return null;
    const z = new root.JSZip();
    z.file(ZIP_INNER, new Blob(parts, { type: 'application/json' }));
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/zip' });
  }
  const stamp = (withTime) => {
    const d = new Date(),
      p2 = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + (withTime ? '_' + p2(d.getHours()) + p2(d.getMinutes()) : '');
  };
  async function saveAll() {
    const f = await buildFull();
    const zip = await zipParts(f.parts);
    const name = 'HAK_SaoLuuToanBo_' + stamp() + (zip ? '.zip' : '.json');
    await saveBackupBlob(zip || new Blob(f.parts, { type: 'application/json' }), name);
    HAK.Store.set(LAST_KEY, Date.now());
    return { name, size: (zip || {}).size, keys: f.keys, archive: f.archive, batches: f.batches, issued: f.issued };
  }
  /* ---------------- Tự sao lưu SQLite (quy tắc 35) ---------------- */
  const sqlAvailable = () => !!(HAK.Storage && HAK.Storage.mode === 'sqlite');
  const sqlCfg = () => HAK.BackupSchedule.normalize(HAK.Store.get(SQL_KEY, null));
  const sqlSet = (c) => HAK.Store.set(SQL_KEY, c);
  const sqlDir = (cfg) => (cfg || sqlCfg()).dir || HAK.BackupSchedule.defaultDir(((HAK.Storage && HAK.Storage.status) || {}).dataDir);
  /** L-25: ẩn đường dẫn tuyệt đối (ổ đĩa / UNC) của máy chủ trong thông báo lỗi hiển thị cho người dùng. */
  const hidePaths = (m) => String(m == null ? '' : m).replace(/(?:[A-Za-z]:|\\\\[^\\/\s]+)[\\/][^\s"':]*/g, '[đường dẫn đã ẩn]');
  /** Sao lưu SQLite NGAY (nút "Sao lưu SQLite ngay" và tự động): máy chủ ghi bản nhất quán vào thư mục, kiểm integrity_check, xoay vòng (chỉ xóa HAK_SQLite_*.db). */
  async function sqlRunNow(opts) {
    if (!sqlAvailable()) throw new Error('Chỉ dùng được ở bản Windows đang lưu dữ liệu bằng SQLite.');
    const cfg = sqlCfg(),
      dir = sqlDir(cfg);
    if (!dir) throw new Error('Chưa xác định được thư mục sao lưu SQLite. Chọn thư mục ở mục "Thư mục sao lưu SQLite".');
    const body = { dir, keep: cfg.keep };
    if (opts && opts.name) body.name = opts.name;
    try {
      const r = await HAK.Storage.call('/db/backup', body);
      sqlSet(
        HAK.BackupSchedule.record(
          cfg,
          {
            ok: true,
            name: String(r.path || '')
              .split(/[\\/]/)
              .pop(),
            removed: (r.removed || []).length,
            dir: r.dir,
          },
          Date.now()
        )
      );
      return r;
    } catch (e) {
      const msg =
        e && e.code === 'scope'
          ? 'Chỉ tài khoản toàn quyền (không giới hạn công ty) mới sao lưu SQLite.'
          : hidePaths((e && e.message) || String(e));
      sqlSet(HAK.BackupSchedule.record(cfg, { ok: false, error: msg }, Date.now()));
      throw Object.assign(new Error(msg), { code: e && e.code });
    }
  }
  /** Chạy một lần khi mở app nếu ĐẾN HẠN (lần mở đầu tiên trong ngày / tuần). Lỗi không làm hỏng việc mở app: chỉ báo (trừ thiếu quyền — không báo mỗi lần mở). */
  async function sqlTick() {
    if (!sqlAvailable() || !HAK.BackupSchedule.due(sqlCfg(), Date.now())) return null;
    try {
      return await sqlRunNow();
    } catch (e) {
      if (e.code !== 'scope' && HAK.UI) HAK.UI.toast('Tự sao lưu SQLite chưa chạy được: ' + e.message, 'warning');
      return null;
    }
  }
  /** Tên file sao lưu tháng: HAK_Thang_MM-YYYY_xuat<ngày>.json (CEO 19/11/2026). */
  const monthFileName = (ym) => 'HAK_Thang_' + ym.slice(5, 7) + '-' + ym.slice(0, 4) + '_xuat' + stamp() + '.json';
  async function saveMonth(ym) {
    const f = await buildMonth(ym);
    const name = monthFileName(ym);
    await saveBackupBlob(new Blob(f.parts, { type: 'application/json' }), name);
    return { name, month: ym, archive: f.archive, batches: f.batches, issued: f.issued, scope: f.scope };
  }
  /** v2.7.5: đọc file sao lưu .zip (của app) hoặc .json → object (null nếu không đọc được JSON). Dùng chung cho Lưu trữ. */
  async function readJson(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    let text;
    if (head[0] === 0x50 && head[1] === 0x4b) {
      // "PK" = ZIP
      if (typeof root.JSZip !== 'function') throw new Error('Không mở được file ZIP (thiếu thư viện nén).');
      let z;
      try {
        const buf = file.arrayBuffer ? await file.arrayBuffer() : file;
        z = await root.JSZip.loadAsync(buf, { checkCRC32: true });
      } catch (e) {
        throw new Error('File sao lưu ZIP bị hỏng hoặc không đọc được.');
      }
      const f = z.file(ZIP_INNER) || Object.values(z.files).find((x) => !x.dir && /\.json$/i.test(x.name));
      if (!f) throw new Error('File ZIP không có dữ liệu sao lưu (.json) của app.');
      const U = (root.HAK && root.HAK.Util) || (typeof require === 'function' ? require('./util.js') : null);
      if (U && U.checkZipLimits) U.checkZipLimits(z, { maxFile: 150 * 1024 * 1024, maxTotal: 250 * 1024 * 1024 });
      try {
        text = await f.async('string');
      } catch (e) {
        throw new Error('File sao lưu bị hỏng (lỗi giải nén hoặc sai mã kiểm tra CRC32).');
      }
    } else text = await file.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }
  /** Khóa tài khoản đăng nhập — giữ nguyên khi khôi phục với tùy chọn "Giữ tài khoản đang dùng trên máy này" (v2.6.6). */
  const AUTH_KEYS = ['hak.auth.v1', 'hak.auth.lastco'];
  /* v2.17.0 (theo hak-migration-manager: sao lưu TRƯỚC khi ghi đè): trước khi khôi phục, chụp cài đặt + danh mục + tài khoản đang có vào 'hak.prerestore.v1' để HOÀN TÁC.
   * Chỉ phần cài đặt / danh mục (localStorage); hồ sơ Lưu trữ nhập vào là thêm / cập nhật theo phiên bản nên không bị xóa. Bản chụp không nằm trong sao lưu toàn bộ. */
  const PRE_KEY = 'hak.prerestore.v1';
  // SQLite là nguồn chính: chỉ cập nhật cache sau khi máy chủ xác nhận ghi.
  // Store.set() thông thường là API đồng bộ, không thể xác nhận một thao tác khôi phục.
  async function writeRestoreKey(key, value) {
    if (HAK.Storage && HAK.Storage.mode !== 'idb') {
      HAK.Storage.assertOpen();
      const expected = JSON.stringify(HAK.Store.get(key, undefined));
      await HAK.DB.kvCas(
        key,
        (cur) => (JSON.stringify(cur) !== expected ? 'Dữ liệu đã thay đổi. Tải lại trước khi khôi phục.' : null),
        value
      );
      HAK.Store.set(key, value, { dbCommitted: true });
    } else if (HAK.Store.set(key, value) === false) throw new Error('Không ghi được "' + key + '".');
  }
  async function removeRestoreKey(key) {
    if (HAK.Storage && HAK.Storage.mode !== 'idb') {
      HAK.Storage.assertOpen();
      await HAK.DB.kvDel(key);
      HAK.Store.remove(key, { dbCommitted: true });
    } else HAK.Store.remove(key);
  }
  /**
   * L-13: nếu lần khôi phục trước DỪNG GIỮA CHỪNG (bản chụp còn cờ incomplete) thì GIỮ NGUYÊN bản chụp đó khi thử lại —
   * ghi đè sẽ chụp luôn trạng thái đã khôi phục dở và làm mất điểm quay về ban đầu của nút "Hoàn tác khôi phục".
   */
  async function snapshotBeforeRestore() {
    try {
      const prev = HAK.Store.get(PRE_KEY, null);
      if (prev && prev.incomplete && prev.keys) return true;
      const keys = {};
      HAK.Store.keys().forEach((k) => {
        if (k.indexOf('hak.') === 0 && k !== LAST_KEY && k !== AUTO_KEY && k !== SQL_KEY && k !== PRE_KEY) keys[k] = HAK.Store.get(k, null);
      });
      await writeRestoreKey(PRE_KEY, { at: Date.now(), keys, incomplete: true });
      return true;
    } catch (e) {
      return false;
    }
  }
  /** Khôi phục xong trọn vẹn → bỏ cờ incomplete (lần khôi phục sau được chụp bản mới). Không ghi được thì giữ cờ: an toàn hơn là mất điểm quay về. */
  async function markSnapshotComplete() {
    try {
      const p = HAK.Store.get(PRE_KEY, null);
      if (p && p.incomplete) await writeRestoreKey(PRE_KEY, { at: p.at, keys: p.keys });
    } catch (e) {
      console.warn('Không đánh dấu hoàn tất bản chụp trước khi khôi phục', e);
    }
  }
  const preRestoreInfo = () => {
    const p = HAK.Store.get(PRE_KEY, null);
    return p && p.keys ? { at: p.at, n: Object.keys(p.keys).length } : null;
  };
  /** Hoàn tác lần khôi phục gần nhất: trả cài đặt / danh mục về bản chụp; khóa mới do khôi phục tạo ra (không có trong bản chụp) bị gỡ. */
  async function undoRestore() {
    const p = HAK.Store.get(PRE_KEY, null);
    if (!p || !p.keys) throw new Error('Chưa có bản chụp trước khi khôi phục.');
    let set = 0,
      removed = 0;
    for (const k of HAK.Store.keys()) {
      if (k.indexOf('hak.') === 0 && k !== LAST_KEY && k !== AUTO_KEY && k !== SQL_KEY && k !== PRE_KEY && !(k in p.keys)) {
        await removeRestoreKey(k);
        removed++;
      }
    }
    for (const k of Object.keys(p.keys)) {
      if (p.keys[k] !== null) {
        await writeRestoreKey(k, p.keys[k]);
        set++;
      }
    }
    await removeRestoreKey(PRE_KEY);
    return { set, removed };
  }
  /**
   * L-14 (D-08): bộ lọc đã lưu nằm ở khóa "hak.sf.presets@<mã tài khoản>@<mã công ty>[.bak…]". Mã tài khoản sinh ra riêng trên từng máy,
   * nên khi khôi phục sang máy khác (giữ tài khoản của máy này) khóa cũ thành MỒ CÔI. Quy tắc (D-08, phương án gợi ý):
   *   · mã tài khoản còn tồn tại sau khôi phục → giữ nguyên khóa;
   *   · không còn nhưng có tài khoản CÙNG TÊN ĐĂNG NHẬP trên máy này → chuyển khóa sang mã tài khoản của máy này;
   *   · không khớp được → không ghi (báo số bộ lọc bỏ qua) — file sao lưu vẫn còn nguyên để nhập lại.
   * Trả khóa đích hoặc null (bỏ qua).
   */
  const FILTER_KEY = /^(hak\.sf\.presets)@([^@]+)@([^@.]+)(\..*)?$/;
  function remapFilterKey(k, ctx) {
    const m = FILTER_KEY.exec(k);
    if (!m) return k;
    const final = ctx.finalUsers || [];
    if (final.some((u) => u && u.id === m[2])) return k;
    const src = (ctx.backupUsers || []).find((u) => u && u.id === m[2]);
    const un = src && String(src.username || '').toLowerCase();
    const mine = un && final.find((u) => u && String(u.username || '').toLowerCase() === un);
    return mine ? m[1] + '@' + mine.id + '@' + m[3] + (m[4] || '') : null;
  }
  const CAT = 'hak.catalog.v1';
  /** Kiểm tra cấu trúc bản sao TRƯỚC khi ghi bất cứ gì (ném lỗi nếu hỏng). */
  function validateBackup(j) {
    if (!j || j.app !== APP || typeof j.keys !== 'object' || !Array.isArray(j.archive))
      throw new Error('Đây không phải file sao lưu toàn bộ của app.');
    // Định dạng sao lưu do bản app MỚI HƠN tạo ra: không đoán — từ chối để không khôi phục thiếu / sai dữ liệu
    if (j.v !== undefined && j.v !== 1)
      throw new Error(
        'File sao lưu này dùng định dạng phiên bản ' +
          j.v +
          ' mà bản app hiện tại chưa hỗ trợ. Hãy cập nhật app lên bản mới nhất rồi thử lại; dữ liệu hiện có chưa bị thay đổi.'
      );
    for (const store of ['attachments', 'bklsTemplates']) {
      if (j[store] !== undefined && !Array.isArray(j[store])) throw new Error('Kho tệp sao lưu không hợp lệ');
      for (const item of j[store] || []) {
        if (!item || typeof item.id !== 'string' || typeof item.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.base64))
          throw new Error('Tệp đính kèm hoặc mẫu không hợp lệ');
      }
    }
    if (HAK.ContractModel && j.keys[CAT] && j.keys[CAT].v === 3) {
      const catalog = HAK.ContractModel.migrate(j.keys[CAT]).data;
      for (const c of catalog.contracts) {
        const error = HAK.ContractModel.validate(c, catalog);
        if (error) throw new Error('Danh mục trong bản sao lưu không hợp lệ: ' + error);
      }
    }
    if (j.yearbook && HAK.Yearbook) HAK.Yearbook.validateBundle(j.yearbook.records);
    const U = (root.HAK && root.HAK.Util) || (typeof require === 'function' ? require('./util.js') : null);
    if (U && U.validateBackupKey && j.keys) {
      for (const k of Object.keys(j.keys)) {
        if (k === PRE_KEY || j.keys[k] === null) continue;
        if (U.isAllowedBackupKey(k)) U.validateBackupKey(k, j.keys[k]);
      }
    }
  }
  /**
   * L-12: kiểm tra cấu trúc từng hồ sơ Lưu trữ trong bản sao (meta.id, data là chuỗi, nội dung giải nén được và rows là mảng)
   * TRƯỚC khi ghi bất cứ gì — hồ sơ hỏng làm hỏng cả lần khôi phục thay vì bị bỏ qua âm thầm sau khi đã đổi cài đặt.
   */
  async function validateArchive(items) {
    const bad = [];
    const decode = HAK.Archive && HAK.Archive.decode;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let why = '';
      if (!it || typeof it !== 'object' || !it.meta || typeof it.meta !== 'object' || typeof it.meta.id !== 'string' || !it.meta.id)
        why = 'thiếu mục lục (meta.id)';
      else if (typeof it.data !== 'string') why = 'thiếu nội dung';
      else if (it.data !== '' && typeof decode === 'function') {
        try {
          const d = await decode(it.data);
          if (!d || !Array.isArray(d.rows)) why = 'danh sách phiếu (rows) không phải mảng';
        } catch (e) {
          why = 'không giải nén được nội dung';
        }
      }
      if (why) bad.push('#' + (i + 1) + (it && it.meta && it.meta.id ? ' (' + it.meta.id + ')' : '') + ': ' + why);
    }
    if (bad.length)
      throw new Error(
        'Bản sao lưu có ' +
          bad.length +
          ' hồ sơ Lưu trữ không hợp lệ — ' +
          bad.slice(0, 3).join('; ') +
          (bad.length > 3 ? '…' : '') +
          '. Chưa thay đổi gì trên máy này.'
      );
  }
  async function verifyManifest(j) {
    if (!j || j.manifest === undefined) return 'unverified';
    const m = j.manifest;
    if (!m || typeof m !== 'object') throw new Error('File sao lưu bị hỏng (manifest không hợp lệ).');
    if (m.counts && typeof m.counts === 'object') {
      const actualCounts = {
        keys: Object.keys(j.keys || {}).length,
        archive: (j.archive || []).length,
        batches: (j.batches || []).length,
        issued: (j.issued || []).length,
        attachments: (j.attachments || []).length,
        bklsTemplates: (j.bklsTemplates || []).length,
      };
      for (const k of Object.keys(actualCounts)) {
        if (m.counts[k] !== undefined && m.counts[k] !== actualCounts[k]) {
          throw new Error('File sao lưu bị hỏng (số lượng bản ghi không khớp).');
        }
      }
    }
    if (m.sha256 && typeof m.sha256 === 'object') {
      for (const k of Object.keys(m.sha256)) {
        const val = j[k] === undefined ? (k === 'yearbook' ? null : k === 'keys' ? {} : []) : j[k];
        const actual = await sha256Text(JSON.stringify(val));
        if (actual && actual !== m.sha256[k]) {
          throw new Error('File sao lưu bị hỏng (sai mã kiểm tra toàn vẹn dữ liệu).');
        }
      }
    }
    return 'verified';
  }
  /** Đọc + kiểm tra + tóm tắt bản sao (KHÔNG ghi gì): dùng để hiện phạm vi dữ liệu trước khi người dùng chọn Nhập bổ sung / Khôi phục. */
  async function inspect(file) {
    const j = await readJson(file);
    if (j && j.app === 'hak-bienban-archive' && Array.isArray(j.items)) return { j, legacy: true, plan: { archive: j.items.length } };
    validateBackup(j);
    const manifest = await verifyManifest(j);
    const plan = {
      kind: kindOf(j),
      scope: j.scope || null,
      keys: Object.keys(j.keys).filter((k) => k.indexOf('hak.') === 0 && k !== PRE_KEY && k !== LAST_KEY && k !== AUTO_KEY && k !== SQL_KEY)
        .length,
      archive: j.archive.length,
      batches: (j.batches || []).length,
      issued: (j.issued || []).length,
      attachments: (j.attachments || []).length,
      templates: (j.bklsTemplates || []).length,
      catalog: null,
    };
    const cin = j.keys[CAT];
    if (cin && HAK.ContractModel) {
      const local = HAK.Store.get(CAT, null),
        M = HAK.ContractModel,
        inD = M.migrate(cin).data,
        loD = M.migrate(local || { v: 3, customers: [], contracts: [] }).data;
      const merged = M.mergeCatalog(local, cin),
        rp = M.mergeCatalog.report || {},
        have = new Set(loD.contracts.map((c) => c.id));
      plan.catalog = {
        fileContracts: inD.contracts.length,
        localContracts: loD.contracts.length,
        add: inD.contracts.filter((c) => !have.has(c.id)).length,
        keptNewer: (rp.kept || []).length,
        conflicts: (rp.conflicts || []).length,
        resultContracts: merged.contracts.length,
        willOverwrite: loD.contracts.filter((c) => {
          const f = inD.contracts.find((x) => x.id === c.id);
          return f && JSON.stringify(f) !== JSON.stringify(c);
        }).length,
        localNewer: loD.contracts
          .filter((c) => {
            const f = inD.contracts.find((x) => x.id === c.id);
            return f && (c.revision || 0) > (f.revision || 0);
          })
          .map(
            (c) =>
              (c.no || c.id) +
              ' (máy này v' +
              (c.revision || 0) +
              ' > bản sao v' +
              ((inD.contracts.find((x) => x.id === c.id) || {}).revision || 0) +
              ')'
          ),
      };
    }
    return { j, legacy: false, plan, manifest };
  }
  /** Chạy tuần tự các bước ghi, ghi lại bước nào xong / lỗi / chưa chạy và bước nào hoàn tác được. */
  async function runSteps(steps) {
    const report = steps.map((x) => ({ id: x.id, label: x.label, undoable: !!x.undoable, status: 'pending', n: 0 }));
    for (let i = 0; i < steps.length; i++) {
      try {
        const r = await steps[i].run();
        report[i].status = 'done';
        report[i].n = r && typeof r === 'object' ? r : { n: r };
      } catch (e) {
        report[i].status = 'failed';
        report[i].error = (e && e.message) || String(e);
        const err = new Error(failText(report));
        err.report = report;
        throw err;
      }
    }
    return report;
  }
  const countOf = (x) => (x && typeof x === 'object' ? (x.n !== undefined ? x.n : (x.added || 0) + (x.updated || 0)) : x);
  function failText(report) {
    const done = report.filter((x) => x.status === 'done'),
      fail = report.find((x) => x.status === 'failed'),
      pend = report.filter((x) => x.status === 'pending');
    return (
      'Khôi phục DỪNG GIỮA CHỪNG tại "' +
      fail.label +
      '": ' +
      fail.error +
      '. ' +
      'Đã nhập: ' +
      (done.length ? done.map((x) => x.label + ' (' + countOf(x.n) + ')').join(', ') : 'chưa có kho nào') +
      '. Chưa chạy: ' +
      (pend.length ? pend.map((x) => x.label).join(', ') : 'không') +
      '. ' +
      'Hoàn tác được bằng nút "Hoàn tác khôi phục": ' +
      (done
        .filter((x) => x.undoable)
        .map((x) => x.label)
        .join(', ') || 'không có') +
      '. ' +
      'KHÔNG hoàn tác tự động (đã nằm trong IndexedDB, nhập lại bản sao là an toàn vì nhập theo phiên bản): ' +
      (done
        .filter((x) => !x.undoable)
        .map((x) => x.label)
        .join(', ') || 'không có') +
      '.'
    );
  }
  /**
   * opts.mode: 'merge' (mặc định — NHẬP BỔ SUNG: danh mục gộp theo phiên bản, dữ liệu mới hơn trên máy được giữ; cài đặt chỉ điền khóa còn thiếu; tệp/mẫu chỉ thêm cái chưa có) |
   *            'replace' (KHÔI PHỤC về đúng thời điểm sao lưu: cài đặt + danh mục thay bằng bản sao; hồ sơ Lưu trữ / đợt Excel / nhật ký vẫn gộp theo phiên bản, KHÔNG xóa dữ liệu chỉ có trên máy này).
   * opts.parsed: kết quả inspect() để khỏi đọc lại file. Trả { …, report } hoặc ném lỗi có .report.
   */
  async function restoreFile(file, opts) {
    const keepAuth = !!(opts && opts.keepAuth);
    let mode = opts && opts.mode === 'replace' ? 'replace' : 'merge';
    const ins = (opts && opts.parsed) || (await inspect(file)),
      j = ins.j; // v2.7.5: .zip hoặc .json
    if (kindOf(j) === 'month') {
      // quy tắc 34: bản tháng CHỈ nhập bổ sung — không thay thế (sẽ xóa / ghi đè dữ liệu tháng khác)
      if (opts && opts.mode === 'replace')
        throw new Error(
          'Bản sao lưu theo tháng chỉ dùng được ở chế độ "Nhập bổ sung" (không thay thế). Dữ liệu các tháng khác được giữ nguyên.'
        );
      mode = 'merge';
    }
    await validateArchive(ins.legacy ? j.items : j.archive); // L-12: kiểm trước khi ghi bất cứ gì
    if (ins.legacy) {
      // file sao lưu riêng Lưu trữ (bản cũ)
      const r = await HAK.Archive.importItems(j.items);
      return { legacy: true, keys: 0, added: r.added, updated: r.updated, skipped: r.skipped, mode };
    }
    const snapshot = await snapshotBeforeRestore();
    if (!snapshot)
      throw new Error(
        'Không chụp được bản hiện tại trước khi khôi phục (bộ nhớ trình duyệt đầy?). Chưa thay đổi gì — hãy Sao lưu toàn bộ ra file rồi dọn bớt dữ liệu trước.'
      );
    const out = {
      legacy: false,
      keys: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      batches: 0,
      issued: 0,
      keepAuth,
      snapshot,
      mode,
      keptNewer: 0,
      conflicts: 0,
      dupPayments: 0,
      maybePayments: 0,
    };
    const merge = mode === 'merge',
      fillOnly = async (store, items) => {
        let n = 0;
        for (const item of items) {
          if (!item || typeof item.id !== 'string' || typeof item.base64 !== 'string')
            throw new Error('Tệp đính kèm hoặc mẫu không hợp lệ');
          if (merge && (await HAK.DB.get(store, item.id))) continue;
          await HAK.DB.put(store, item);
          n++;
        }
        return n;
      };
    const steps = [
      {
        id: 'keys',
        label: 'cài đặt & danh mục',
        undoable: true,
        run: async () => {
          const U = (root.HAK && root.HAK.Util) || (typeof require === 'function' ? require('./util.js') : null);
          const localUsers = (HAK.Store.get('hak.auth.v1', null) || {}).users || [],
            backupUsers = (j.keys['hak.auth.v1'] || {}).users || [],
            fctx = { finalUsers: keepAuth ? localUsers : backupUsers.length ? backupUsers : localUsers, backupUsers };
          out.filtersRemapped = 0;
          out.filtersSkipped = 0;
          for (const k0 of Object.keys(j.keys)) {
            let k = k0;
            if (k === PRE_KEY) continue;
            if (keepAuth && AUTH_KEYS.indexOf(k) >= 0) continue; // giữ tài khoản / mật khẩu / khóa khôi phục / loại máy hiện tại
            if (FILTER_KEY.test(k)) {
              k = remapFilterKey(k, fctx);
              if (k === null) {
                out.filtersSkipped++;
                continue;
              }
              if (k !== k0) out.filtersRemapped++;
            }
            if (!(k.indexOf('hak.') === 0 && k !== LAST_KEY && k !== AUTO_KEY && k !== SQL_KEY && j.keys[k0] !== null)) continue;
            if (U && U.isAllowedBackupKey && !U.isAllowedBackupKey(k)) continue;
            if (k === CAT && merge && HAK.ContractModel) {
              // CÙNG quy tắc phiên bản với Gói cấu hình: bản cũ không ghi đè bản mới
              const merged = HAK.ContractModel.mergeCatalog(HAK.Store.get(CAT, null), j.keys[k]),
                rp = HAK.ContractModel.mergeCatalog.report || {};
              out.keptNewer = (rp.kept || []).length;
              out.conflicts = (rp.conflicts || []).length;
              out.dupPayments = ((rp.customs || {}).duplicatePayments || []).length;
              out.maybePayments = ((rp.customs || {}).maybe || []).length;
              await writeRestoreKey(CAT, merged);
              out.keys++;
              continue;
            }
            if (merge && k !== CAT && HAK.Store.get(k, null) !== null) continue; // nhập bổ sung: không đè cài đặt đang có
            await writeRestoreKey(k, j.keys[k0]);
            out.keys++;
          }
          return { n: out.keys };
        },
      },
      {
        id: 'yearbook',
        label: 'hồ sơ năm',
        run: async () => {
          if (j.yearbook && HAK.Yearbook) await HAK.Yearbook.importState(j.yearbook.records);
          return { n: j.yearbook ? (j.yearbook.records || []).length || 1 : 0 };
        },
      },
      {
        id: 'archive',
        label: 'hồ sơ Lưu trữ',
        run: async () => {
          const r = await HAK.Archive.importItems(j.archive);
          out.added = r.added;
          out.updated = r.updated;
          out.skipped = r.skipped;
          return r;
        },
      },
      { id: 'attachments', label: 'tệp đính kèm', run: () => fillOnly('attachments', j.attachments || []) },
      { id: 'bklsTemplates', label: 'mẫu BKLS', run: () => fillOnly('bklsTemplates', j.bklsTemplates || []) },
      {
        id: 'batches',
        label: 'đợt Excel',
        run: async () => {
          out.batches = HAK.Batches && Array.isArray(j.batches) ? await HAK.Batches.importAll(j.batches, { keepNewer: merge }) : 0;
          return out.batches;
        },
      },
      {
        id: 'issued',
        label: 'nhật ký chứng từ',
        run: async () => {
          out.issued = HAK.Issued && Array.isArray(j.issued) ? await HAK.Issued.importAll(j.issued) : 0;
          return out.issued;
        },
      },
    ];
    out.report = await runSteps(steps);
    await markSnapshotComplete();
    return out;
  }

  /* ---------------- v2.6.4 D2 — Gói cấu hình cài đặt (cài cho nhiều công ty / nhiều máy) ----------------
   * GỒM: Cài đặt (công ty, kho, cài đặt chung, bảng mã ĐVVC), mẫu Word đã tải lên, Danh mục (khách hàng, hợp đồng),
   *      cấu hình Google Sheet từng công ty (URL + mã bí mật), tài khoản Nhân viên, khóa công khai khôi phục của nhóm.
   * KHÔNG GỒM: tài khoản Quản trị (đặt riêng khi cài từng máy), hồ sơ Lưu trữ, đợt Excel, nhật ký chứng từ, danh sách xe, trạng thái đồng bộ.
   * Nhập: Cài đặt + mẫu Word có trong gói → thay; Danh mục → gộp theo id (ô trống trong gói không xóa dữ liệu máy này);
   *       Google Sheet → thay URL/mã theo từng công ty; Nhân viên → gộp theo tên đăng nhập (xem HAK.Auth.packIn). */
  const PACK = 'hak-bienban-pack',
    CAT_KEY = 'hak.catalog.v1',
    GS_KEY = 'hak.gsync.v2',
    CFG_KEY = 'hak.config.v1';
  /** ids = danh sách công ty của gói (v2.6.5 D4 — gói cho máy trạm); null = gói đầy đủ (máy chính). */
  function packBuild(ids) {
    const st = HAK.Auth && HAK.Auth.stationCos ? HAK.Auth.stationCos() : null;
    if (st) ids = (ids || st).filter((id) => st.indexOf(id) >= 0); // máy trạm chỉ xuất được gói trong phạm vi của mình
    if (ids && !ids.length) throw new Error('Chọn ít nhất 1 công ty cho gói.');
    const inIds = (id) => !ids || ids.indexOf(id) >= 0;
    const tpl = {};
    HAK.Store.keys().forEach((k) => {
      if (k.indexOf('hak.tpl.') === 0) {
        const v = HAK.Store.get(k, null);
        if (v) tpl[k] = v;
      }
    });
    const gs = {},
      cos = (HAK.Store.get(GS_KEY, null) || {}).cos || {};
    Object.keys(cos).forEach((cid) => {
      if (inIds(cid) && cos[cid] && cos[cid].url) gs[cid] = { url: cos[cid].url, token: cos[cid].token || '' };
    });
    let catalog = HAK.Store.get(CAT_KEY, null);
    if (ids && catalog && Array.isArray(catalog.contracts) && HAK.Catalog && HAK.Catalog.relatedTo) {
      catalog = Object.assign({}, catalog, { contracts: catalog.contracts.filter((c) => HAK.Catalog.relatedTo(c, ids)) }); // chỉ HĐ liên quan công ty của gói (+ HĐ chưa gán)
    }
    if (catalog)
      catalog = Object.assign({}, catalog, {
        contracts: (catalog.contracts || []).map((c) => {
          const copy = Object.assign({}, c);
          delete copy.contractFiles;
          delete copy.certificateFiles;
          if (Array.isArray(copy.details))
            copy.details = copy.details.map((d) => {
              const child = Object.assign({}, d);
              delete child.certificateFiles;
              delete child.sourcePdfId;
              return child;
            });
          return copy;
        }),
      });
    return {
      app: PACK,
      v: 1,
      exportedAt: new Date().toISOString(),
      by: HAK.Auth ? HAK.Auth.who() : '',
      config: HAK.Config ? HAK.Config.data : HAK.Store.get(CFG_KEY, null),
      tpl,
      catalog,
      gsync: gs,
      auth: HAK.Auth ? HAK.Auth.packOut(ids) : { users: [], groupPub: null, station: null },
    };
  }
  const asciiName = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9]+/g, '');
  async function packExport(ids) {
    const j = packBuild(ids),
      d = new Date(),
      p2 = (n) => String(n).padStart(2, '0');
    const st = j.auth && j.auth.station ? j.auth.station.cos : null;
    const tag = st
      ? '_' +
        st
          .map((id) => {
            const c = (j.config.companies || []).find((x) => x.id === id);
            return asciiName(c ? c.short || c.name : id);
          })
          .join('-')
      : '';
    const name = 'HAK_GoiCaiDat' + tag + '_' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json';
    await saveBackupBlob(new Blob([JSON.stringify(j)], { type: 'application/json' }), name);
    return { name, j };
  }
  async function packRead(file) {
    let j = null;
    try {
      j = JSON.parse(await file.text());
    } catch (e) {
      /* báo lỗi bên dưới */
    }
    if (!j || j.app !== PACK || !j.config || !Array.isArray(j.config.companies)) {
      throw new Error(
        j && j.app === APP
          ? 'Đây là file Sao lưu toàn bộ — hãy dùng nút "Khôi phục toàn bộ".'
          : 'Đây không phải file gói cấu hình cài đặt của app.'
      );
    }
    return j;
  }
  /** Tóm tắt gói (HTML) — dùng ở thẻ Cài đặt và ở màn tạo Quản trị lần đầu. */
  function packSummaryHtml(j) {
    const cat = j.catalog || {},
      u = HAK.Auth ? HAK.Auth.packIn(j.auth, true) : { added: 0, updated: 0, skipped: [] };
    const names = (j.config.companies || []).map((c) => c.short || c.name);
    const coN = (id) => {
      const c = (j.config.companies || []).find((x) => x.id === id);
      return c ? c.short || c.name : id;
    };
    const kind = u.station
      ? '<b class="text-primary">Máy trạm — chỉ làm: ' + esc(u.station.map(coN).join(', ')) + '</b>'
      : '<b>Máy chính — mọi công ty</b>' +
        (u.wasStation ? ' <span class="text-warning">(máy này đang là máy trạm → sẽ bỏ giới hạn)</span>' : '');
    const gsN = Object.keys(j.gsync || {}).length,
      tplN = Object.keys(j.tpl || {}).length;
    return (
      '<ul class="sum-list mb-2">' +
      '<li><span>Loại gói</span>' +
      kind +
      '</li>' +
      '<li><span>Tạo lúc</span><b>' +
      (j.exportedAt ? fmtDT(j.exportedAt) : '—') +
      (j.by ? ' · ' + esc(j.by) : '') +
      '</b></li>' +
      '<li><span>Công ty (' +
      names.length +
      ')</span><b>' +
      esc(names.join(', ')) +
      '</b></li>' +
      '<li><span>Kho · mã ĐVVC</span><b>' +
      (j.config.warehouses || []).length +
      ' kho · ' +
      (j.config.carrierCodes || []).length +
      ' mã</b></li>' +
      '<li><span>Mẫu Word đã tải lên</span><b>' +
      tplN +
      '</b></li>' +
      '<li><span>Danh mục</span><b>' +
      (cat.customers || []).length +
      ' khách hàng · ' +
      (cat.contracts || []).length +
      ' hợp đồng</b></li>' +
      '<li><span>Google Sheet đã cấu hình</span><b>' +
      gsN +
      ' công ty</b></li>' +
      '<li><span>Nhân viên</span><b>thêm ' +
      u.added +
      ' · cập nhật ' +
      u.updated +
      (u.skipped.length ? ' · <span class="text-warning">bỏ qua ' + esc(u.skipped.join(', ')) + ' (trùng Quản trị máy này)</span>' : '') +
      '</b></li>' +
      '<li><span>Mật khẩu chủ của nhóm</span><b>' +
      (j.auth && j.auth.master ? 'Có · <span class="mono">' + esc(j.auth.master.fp || '') + '</span>' : '—') +
      '</b></li>' +
      '<li><span>Khóa khôi phục của nhóm</span><b>' +
      (j.auth && j.auth.groupPub ? 'Có' : '—') +
      '</b></li></ul>'
    );
  }
  function packApply(j) {
    const r = { tpl: 0, cat: 0, gs: 0 };
    const mergedCatalog = j.catalog && HAK.ContractModel ? HAK.ContractModel.mergeCatalog(HAK.Store.get(CAT_KEY, null), j.catalog) : null;
    HAK.Store.set(CFG_KEY, j.config);
    if (HAK.Config && typeof HAK.Config.load === 'function') HAK.Config.load(); // N-03: nạp lại để số phiên bản (rev) khớp bản vừa ghi
    Object.keys(j.tpl || {}).forEach((k) => {
      if (k.indexOf('hak.tpl.') === 0 && j.tpl[k]) {
        HAK.Store.set(k, j.tpl[k]);
        r.tpl++;
      }
    });
    if (j.catalog && Array.isArray(j.catalog.customers) && Array.isArray(j.catalog.contracts)) {
      if (mergedCatalog) {
        HAK.Store.set(CAT_KEY, mergedCatalog);
        r.cat = (j.catalog.customers || []).length + (j.catalog.contracts || []).length;
        const rp = (HAK.ContractModel.mergeCatalog && HAK.ContractModel.mergeCatalog.report) || {};
        r.keptNewer = (rp.kept || []).length;
        r.conflicts = (rp.conflicts || []).length;
        r.dupPayments = ((rp.customs || {}).duplicatePayments || []).length;
        r.maybePayments = ((rp.customs || {}).maybe || []).length;
      } else throw new Error('Thiếu mô hình dữ liệu hợp đồng.');
    }
    const gsIn = j.gsync || {},
      gs = HAK.Store.get(GS_KEY, null) || { cos: {} };
    if (!gs.cos) gs.cos = {};
    const stIn = j.auth && j.auth.station && Array.isArray(j.auth.station.cos) ? j.auth.station.cos : null;
    if (stIn)
      Object.keys(gs.cos).forEach((cid) => {
        if (stIn.indexOf(cid) < 0) delete gs.cos[cid];
      }); // máy trạm: xóa Sheet công ty khác (nếu có từ gói cũ)
    Object.keys(gsIn).forEach((cid) => {
      if (gsIn[cid] && gsIn[cid].url) {
        gs.cos[cid] = Object.assign({}, gs.cos[cid], { url: gsIn[cid].url, token: gsIn[cid].token || '' });
        r.gs++;
      }
    });
    if (r.gs || stIn) {
      gs.migV1 = true;
      HAK.Store.set(GS_KEY, gs);
    }
    r.users = HAK.Auth ? HAK.Auth.packIn(j.auth) : { added: 0, updated: 0, skipped: [] };
    return r;
  }
  const packMsg = (r) =>
    'Đã nhập gói cấu hình: ' +
    r.tpl +
    ' mẫu Word, ' +
    r.cat +
    ' mục danh mục, ' +
    r.gs +
    ' Google Sheet, nhân viên thêm ' +
    r.users.added +
    ' / cập nhật ' +
    r.users.updated +
    (r.users.master ? ', mật khẩu chủ của nhóm' : '') +
    (r.users.station ? ' — máy trạm (' + r.users.station.length + ' công ty)' : '') +
    (r.keptNewer ? ' · giữ nguyên ' + r.keptNewer + ' hợp đồng trên máy này vì mới hơn bản trong gói' : '') +
    (r.conflicts ? ' · ⚠ ' + r.conflicts + ' mục cùng phiên bản nhưng khác nội dung — đã giữ bản trên máy này, cần đối chiếu' : '') +
    (r.dupPayments ? ' · bỏ ' + r.dupPayments + ' khoản nộp thuế trùng giấy nộp tiền đã có (không cộng đôi)' : '') +
    (r.maybePayments ? ' · ⚠ ' + r.maybePayments + ' khoản nộp nghi trùng (thiếu số giấy) — đã giữ cả hai, cần đối soát' : '') +
    '. Trang sẽ tải lại…';
  /** Ô chọn công ty của gói. Tick đủ mọi công ty (máy chính) = gói đầy đủ; tick 1 phần = gói máy trạm. */
  function pkCosHtml() {
    const st = HAK.Auth && HAK.Auth.stationCos ? HAK.Auth.stationCos() : null;
    const cos = ((HAK.Config && HAK.Config.data.companies) || []).filter((c) => !st || st.indexOf(c.id) >= 0);
    return (
      '<div class="mb-2"><div class="form-label mb-1">Gói cho công ty</div><div class="d-flex flex-wrap gap-3" id="pkCos">' +
      cos
        .map(
          (c) =>
            '<div class="form-check"><input class="form-check-input" type="checkbox" checked data-pkco="' +
            esc(c.id) +
            '" id="pkCo-' +
            esc(c.id) +
            '"><label class="form-check-label" for="pkCo-' +
            esc(c.id) +
            '">' +
            esc(c.short || c.name) +
            '</label></div>'
        )
        .join('') +
      '</div><div class="form-text" id="pkKind"></div></div>'
    );
  }
  /** null = gói đầy đủ (mọi công ty, chỉ ở máy chính). */
  function pkIds() {
    const all = Array.from(document.querySelectorAll('#pkCos [data-pkco]')),
      on = all.filter((x) => x.checked).map((x) => x.dataset.pkco);
    const st = HAK.Auth && HAK.Auth.stationCos ? HAK.Auth.stationCos() : null;
    return !st && on.length === all.length ? null : on;
  }
  function pkKind() {
    const k = $('#pkKind');
    if (!k) return;
    const ids = pkIds();
    k.innerHTML =
      ids === null
        ? 'Tick <b>đủ mọi công ty</b> = gói <b>máy chính</b> (mọi Google Sheet, mọi nhân viên, mọi hợp đồng).'
        : !ids.length
          ? '<span class="text-danger">Chọn ít nhất 1 công ty.</span>'
          : 'Gói <b>máy trạm</b>: Quản trị máy đó chỉ chọn được công ty đã tick; gói chỉ mang Google Sheet, nhân viên (được làm công ty đã tick) và hợp đồng liên quan các công ty này; khóa khôi phục bị khóa ở máy trạm.';
    $('#pkOut').disabled = !!ids && !ids.length;
  }
  function renderPack() {
    const box = $('#packBody');
    if (!box) return;
    box.innerHTML =
      '<p class="small mb-2">Dùng khi <b>cài app cho máy / công ty khác</b>: xuất 1 file từ máy đã cài đặt xong, sang máy mới bấm nhập — không phải nhập lại công ty, kho, mẫu Word, danh mục, Google Sheet, nhân viên. <a href="#/help" data-help="help-install">📘 Xem hướng dẫn</a></p>' +
      pkCosHtml() +
      '<div class="d-flex flex-wrap gap-2"><button class="btn btn-primary" id="pkOut" type="button">📦 Xuất gói cấu hình (.json)</button>' +
      '<label class="btn btn-outline-primary mb-0">📥 Nhập gói cấu hình<input type="file" id="pkIn" accept=".json,application/json" hidden></label></div>' +
      '<div id="pkPreview"></div>' +
      '<div class="form-text mt-2">Gói <b>không</b> chứa tài khoản Quản trị (mỗi máy tự đặt khi cài), hồ sơ Lưu trữ, đợt Excel, nhật ký chứng từ, danh sách xe. ' +
      '<span class="text-warning">⚠ File có mật khẩu Nhân viên (dạng băm) và mã bí mật Google Sheet — chỉ gửi cho người cài máy, không đăng công khai.</span></div>';
    $('#pkCos').addEventListener('change', pkKind);
    pkKind();
    $('#pkOut').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = await packExport(pkIds());
        toast('Đã xuất ' + r.name + ' (' + r.j.config.companies.length + ' công ty, ' + r.j.auth.users.length + ' nhân viên).', 'success');
      } catch (err) {
        if (!(err && err.name === 'AbortError')) {
          console.error(err);
          toast('Không xuất được: ' + (err.message || err), 'error');
        }
      }
      b.disabled = false;
      pkKind();
    });
    $('#pkIn').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const pv = $('#pkPreview');
      try {
        const j = await packRead(f);
        pv.innerHTML =
          '<div class="border rounded p-3 mt-3"><div class="fw-semibold mb-2">Gói ' +
          esc(f.name) +
          '</div>' +
          packSummaryHtml(j) +
          '<div class="small muted mb-2">Cài đặt công ty / kho / mã ĐVVC và mẫu Word trong gói sẽ <b>thay</b> bản trên máy này; danh mục và nhân viên được <b>gộp</b>. Nên Sao lưu toàn bộ trước.</div>' +
          '<div class="d-flex gap-2"><button class="btn btn-primary" id="pkApply" type="button">Áp dụng &amp; tải lại</button><button class="btn btn-outline-secondary" id="pkCancel" type="button">Hủy</button></div></div>';
        $('#pkCancel').addEventListener('click', () => {
          pv.innerHTML = '';
        });
        $('#pkApply').addEventListener('click', () => {
          const r = packApply(j);
          toast(packMsg(r), 'success');
          setTimeout(() => root.location.reload(), 1500);
        });
      } catch (err) {
        pv.innerHTML = '';
        toast(err.message || String(err), 'error');
      }
    });
  }

  /* ---------------- v2.7.5 🔁 Tự sao lưu vào thư mục (xoay vòng N bản) ----------------
   * Thư mục chọn 1 lần (quyền GHI, tay cầm lưu ở HAK.DB 'handles' khóa AUTO_DIR — riêng với thư mục "mở sẵn" DIR_KEY).
   * Mỗi ngày: lần đầu mở app (sau ~20 giây) / mỗi 30 phút kiểm tra → quá AUTO_EVERY kể từ lần tự sao lưu thành công gần nhất thì ghi
   * HAK_TuDong_<yyyymmdd>_<hhmm>.zip, đọc lại kiểm tra dung lượng, rồi xóa các bản HAK_TuDong_*.zip cũ hơn N bản mới nhất
   * (KHÔNG đụng file khác trong thư mục). Trình duyệt hỏi lại quyền ghi sau khi mở lại → nút "Cho phép" ở Tổng quan / Cài đặt. */
  const AUTO_RE = /^HAK_TuDong_\d{8}_\d{4}\.zip$/,
    AUTO_EVERY = 20 * 3600e3,
    AUTO_KEEPS = [5, 10, 20, 30];
  const auto = { h: null, perm: 'none', busy: false, warned: false }; // perm: none | granted | prompt | denied | unsupported
  const autoCfg = () => Object.assign({ on: false, keep: 10, last: null }, HAK.Store.get(AUTO_KEY, null) || {});
  const autoSet = (patch) => HAK.Store.set(AUTO_KEY, Object.assign(autoCfg(), patch));
  async function autoDir() {
    if (auto.h) return auto.h;
    try {
      auto.h = (await HAK.DB.get('handles', AUTO_DIR)) || null;
    } catch (e) {
      auto.h = null;
    }
    return auto.h;
  }
  async function autoPerm(ask) {
    if (!dirPickerSupported()) return (auto.perm = 'unsupported');
    const h = await autoDir();
    if (!h) return (auto.perm = 'none');
    const o = { mode: 'readwrite' };
    try {
      let p = h.queryPermission ? await h.queryPermission(o) : 'granted';
      if (p !== 'granted' && ask && h.requestPermission) p = await h.requestPermission(o);
      return (auto.perm = p);
    } catch (e) {
      return (auto.perm = 'prompt');
    }
  }
  async function autoPick() {
    const h = await root.showDirectoryPicker({ id: 'hak-auto-backup', mode: 'readwrite' });
    auto.h = h;
    try {
      await HAK.DB.put('handles', h, AUTO_DIR);
    } catch (e) {
      console.warn('Không lưu được thư mục tự sao lưu:', e);
    }
    auto.perm = 'granted';
    return h;
  }
  async function autoForget() {
    auto.h = null;
    auto.perm = 'none';
    try {
      await HAK.DB.del('handles', AUTO_DIR);
    } catch (e) {
      /* bỏ qua */
    }
  }
  async function autoList() {
    const h = await autoDir(),
      out = [];
    if (!h || auto.perm !== 'granted' || !h.entries) return out;
    for await (const [name, e] of h.entries()) {
      if (e.kind === 'file' && AUTO_RE.test(name)) {
        try {
          const f = await e.getFile();
          if (f.size > 0) out.push({ name, size: f.size, at: f.lastModified });
        } catch (x) {
          /* bỏ qua */
        }
      }
    }
    return out.sort((a, b) => (b.at || 0) - (a.at || 0) || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  }
  async function verifyAutoZip(file) {
    if (!file || !(file.size > 0)) throw new Error('File sao lưu ghi ra bị rỗng (0 byte).');
    if (typeof root.JSZip === 'function') {
      let z;
      try {
        const buf = file.arrayBuffer ? await file.arrayBuffer() : file;
        z = await root.JSZip.loadAsync(buf, { checkCRC32: true });
      } catch (e) {
        throw new Error('File sao lưu tự động đọc lại bị hỏng (CRC32).');
      }
      const inner = z.file(ZIP_INNER);
      if (!inner) throw new Error('File sao lưu tự động thiếu dữ liệu bên trong.');
      await inner.async('string');
    }
  }
  const autoDue = (c) => c.on && !(c.last && c.last.ok && Date.now() - c.last.at < AUTO_EVERY);
  /** Ghi 1 bản vào thư mục. opts.ask = được hỏi quyền (đang trong thao tác bấm của người dùng); opts.force = chạy dù chưa bật / chưa tới hạn. */
  async function autoRun(opts) {
    opts = opts || {};
    const c = autoCfg();
    if (auto.busy || (!opts.force && !autoDue(c))) return { skipped: true };
    const h = await autoDir();
    if (!h) return { err: 'nodir' };
    if ((await autoPerm(opts.ask)) !== 'granted') {
      notify();
      return { err: 'perm' };
    }
    auto.busy = true;
    const name = 'HAK_TuDong_' + stamp(true) + '.zip';
    const partName = name + '.part';
    let committed = false;
    let wroteFinal = false;
    try {
      const f = await buildFull(),
        zip = await zipParts(f.parts);
      if (!zip) throw new Error('Thiếu thư viện nén ZIP.');
      const fhPart = await h.getFileHandle(partName, { create: true }),
        w = await fhPart.createWritable();
      await w.write(zip);
      await w.close();
      const chk = await (await h.getFileHandle(partName)).getFile();
      if (chk.size !== zip.size) throw new Error('File ghi ra không đủ (' + chk.size + ' / ' + zip.size + ' byte).');
      await verifyAutoZip(chk);
      if (typeof fhPart.move === 'function') {
        await fhPart.move(name);
        committed = true;
      } else {
        wroteFinal = true;
        const fh = await h.getFileHandle(name, { create: true }),
          w2 = await fh.createWritable();
        await w2.write(zip);
        await w2.close();
        const chk2 = await (await h.getFileHandle(name)).getFile();
        if (chk2.size !== zip.size) throw new Error('File ghi ra không đủ (' + chk2.size + ' / ' + zip.size + ' byte).');
        await verifyAutoZip(chk2);
        committed = true;
        try {
          await h.removeEntry(partName);
        } catch (e) {
          /* bỏ qua */
        }
      }
      const keep = Math.max(1, +c.keep || 10);
      let removed = 0;
      for (const x of (await autoList()).filter((x) => x.name !== name).slice(Math.max(0, keep - 1))) {
        try {
          await h.removeEntry(x.name);
          removed++;
        } catch (e) {
          console.warn('Không xóa được bản cũ', x.name, e);
        }
      }
      const now = Date.now();
      autoSet({ last: { at: now, ok: true, name, size: zip.size, archive: f.archive } });
      HAK.Store.set(LAST_KEY, now);
      auto.warned = false;
      return { name, size: zip.size, removed, archive: f.archive };
    } catch (e) {
      if (h && h.removeEntry) {
        try {
          await h.removeEntry(partName);
        } catch (x) {
          /* bỏ qua */
        }
        if (wroteFinal && !committed) {
          try {
            await h.removeEntry(name);
          } catch (x) {
            /* bỏ qua */
          }
        }
      }
      console.error('Tự sao lưu lỗi:', e);
      autoSet({ last: Object.assign({}, autoCfg().last, { failAt: Date.now(), ok: false, err: e.message || String(e) }) });
      return { err: 'fail', msg: e.message || String(e) };
    } finally {
      auto.busy = false;
      notify();
    }
  }
  /** Báo các trang đang mở vẽ lại (Tổng quan, Cài đặt). */
  function notify() {
    if (location.hash === '#/home' || !location.hash) {
      if (HAK.Dashboard && HAK.Dashboard.render) HAK.Dashboard.render();
    }
    const g = document.getElementById('tab-backup');
    if (g && g.classList.contains('active')) render();
  }
  async function autoTick() {
    const c = autoCfg();
    if (!autoDue(c) || auto.busy) return;
    const before = auto.perm,
      r = await autoRun({});
    if (r.name)
      toast(
        '🔁 Đã tự sao lưu vào thư mục: ' +
          r.name +
          ' (' +
          fmtBytes(r.size) +
          ', ' +
          r.archive +
          ' hồ sơ' +
          (r.removed ? ', xóa ' + r.removed + ' bản cũ' : '') +
          ').',
        'success'
      );
    else if (r.err === 'fail' && !auto.warned) {
      auto.warned = true;
      toast('⚠ Tự sao lưu lỗi: ' + r.msg + ' — vào Cài đặt → Sao lưu & khôi phục → Tự sao lưu để kiểm tra.', 'error');
    } else if (r.err === 'perm' && before !== auto.perm) notify();
  }
  /** Trạng thái tự sao lưu (đồng bộ, theo lần kiểm tra quyền gần nhất) — cho cảnh báo ở Tổng quan. */
  function autoStatus() {
    const c = autoCfg();
    return { on: c.on, due: autoDue(c), perm: auto.perm, dir: auto.h ? auto.h.name : '', last: c.last, keep: c.keep, busy: auto.busy };
  }
  /** Bấm "Cho phép & sao lưu ngay" (Tổng quan / Cài đặt) — trong thao tác bấm nên trình duyệt cho hỏi quyền. */
  async function autoAllowAndRun(btn) {
    if (btn) btn.disabled = true;
    const r = await autoRun({ ask: true, force: true });
    if (r.name)
      toast(
        '🔁 Đã sao lưu vào thư mục: ' + r.name + ' (' + fmtBytes(r.size) + (r.removed ? ', xóa ' + r.removed + ' bản cũ' : '') + ').',
        'success'
      );
    else if (r.err === 'perm') toast('Trình duyệt chưa cho phép ghi vào thư mục — bấm lại và chọn "Cho phép" (Allow).', 'warning');
    else if (r.err === 'nodir') toast('Chưa chọn thư mục tự sao lưu (Cài đặt → Sao lưu & khôi phục → Thư mục).', 'warning');
    else if (r.err === 'fail') toast('Không sao lưu được: ' + r.msg, 'error');
    if (btn) btn.disabled = false;
    return r;
  }
  /** Khối "🔁 Tự sao lưu" trong thẻ Bộ nhớ & sao lưu. */
  async function autoHtml() {
    if (!dirPickerSupported())
      return '<hr><div class="fw-semibold mb-1">🔁 Tự sao lưu vào thư mục</div><div class="small text-warning">Trình duyệt này không hỗ trợ ghi vào thư mục — dùng Chrome hoặc Edge để bật tự sao lưu. Vẫn sao lưu tay được bằng nút ⬇ ở trên.</div>';
    const c = autoCfg(),
      h = await autoDir(),
      perm = await autoPerm(false),
      files = await autoList();
    const L = c.last,
      okT = (v, t) => '<span class="' + (v ? 'text-success' : 'text-warning') + '">' + t + '</span>';
    const permTxt = !h
      ? '—'
      : perm === 'granted'
        ? okT(true, 'Đã cho phép')
        : okT(false, 'Chờ cho phép (trình duyệt hỏi lại sau khi mở lại) — bấm ▶ Sao lưu vào thư mục ngay');
    const lastTxt = !L
      ? okT(false, 'Chưa có')
      : L.ok === false
        ? '<span class="text-danger">✗ Lỗi ' +
          esc(fmtDT(L.failAt || L.at)) +
          ': ' +
          esc(L.err || '') +
          '</span>' +
          (L.name ? ' · bản tốt gần nhất: ' + esc(fmtDT(L.at)) : '')
        : okT(true, '✓ ' + esc(fmtDT(L.at))) + ' — <span class="mono">' + esc(L.name || '') + '</span> (' + fmtBytes(L.size) + ')';
    return (
      '<hr><div class="fw-semibold mb-1">🔁 Tự sao lưu vào thư mục <span class="muted small fw-normal">— mỗi ngày 1 bản .zip, giữ ' +
      c.keep +
      ' bản mới nhất</span></div>' +
      '<ul class="sum-list mb-2">' +
      '<li><span>Thư mục</span><b>' +
      (h ? '📁 ' + esc(h.name) : okT(false, 'Chưa chọn — chọn ở khối ⑤ Thư mục sao lưu')) +
      '</b></li>' +
      '<li><span>Trạng thái</span><b>' +
      (c.on ? okT(true, 'Đang bật') : okT(false, 'Đang tắt')) +
      '</b></li>' +
      '<li><span>Quyền ghi thư mục</span><b>' +
      permTxt +
      '</b></li>' +
      '<li><span>Lần tự sao lưu gần nhất</span><b>' +
      lastTxt +
      '</b></li></ul>' +
      '<div class="d-flex flex-wrap align-items-center gap-2">' +
      '<div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" role="switch" id="abOn"' +
      (c.on ? ' checked' : '') +
      (h ? '' : ' disabled') +
      '><label class="form-check-label" for="abOn">Tự sao lưu mỗi ngày</label></div>' +
      '<label class="small d-flex align-items-center gap-1 mb-0">Giữ <select class="form-select form-select-sm w-auto" id="abKeep">' +
      AUTO_KEEPS.map((n) => '<option value="' + n + '"' + (+c.keep === n ? ' selected' : '') + '>' + n + '</option>').join('') +
      '</select> bản</label>' +
      '<button class="btn btn-primary" id="abRun" type="button"' +
      (h ? '' : ' disabled') +
      '>▶ Sao lưu vào thư mục ngay</button>' +
      '</div>' +
      (files.length
        ? '<div class="table-responsive mt-2"><table class="table table-sm mb-0"><thead><tr><th>Bản trong thư mục (' +
          files.length +
          ')</th><th class="text-end">Dung lượng</th><th class="text-end">Ghi lúc</th></tr></thead><tbody>' +
          files
            .map(
              (x) =>
                '<tr><td class="mono small">' +
                esc(x.name) +
                '</td><td class="text-end small">' +
                fmtBytes(x.size) +
                '</td><td class="text-end small">' +
                esc(fmtDT(x.at)) +
                '</td></tr>'
            )
            .join('') +
          '</tbody></table></div>'
        : '') +
      '<div class="form-text mt-2">App ghi <span class="mono">HAK_TuDong_&lt;ngày&gt;_&lt;giờ&gt;.zip</span> (đủ như ⬇ Sao lưu toàn bộ) lần đầu mở app mỗi ngày, đọc lại kiểm tra, rồi xóa các bản <span class="mono">HAK_TuDong_*.zip</span> cũ hơn số bản giữ — không đụng file khác trong thư mục. ' +
      'Nên chọn thư mục <b>đồng bộ Google Drive / OneDrive</b> hoặc ổ khác ổ C để có bản ngoài máy. Chrome/Edge thường hỏi lại quyền ghi sau mỗi lần mở trình duyệt → bấm <b>Cho phép &amp; sao lưu</b> ở Tổng quan (chọn "Cho phép mỗi lần truy cập" nếu trình duyệt có).</div>'
    );
  }
  function bindAuto() {
    const pick = $('#abPick');
    if (pick)
      pick.addEventListener('click', async () => {
        try {
          const h = await autoPick(); // quyền GHI — cũng dùng làm thư mục "mở sẵn" của hộp thoại Lưu file (MỘT thư mục cho cả hai)
          await setSavedDir(h);
          const c = autoCfg();
          if (!c.on) autoSet({ on: true });
          await render();
          toast('Đã chọn thư mục sao lưu JSON và bật tự sao lưu mỗi ngày. Bấm ▶ để tạo bản đầu tiên.', 'success');
        } catch (e) {
          if (!(e && e.name === 'AbortError')) {
            console.error(e);
            toast('Không chọn được thư mục: ' + (e.message || e), 'error');
          }
        }
      });
    const on = $('#abOn');
    if (on) {
      on.addEventListener('change', (e) => {
        autoSet({ on: e.target.checked });
        render();
      });
      $('#abKeep').addEventListener('change', (e) => {
        autoSet({ keep: +e.target.value });
        render();
      });
      $('#abRun').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        HAK.UI.Loading.show('Đang sao lưu vào thư mục…');
        try {
          await autoAllowAndRun(b);
        } finally {
          HAK.UI.Loading.hide();
        }
        render();
      });
    }
    const fg = $('#abForget');
    if (fg)
      fg.addEventListener('click', (e) =>
        HAK.UI.confirmClick(
          e.currentTarget,
          async () => {
            await autoForget();
            await setSavedDir(null);
            autoSet({ on: false });
            render();
            toast('Đã bỏ thư mục sao lưu JSON (các file đã ghi vẫn còn trong thư mục).', 'info');
          },
          'Bấm lần nữa'
        )
      );
  }

  /* ---------------- v2.7.5 🩺 Sức khỏe dữ liệu (Tổng quan) ----------------
   * Mỗi mục: lvl 0 = tốt, 1 = cần chú ý, 2 = nguy hiểm. Chỉ đọc. */
  function lsSize() {
    let b = 0;
    try {
      HAK.Store.keys().forEach((k) => {
        const v = root.localStorage.getItem(k);
        if (v) b += (k.length + v.length) * 2;
      });
    } catch (e) {
      /* bị chặn */
    }
    return b;
  }
  async function health() {
    const st = await HAK.DB.status(),
      ls = lsSize();
    let nArch = 0,
      archMetas = [];
    try {
      archMetas = HAK.Archive ? await HAK.Archive.list() : [];
      nArch = archMetas.length;
    } catch (e) {
      /* bỏ qua */
    }
    let integ = [];
    try {
      if (HAK.Integrity && HAK.Catalog && HAK.Catalog.core) integ = HAK.Integrity.audit(HAK.Catalog.core.get(), archMetas);
    } catch (e) {
      /* bỏ qua */
    }
    const soft = (HAK.Archive && HAK.Archive.SOFT_WARN) || 1500;
    await autoPerm(false);
    const a = autoStatus(),
      last = HAK.Store.get(LAST_KEY, 0),
      days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    const pct = st.quota ? (st.usage / st.quota) * 100 : 0,
      lsPct = (ls / (5 * 1048576)) * 100;
    const autoOk = a.on && a.dir && a.perm === 'granted' && !(a.last && a.last.ok === false); // tự sao lưu chạy tốt → "chưa cam kết giữ dữ liệu" không còn đáng lo
    const items = [
      st.backend === 'sqlite'
        ? {
            k: 'store',
            label: 'Cơ sở dữ liệu SQLite',
            val: fmtBytes(st.usage),
            lvl: 0,
            hint: 'Nguồn dữ liệu chính, nằm ngoài thư mục cài và không phụ thuộc trình duyệt: ' + (st.file || ''),
          }
        : {
            k: 'store',
            label: 'Bộ nhớ trình duyệt',
            val: st.backend !== 'idb' ? 'RAM tạm' : fmtBytes(st.usage) + (st.quota ? ' (' + pct.toFixed(1).replace('.', ',') + '%)' : ''),
            lvl: st.backend !== 'idb' || pct > 80 ? 2 : pct > 50 || (st.persisted === false && !autoOk) ? 1 : 0,
            hint:
              st.backend !== 'idb'
                ? 'Dữ liệu mất khi đóng trang'
                : st.persisted === false
                  ? 'Trình duyệt chưa cam kết giữ dữ liệu' + (autoOk ? ' — đã có tự sao lưu' : ' → bật Tự sao lưu')
                  : 'Bền',
          },
      {
        k: 'ls',
        label: 'Cài đặt (localStorage)',
        val: fmtBytes(ls) + ' / 5 MB',
        lvl: lsPct > 85 ? 2 : lsPct > 60 ? 1 : 0,
        hint: lsPct > 60 ? 'Gần đầy — bớt mẫu Word tải lên' : 'Còn rộng',
      },
      {
        k: 'arch',
        label: 'Lưu trữ',
        val: nArch.toLocaleString('vi-VN') + ' hồ sơ',
        lvl: nArch > soft ? 1 : 0,
        hint: nArch > soft ? 'Nên 📦 Xuất & dọn hồ sơ cũ' : 'Không tự xóa',
      },
      {
        k: 'integ',
        label: 'Toàn vẹn danh mục',
        val: integ.length ? integ.length + ' vấn đề' : 'Không phát hiện',
        lvl: integ.some((x) => x.level === 'error') ? 2 : integ.length ? 1 : 0,
        hint: integ.length
          ? integ
              .slice(0, 3)
              .map((x) => x.msg)
              .join(' · ') + (integ.length > 3 ? ' · …' : '')
          : 'Khóa, quan hệ hợp đồng — chi tiết — tờ khai khớp nhau',
      },
      {
        k: 'bk',
        label: 'Sao lưu toàn bộ gần nhất',
        val: last ? (days === 0 ? 'Hôm nay' : days + ' ngày trước') : 'Chưa có',
        lvl: !last || days > 14 ? 2 : days > 7 ? 1 : 0,
        hint: last ? fmtDT(last) : 'Bấm ⬇ Sao lưu toàn bộ',
      },
      {
        k: 'auto',
        label: 'Tự sao lưu',
        val:
          a.perm === 'unsupported'
            ? 'Không hỗ trợ'
            : !a.dir
              ? 'Chưa bật'
              : !a.on
                ? 'Đang tắt'
                : a.last && a.last.ok === false
                  ? 'Lỗi'
                  : a.perm !== 'granted'
                    ? 'Chờ cho phép'
                    : 'Đang bật',
        lvl: a.on && a.dir && a.last && a.last.ok === false ? 2 : a.on && a.dir && a.perm === 'granted' ? 0 : 1,
        hint: a.dir ? '📁 ' + a.dir + ' · giữ ' + a.keep + ' bản' : 'Cài đặt → Sao lưu & khôi phục',
      },
    ];
    return {
      items,
      lvl: Math.max.apply(
        null,
        items.map((x) => x.lvl)
      ),
      auto: a,
    };
  }

  /* ---------------- Thẻ trạng thái ở Cài đặt ---------------- */
  /** Nội dung xem trước phạm vi dữ liệu (HTML) cho hộp chọn cách nhập. */
  function planHtml(plan) {
    const c = plan.catalog,
      li = (t) => '<li>' + t + '</li>';
    return (
      '<ul class="small mb-2">' +
      li(
        'Bản sao có: <b>' +
          plan.keys +
          '</b> mục cài đặt/danh mục, <b>' +
          plan.archive +
          '</b> hồ sơ Lưu trữ, <b>' +
          plan.batches +
          '</b> đợt Excel, <b>' +
          plan.issued +
          '</b> chứng từ đã lập, <b>' +
          plan.attachments +
          '</b> tệp đính kèm, <b>' +
          plan.templates +
          '</b> mẫu BKLS.'
      ) +
      (c
        ? li(
            'Danh mục hợp đồng: bản sao <b>' +
              c.fileContracts +
              '</b> · máy này <b>' +
              c.localContracts +
              '</b> · thêm mới <b>' +
              c.add +
              '</b> · khác nội dung <b>' +
              c.willOverwrite +
              '</b>' +
              (c.localNewer.length
                ? ' · máy này MỚI HƠN ở: ' + c.localNewer.slice(0, 5).map(esc).join('; ') + (c.localNewer.length > 5 ? '…' : '')
                : '') +
              '.'
          )
        : '') +
      '</ul>'
    );
  }
  /** Hộp chọn: Nhập bổ sung (an toàn, theo phiên bản) | Khôi phục về thời điểm sao lưu (ghi đè danh mục & cài đặt) | Hủy. Trả 'merge' | 'replace' | null. */
  function chooseMode(info) {
    if (HAK.Backup && HAK.Backup._choose) return Promise.resolve(HAK.Backup._choose(info));
    return new Promise((ok) => {
      let m = document.getElementById('restoreModal');
      if (m) m.remove();
      m = document.createElement('div');
      m.className = 'modal fade';
      m.id = 'restoreModal';
      m.tabIndex = -1;
      const c = info.plan.catalog;
      m.innerHTML =
        '<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Nhập từ bản sao lưu — chọn cách nhập</h5></div><div class="modal-body">' +
        planHtml(info.plan) +
        '<div class="border rounded p-2 mb-2"><b>Nhập bổ sung (khuyên dùng)</b><div class="small">Gộp theo phiên bản: dữ liệu <b>mới hơn trên máy này được giữ</b> (vd. máy 700 BDMT phiên bản 4 + bản sao 500 BDMT phiên bản 2 → giữ 700); hợp đồng đã mở lại vẫn mở; cài đặt đang có không bị đè; nhập lặp lại cho cùng kết quả.</div></div>' +
        '<div class="border border-danger rounded p-2"><b>Thay thế (ghi đè các mục có trong file)</b><div class="small">Cài đặt và <b>danh mục hợp đồng' +
        (c ? ' (' + c.willOverwrite + ' hợp đồng khác nội dung sẽ bị thay bằng bản sao, kể cả khi máy này mới hơn)' : '') +
        '</b> bị <b>ghi đè</b> bằng bản sao. Hồ sơ Lưu trữ / đợt Excel / nhật ký vẫn gộp theo phiên bản; dữ liệu chỉ có trên máy này không bị xóa. Có nút "Hoàn tác khôi phục" cho phần cài đặt &amp; danh mục.</div></div>' +
        '</div><div class="modal-footer"><button class="btn btn-primary" data-choice="merge" type="button">Nhập bổ sung</button><button class="btn btn-outline-danger" data-choice="replace" type="button">Thay thế (ghi đè các mục có trong file)</button><button class="btn btn-outline-secondary" data-choice="cancel" type="button">Hủy</button></div></div></div>';
      document.body.appendChild(m);
      const inst = bootstrap.Modal.getOrCreateInstance(m, { backdrop: 'static', keyboard: false });
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-choice]');
        if (!b) return;
        inst._isTransitioning ? m.addEventListener('shown.bs.modal', () => inst.hide(), { once: true }) : inst.hide();
        ok(b.dataset.choice === 'cancel' ? null : b.dataset.choice);
      });
      inst.show();
    });
  }
  /** Hộp xác nhận khôi phục bản THEO THÁNG: chỉ "Nhập bổ sung" (quy tắc 34), có xem trước nội dung. Trả 'merge' | null. */
  function chooseMonth(info) {
    if (HAK.Backup && HAK.Backup._choose) return Promise.resolve(HAK.Backup._choose(info));
    return new Promise((ok) => {
      let m = document.getElementById('restoreModal');
      if (m) m.remove();
      m = document.createElement('div');
      m.className = 'modal fade';
      m.id = 'restoreModal';
      m.tabIndex = -1;
      const sc = info.plan.scope || {},
        cn = sc.counts || {};
      const ym = String(sc.month || ''),
        label = ym ? ym.slice(5, 7) + '/' + ym.slice(0, 4) : '?';
      m.innerHTML =
        '<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Khôi phục bản sao lưu THEO THÁNG ' +
        esc(label) +
        '</h5></div><div class="modal-body">' +
        '<p class="small mb-2">Bản này chứa hồ sơ, đợt Excel và chứng từ của <b>tháng ' +
        esc(label) +
        '</b> (tính theo <b>ngày cân đầu tiên</b> của hồ sơ) cùng <b>' +
        (cn.contracts || 0) +
        '</b> hợp đồng, <b>' +
        (cn.customs || 0) +
        '</b> tờ khai, <b>' +
        (cn.customers || 0) +
        '</b> khách hàng mà các hồ sơ đó gắn tới.</p>' +
        planHtml(info.plan) +
        '<div class="border rounded p-2"><b>Chỉ NHẬP BỔ SUNG</b><div class="small">Thêm phần còn thiếu, cập nhật phần cũ hơn; <b>không xóa hay ghi đè các tháng khác</b>, không thay cài đặt. Nhập lại cùng file không tạo bản trùng.</div></div>' +
        '</div><div class="modal-footer"><button class="btn btn-primary" data-choice="merge" type="button">Nhập bổ sung</button><button class="btn btn-secondary" data-choice="cancel" type="button">Hủy</button></div></div></div>';
      document.body.appendChild(m);
      const inst = bootstrap.Modal.getOrCreateInstance(m, { backdrop: 'static', keyboard: false });
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-choice]');
        if (!b) return;
        inst._isTransitioning ? m.addEventListener('shown.bs.modal', () => inst.hide(), { once: true }) : inst.hide();
        ok(b.dataset.choice === 'cancel' ? null : b.dataset.choice);
      });
      inst.show();
    });
  }
  const MONTH_NAMES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const blockHead = (n, t, sub) =>
    '<div class="bk-block mt-4 mb-2"><h3 class="h6 mb-0">' +
    n +
    ' ' +
    t +
    '</h3>' +
    (sub ? '<div class="muted small">' + sub + '</div>' : '') +
    '</div>';
  /** ⑤ Thư mục sao lưu JSON: MỘT thư mục cho cả hộp thoại "Lưu file" (mở sẵn) và tự sao lưu JSON; + thư mục SQLite (HAKDocs ghi). */
  async function foldersHtml() {
    const dirOk = dirPickerSupported(),
      h = dirOk ? (await autoDir()) || (await getSavedDir()) : null,
      sc = sqlCfg(),
      okT = (v, t) => '<span class="' + (v ? 'text-success' : 'text-warning') + '">' + t + '</span>';
    return (
      '<ul class="sum-list mb-2">' +
      '<li><span>Thư mục sao lưu JSON</span><b>' +
      (dirOk ? (h ? '📁 ' + esc(h.name) : okT(false, 'Chưa chọn')) : okT(false, 'Trình duyệt này không hỗ trợ chọn thư mục')) +
      '</b></li></ul>' +
      (dirOk
        ? '<div class="d-flex flex-wrap gap-2 mb-1"><button class="btn btn-outline-secondary" id="abPick" type="button">📁 ' +
          (h ? 'Đổi thư mục…' : 'Chọn thư mục sao lưu JSON…') +
          '</button>' +
          (h ? '<button class="btn btn-outline-secondary btn-sm" id="abForget" type="button">✕ Bỏ thư mục</button>' : '') +
          '</div>'
        : '') +
      '<div class="form-text mb-3">Một thư mục dùng cho cả hộp thoại "Lưu file" (mở sẵn tại đây) và <b>tự sao lưu JSON</b>. Nên chọn thư mục đồng bộ Google Drive / OneDrive hoặc ổ khác ổ C.</div>' +
      '<div class="mb-1 fw-semibold small">Thư mục sao lưu SQLite</div>' +
      (sqlAvailable()
        ? '<div class="input-group mb-1"><input class="form-control" id="sqDir" type="text" placeholder="' +
          esc(
            HAK.BackupSchedule.defaultDir(((HAK.Storage && HAK.Storage.status) || {}).dataDir) || 'Đường dẫn đầy đủ, ví dụ D:\\SaoLuu\\HAK'
          ) +
          '" value="' +
          esc(sc.dir) +
          '" aria-label="Thư mục sao lưu SQLite"><button class="btn btn-outline-secondary" id="sqDirSave" type="button">Lưu</button><button class="btn btn-outline-secondary" id="sqDirDefault" type="button" title="Dùng thư mục mặc định (backups trong thư mục dữ liệu)">Mặc định</button></div>' +
          '<div class="form-text">HAKDocs ghi tệp <span class="mono">HAK_SQLite_&lt;ngày&gt;-&lt;giờ&gt;.db</span> vào thư mục này (nhập đường dẫn đầy đủ trên máy này; để trống = thư mục mặc định ở trên). App chỉ xóa các tệp đúng mẫu đó khi xoay vòng.</div>'
        : '<div class="small muted">Chỉ có ở bản Windows đang lưu dữ liệu bằng SQLite.</div>')
    );
  }
  /** ④ Dòng tự sao lưu SQLite (cùng mẫu với dòng JSON). */
  function sqlAutoHtml() {
    const okT = (v, t) => '<span class="' + (v ? 'text-success' : 'text-warning') + '">' + t + '</span>';
    if (!sqlAvailable())
      return '<hr><div class="fw-semibold mb-1">🗄 Tự sao lưu SQLite</div><div class="small muted">Chỉ có ở bản Windows đang lưu dữ liệu bằng SQLite.</div>';
    const c = sqlCfg(),
      L = c.last;
    const lastOk = L && (L.ok ? L.at : L.okAt);
    const lastTxt = !lastOk
      ? okT(false, 'Chưa có')
      : okT(true, '✓ ' + esc(fmtDT(lastOk))) + (L && L.ok && L.name ? ' — <span class="mono">' + esc(L.name) + '</span>' : '');
    const errTxt =
      L && L.ok === false
        ? '<span class="text-danger">✗ ' + esc(fmtDT(L.at)) + ': ' + esc(L.error || '') + '</span>'
        : okT(true, 'Không có');
    return (
      '<hr><div class="fw-semibold mb-1">🗄 Tự sao lưu SQLite <span class="muted small fw-normal">— ' +
      (c.freq === 'week' ? 'mỗi tuần' : 'mỗi ngày') +
      ' 1 bản .db, giữ ' +
      c.keep +
      ' bản mới nhất</span></div>' +
      '<ul class="sum-list mb-2">' +
      '<li><span>Thư mục</span><b>' +
      esc(sqlDir(c) || '—') +
      '</b></li>' +
      '<li><span>Trạng thái</span><b>' +
      (c.on ? okT(true, 'Đang bật') : okT(false, 'Đang tắt')) +
      '</b></li>' +
      '<li><span>Lần sao lưu thành công gần nhất</span><b>' +
      lastTxt +
      '</b></li>' +
      '<li><span>Lỗi gần nhất</span><b>' +
      errTxt +
      '</b></li></ul>' +
      '<div class="d-flex flex-wrap align-items-center gap-2">' +
      '<div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" role="switch" id="sqOn"' +
      (c.on ? ' checked' : '') +
      '><label class="form-check-label" for="sqOn">Tự sao lưu</label></div>' +
      '<label class="small d-flex align-items-center gap-1 mb-0">Chạy <select class="form-select form-select-sm w-auto" id="sqFreq"><option value="day"' +
      (c.freq === 'day' ? ' selected' : '') +
      '>mỗi ngày</option><option value="week"' +
      (c.freq === 'week' ? ' selected' : '') +
      '>mỗi tuần</option></select></label>' +
      '<label class="small d-flex align-items-center gap-1 mb-0">Giữ <input class="form-control form-control-sm" style="width:5rem" type="number" min="1" max="365" id="sqKeep" value="' +
      c.keep +
      '" aria-label="Số bản giữ"> bản</label>' +
      '<button class="btn btn-primary" id="sqRun" type="button">▶ Chạy ngay</button>' +
      '</div>' +
      '<div class="form-text mt-2">Chạy ở lần mở app đầu tiên trong ' +
      (c.freq === 'week' ? 'tuần (cách ≥ 7 ngày)' : 'ngày') +
      '. Bản được kiểm tra toàn vẹn ngay sau khi ghi; lỗi quyền / đĩa đầy được báo ở đây.</div>'
    );
  }
  async function render() {
    const box = $('#backupBody');
    if (!box) return;
    const st = await HAK.DB.status();
    const lsBytes = lsSize();
    let nArch = 0;
    try {
      nArch = HAK.Archive ? (await HAK.Archive.list()).length : 0;
    } catch (e) {
      /* bỏ qua */
    }
    let nBat = 0;
    try {
      nBat = (await HAK.DB.getAll('batches')).length;
    } catch (e) {
      /* bỏ qua */
    }
    const nIss = HAK.Issued ? HAK.Issued.list.length : 0;
    const last = HAK.Store.get(LAST_KEY, 0);
    const ok = (v, t) => '<span class="' + (v ? 'text-success' : 'text-warning') + '">' + t + '</span>';
    const pct = st.quota ? Math.max(0.01, (st.usage / st.quota) * 100) : 0;
    let mo = { list: [], undated: 0 };
    try {
      mo = await listMonths();
    } catch (e) {
      /* bỏ qua: chưa có dữ liệu */
    }
    const sc = sqlCfg(),
      sqlLast = sc.last && (sc.last.ok ? sc.last.at : sc.last.okAt);
    const now = new Date(),
      defYm = mo.list[0] ? mo.list[0].month : now.getFullYear() + '-' + MONTH_NAMES[now.getMonth()];
    const years = Array.from(new Set(mo.list.map((x) => +x.month.slice(0, 4)).concat([now.getFullYear()]))).sort((a, b) => b - a);
    box.innerHTML =
      blockHead('①', 'Tình trạng dữ liệu', 'Nơi lưu · dung lượng · số liệu · lần sao lưu gần nhất — MỘT chỗ') +
      '<ul class="sum-list mb-2">' +
      '<li><span>Trình duyệt cam kết giữ dữ liệu</span><b>' +
      (st.persisted === null ? '—' : ok(st.persisted, st.persisted ? 'Có' : 'Chưa (có thể bị xóa khi thiếu dung lượng)')) +
      '</b></li>' +
      '<li><span>Dung lượng đang dùng</span><b>' +
      fmtBytes(st.usage) +
      (st.quota ? ' / ' + fmtBytes(st.quota) + ' (' + pct.toFixed(2).replace('.', ',') + '%)' : '') +
      '</b></li>' +
      '<li><span>Cài đặt &amp; danh sách xe (localStorage)</span><b>' +
      fmtBytes(lsBytes) +
      ' / ~5 MB</b></li>' +
      '<li><span>Hồ sơ trong Lưu trữ</span><b>' +
      nArch +
      '</b></li>' +
      '<li><span>Đợt Excel đã lưu (mở lại app vẫn còn)</span><b>' +
      nBat +
      '</b></li>' +
      '<li><span>Chứng từ đã lập (nhật ký)</span><b>' +
      nIss +
      '</b></li>' +
      '<li><span>Sao lưu JSON gần nhất</span><b>' +
      (last ? fmtDT(last) : ok(false, 'Chưa sao lưu lần nào')) +
      '</b></li>' +
      (sqlAvailable()
        ? '<li><span>Sao lưu SQLite gần nhất</span><b>' + (sqlLast ? fmtDT(sqlLast) : ok(false, 'Chưa có')) + '</b></li>'
        : '') +
      '</ul>' +
      '<div id="bkStorage"></div>' +
      blockHead('②', 'Sao lưu ngay') +
      '<div class="d-flex flex-wrap align-items-end gap-2">' +
      '<button class="btn btn-primary" id="bkSave" type="button">⬇ Toàn bộ (.zip)</button>' +
      '<div class="d-flex flex-wrap align-items-end gap-1 border rounded p-2"><label class="small mb-0">Tháng <select class="form-select form-select-sm" id="bkMonthM" aria-label="Tháng">' +
      MONTH_NAMES.map((m) => '<option value="' + m + '"' + (defYm.slice(5, 7) === m ? ' selected' : '') + '>' + m + '</option>').join('') +
      '</select></label><label class="small mb-0">Năm <select class="form-select form-select-sm" id="bkMonthY" aria-label="Năm">' +
      years.map((y) => '<option value="' + y + '"' + (+defYm.slice(0, 4) === y ? ' selected' : '') + '>' + y + '</option>').join('') +
      '</select></label><button class="btn btn-outline-primary" id="bkSaveMonth" type="button">⬇ Theo tháng (.json)</button><span class="small muted ms-1" id="bkMonthInfo"></span></div>' +
      (sqlAvailable()
        ? '<button class="btn btn-outline-primary" id="bkSqlNow" type="button">🗄 SQLite ngay (.db)</button>'
        : '<button class="btn btn-outline-secondary" id="bkSqlNow" type="button" disabled title="Chỉ khả dụng khi ứng dụng kết nối cơ sở dữ liệu SQLite (bản Windows)">🗄 SQLite ngay (chỉ trên Windows)</button>') +
      '</div>' +
      '<div class="form-text mt-2">Bản <b>theo tháng</b> = hồ sơ, đợt Excel, chứng từ của tháng (tính theo <b>ngày cân đầu tiên</b>) cùng hợp đồng / tờ khai / khách hàng mà chúng gắn tới' +
      (mo.undated ? ' · ⚠ ' + mo.undated + ' hồ sơ không có ngày cân nên không thuộc tháng nào (chỉ có trong bản toàn bộ)' : '') +
      '. Nên sao lưu toàn bộ định kỳ và trước khi đổi máy / trình duyệt.</div>' +
      blockHead('③', 'Khôi phục', 'MỘT nút — app tự nhận loại file (toàn bộ · theo tháng · theo năm)') +
      '<div class="d-flex flex-wrap gap-2">' +
      (preRestoreInfo()
        ? '<button class="btn btn-outline-warning admin-only" id="bkUndo" type="button" title="Trả cài đặt / danh mục về trạng thái trước lần khôi phục gần nhất (' +
          esc(fmtDT(preRestoreInfo().at)) +
          ')">↶ Hoàn tác khôi phục</button>'
        : '') +
      '<label class="btn btn-outline-primary mb-0 admin-only">⬆ Chọn file để khôi phục<input type="file" id="bkRestore" accept=".zip,.json,application/zip,application/json" hidden></label>' +
      (st.persisted === false
        ? '<button class="btn btn-outline-secondary" id="bkPersist" type="button">Yêu cầu trình duyệt giữ dữ liệu</button>'
        : '') +
      '</div>' +
      '<div class="form-check mt-2 admin-only"><input class="form-check-input" type="checkbox" id="bkKeepAuth" checked><label class="form-check-label small" for="bkKeepAuth"><b>Giữ tài khoản đang dùng trên máy này</b> khi khôi phục bản toàn bộ. Bỏ tick khi chuyển sang máy mới và muốn mọi người đăng nhập bằng mật khẩu cũ.</label></div>' +
      '<div class="form-text mt-1">Bản <b>toàn bộ</b>: chọn <b>Nhập bổ sung</b> (giữ dữ liệu mới hơn trên máy) hoặc <b>Thay thế (ghi đè các mục có trong file)</b> (về đúng thời điểm sao lưu, không xóa dữ liệu chỉ có trên máy này, có Hoàn tác). Bản <b>theo tháng</b>: chỉ Nhập bổ sung, không đụng tháng khác. Bản <b>theo năm</b>: nhập vào Sổ hồ sơ năm. Xem trước nội dung trước khi ghi.</div>' +
      blockHead('④', 'Tự sao lưu định kỳ') +
      (await autoHtml()) +
      sqlAutoHtml() +
      blockHead('⑤', 'Thư mục sao lưu') +
      (await foldersHtml()) +
      blockHead('⑥', 'Theo năm') +
      '<div class="small mb-1">Sao lưu / khôi phục / đóng năm theo từng năm làm ở <b>Sổ hồ sơ năm</b> (không làm lại ở đây).</div>' +
      '<button class="btn btn-outline-secondary" id="bkYear" type="button">📚 Mở Sổ hồ sơ năm</button>';
    bindAuto();
    if (HAK.MigrateUI) HAK.MigrateUI.mount($('#bkStorage')); // "Nơi lưu dữ liệu" — chỉ một chỗ (khối ①)
    bindSqlFolders();
    const b1 = $('#bkSave'),
      b2 = $('#bkRestore'),
      b3 = $('#bkPersist');
    const monthYm = () => $('#bkMonthY').value + '-' + $('#bkMonthM').value;
    const monthInfo = () => {
      const row = mo.list.find((x) => x.month === monthYm());
      $('#bkMonthInfo').textContent = row ? row.archive + ' hồ sơ · ' + row.issued + ' chứng từ' : 'chưa có hồ sơ';
    };
    $('#bkMonthM').addEventListener('change', monthInfo);
    $('#bkMonthY').addEventListener('change', monthInfo);
    monthInfo();
    $('#bkSaveMonth').addEventListener('click', async (e) => {
      const b = e.currentTarget,
        ym = monthYm(),
        row = mo.list.find((x) => x.month === ym);
      if (!row) {
        toast('Tháng ' + ym.slice(5, 7) + '/' + ym.slice(0, 4) + ' chưa có hồ sơ hay chứng từ nào để sao lưu.', 'warning');
        return;
      }
      b.disabled = true;
      try {
        const r = await saveMonth(ym);
        toast(
          'Đã sao lưu tháng ' +
            ym.slice(5, 7) +
            '/' +
            ym.slice(0, 4) +
            ': ' +
            r.name +
            ' (' +
            r.archive +
            ' hồ sơ, ' +
            r.batches +
            ' đợt Excel, ' +
            r.issued +
            ' chứng từ). Tệp đã lưu vào thư mục Tải xuống của trình duyệt (hoặc thư mục bạn đã chọn).',
          'success'
        );
      } catch (err) {
        if (!(err && err.name === 'AbortError')) {
          console.error(err);
          toast('Không sao lưu được: ' + (err.message || err), 'error');
        }
      }
      b.disabled = false;
    });
    const bs = $('#bkSqlNow');
    if (bs)
      bs.addEventListener('click', async () => {
        bs.disabled = true;
        HAK.UI.Loading.show('Đang sao lưu SQLite…');
        try {
          const r = await sqlRunNow();
          toast(
            'Đã sao lưu SQLite: ' +
              String(r.path).split(/[\\/]/).pop() +
              ' (' +
              fmtBytes(r.size) +
              ', đạt kiểm tra toàn vẹn' +
              (r.removed && r.removed.length ? ', xóa ' + r.removed.length + ' bản cũ' : '') +
              ').',
            'success'
          );
        } catch (err) {
          toast('Không sao lưu SQLite được: ' + (err.message || err), 'error');
        }
        HAK.UI.Loading.hide();
        render();
      });
    const by = $('#bkYear');
    if (by) by.addEventListener('click', () => HAK.Yearbook && HAK.Yearbook.show && HAK.Yearbook.show());
    b1.addEventListener('click', async () => {
      b1.disabled = true;
      try {
        const r = await saveAll();
        toast(
          'Đã sao lưu: ' +
            r.name +
            (r.size ? ' · ' + fmtBytes(r.size) : '') +
            ' (' +
            r.keys +
            ' mục cài đặt, ' +
            r.archive +
            ' hồ sơ, ' +
            r.batches +
            ' đợt Excel, ' +
            r.issued +
            ' chứng từ đã lập). Tệp đã lưu vào thư mục Tải xuống của trình duyệt (hoặc thư mục bạn đã chọn).',
          'success'
        );
        render();
      } catch (e) {
        if (e && e.name === 'AbortError') {
          b1.disabled = false;
          return;
        } // người dùng bấm Hủy trong hộp thoại lưu — không phải lỗi
        console.error(e);
        toast('Không sao lưu được: ' + (e.message || e), 'error');
        b1.disabled = false;
      }
    });
    const bu = $('#bkUndo');
    if (bu)
      bu.addEventListener('click', () =>
        HAK.UI.confirmClick(
          bu,
          async () => {
            try {
              const r = await undoRestore();
              toast(
                'Đã hoàn tác khôi phục: trả ' +
                  r.set +
                  ' mục cài đặt / danh mục, gỡ ' +
                  r.removed +
                  ' mục mới. Hồ sơ Lưu trữ đã nhập vẫn giữ.',
                'success'
              );
              setTimeout(() => root.location.reload(), 1200);
            } catch (err) {
              toast(err.message || String(err), 'error');
            }
          },
          'Bấm lần nữa để hoàn tác'
        )
      );
    b2.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      HAK.UI.Loading.show('Đang kiểm tra bản sao…');
      let info = null;
      try {
        const j0 = await readJson(f),
          kind = kindOf(j0);
        if (!kind) throw new Error('Không nhận ra file này là bản sao lưu của app (toàn bộ, theo tháng hay theo năm).');
        if (kind === 'year') {
          // bản sao lưu THEO NĂM (Sổ hồ sơ năm): nhập vào Sổ hồ sơ năm bằng đúng bộ khôi phục năm
          HAK.UI.Loading.hide();
          if (!HAK.Yearbook || !HAK.Yearbook.restore) throw new Error('Chưa nạp Sổ hồ sơ năm.');
          if (
            !root.confirm('Đây là bản sao lưu THEO NĂM ' + j0.year + ' (' + (j0.records || []).length + ' hồ sơ). Nhập vào Sổ hồ sơ năm?')
          ) {
            toast('Đã hủy — chưa thay đổi gì.', 'info');
            return;
          }
          HAK.UI.Loading.show('Đang nhập bản sao lưu năm…');
          await HAK.Yearbook.restore(f);
          toast('Đã nhập bản sao lưu năm ' + j0.year + ' vào Sổ hồ sơ năm.', 'success');
          return;
        }
        info = await inspect(f); // kiểm tra TRƯỚC khi ghi: file hỏng thì chưa đổi gì
        HAK.UI.Loading.hide();
        const mode = info.legacy ? 'merge' : kind === 'month' ? await chooseMonth(info) : await chooseMode(info);
        if (!mode) {
          toast('Đã hủy — chưa thay đổi gì.', 'info');
          return;
        }
        HAK.UI.Loading.show(mode === 'replace' ? 'Đang khôi phục…' : 'Đang nhập bổ sung…');
        const ka = $('#bkKeepAuth'),
          r = await restoreFile(f, { keepAuth: !ka || ka.checked, mode, parsed: info });
        toast(
          (mode === 'replace' ? 'Khôi phục' : 'Nhập bổ sung') +
            ' xong' +
            (r.legacy
              ? ' (file riêng Lưu trữ)'
              : kind === 'month'
                ? ' (bản theo tháng)'
                : ': ' + r.keys + ' mục cài đặt' + (r.keepAuth ? ' (giữ tài khoản đang dùng)' : ' (lấy cả tài khoản trong file)')) +
            ', hồ sơ thêm ' +
            r.added +
            ', cập nhật ' +
            r.updated +
            (r.skipped ? ', bỏ qua ' + r.skipped : '') +
            (r.keptNewer ? ' · giữ ' + r.keptNewer + ' hợp đồng trên máy vì mới hơn bản sao' : '') +
            (r.conflicts ? ' · ⚠ ' + r.conflicts + ' hợp đồng cùng phiên bản nhưng khác nội dung (đã giữ bản trên máy)' : '') +
            (r.dupPayments ? ' · bỏ ' + r.dupPayments + ' khoản nộp thuế trùng giấy đã có' : '') +
            (r.maybePayments ? ' · ⚠ ' + r.maybePayments + ' khoản nộp nghi trùng cần đối soát' : '') +
            '.',
          r.conflicts ? 'warning' : 'success'
        );
        setTimeout(() => root.location.reload(), 1500);
      } catch (err) {
        console.error(err);
        toast(err.message || String(err), 'error');
        if (err && err.report) {
          try {
            root.alert(err.message);
          } catch (e2) {
            /* bỏ qua */
          }
        }
      } finally {
        HAK.UI.Loading.hide();
      }
    });
    if (b3)
      b3.addEventListener('click', async () => {
        toast(
          (await HAK.DB.requestPersist())
            ? 'Trình duyệt đã đồng ý giữ dữ liệu.'
            : 'Trình duyệt chưa đồng ý (thường tự đồng ý khi bạn dùng app đều đặn hoặc thêm vào trang chủ).',
          'info'
        );
        render();
      });
  }
  /** Gắn nút cho thư mục SQLite + dòng tự sao lưu SQLite (khối ④, ⑤). */
  function bindSqlFolders() {
    const save = $('#sqDirSave');
    if (save) {
      const saveDir = (v) => {
        const t = String(v || '').trim();
        if (t && !/^([A-Za-z]:[\\/]|\\\\|\/)/.test(t)) {
          toast('Thư mục không hợp lệ: nhập đường dẫn đầy đủ (ví dụ D:\\SaoLuu\\HAK).', 'error');
          return;
        }
        sqlSet(Object.assign(sqlCfg(), { dir: t }));
        toast(t ? 'Đã lưu thư mục sao lưu SQLite.' : 'Đã dùng thư mục mặc định.', 'success');
        render();
      };
      save.addEventListener('click', () => saveDir($('#sqDir').value));
      $('#sqDirDefault').addEventListener('click', () => saveDir(''));
    }
    const on = $('#sqOn');
    if (on) {
      on.addEventListener('change', (e) => {
        sqlSet(Object.assign(sqlCfg(), { on: e.target.checked }));
        render();
      });
      $('#sqFreq').addEventListener('change', (e) => {
        sqlSet(Object.assign(sqlCfg(), { freq: e.target.value }));
        render();
      });
      $('#sqKeep').addEventListener('change', (e) => {
        sqlSet(Object.assign(sqlCfg(), { keep: +e.target.value }));
        render();
      });
      $('#sqRun').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        HAK.UI.Loading.show('Đang sao lưu SQLite…');
        try {
          const r = await sqlRunNow();
          toast(
            'Đã sao lưu SQLite: ' +
              String(r.path).split(/[\\/]/).pop() +
              (r.removed && r.removed.length ? ' (xóa ' + r.removed.length + ' bản cũ)' : '') +
              '.',
            'success'
          );
        } catch (err) {
          toast('Không sao lưu SQLite được: ' + (err.message || err), 'error');
        }
        HAK.UI.Loading.hide();
        render();
      });
    }
  }

  /* ---------------- v2.16.2 — Dải nhắc sao lưu ở mọi trang: có dữ liệu mà > 7 ngày (hoặc chưa lần nào) chưa sao lưu toàn bộ ---------------- */
  const BK_OLD_DAYS = 7,
    SNOOZE_KEY = 'hak.backup.snooze';
  /** Thuần: có nên nhắc không? last = mốc sao lưu gần nhất (ms, 0 = chưa), snooze = mốc đã bấm "để sau". */
  function backupNag(hasData, last, now, snooze) {
    if (!hasData || (snooze && now - snooze < 864e5)) return null;
    if (!last) return { days: null, text: 'Chưa sao lưu toàn bộ lần nào' };
    const days = Math.floor((now - last) / 864e5);
    return days > BK_OLD_DAYS ? { days, text: 'Đã ' + days + ' ngày chưa sao lưu toàn bộ' } : null;
  }
  async function bkBanner() {
    let el = document.getElementById('bkNag');
    let has = !!(HAK.Issued && HAK.Issued.list && HAK.Issued.list.length);
    try {
      if (!has && HAK.Archive) has = (await HAK.Archive.list()).length > 0;
    } catch (e) {
      /* bỏ qua */
    }
    try {
      if (!has && HAK.Catalog && HAK.Catalog.core) has = (HAK.Catalog.core.get().contracts || []).length > 0;
    } catch (e) {
      /* bỏ qua */
    }
    const n = backupNag(has, HAK.Store.get(LAST_KEY, 0), Date.now(), HAK.Store.get(SNOOZE_KEY, 0));
    if (!n) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      const top = document.querySelector('.content > .topbar');
      if (!top) return;
      el = document.createElement('div');
      el.id = 'bkNag';
      el.className = 'alert alert-warning d-flex align-items-center gap-2 flex-wrap py-2 px-3 mb-0 rounded-0 small';
      el.setAttribute('role', 'alert');
      top.insertAdjacentElement('afterend', el);
    }
    el.innerHTML =
      '<span>💾 <b>' +
      n.text +
      '</b> — nếu trình duyệt bị xóa hoặc hỏng, file sao lưu là đường lấy lại dữ liệu.</span>' +
      '<span class="ms-auto d-flex gap-2"><a class="btn btn-sm btn-warning" href="#/settings" data-bknag="go">Sao lưu ngay</a><button class="btn btn-sm btn-outline-secondary" type="button" data-bknag="later">Để sau 1 ngày</button></span>';
  }

  /* ---------------- Khởi tạo ---------------- */
  let lastWarn = 0;
  function init() {
    // Không lưu được (localStorage đầy/bị chặn và không có IndexedDB) → báo, tối đa 1 lần / 10 giây
    HAK.Store.onError = () => {
      if (Date.now() - lastWarn < 10000) return;
      lastWarn = Date.now();
      toast(
        '⚠ Không lưu được dữ liệu vào bộ nhớ trình duyệt (đầy hoặc bị chặn) — thay đổi chỉ tồn tại đến khi đóng trang. Hãy vào Cài đặt → Chung → Sao lưu toàn bộ.',
        'error'
      );
    };
    if (boot.restored) toast('Đã khôi phục ' + boot.restored + ' mục cài đặt từ bản sao dự phòng của trình duyệt.', 'info');
    // Lưu nốt form đang gõ dở khi đóng / ẩn trang
    const flush = () => root.dispatchEvent(new Event('hak:flush'));
    root.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    const tab = document.querySelector('[data-bs-target="#tab-backup"]');
    if (tab) tab.addEventListener('shown.bs.tab', render);
    render();
    renderPack();
    // v2.7.5 tự sao lưu: kiểm tra sau ~20 giây (không làm chậm lúc mở) rồi mỗi 30 phút; nút "Cho phép & sao lưu" ở Tổng quan
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-autobk-allow]');
      if (b) {
        e.preventDefault();
        autoAllowAndRun(b);
      }
    });
    autoPerm(false)
      .then(() => {
        if (autoCfg().on) notify();
      })
      .catch(() => {
        /* bỏ qua */
      });
    setTimeout(() => sqlTick().catch(() => {}), 4000); // tự sao lưu SQLite (đến hạn mới chạy)
    setTimeout(() => {
      autoTick();
      setInterval(autoTick, 30 * 60e3);
    }, 20e3);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bknag]');
      if (!b) return;
      if (b.dataset.bknag === 'later') {
        HAK.Store.set(SNOOZE_KEY, Date.now());
        bkBanner();
      }
    });
    setTimeout(bkBanner, 3000);
    setInterval(bkBanner, 10 * 60e3);
    root.addEventListener('hashchange', () => setTimeout(bkBanner, 300));
  }

  HAK.Backup = {
    boot,
    init,
    render,
    saveAll,
    restoreFile,
    validateArchive,
    remapFilterKey,
    hidePaths,
    inspect,
    planHtml,
    undoRestore,
    preRestoreInfo,
    collect,
    dirPickerSupported,
    getSavedDir,
    pickDefaultDir,
    setSavedDir,
    saveBackupBlob,
    backupNag,
    bkBanner,
    readJson,
    buildFull,
    sqlAvailable,
    sqlCfg,
    sqlSet,
    sqlDir,
    sqlRunNow,
    sqlTick,
    buildMonth,
    listMonths,
    saveMonth,
    monthFileName,
    kindOf,
    serialize,
    zipParts,
    health,
    autoStatus,
    autoRun,
    autoTick,
    autoAllowAndRun,
    autoList,
    autoPick,
    packBuild,
    packExport,
    packRead,
    packSummaryHtml,
    packApply,
    packMsg,
  };
})(window);
