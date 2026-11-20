/**
 * trip-details.js — NGUỒN CHUNG "chi tiết hợp đồng nào đã có phiếu cân" (quy tắc nghiệp vụ mục 1b/30).
 *
 * Trạng thái "Đã hoàn thành" của hợp đồng cần biết chi tiết nào đã có phiếu cân trong hồ sơ Lưu trữ. Mọi màn hình (Danh mục, tab Tờ khai,
 * Báo cáo tổng hợp, Chi tiết xuất hàng theo HĐ, Báo cáo thực hiện HĐ, Hồ sơ hợp đồng, Google Sheet, bản in/xuất) lấy trạng thái từ
 * HAK.CustomsModel.contractStatus; mô hình đó đọc tập này qua setTripDetailsProvider → MỘT nguồn, không thể lệch giữa các màn.
 *
 * Cách tính = đúng cách của trang "Chi tiết xuất hàng theo HĐ": Report.prepareTickets → compute → xhLots (cùng phạm vi công ty, chống trùng cấp phiếu).
 * Chưa tính xong → provider trả null (trạng thái hiển thị như cũ) rồi tự cập nhật; đổi Lưu trữ / Danh mục / phạm vi công ty → tính lại (gộp
 * nhiều thay đổi liên tiếp) và phát sự kiện 'hak:tripdetails' để màn đang mở vẽ lại. Không chặn giao diện (chạy nền).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const ticketCache = (HAK.Report && HAK.Report.ticketCache) || new Map(); // dùng chung với trang Chi tiết xuất hàng theo HĐ (cùng khóa id + updatedAt)
  const DELAY = 250;
  let ids = null,
    sig = null,
    timer = null,
    running = null,
    pending = false,
    started = false,
    lastMs = 0,
    failed = false;
  const signature = (s) => (s ? Array.from(s).sort().join('|') : null);

  /** Tính tập mã chi tiết hợp đồng đã có phiếu cân (≥ 1 phiếu trong phạm vi công ty đang xem). */
  async function compute() {
    const scope = HAK.Auth && HAK.Auth.scopeIds ? HAK.Auth.scopeIds('report') : null;
    const metas0 = await HAK.Archive.ensureStats(await HAK.Archive.list());
    const metas = scope ? metas0.filter((m) => scope.indexOf(HAK.Auth.companyOfMeta(m)) >= 0) : metas0;
    const tickets = await HAK.Report.prepareTickets(metas, ticketCache);
    const model = HAK.Report.compute(metas, { tickets }),
      xl = HAK.Report.xhLots(model.used, scope ? { scope } : {});
    const out = new Set();
    xl.lots.forEach((L) => {
      if (L.c && L.recs.length && L.trips > 0) out.add(L.c.id);
    });
    return out;
  }
  /** Tính lại ngay; trả Set. Gọi chồng nhau thì chạy tiếp một lượt sau khi lượt đang chạy xong (không bỏ sót thay đổi). */
  function refresh() {
    if (running) {
      pending = true;
      return running;
    }
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    running = compute()
      .then((s) => {
        lastMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
        const next = signature(s),
          changed = next !== sig;
        ids = s;
        failed = false;
        sig = next;
        if (changed) {
          try {
            root.dispatchEvent(new CustomEvent('hak:tripdetails', { detail: { count: s.size } }));
          } catch (e) {
            /* môi trường không có sự kiện */
          }
        }
        return s;
      })
      .catch((e) => {
        console.warn('Không tính được chi tiết hợp đồng đã có phiếu cân', e);
        if (ids === null) {
          failed = true; // chưa có kết quả nào: các màn báo "chưa đối chiếu được phiếu cân" thay vì chờ mãi
          try {
            root.dispatchEvent(new CustomEvent('hak:tripdetails', { detail: { error: true } }));
          } catch (e2) {
            /* môi trường không có sự kiện */
          }
        }
        return ids;
      })
      .finally(() => {
        running = null;
        if (pending) {
          pending = false;
          refresh();
        }
      });
    return running;
  }
  /** Lên lịch tính lại (gộp nhiều thay đổi liên tiếp). */
  function schedule() {
    if (!started) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, DELAY);
  }
  /** Gắn nguồn cho mô hình trạng thái hợp đồng và theo dõi thay đổi. Gọi một lần sau khi app khởi động. */
  function start() {
    if (HAK.CustomsModel && HAK.CustomsModel.setTripDetailsProvider)
      HAK.CustomsModel.setTripDetailsProvider(() => (ids === null && failed ? 'error' : ids));
    if (!started) {
      started = true;
      ['hak:archive', 'hak:catalog', 'hak:scope'].forEach((ev) => root.addEventListener(ev, schedule));
    }
    schedule();
  }
  HAK.TripDetails = {
    start,
    refresh,
    schedule,
    ticketCache,
    ids: () => ids,
    get ready() {
      return ids !== null;
    },
    get lastMs() {
      return lastMs;
    },
    _compute: compute,
  };
})(typeof window !== 'undefined' ? window : globalThis);
