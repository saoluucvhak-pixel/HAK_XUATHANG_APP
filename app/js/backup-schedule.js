/**
 * backup-schedule.js — lịch TỰ SAO LƯU SQLite (quy tắc 35): mặc định mỗi ngày, giữ 30 bản; đổi được ngày / tuần và số bản giữ.
 * Hàm thuần (không đụng DOM / mạng) để kiểm thử: chuẩn hóa cấu hình, tính "đến hạn chưa", thư mục mặc định.
 * Chạy ở lần mở app đầu tiên trong ngày (backup.js gọi sau khi mở) + nút "Sao lưu SQLite ngay".
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const DAY = 86400000,
    RETRY_AFTER_FAIL = 3600000; // lần trước lỗi: thử lại sau ≥ 1 giờ (không dồn dập khi ổ đĩa đầy / thư mục mất)
  const DEFAULT = { on: true, freq: 'day', keep: 30, dir: '', last: null };
  /** Chuẩn hóa cấu hình đã lưu (thiếu / hỏng → mặc định; keep 1…365). */
  function normalize(c) {
    const o = Object.assign({}, DEFAULT, c && typeof c === 'object' ? c : {});
    o.on = o.on !== false;
    o.freq = o.freq === 'week' ? 'week' : 'day';
    const k = Math.floor(Number(o.keep));
    o.keep = Number.isFinite(k) ? Math.min(365, Math.max(1, k)) : DEFAULT.keep;
    o.dir = typeof o.dir === 'string' ? o.dir.trim() : '';
    o.last = o.last && typeof o.last === 'object' ? o.last : null;
    return o;
  }
  const sameDay = (a, b) => {
    const x = new Date(a),
      y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  };
  /**
   * Đến hạn chưa?  day: chưa có bản thành công NGÀY HÔM NAY (lần mở app đầu tiên trong ngày);  week: cách bản thành công gần nhất ≥ 7 ngày.
   * Lần gần nhất lỗi → chờ ≥ 1 giờ rồi mới thử lại. Tắt (on = false) → không bao giờ đến hạn.
   */
  function due(cfg, now) {
    const c = normalize(cfg);
    if (!c.on) return false;
    const last = c.last;
    if (last && last.ok === false && now - (last.at || 0) < RETRY_AFTER_FAIL) return false;
    const okAt = last && last.ok !== false && last.okAt ? last.okAt : last && last.ok ? last.at : 0;
    if (!okAt) return true;
    return c.freq === 'week' ? now - okAt >= 7 * DAY : !sameDay(okAt, now);
  }
  /** Thư mục mặc định = <thư mục dữ liệu>\backups (giữ kiểu dấu phân cách của đường dẫn đã cho). */
  function defaultDir(dataDir) {
    const d = String(dataDir || '').replace(/[\\/]+$/, '');
    if (!d) return '';
    return d + (d.indexOf('\\') >= 0 ? '\\' : '/') + 'backups';
  }
  /** Ghi kết quả lần chạy vào cấu hình (trả cấu hình mới; không sửa đối tượng cũ). */
  function record(cfg, result, now) {
    const c = normalize(cfg);
    const last =
      result && result.ok
        ? { ok: true, at: now, okAt: now, name: result.name || '', removed: result.removed || 0, dir: result.dir || '' }
        : {
            ok: false,
            at: now,
            okAt: c.last && c.last.okAt ? c.last.okAt : c.last && c.last.ok ? c.last.at : 0,
            error: (result && result.error) || 'Không rõ nguyên nhân',
          };
    return Object.assign({}, c, { last });
  }
  HAK.BackupSchedule = { DEFAULT, normalize, due, defaultDir, record, sameDay };
  if (typeof module === 'object' && module.exports) module.exports = HAK.BackupSchedule;
})(typeof window !== 'undefined' ? window : globalThis);
