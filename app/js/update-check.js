/**
 * update-check.js — nút "Kiểm tra bản mới" (v2.17.0). App chạy offline nên CHỈ kiểm tra khi người dùng bấm nút và có mạng; không tự gọi ra ngoài.
 * Hỏi API công khai của GitHub Releases (không gửi dữ liệu của người dùng). Hàm thuần compare / parseRelease kiểm thử được trong Node.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const REPO = 'saoluucvhak-pixel/HAK_XUATHANG_APP',
    API = 'https://api.github.com/repos/' + REPO + '/releases/latest',
    PAGE = 'https://github.com/' + REPO + '/releases/latest';
  /** So sánh 2 số phiên bản "2.17.0" / "v2.16.2": -1 nhỏ hơn, 0 bằng, 1 lớn hơn, null nếu không hợp lệ. */
  function compare(a, b) {
    const p = (s) => {
      const m = String(s == null ? '' : s)
        .trim()
        .replace(/^v/i, '')
        .match(/^(\d+)\.(\d+)\.(\d+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    const x = p(a),
      y = p(b);
    if (!x || !y) return null;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }
  /** JSON release GitHub → { version, url, setupUrl, sha256 } (null nếu không phải bản phát hành hợp lệ). */
  function parseRelease(j) {
    if (!j || typeof j.tag_name !== 'string' || compare(j.tag_name, '0.0.0') === null || j.draft || j.prerelease) return null;
    const asset = (j.assets || []).find((a) => /^HAK_QuanLyXuatHang_Setup_v.*\.exe$/i.test(a.name || ''));
    const sha = String(j.body || '').match(/SHA-256:\s*`([0-9a-f]{64})`/i);
    return {
      version: j.tag_name.replace(/^v/i, ''),
      url: j.html_url || PAGE,
      setupUrl: asset ? asset.browser_download_url : '',
      sha256: sha ? sha[1].toLowerCase() : '',
    };
  }
  /** Kết luận cho người dùng: { state:'new'|'current'|'ahead'|'unknown', latest, text }. */
  function verdict(current, rel) {
    if (!rel) return { state: 'unknown', latest: null, text: 'Không đọc được thông tin bản phát hành mới nhất.' };
    const c = compare(current, rel.version);
    if (c === null)
      return { state: 'unknown', latest: rel, text: 'Không so sánh được số phiên bản (' + current + ' ↔ ' + rel.version + ').' };
    if (c < 0) return { state: 'new', latest: rel, text: 'Có bản mới v' + rel.version + ' (đang dùng v' + current + ').' };
    if (c === 0) return { state: 'current', latest: rel, text: 'Đang dùng bản mới nhất v' + current + '.' };
    return { state: 'ahead', latest: rel, text: 'Bản đang chạy v' + current + ' mới hơn bản đã phát hành (v' + rel.version + ').' };
  }
  async function check(fetchFn, current) {
    const f = fetchFn || root.fetch;
    if (!f) throw new Error('Trình duyệt không hỗ trợ kiểm tra bản mới.');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null,
      t = ctl ? setTimeout(() => ctl.abort(), 10000) : null;
    try {
      const r = await f(API, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('GitHub trả mã ' + r.status);
      return verdict(current || HAK.VERSION, parseRelease(await r.json()));
    } catch (e) {
      throw new Error(
        e && e.name === 'AbortError' ? 'Quá thời gian chờ (không có mạng?).' : 'Không kiểm tra được: ' + (e && e.message ? e.message : e)
      );
    } finally {
      if (t) clearTimeout(t);
    }
  }
  HAK.Update = { compare, parseRelease, verdict, check, PAGE };
  if (typeof module === 'object' && module.exports) module.exports = HAK.Update;
})(typeof window !== 'undefined' ? window : globalThis);
