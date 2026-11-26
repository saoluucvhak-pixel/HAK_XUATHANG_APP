/**
 * main.js — Điểm khởi động: điều hướng (sidebar), Trang chủ, trang "Chọn File Excel"
 * (upload · chọn sheet · ánh xạ cột · thống kê · xem trước) và chủ đề sáng/tối.
 * Trạng thái dùng chung nằm ở HAK.App (ds = dataset đã đọc).
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { $, $$, esc, toast, Loading, toggleTheme, debounce, confirmClick } = HAK.UI;
  const X = HAK.Excel,
    G = HAK.Generator;
  const fmtInt = (n) => G.fmtInt(n);

  /* Mỗi loại biên bản có "ngăn" dữ liệu riêng (slot). Một slot chứa NHIỀU ĐỢT (batch = 1 file Excel cân) và một bản GỘP (slot.ds).
   *  - Các trang biên bản đọc slot.ds (gộp mọi đợt của loại đó, đã khử phiếu trùng) — không bao giờ dùng nhầm dữ liệu của loại khác.
   *  - App.wb / fileName / size / sheet / mapping / headerRow / ds / previewPage là lối tắt tới ĐỢT đang xem ở trang Nhập liệu
   *    (slot.sel) — nhờ vậy code cũ (xem trước, ánh xạ cột…) không phải đổi. */
  const newBatch = () => ({
    wb: null,
    fileName: '',
    size: 0,
    sheet: '',
    mapping: {},
    headerRow: null,
    fallbackUnit: null,
    templateId: null,
    templateName: null,
    headerNames: null,
    templateError: null,
    ds: null,
    previewPage: 0,
  });
  const NOBATCH = newBatch();
  const newSlot = () => ({ batches: [], sel: -1, ds: null });
  const App = (HAK.App = {
    type: '',
    slots: {},
    reparse: null,
    slot() {
      return App.type ? App.slots[App.type] || (App.slots[App.type] = newSlot()) : null;
    },
    cur() {
      const sl = App.slot();
      return (sl && sl.batches[sl.sel]) || NOBATCH;
    },
  });
  Object.keys(NOBATCH).forEach((k) =>
    Object.defineProperty(App, k, {
      get() {
        return App.cur()[k];
      },
      set(v) {
        App.cur()[k] = v;
      },
      enumerable: true,
    })
  );
  const DOC_TYPES = () => Object.keys(HAK.Pages.DOCS);
  const slotOk = (t) => {
    const sl = App.slots[t];
    return !!(sl && sl.ds && sl.ds.ok);
  };
  /** Tên hiển thị nguồn dữ liệu của 1 loại: tên file (1 đợt) hoặc "N đợt". */
  const slotLabel = (sl) => (sl.batches.length === 1 ? sl.batches[0].fileName : sl.batches.length + ' đợt');

  /** Khóa phiếu mà người dùng chọn "dùng số của đợt sau" (lưu theo loại biên bản). */
  const PREFER_KEY = (t) => 'hak.dupprefer.' + t;
  const preferNewKeys = (t) => (t ? HAK.Store.get(PREFER_KEY(t), []) || [] : []);
  function setPreferNew(t, keys) {
    if (keys.length) HAK.Store.set(PREFER_KEY(t), keys);
    else HAK.Store.remove(PREFER_KEY(t));
  }
  /** Gộp các đợt của 1 loại thành sl.ds. 1 đợt → dùng thẳng ds của đợt đó. ≥ 2 đợt → nối dòng, khử phiếu trùng, tính lại thống kê. */
  function mergeSlot(sl) {
    const type = Object.keys(App.slots).find((t) => App.slots[t] === sl) || '';
    HAK.BatchMerge.merge(sl, new Set(preferNewKeys(type)));
  }
  const PAGE_SIZE = 25;

  const TITLES = {
    home: 'Tổng quan',
    file: 'Nhập liệu',
    chungtu: 'Chứng từ xuất hàng',
    guikho: 'Trung chuyển gửi kho',
    xuatkhogui: 'Xuất hàng kho gửi',
    xuatkhau: 'Xuất khẩu',
    xuatban: 'Xuất bán',
    uythac: 'Ủy thác xuất khẩu',
    dieuchuyen: 'Điều chuyển nội bộ',
    traodoi: 'Trao đổi hàng hóa',
    archive: 'Lưu trữ',
    report: 'Báo cáo tổng hợp',
    contractoverview: 'Báo cáo thực hiện hợp đồng',
    contractstatus: 'Chi tiết xuất hàng theo hợp đồng',
    catalog: 'Danh mục hợp đồng & khách hàng',
    settings: 'Cài đặt',
    help: 'Hướng dẫn',
  };

  /* ===============================================================
   * Điều hướng
   * ============================================================= */
  function route() {
    let key = (location.hash || '').replace(/^#\//, '') || 'home';
    if (!TITLES[key]) key = 'home';
    $$('.page').forEach((p) => {
      p.hidden = p.id !== 'page-' + key;
    });
    $$('.sb-link').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
    $('#pageTitle').textContent = TITLES[key];
    document.title = TITLES[key] + ' · HAK QUẢN LÝ XUẤT HÀNG';
    $('#sidebar').classList.remove('open');
    $('#sbBackdrop').classList.remove('show');
    if (HAK.Pages.DOCS[key]) HAK.Pages.show(key);
    if (key === 'home') renderHome();
    if (key === 'chungtu' && HAK.Chungtu) HAK.Chungtu.render();
    updateChips();
    if (key === 'archive' && HAK.Archive) HAK.Archive.render();
    if (key === 'report' && HAK.Report) HAK.Report.render();
    if (key === 'contractoverview' && HAK.ContractOverview) HAK.ContractOverview.render();
    if (key === 'contractstatus' && HAK.ContractStatus) HAK.ContractStatus.render();
    if (key === 'catalog' && HAK.Catalog) HAK.Catalog.render();
    if (key === 'help' && HAK.Help) HAK.Help.render();
    window.scrollTo(0, 0);
  }

  /* ===============================================================
   * Trang chủ + nhãn trạng thái
   * ============================================================= */
  function statTile(v, l, s) {
    return (
      '<div class="col-6 col-md-4 col-xl"><div class="stat"><div class="v">' +
      esc(v) +
      '</div><div class="l">' +
      esc(l) +
      '</div>' +
      (s ? '<div class="s">' + esc(s) + '</div>' : '') +
      '</div></div>'
    );
  }
  function renderHome() {
    const loaded = DOC_TYPES().filter(slotOk);
    if (!loaded.length) {
      $('#homeStatus').innerHTML = '<div class="muted">Chưa có dữ liệu. <a href="#/file">Nhập liệu</a> để bắt đầu.</div>';
      if (HAK.Dashboard) HAK.Dashboard.render();
      return;
    }
    $('#homeStatus').innerHTML = loaded
      .map((t) => {
        const sl = App.slots[t],
          ds = sl.ds,
          st = ds.stats,
          D = HAK.Pages.DOCS[t];
        return (
          '<div class="mb-4"><div class="mb-2 text-break">' +
          D.icon +
          ' <b>' +
          esc(D.title) +
          '</b> — ' +
          esc(slotLabel(sl)) +
          (sl.batches.length === 1 ? ' · sheet "' + esc(sl.batches[0].sheet) + '"' : ' (đã gộp)') +
          '</div><div class="row g-3">' +
          statTile(fmtInt(st.trips), 'Tổng xe (lượt)') +
          statTile(G.fmtTon(st.kg), 'Tổng tấn') +
          statTile(fmtInt(st.plates), 'Số xe (biển số)') +
          statTile(st.from, 'Bắt đầu') +
          statTile(st.to, 'Kết thúc') +
          '</div>' +
          (ds.warnings.length
            ? '<div class="mt-2 small text-warning">⚠ Có ' + ds.warnings.length + ' cảnh báo dữ liệu — xem ở mục Nhập liệu.</div>'
            : '') +
          '</div>'
        );
      })
      .join('');
    if (HAK.Dashboard) HAK.Dashboard.render();
  }
  /** Nhãn trạng thái: ở trang biên bản thì hiện file của đúng loại đó; ở trang khác thì hiện loại đang chọn ở Chọn File. */
  function updateChips() {
    const key = (location.hash || '').replace(/^#\//, '') || 'home';
    const t = HAK.Pages.DOCS[key] ? key : key === 'chungtu' && HAK.Chungtu ? HAK.Chungtu.type : App.type;
    const sl = t ? App.slots[t] : null,
      ds = sl && sl.ds,
      ok = !!(ds && ds.ok);
    $('#sbFile').innerHTML =
      sl && sl.batches.length
        ? '<b>' +
          esc(slotLabel(sl)) +
          '</b>' +
          (ok ? fmtInt(ds.stats.trips) + ' xe · ' + G.fmtTon(ds.stats.kg) + ' tấn' : 'Chưa đọc được dữ liệu')
        : t
          ? 'Chưa có file Excel cho loại này'
          : 'Chưa chọn file Excel';
    const chip = $('#topFileChip');
    chip.hidden = !ok;
    if (ok) chip.textContent = '📊 ' + fmtInt(ds.stats.trips) + ' xe · ' + G.fmtTon(ds.stats.kg) + ' tấn';
    const types = DOC_TYPES();
    $('.sb-link[data-nav=file]').classList.toggle('ready', types.some(slotOk));
    types.forEach((k) => {
      const a = $('.sb-link[data-nav=' + k + ']');
      if (a) a.classList.toggle('ready', slotOk(k));
    });
  }

  /** Chọn loại biên bản cho file (trang Chọn File Excel). */
  function renderTypePicker() {
    const D = HAK.Pages.DOCS;
    $('#fileTypes').innerHTML = DOC_TYPES()
      .map((k) => {
        const sl = App.slots[k],
          ok = slotOk(k);
        return (
          '<button type="button" class="btn ' +
          (App.type === k ? 'btn-primary' : 'btn-outline-secondary') +
          '" data-ft="' +
          k +
          '">' +
          D[k].icon +
          ' ' +
          esc(D[k].title) +
          (ok ? ' <span class="badge text-bg-success ms-1">✓ ' + fmtInt(sl.ds.stats.trips) + ' xe</span>' : '') +
          '</button>'
        );
      })
      .join('');
    $('#fileTypeHint').textContent = App.type
      ? 'Các file đợt thêm ở bước ② chỉ dùng cho "' + D[App.type].title + '" — các loại khác có dữ liệu riêng, không dùng chung.'
      : 'Hãy chọn loại biên bản trước, rồi mới thêm file Excel.';
    $('#dropzone').classList.toggle('locked', !App.type);
    $('#fileInput').disabled = !App.type;
    renderBatches();
  }
  /** Danh sách các đợt (file Excel) của loại đang chọn + dòng tổng gộp. */
  function renderBatches() {
    const sl = App.slot(),
      card = $('#batchCard');
    card.hidden = !(sl && sl.batches.length);
    if (card.hidden) return;
    $('#batchTitle').textContent = 'Các đợt đã nạp — ' + HAK.Pages.DOCS[App.type].title;
    $('#batchBody').innerHTML = sl.batches
      .map((b, i) => {
        const ok = b.ds && b.ds.ok,
          st = ok ? b.ds.stats : null;
        const D = HAK.Pages.DOCS,
          tag =
            (b.conv && D[b.conv.to] ? ' <span class="badge text-bg-info">➡ đã chuyển sang ' + esc(D[b.conv.to].title) + '</span>' : '') +
            (b.from && D[b.from.type] ? ' <span class="badge badge-soft">⬅ chép từ ' + esc(D[b.from.type].title) + '</span>' : '') +
            (b.saveError
              ? ' <span class="badge text-bg-danger" title="' +
                esc(b.saveError) +
                '">⚠ Chưa lưu bền</span> <button class="btn btn-sm btn-outline-danger py-0" data-retry-batch="' +
                esc(b.fileName) +
                '" type="button">Thử lưu lại</button>'
              : b.saved
                ? ' <span class="badge text-bg-success" title="File gốc + thông số đã ghi vào bộ nhớ trình duyệt">✔ Đã lưu</span>'
                : '');
        return (
          '<tr class="' +
          (i === sl.sel ? 'table-active' : '') +
          '" data-bi="' +
          i +
          '" style="cursor:pointer"><td>' +
          (i + 1) +
          '</td><td class="text-break">' +
          esc(b.fileName) +
          tag +
          '</td>' +
          (ok
            ? '<td class="num">' +
              fmtInt(st.trips) +
              '</td><td class="num">' +
              G.fmtTon(st.kg) +
              '</td><td>' +
              esc(st.from) +
              (st.to && st.to !== st.from ? ' → ' + esc(st.to) : '') +
              '</td>'
            : '<td colspan="3" class="text-danger small">' +
              esc((b.ds && b.ds.errors && b.ds.errors[0]) || 'Không đọc được dữ liệu') +
              '</td>') +
          '<td class="text-nowrap">' +
          vehCell(b) +
          '</td>' +
          '<td class="text-end text-nowrap"><button class="btn btn-sm btn-outline-secondary me-1" data-view-batch="' +
          i +
          '" type="button">Xem</button><button class="btn btn-sm btn-outline-danger" data-del-batch="' +
          esc(b.fileName) +
          '" type="button">Xóa</button></td></tr>'
        );
      })
      .join('');
    const ds = sl.ds;
    $('#batchSummary').innerHTML =
      ds && ds.ok
        ? '<b>Dữ liệu gộp cho trang biên bản:</b> ' +
          sl.batches.length +
          ' đợt · ' +
          fmtInt(ds.stats.trips) +
          ' xe · ' +
          G.fmtTon(ds.stats.kg) +
          ' tấn' +
          (ds.stats.from ? ' · ' + esc(ds.stats.from) + ' → ' + esc(ds.stats.to) : '') +
          (ds.dup ? ' <span class="text-warning">· đã bỏ ' + ds.dup + ' phiếu trùng giữa các đợt</span>' : '') +
          (ds.conflicts && ds.conflicts.length
            ? '<div class="alert alert-warning py-2 mt-2 mb-0">⚠ <b>' +
              ds.conflicts.length +
              ' phiếu trùng giữa các đợt nhưng khác khối lượng.</b> App đang dùng số theo lựa chọn của bạn (mặc định: đợt nạp trước). <button class="btn btn-sm btn-warning ms-2" id="btnConflicts" type="button">Xem &amp; chọn</button></div>'
            : '')
        : '<span class="text-danger">Chưa có đợt nào đọc được.</span>';
  }
  /** v2.7.2 ô "DS xe" của 1 đợt: số xe + khớp biển số, hoặc cảnh báo chưa có. */
  function vehCell(b) {
    const vi = b.ds && b.ds.vehicleInfo;
    if (!b.veh)
      return '<span class="badge text-bg-danger" title="Đợt chưa có danh sách xe — bấm dòng đợt rồi gắn ở khung Danh sách xe & tài xế">🚚 Chưa có</span>';
    return (
      '<span class="badge ' +
      (vi && vi.missing.length ? 'text-bg-warning' : 'text-bg-success') +
      '" title="' +
      esc(b.veh.fileName || '') +
      '">🚚 ' +
      Number(b.veh.count || 0) +
      ' xe' +
      (vi && vi.plates ? ' · ' + vi.matched + '/' + vi.plates : '') +
      '</span>'
    );
  }
  function viewBatch(i) {
    const sl = App.slot();
    if (!sl || !sl.batches[i]) return;
    sl.sel = i;
    renderTypePicker();
    renderFile();
    renderVehicles();
    const box = $('#fileResult');
    if (box && !box.hidden) {
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      box.classList.remove('ocr-filled');
      void box.offsetWidth;
      box.classList.add('ocr-filled');
      setTimeout(() => box.classList.remove('ocr-filled'), 1600);
      const st = App.ds && App.ds.ok && App.ds.stats;
      toast(
        'Đang xem đợt "' +
          sl.batches[i].fileName +
          '"' +
          (st ? ': ' + fmtInt(st.trips) + ' xe · ' + G.fmtTon(st.kg) + ' tấn' : '') +
          ' — xem bảng chi tiết bên dưới.',
        'info'
      );
    }
  }
  /** Thử lưu lại đợt chưa ghi được vào IndexedDB (file gốc còn giữ trong RAM). */
  async function retryBatch(fileName) {
    const sl = App.slot(),
      b = sl && sl.batches.find((x) => x.fileName === fileName);
    if (!b || !HAK.Batches) return;
    const ok = await HAK.Batches.retry(App.type, b);
    toast(
      ok
        ? 'Đã lưu đợt "' + fileName + '" vào bộ nhớ trình duyệt.'
        : 'Vẫn chưa lưu được đợt "' + fileName + '": ' + (b.saveError || 'lỗi không rõ') + '.',
      ok ? 'success' : 'error'
    );
    renderBatches();
  }
  /** Xóa đợt theo TÊN FILE (mã đợt ổn định) — không dùng số thứ tự vì danh sách có thể đã đổi (đợt khác bị xóa / thêm, cửa sổ khác). */
  async function deleteBatch(fileName) {
    const sl = App.slot();
    if (!sl) return;
    const i = sl.batches.findIndex((x) => x.fileName === fileName);
    if (i < 0) {
      toast('Đợt "' + fileName + '" không còn trong danh sách.', 'warning');
      renderBatches();
      return;
    }
    const D = HAK.Pages.DOCS,
      cur = sl.batches[i];
    // Điểm tham chiếu: đợt đã chép sang hình thức khác (đợt đích có bản sao độc lập — vẫn giữ)
    const dests =
      cur.conv && App.slots[cur.conv.to]
        ? App.slots[cur.conv.to].batches.filter((x) => x.from && x.from.type === App.type && x.from.fileName === cur.fileName)
        : [];
    if (
      dests.length &&
      !confirm(
        'Đợt "' +
          cur.fileName +
          '" đã được chuyển sang ' +
          (D[cur.conv.to] ? D[cur.conv.to].title : cur.conv.to) +
          '.\n\nXóa đợt gốc: đợt ở ' +
          (D[cur.conv.to] ? D[cur.conv.to].title : '') +
          ' VẪN GIỮ (bản sao độc lập) nhưng mất dấu "chép từ".\n\nBấm OK để xóa; Hủy để giữ lại.'
      )
    )
      return;
    if (HAK.Batches && cur.saved) {
      // xóa file gốc + thông số trong MỘT giao dịch; lỗi → giữ nguyên đợt và báo rõ
      const r = await HAK.Batches.remove(App.type, cur.fileName, cur.rev || 0);
      if (!r.ok) {
        toast('Không xóa được đợt "' + cur.fileName + '": ' + r.error + ' Đợt vẫn còn nguyên — thử lại.', 'error');
        return;
      }
    }
    const j = sl.batches.findIndex((x) => x.fileName === fileName);
    if (j < 0) return;
    dests.forEach((x) => {
      x.from = null;
      if (x.saved && HAK.Batches) HAK.Batches.saveMeta(cur.conv.to, x);
    });
    const fr = sl.batches[j].from; // xóa đợt đã chép sang → đợt gốc được chuyển lại (sang hình thức khác nếu cần)
    if (fr && App.slots[fr.type])
      App.slots[fr.type].batches.forEach((b) => {
        if (b.fileName === fr.fileName && b.conv && b.conv.to === App.type) {
          b.conv = null;
          if (b.saved && HAK.Batches) HAK.Batches.saveMeta(fr.type, b);
        }
      });
    sl.batches.splice(j, 1);
    sl.sel = Math.min(sl.sel >= j ? sl.sel - 1 : sl.sel, sl.batches.length - 1);
    if (sl.sel < 0 && sl.batches.length) sl.sel = 0;
    mergeSlot(sl);
    renderTypePicker();
    renderFile();
    renderVehicles();
    updateChips();
    HAK.Pages.onData(App.type);
    if (location.hash === '#/home' || !location.hash) renderHome();
    toast('Đã xóa đợt "' + fileName + '" khỏi dữ liệu của loại này (file gốc và thông số đã xóa khỏi bộ nhớ trình duyệt).', 'info');
  }
  /* ---- v2.12.1: phiếu trùng giữa các đợt nhưng khác khối lượng → chọn đợt trước / đợt sau ---- */
  function ensureConflictModal() {
    if ($('#conflictModal')) return;
    const m = document.createElement('div');
    m.className = 'modal fade';
    m.id = 'conflictModal';
    m.tabIndex = -1;
    m.innerHTML =
      '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Phiếu trùng giữa các đợt, khác khối lượng</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>' +
      '<div class="modal-body"><p class="small muted">Cùng số phiếu, biển số và giờ cân vào nhưng khối lượng khác nhau ở các file Excel. Chọn số nào sẽ được dùng cho biên bản. Mặc định là <b>đợt nạp trước</b>; nếu file sau là bản đã sửa thì chọn <b>đợt sau</b>. Lựa chọn được nhớ cho loại biên bản này.</p>' +
      '<div class="d-flex flex-wrap gap-2 mb-2"><button class="btn btn-sm btn-outline-primary" id="cfAllNew" type="button">Dùng đợt sau cho tất cả</button><button class="btn btn-sm btn-outline-secondary" id="cfAllOld" type="button">Giữ đợt trước cho tất cả</button><span class="ms-auto small" id="cfCount"></span></div>' +
      '<div class="tbl-wrap"><table class="table table-sm"><thead><tr><th>Số phiếu</th><th>Giờ cân 1</th><th>Biển số</th><th>Đợt trước</th><th>Đợt sau</th><th>Dùng</th></tr></thead><tbody id="cfBody"></tbody></table></div></div>' +
      '<div class="modal-footer"><button class="btn btn-primary" data-bs-dismiss="modal" type="button">Xong</button></div></div></div>';
    document.body.appendChild(m);
    const apply = (keys) => {
      setPreferNew(App.type, keys);
      const sl = App.slot();
      mergeSlot(sl);
      renderConflicts();
      renderTypePicker();
      renderBatches();
      updateChips();
      HAK.Pages.onData(App.type);
    };
    $('#cfBody').addEventListener('change', (e) => {
      const r = e.target.closest('input[data-key]');
      if (!r) return;
      const cur = new Set(preferNewKeys(App.type));
      if (r.value === 'new') cur.add(r.dataset.key);
      else cur.delete(r.dataset.key);
      apply(Array.from(cur));
    });
    $('#cfAllNew').addEventListener('click', () =>
      apply(Array.from(new Set((App.slot().ds.conflicts || []).map((c) => c.key).concat(preferNewKeys(App.type)))))
    );
    $('#cfAllOld').addEventListener('click', () => apply([]));
  }
  function renderConflicts() {
    const sl = App.slot(),
      list = (sl && sl.ds && sl.ds.conflicts) || [];
    const kg = (x) => fmtInt(x.net) + ' kg · ' + esc(x.file);
    $('#cfBody').innerHTML = list
      .map((c) => {
        const first = c.items[0],
          last = c.items[c.items.length - 1],
          name = 'cf' + esc(c.key);
        return (
          '<tr><td class="mono">' +
          esc(c.ticket || '—') +
          '</td><td>' +
          esc(c.time) +
          '</td><td>' +
          esc(c.plate) +
          '</td>' +
          '<td' +
          (c.useNew ? ' class="opacity-50"' : ' class="fw-semibold"') +
          '>' +
          kg(first) +
          '</td><td' +
          (c.useNew ? ' class="fw-semibold"' : ' class="opacity-50"') +
          '>' +
          kg(last) +
          '</td>' +
          '<td class="text-nowrap"><label class="me-2"><input type="radio" name="' +
          name +
          '" data-key="' +
          esc(c.key) +
          '" value="old"' +
          (c.useNew ? '' : ' checked') +
          '> trước</label>' +
          '<label><input type="radio" name="' +
          name +
          '" data-key="' +
          esc(c.key) +
          '" value="new"' +
          (c.useNew ? ' checked' : '') +
          '> sau</label></td></tr>'
        );
      })
      .join('');
    const used = list.filter((c) => c.useNew).length;
    $('#cfCount').textContent = list.length
      ? list.length + ' phiếu khác khối lượng · dùng đợt sau: ' + used + ' · đợt trước: ' + (list.length - used)
      : 'Không còn phiếu khác khối lượng.';
  }
  function openConflicts() {
    ensureConflictModal();
    renderConflicts();
    bootstrap.Modal.getOrCreateInstance($('#conflictModal')).show();
  }
  function setFileType(t) {
    if (t && !HAK.Pages.DOCS[t]) return;
    App.type = t || '';
    HAK.Store.set('hak.app.filetype', App.type);
    const q = $('#plateSearch');
    if (q) q.value = '';
    renderTypePicker();
    renderFile();
    updateChips();
  }

  /* ===============================================================
   * Đọc file Excel
   * ============================================================= */
  /** Thêm 1 file Excel = 1 ĐỢT của loại đang chọn (trùng tên file thì thay đợt cũ). */
  async function handleFile(file) {
    if (!file) return;
    if (!App.type) {
      toast('Hãy chọn loại biên bản trước khi chọn file Excel.', 'warning');
      return;
    }
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      toast('Vui lòng chọn file Excel (.xlsx, .xls, .xlsm) hoặc .csv', 'error');
      return;
    }
    Loading.show('Đang đọc file "' + file.name + '"…');
    try {
      const info = await X.readFile(file, (p) => Loading.set(p));
      const bytes = HAK.Batches ? await file.arrayBuffer() : null; // file gốc → lưu bền để mở lại app vẫn còn
      const sl = App.slot();
      let bi = sl.batches.findIndex((b) => b.fileName === file.name),
        replaced = bi >= 0;
      if (replaced) {
        // nạp file trùng tên = THAY đợt cũ: nói rõ đợt nào sẽ bị thay
        const old = sl.batches[bi],
          os = old.ds && old.ds.ok ? old.ds.stats : null,
          D = HAK.Pages.DOCS;
        Loading.hide();
        const ok = confirm(
          'Đã có đợt cùng tên "' +
            file.name +
            '" ở ' +
            D[App.type].title +
            (os ? ' (' + fmtInt(os.trips) + ' phiếu cân, ' + G.fmtTon(os.kg) + ' tấn)' : '') +
            (old.conv && D[old.conv.to]
              ? '\nĐợt này đã chuyển sang ' + D[old.conv.to].title + ' (bản đã chuyển giữ nguyên, không đổi theo).'
              : '') +
            '.\n\nBấm OK để THAY bằng file mới; Hủy để giữ đợt cũ.'
        );
        if (!ok) {
          toast('Đã giữ đợt cũ "' + file.name + '" — chưa thay.', 'info');
          return;
        }
        Loading.show('Đang đọc file "' + file.name + '"…');
      }
      // Dòng TRÙNG HOÀN TOÀN trong file (cùng số phiếu, biển số, giờ cân): cảnh báo và CHẶN nạp — làm trước khi đổi bất kỳ dữ liệu đợt nào.
      {
        let probe = null;
        for (const n of info.sheetNames) {
          const r = X.parseSheet(info.workbook, n, { autoSwap: HAK.Config.data.general.autoSwap });
          if (r.ok) {
            probe = Object.assign({ sheetName: n }, r);
            break;
          }
        }
        const dups = probe ? G.duplicateRows(probe.rows) : [];
        if (dups.length) {
          Loading.hide();
          toast(
            '⛔ Chưa nạp "' +
              file.name +
              '": sheet "' +
              probe.sheetName +
              '" có ' +
              HAK.ReadConfig.dupSummary(dups) +
              '. Xóa dòng thừa trong file Excel rồi nạp lại.',
            'error'
          );
          return;
        }
      }
      const keepRev = replaced ? sl.batches[bi].rev || 0 : 0;
      const keepAdded = replaced ? sl.batches[bi].addedAt : 0,
        keepConv = replaced ? sl.batches[bi].conv : null,
        keepFrom = replaced ? sl.batches[bi].from : null;
      const keepVeh = replaced ? sl.batches[bi].veh : null;
      if (!replaced) {
        sl.batches.push(newBatch());
        bi = sl.batches.length - 1;
      } else sl.batches[bi] = newBatch();
      if (keepAdded) sl.batches[bi].addedAt = keepAdded;
      if (keepRev) sl.batches[bi].rev = keepRev;
      if (keepConv) sl.batches[bi].conv = keepConv; // nạp lại file cùng tên: vẫn giữ dấu "đã chuyển sang" (mỗi đợt 1 hình thức)
      if (keepFrom) sl.batches[bi].from = keepFrom;
      sl.sel = bi;
      App.wb = info.workbook;
      App.fileName = file.name;
      App.size = file.size;
      App.mapping = {};
      App.headerRow = null;
      App.fallbackUnit = null;

      const defTpl = HAK.ExcelTemplate ? HAK.ExcelTemplate.getDefault() : null;
      let tplMatch = null;
      if (defTpl) {
        App.cur().templateId = defTpl.id;
        App.cur().templateName = defTpl.name;
        App.cur().fallbackUnit = defTpl.fallbackUnit || null;
        App.cur().headerNames = defTpl.headerNames || null;
        App.fallbackUnit = defTpl.fallbackUnit || null;
        App.headerRow = defTpl.headerRow || 1;
      } else {
        App.cur().templateId = null;
        App.cur().templateName = null;
        App.cur().fallbackUnit = null;
        App.cur().headerNames = null;
        App.cur().templateError = null;
      }

      // ưu tiên sheet theo mẫu nếu có hoặc sheet đầu tiên đọc được
      let pick = defTpl && defTpl.sheet && info.sheetNames.includes(defTpl.sheet) ? defTpl.sheet : info.sheetNames[0];
      if (defTpl) {
        const ws = App.wb.Sheets[pick];
        if (ws) {
          const G = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
          const hrIdx = Math.max(0, (defTpl.headerRow || 1) - 1);
          const headerCells = G[hrIdx] || [];
          tplMatch = HAK.ExcelTemplate.matchTemplate(defTpl, headerCells);
          if (tplMatch.ok) {
            App.mapping = tplMatch.mapping;
            App.cur().templateError = null;
          } else {
            App.cur().templateError = tplMatch.errors;
          }
        }
      }
      if (!tplMatch || !tplMatch.ok) {
        for (const n of info.sheetNames) {
          if (X.parseSheet(App.wb, n, { autoSwap: HAK.Config.data.general.autoSwap }).ok) {
            pick = n;
            break;
          }
        }
      }
      App.sheet = pick;
      App.cur().sheet = pick;
      App.cur().mapping = App.mapping;
      App.cur().headerRow = App.headerRow;
      App.cur().fallbackUnit = App.fallbackUnit;
      // v2.7.2 danh sách xe RIÊNG của đợt: sheet "DS XE - TAI XE" trong chính file (file mẫu); không có → giữ danh sách đã gắn khi thay file cùng tên
      const fv = HAK.Vehicles.fromWorkbook(info.workbook, file.name, pick);
      App.cur().veh = fv || keepVeh || null;
      parseCurrent(true);
      let savedOk = true;
      if (App.ds.ok && bytes) savedOk = await HAK.Batches.save(App.type, App.cur(), bytes); // true chỉ khi giao dịch IndexedDB đã hoàn tất
      if (App.ds.ok && !savedOk)
        toast(
          '⚠ Đã đọc "' +
            file.name +
            '" (' +
            fmtInt(App.ds.stats.trips) +
            ' phiếu) nhưng CHƯA lưu được vào bộ nhớ trình duyệt: ' +
            (App.cur().saveError || 'lỗi không rõ') +
            ' — đợt chỉ tồn tại đến khi đóng trang. Bấm "Thử lưu lại" ở dòng đợt.',
          'error'
        );
      else if (App.ds.ok)
        toast(
          (replaced ? 'Đã thay đợt "' + file.name + '": ' : 'Đã thêm đợt: ') +
            fmtInt(App.ds.stats.trips) +
            ' phiếu cân — ' +
            G.fmtTon(App.ds.stats.kg) +
            ' tấn.' +
            (fv
              ? ' Danh sách xe của đợt: ' + fv.count + ' xe (sheet "' + fv.sheet + '").'
              : App.cur().veh
                ? ' Giữ danh sách xe đã gắn cho đợt.'
                : ' Đợt chưa có danh sách xe — bấm 🚚 ở dòng đợt để gắn.'),
          fv || App.cur().veh ? 'success' : 'warning'
        );
      else toast(App.ds.errors[0] || 'Không đọc được dữ liệu.', 'error');
      const cf = App.slot() && App.slot().ds && App.slot().ds.conflicts;
      if (cf && cf.length)
        toast(
          '⚠ ' + cf.length + ' phiếu trùng giữa các đợt nhưng KHÁC khối lượng — bấm "Xem & chọn" ở khung Dữ liệu gộp để chọn số đúng.',
          'warning'
        );
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), 'error');
    } finally {
      Loading.hide();
    }
  }
  async function handleFiles(list) {
    for (const f of Array.from(list || [])) await handleFile(f);
  }

  /** Phân tích lại 1 ngăn dữ liệu (theo sheet / ánh xạ cột của chính ngăn đó). */
  function parseSlot(sl) {
    const opts = { mapping: sl.mapping, autoSwap: HAK.Config.data.general.autoSwap };
    if (sl.headerRow) opts.headerRow = sl.headerRow;
    if (sl.fallbackUnit) opts.fallbackUnit = sl.fallbackUnit;
    try {
      sl.ds = X.parseSheet(sl.wb, sl.sheet, opts);
    } catch (e) {
      console.error(e);
      sl.ds = { ok: false, errors: [e.message], warnings: [], columns: [], mapping: {}, autoMapping: {}, rows: [] };
    }
    if (sl.ds.ok) HAK.Vehicles.enrich(sl.ds, sl.veh || null); // v2.7.2: điền Tài xế / ĐVVC theo danh sách xe RIÊNG của đợt (null → cảnh báo)
  }
  /**
   * Đổi cách đọc của đợt đang xem (đổi sheet, dòng tiêu đề, ánh xạ cột, nhận diện lại cột): đọc thử TRƯỚC khi áp dụng (xem read-config.js).
   * Từ chối thì vẽ lại màn hình để các ô chọn về đúng giá trị đang dùng. Trả true nếu đã áp dụng.
   */
  function applyReadConfig(mutate) {
    const b = App.cur();
    if (!b || !b.wb) return false;
    const RC = HAK.ReadConfig,
      prev = {
        sheet: b.sheet,
        mapping: JSON.parse(JSON.stringify(b.mapping || {})),
        headerRow: b.headerRow || null,
        fallbackUnit: b.fallbackUnit || null,
      },
      next = JSON.parse(JSON.stringify(prev));
    mutate(next);
    const wasOk = !!(b.ds && b.ds.ok),
      verdict = RC.decide(wasOk, RC.probeRead(b.wb, next, HAK.Config.data.general.autoSwap));
    if (!verdict.apply) {
      toast(
        '⛔ Chưa áp dụng: ' +
          verdict.why +
          '. Giữ nguyên cách đọc đang dùng' +
          (wasOk ? ' (sheet "' + prev.sheet + '")' : '') +
          '. ' +
          verdict.hint,
        'error'
      );
      renderFile();
      return false;
    }
    App.sheet = next.sheet;
    App.mapping = next.mapping;
    App.headerRow = next.headerRow;
    App.fallbackUnit = next.fallbackUnit;
    b.sheet = next.sheet;
    b.mapping = next.mapping;
    b.headerRow = next.headerRow;
    b.fallbackUnit = next.fallbackUnit;
    parseCurrent(true);
    return true;
  }
  /** Phân tích lại sheet của loại đang chọn. */
  function parseCurrent(resetPages) {
    if (!App.wb) return;
    parseSlot(App.cur());
    mergeSlot(App.slot());
    if (HAK.Batches && App.cur().saved) HAK.Batches.saveMeta(App.type, App.cur()); // đổi sheet / ánh xạ cột → cập nhật đợt đã lưu
    App.previewPage = 0;
    renderVehicles();
    renderTypePicker();
    renderFile();
    updateChips();
    HAK.Pages.onData(App.type);
    if (location.hash === '#/home' || !location.hash) renderHome();
  }
  /** Đổi danh sách xe / cài đặt → đọc lại mọi loại đã nạp file. */
  App.reparse = () => {
    let any = false;
    Object.keys(App.slots).forEach((t) => {
      const sl = App.slots[t];
      sl.batches.forEach((b) => {
        if (b.wb) {
          parseSlot(b);
          any = true;
        }
      });
      mergeSlot(sl);
    });
    if (!any) return;
    App.previewPage = 0;
    renderVehicles();
    renderTypePicker();
    renderFile();
    updateChips();
    HAK.Pages.onData();
    if (location.hash === '#/home' || !location.hash) renderHome();
  };

  /**
   * v2.6.7 — Chép các đợt `list` của loại `src` sang loại `dst` (chuyển Xuất hàng kho gửi → Xuất khẩu / Ủy thác / Xuất bán).
   * Dùng chung workbook đã đọc (không đọc lại file), lưu bền file gốc cho loại đích, đánh dấu đợt gốc conv = { to } (mỗi đợt 1 hình thức).
   * Đợt cùng tên đã có ở loại đích → thay (chuyển lại = cập nhật).
   */
  App.copyBatches = async (src, list, dst) => {
    const sl = App.slots[dst] || (App.slots[dst] = newSlot());
    for (const b of list) {
      let bytes = null;
      if (HAK.Batches && HAK.Batches.bytes) {
        try {
          bytes = await HAK.Batches.bytes(src, b.fileName);
        } catch (e) {
          /* đợt chưa lưu bền */
        }
      }
      let wb = b.wb;
      if (!wb && bytes) wb = (await X.readFile(new File([bytes], b.fileName))).workbook;
      if (!wb) continue;
      let i = sl.batches.findIndex((x) => x.fileName === b.fileName);
      const nb = newBatch();
      Object.assign(nb, {
        wb,
        fileName: b.fileName,
        size: b.size,
        sheet: b.sheet,
        mapping: Object.assign({}, b.mapping || {}),
        headerRow: b.headerRow || null,
        addedAt: i >= 0 ? sl.batches[i].addedAt : 0,
        rev: i >= 0 ? sl.batches[i].rev || 0 : 0,
        from: { type: src, fileName: b.fileName, at: Date.now() },
        veh: b.veh ? Object.assign({}, b.veh) : null,
      }); // v2.7.2: cùng lô hàng → mang theo danh sách xe của đợt gốc
      if (i >= 0) sl.batches[i] = nb;
      else {
        sl.batches.push(nb);
        i = sl.batches.length - 1;
      }
      parseSlot(nb);
      if (nb.ds && nb.ds.ok && bytes && HAK.Batches) await HAK.Batches.save(dst, nb, bytes);
      b.conv = { to: dst, at: Date.now() };
      if (b.saved && HAK.Batches) await HAK.Batches.saveMeta(src, b);
    }
    if (sl.sel < 0 && sl.batches.length) sl.sel = 0;
    mergeSlot(sl);
    HAK.Pages.onData(dst);
    renderTypePicker();
    renderFile();
    updateChips();
    return sl.ds && sl.ds.ok;
  };

  /** Mở app → nạp lại các đợt đã lưu (file gốc + sheet + ánh xạ cột), đọc bằng đúng bộ đọc hiện hành. */
  async function restoreBatches() {
    let list;
    try {
      list = await HAK.Batches.loadAll();
    } catch (e) {
      console.warn('Không đọc được các đợt đã lưu:', e);
      return;
    }
    if (!list.length) return;
    Loading.show('Đang khôi phục dữ liệu các đợt đã nhập…');
    let n = 0,
      fail = 0;
    const legacyVeh = !HAK.Store.get(VEH_MIG, false) ? HAK.Vehicles.legacy() : null,
      migrated = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const m = list[i].meta;
        if (!HAK.Pages.DOCS[m.type]) continue;
        Loading.set((i / list.length) * 100, 'Đang khôi phục "' + m.fileName + '"…');
        try {
          const info = await X.readFile(new File([list[i].bytes], m.fileName));
          const sl = App.slots[m.type] || (App.slots[m.type] = newSlot());
          if (sl.batches.some((b) => b.fileName === m.fileName)) continue; // người dùng đã tự nạp lại trong lúc chờ
          const b = newBatch();
          b.wb = info.workbook;
          b.fileName = m.fileName;
          b.size = m.size || 0;
          b.sheet = info.sheetNames.indexOf(m.sheet) >= 0 ? m.sheet : info.sheetNames[0];
          b.mapping = m.mapping || {};
          b.headerRow = m.headerRow || null;
          b.fallbackUnit = m.fallbackUnit || null;
          b.templateId = m.templateId || null;
          b.templateName = m.templateName || null;
          b.headerNames = m.headerNames || null;
          b.addedAt = m.addedAt;
          b.saved = true;
          b.rev = m.rev || 0;
          b.conv = m.conv || null;
          b.from = m.from || null;
          b.veh = m.veh || null;
          if (m.veh === undefined && legacyVeh) {
            b.veh = Object.assign({}, legacyVeh);
            migrated.push([m.type, b]);
          } // đợt lưu từ bản cũ: gắn danh sách chung đang dùng (1 lần)
          sl.batches.push(b);
          if (sl.sel < 0) sl.sel = 0;
          parseSlot(b);
          n++;
        } catch (e) {
          fail++;
          console.warn('Không khôi phục được đợt', m.fileName, e);
        }
      }
      Object.keys(App.slots).forEach((t) => mergeSlot(App.slots[t]));
      for (const [t, b] of migrated) await HAK.Batches.saveMeta(t, b);
      HAK.Store.set(VEH_MIG, true);
    } finally {
      Loading.hide();
    }
    if (!n && !fail) return;
    renderTypePicker();
    renderFile();
    renderVehicles();
    updateChips();
    HAK.Pages.onData();
    if (location.hash === '#/home' || !location.hash) renderHome();
    if (HAK.Chungtu) HAK.Chungtu.render();
    if (n) toast('Đã khôi phục ' + n + ' đợt dữ liệu đã nhập lần trước.', 'info');
    if (fail) toast(fail + ' đợt không khôi phục được (file lưu bị lỗi) — hãy nạp lại file Excel.', 'warning');
  }

  /* ===============================================================
   * v2.7.2 Danh sách xe & tài xế RIÊNG TỪNG ĐỢT (Thủy chốt 30/09/2026): chỉ áp cho bảng cân của đợt đó.
   *   Nguồn: sheet DS XE trong file đợt (tự đọc) · ⬆ gắn file riêng · dùng lại danh sách của đợt khác (dự phòng, mặc định đợt gần nhất).
   *   Đợt không có danh sách → cảnh báo, Tài xế / ĐVVC để trống. Danh sách chung kiểu cũ chỉ còn trong danh sách dự phòng.
   * ============================================================= */
  const VEH_MIG = 'hak.mig.vehPerBatch';
  const vehDate = (t) => (t ? new Date(t).toLocaleDateString('vi-VN') : '');
  /** Các danh sách có thể dùng lại cho đợt đang xem: đợt khác (mọi hình thức) + danh sách chung cũ — mới nhất trước. */
  function vehCandidates() {
    const cur = App.cur(),
      out = [],
      D = HAK.Pages.DOCS;
    Object.keys(App.slots).forEach((t) =>
      App.slots[t].batches.forEach((b, i) => {
        if (b === cur || !b.veh || !b.veh.list || !b.veh.list.length) return;
        out.push({
          key: t + '|' + i,
          veh: b.veh,
          label: (D[t] ? D[t].title : t) + ' · ' + b.fileName + ' — ' + b.veh.count + ' xe' + (b.veh.at ? ' · ' + vehDate(b.veh.at) : ''),
        });
      })
    );
    const lg = HAK.Vehicles.legacy();
    if (lg) out.push({ key: 'legacy', veh: lg, label: 'Danh sách chung (bản cũ) · ' + (lg.fileName || '') + ' — ' + lg.count + ' xe' });
    return out.sort((a, b) => (b.veh.at || 0) - (a.veh.at || 0));
  }
  /** Gắn / thay / bỏ danh sách xe của đợt đang xem → đọc lại đúng đợt đó, lưu bền, cập nhật trang biên bản. */
  async function setBatchVeh(veh, msg) {
    const b = App.cur(),
      sl = App.slot();
    if (!sl || !b.fileName) {
      toast('Hãy thêm / chọn một đợt trước.', 'warning');
      return;
    }
    b.veh = veh;
    if (b.wb) parseSlot(b);
    mergeSlot(sl);
    if (b.saved && HAK.Batches) await HAK.Batches.saveMeta(App.type, b);
    renderTypePicker();
    renderFile();
    renderVehicles();
    updateChips();
    HAK.Pages.onData(App.type);
    if (location.hash === '#/home' || !location.hash) renderHome();
    if (HAK.Chungtu) HAK.Chungtu.render();
    const vi = b.ds && b.ds.vehicleInfo;
    toast(
      msg + (veh && vi ? ' Khớp ' + vi.matched + '/' + vi.plates + ' biển số.' : ''),
      veh && vi && vi.missing.length ? 'warning' : 'success'
    );
  }
  async function handleVehicles(file) {
    if (!file) return;
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      toast('Vui lòng chọn file Excel danh sách xe.', 'error');
      return;
    }
    if (!App.cur().fileName) {
      toast('Hãy thêm / chọn một đợt trước, rồi gắn danh sách xe cho đợt đó.', 'warning');
      return;
    }
    Loading.show('Đang đọc danh sách xe…');
    try {
      const veh = await HAK.Vehicles.readFileVeh(file);
      (veh.warnings || []).forEach((w) => toast(w, 'warning'));
      await setBatchVeh(
        veh,
        'Đã gắn ' +
          veh.count +
          ' xe từ "' +
          veh.fileName +
          '" cho đợt "' +
          App.cur().fileName +
          '".' +
          (veh.dup ? ' (bỏ ' + veh.dup + ' biển trùng)' : '')
      );
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), 'error');
    } finally {
      Loading.hide();
    }
  }
  async function downloadSampleXlsx() {
    try {
      if (!HAK.SampleXlsx) await HAK.UI.loadScript('js/sample-xlsx.js');
      const S = HAK.SampleXlsx;
      HAK.Word.Files.saveBlob(
        new Blob([HAK.Word.b64ToBytes(S.b64)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        S.name
      );
    } catch (e) {
      console.error(e);
      toast('Không tải được file mẫu: ' + (e.message || e), 'error');
    }
  }
  function renderVehicles() {
    const box = $('#vehStatus'),
      match = $('#vehMatch');
    if (!box) return;
    const b = App.cur(),
      has = !!b.fileName,
      veh = has ? b.veh : null;
    $('#vehFor').textContent = has ? '— đợt "' + b.fileName + '"' : '';
    $('#vehAttach').classList.toggle('disabled', !has);
    $('#vehClear').hidden = !veh;
    const cands = has && !veh ? vehCandidates() : [];
    $('#vehPickWrap').hidden = !cands.length;
    $('#vehPick').innerHTML = cands
      .map((c, i) => '<option value="' + esc(c.key) + '">' + (i === 0 ? '★ ' : '') + esc(c.label) + '</option>')
      .join('');
    if (!has) {
      box.innerHTML =
        '<span class="muted">Thêm đợt (file Excel cân) trước — mỗi đợt có danh sách xe riêng, chỉ áp cho bảng cân của đợt đó.</span>';
      match.innerHTML = '';
      return;
    }
    if (!veh) {
      box.innerHTML =
        '<span class="text-danger fw-semibold">⚠ Đợt này chưa có danh sách xe & tài xế</span> <span class="muted">— Tài xế / Đơn vị vận chuyển sẽ để trống. Gắn file danh sách' +
        (cands.length ? ' hoặc chọn dùng danh sách của đợt khác (★ = gần nhất)' : '') +
        '.</span>';
      match.innerHTML = '';
      return;
    }
    const SRC = { file: 'trong file đợt', attach: 'file gắn riêng', copy: 'dùng lại của đợt khác', legacy: 'danh sách chung bản cũ' };
    box.innerHTML =
      '<span class="badge text-bg-success">' +
      esc(SRC[veh.src] || '') +
      '</span> <b>' +
      esc(veh.fileName || '') +
      '</b>' +
      (veh.sheet ? ' · sheet "' + esc(veh.sheet) + '"' : '') +
      ' · ' +
      Number(veh.count || 0) +
      ' xe' +
      (veh.at ? ' · ' + esc(vehDate(veh.at)) : '') +
      (veh.from ? ' <span class="muted">(từ đợt ' + esc(veh.from) + ')</span>' : '');
    const vi = b.ds && b.ds.vehicleInfo;
    match.innerHTML =
      vi && vi.total
        ? 'Khớp <b>' +
          vi.matched +
          '/' +
          vi.plates +
          '</b> biển số trong bảng cân của đợt' +
          (vi.missing.length
            ? ' · <span class="text-warning">thiếu: ' +
              esc(vi.missing.slice(0, 8).join(', ')) +
              (vi.missing.length > 8 ? ' …' : '') +
              '</span>'
            : ' ✓')
        : '';
  }

  /* ===============================================================
   * Trang "Chọn File Excel"
   * ============================================================= */
  let dataSmart,
    dataSmartKey = '';
  function fileSmart() {
    const F = HAK.Filters;
    if (!dataSmart) {
      const options = (k) => Array.from(new Set(((App.ds || {}).rows || []).map((r) => r[k]).filter(Boolean)));
      dataSmart = F.mount(
        '#fileSmartFilter',
        Object.assign({}, F.tripConfig(options), {
          screenId: 'file-preview',
          source: () => (App.ds || {}).rows || [],
          quickFields: ['q', 'plate', 'carrier'],
          onApply: () => {
            App.previewPage = 0;
            renderFile();
          },
          summary: (r) => [{ label: 'Khối lượng', value: G.fmtTon(r.rows.reduce((a, r) => a + (+r.net || 0), 0)) + ' tấn' }],
        })
      );
    }
    const key = App.type + '|' + App.fileName;
    if (key !== dataSmartKey) {
      dataSmartKey = key;
      dataSmart.setState(F.core.empty());
    }
    dataSmart.refresh();
    return dataSmart;
  }
  function useViewScope() {
    if (!dataSmart || !App.ds) return;
    const res = dataSmart.filter(App.ds.rows),
      rows = res.rows || [],
      kg = rows.reduce((a, r) => a + (+r.net || 0), 0),
      state = dataSmart.getState();
    if (!rows.length) {
      HAK.UI.toast('Phạm vi đang xem không có phiếu nào — chưa thể chuyển.', 'warning');
      return;
    }
    const P = HAK.Pages;
    if (!P || !P.useScope || !P.hasType(App.type)) {
      HAK.UI.toast('Hình thức này chưa có trang lập chứng từ.', 'warning');
      return;
    }
    const r = P.useScope(App.type, state);
    const msg =
      'Đã chuyển phạm vi đang xem sang trang lập chứng từ: ' +
      rows.length +
      ' phiếu · ' +
      G.fmtTon(kg) +
      ' tấn.' +
      (r.skipped.length ? ' Điều kiện KHÔNG chuyển được (cần đặt lại ở trang biên bản): ' + r.skipped.join(', ') + '.' : '');
    HAK.UI.toast(msg, r.skipped.length ? 'warning' : 'success');
    location.hash = '#/' + App.type;
  }
  const previewRows = () => (dataSmart ? dataSmart.filter(App.ds.rows).rows : App.ds.rows);
  function renderFile() {
    const ds = App.ds;
    $('#fileResult').hidden = !App.wb;
    if (!App.wb) return;
    $('#fileName').textContent = App.fileName;
    $('#sheetSelect').innerHTML = (App.wb.SheetNames || [])
      .map((n) => '<option' + (n === App.sheet ? ' selected' : '') + '>' + esc(n) + '</option>')
      .join('');
    const tplSel = $('#batchTemplateSelect');
    if (tplSel && HAK.ExcelTemplate) {
      const curTplId = App.cur().templateId || '';
      tplSel.innerHTML =
        '<option value="">Tự nhận diện (mặc định app)</option>' +
        HAK.ExcelTemplate.list()
          .map(
            (t) =>
              '<option value="' +
              esc(t.id) +
              '"' +
              (curTplId === t.id ? ' selected' : '') +
              '>' +
              esc(t.name) +
              (t.isDefault ? ' (Mặc định)' : '') +
              '</option>'
          )
          .join('');
    }
    $('#fileMeta').textContent = (App.size / 1024).toFixed(1) + ' KB · ' + (App.wb.SheetNames || []).length + ' sheet';

    // ---- cảnh báo ----
    let al = '';
    if (App.cur().templateError && App.cur().templateError.length) {
      al +=
        '<div class="alert alert-warning py-2 mb-2"><b>Mẫu "' +
        esc(App.cur().templateName || 'đang dùng') +
        '" không khớp hoàn toàn với file:</b><ul class="alert-list small mb-2">' +
        App.cur()
          .templateError.map((e) => '<li>' + esc(e) + '</li>')
          .join('') +
        '</ul><div class="d-flex flex-wrap gap-2">' +
        '<button class="btn btn-sm btn-outline-primary" id="btnSwitchAutoDetect" type="button">Chuyển sang "Tự nhận diện"</button>' +
        '</div></div>';
    }
    if (ds.errors && ds.errors.length)
      al +=
        '<div class="alert alert-danger"><b>Không thể tạo biên bản:</b><ul class="alert-list">' +
        ds.errors.map((e) => '<li>' + esc(e) + '</li>').join('') +
        '</ul></div>';
    if (ds.warnings && ds.warnings.length)
      al +=
        '<div class="alert alert-warning"><b>Cảnh báo dữ liệu:</b><ul class="alert-list">' +
        ds.warnings.map((e) => '<li>' + esc(e) + '</li>').join('') +
        '</ul></div>';
    if (ds.ok && ds.reconciled)
      al +=
        '<div class="alert alert-success py-2">✓ Số xe và tổng khối lượng khớp với dòng "Tổng số" ghi ở tiêu đề báo cáo (' +
        fmtInt(ds.meta.declaredTrips) +
        ' xe · ' +
        fmtInt(ds.meta.declaredKg) +
        ' kg)' +
        (ds.cancelled && ds.cancelled.length
          ? ' — gồm ' +
            ds.cancelled.length +
            ' phiếu BO đã loại khỏi biên bản (còn ' +
            fmtInt(ds.stats.trips) +
            ' xe · ' +
            fmtInt(ds.stats.kg) +
            ' kg).'
          : '.') +
        '</div>';
    $('#fileAlerts').innerHTML = al;

    // ---- ánh xạ cột ----
    renderMapping(ds);

    if (!ds.ok) {
      $('#statTiles').innerHTML = '';
      $('#groupBody').innerHTML = '';
      $('#plateBody').innerHTML = '';
      $('#previewBody').innerHTML = '';
      $('#previewInfo').textContent = '';
      return;
    }
    fileSmart();
    const selectedRows = previewRows(),
      st = X.computeStats(selectedRows);
    $('#statTiles').innerHTML =
      statTile(fmtInt(selectedRows.length), 'Số dòng dữ liệu', ds.skipped ? 'bỏ qua ' + ds.skipped + ' dòng tiêu đề/chữ ký' : '') +
      statTile(fmtInt(st.trips), 'Tổng xe (lượt cân)') +
      statTile(G.fmtTon(st.kg), 'Tổng tấn', fmtInt(st.kg) + ' kg') +
      statTile(fmtInt(st.tickets), 'Tổng phiếu', 'số phiếu khác nhau') +
      statTile(fmtInt(st.plates), 'Số xe (biển số)', 'khác nhau') +
      statTile(st.from, 'Ngày bắt đầu') +
      statTile(st.to, 'Ngày kết thúc');

    $('#groupBody').innerHTML = st.groups
      .map((g) => {
        const t = (ts) => X.util.fmtDate(X.util.tsToParts(ts));
        return (
          '<tr><td>' +
          (g.label ? esc(g.label) : '<span class="muted">(không nhãn)</span>') +
          '</td><td class="num">' +
          fmtInt(g.trips) +
          '</td><td class="num">' +
          G.fmtTon(g.kg) +
          '</td><td>' +
          (isFinite(g.minTs) ? t(g.minTs) + ' → ' + t(g.maxTs) : '') +
          '</td></tr>'
        );
      })
      .join('');
    renderPlates();
    renderPreview();
  }

  function renderMapping(ds) {
    const body = $('#mapBody');
    const cols = ds.columns || [];
    let html =
      '<div class="row g-2 align-items-end mb-2"><div class="col-auto"><label class="form-label small mb-0">Dòng tiêu đề (số dòng Excel)</label>' +
      '<input class="form-control form-control-sm" style="width:110px" type="number" min="1" id="hdrRow" value="' +
      (App.headerRow || (ds.headerRow >= 0 ? ds.headerRow + 1 : '')) +
      '" placeholder="tự dò"></div>' +
      '<div class="col-auto"><button class="btn btn-sm btn-outline-primary" id="btnHdr" type="button">Áp dụng</button></div></div>';
    if (!cols.length) {
      body.innerHTML =
        html + '<div class="muted small">Chưa nhận diện được dòng tiêu đề — nhập số dòng chứa tiêu đề cột rồi bấm Áp dụng.</div>';
      bindHdr();
      return;
    }
    const autoM = ds.autoMapping || {},
      curM = ds.mapping || {};
    const show = X.FIELDS.filter((f) => !f.hidden || curM[f.key] !== undefined);
    html += show
      .map((f) => {
        const cur = curM[f.key];
        const opts =
          '<option value="-1">— Không có —</option>' +
          cols
            .map(
              (c) =>
                '<option value="' +
                c.index +
                '"' +
                (cur === c.index ? ' selected' : '') +
                '>' +
                c.letter +
                ' · ' +
                esc(c.label) +
                '</option>'
            )
            .join('');
        let badge;
        const missing =
          cur === undefined &&
          f.req &&
          !(f.key === 'date' && curM.datetime1 !== undefined) &&
          !(f.key === 'net' && curM.tare !== undefined && curM.gross !== undefined);
        if (cur === undefined)
          badge = missing ? '<span class="badge text-bg-danger">Thiếu</span>' : '<span class="badge text-bg-secondary">Không có</span>';
        else if (autoM[f.key] === cur) badge = '<span class="badge text-bg-success">Tự nhận diện</span>';
        else badge = '<span class="badge text-bg-warning">Chỉnh tay</span>';
        return (
          '<div class="map-row"><div class="fw-semibold small' +
          (f.req ? ' req' : '') +
          '">' +
          esc(f.label) +
          '</div><select class="form-select form-select-sm" aria-label="Cột nguồn cho ' +
          esc(f.label) +
          '" data-map="' +
          f.key +
          '">' +
          opts +
          '</select><div>' +
          badge +
          '</div></div>'
        );
      })
      .join('');
    body.innerHTML = html;
    $$('#mapBody [data-map]').forEach((s) =>
      s.addEventListener('change', () => {
        applyReadConfig((c) => {
          c.mapping[s.dataset.map] = +s.value;
        });
      })
    );
    bindHdr();
  }
  function bindHdr() {
    const b = $('#btnHdr');
    if (!b) return;
    b.addEventListener('click', () => {
      const v = parseInt($('#hdrRow').value, 10);
      applyReadConfig((c) => {
        c.headerRow = v > 0 ? v : null;
        c.mapping = {};
      });
    });
  }

  function renderPlates() {
    const q = $('#plateSearch').value.trim().toLowerCase();
    const list = X.computeStats(previewRows()).byPlate.filter((p) => !q || p.plate.toLowerCase().includes(q));
    $('#plateBody').innerHTML =
      list
        .slice(0, 500)
        .map(
          (p) =>
            '<tr><td class="mono">' +
            esc(p.plate) +
            '</td><td class="num">' +
            fmtInt(p.trips) +
            '</td><td class="num">' +
            G.fmtTon(p.kg) +
            '</td></tr>'
        )
        .join('') +
      (list.length > 500 ? '<tr><td colspan="3" class="muted">… còn ' + (list.length - 500) + ' xe — gõ để lọc</td></tr>' : '');
  }
  function renderPreview() {
    const rows = previewRows(),
      pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    App.previewPage = Math.min(Math.max(0, App.previewPage), pages - 1);
    const from = App.previewPage * PAGE_SIZE,
      slice = rows.slice(from, from + PAGE_SIZE);
    $('#previewBody').innerHTML = slice
      .map(
        (r) =>
          '<tr class="' +
          (r.warn.length ? 'row-warn' : '') +
          '" ' +
          (r.warn.length ? 'title="' + esc(r.warn.join('; ')) + '"' : '') +
          '><td>' +
          r.idx +
          '</td><td class="mono">' +
          esc(r.ticket) +
          '</td><td>' +
          esc(r.time1) +
          '</td><td>' +
          esc(r.time2) +
          '</td><td>' +
          esc(r.plate) +
          '</td><td>' +
          esc(r.driver) +
          '</td><td>' +
          esc(r.carrier) +
          '</td>' +
          '<td class="num">' +
          fmtInt(r.tare) +
          '</td><td class="num">' +
          fmtInt(r.gross) +
          '</td><td class="num">' +
          fmtInt(r.net) +
          '</td><td>' +
          esc(r.note) +
          '</td></tr>'
      )
      .join('');
    $('#prevPage').textContent = 'Trang ' + (App.previewPage + 1) + ' / ' + pages;
    $('#previewInfo').textContent =
      '· ' +
      fmtInt(rows.length ? from + 1 : 0) +
      '–' +
      fmtInt(from + slice.length) +
      ' / ' +
      fmtInt(rows.length) +
      ' dòng (dòng tô vàng có cảnh báo — rê chuột để xem)';
  }

  /* ===============================================================
   * Khởi động
   * ============================================================= */
  function init() {
    // Danh mục đọc lại dữ liệu TRƯỚC khi dựng các trang biên bản (ô "Chọn hợp đồng"): bản đọc lúc nạp script có thể là bản cũ
    // (localStorage chưa kịp nhận lần ghi ngay trước khi tải lại trang, hoặc Backup.boot vừa khôi phục từ IndexedDB).
    if (HAK.Catalog) HAK.Catalog.init();
    HAK.Pages.init();
    HAK.Settings.init();
    // N-06: đóng / tải lại trang khi còn phiếu đã chọn hoặc Cài đặt chung sửa dở chưa lưu → trình duyệt hỏi xác nhận
    root.addEventListener('beforeunload', (e) => {
      const unsaved =
        (HAK.Pages && HAK.Pages.hasUnsaved && HAK.Pages.hasUnsaved()) ||
        (HAK.Settings && HAK.Settings.hasUnsaved && HAK.Settings.hasUnsaved());
      if (!unsaved) return undefined;
      e.preventDefault();
      e.returnValue = 'Có thay đổi chưa lưu (phiếu đã chọn hoặc cài đặt đang sửa dở). Rời trang sẽ mất các thay đổi này.';
      return e.returnValue;
    });
    if (HAK.Archive) HAK.Archive.init();
    if (HAK.GSync) HAK.GSync.init();
    if (HAK.Auth) HAK.Auth.init();
    if (HAK.Report) HAK.Report.init();
    if (HAK.ContractStatus) HAK.ContractStatus.init();
    if (HAK.TripDetails) HAK.TripDetails.start(); // nguồn chung "chi tiết hợp đồng đã có phiếu cân" cho trạng thái hợp đồng
    if (HAK.ContractOverview) HAK.ContractOverview.init();
    if (HAK.Chungtu) HAK.Chungtu.init();
    if (HAK.Backup) HAK.Backup.init();

    // Điều hướng & menu di động
    window.addEventListener('hashchange', route);
    const setMenu = (open) => {
      $('#sidebar').classList.toggle('open', open);
      $('#sbBackdrop').classList.toggle('show', open);
      $('#btnMenu').setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    $('#btnMenu').addEventListener('click', () => setMenu(!$('#sidebar').classList.contains('open')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#sidebar').classList.contains('open')) {
        setMenu(false);
        $('#btnMenu').focus();
      }
    });
    $('#sbBackdrop').addEventListener('click', () => {
      setMenu(false);
    });
    $('#btnTheme').addEventListener('click', toggleTheme);
    $('#btnThemeSb').addEventListener('click', toggleTheme);

    // Chọn loại biên bản (bước ① trang Chọn File) + link "Chọn file Excel cho loại này" ở các trang biên bản
    $('#fileTypes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ft]');
      if (b) setFileType(b.dataset.ft);
    });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-filetype]');
      if (a) setFileType(a.dataset.filetype);
    });
    const t0 = HAK.Store.get('hak.app.filetype', '');
    if (t0 && HAK.Pages.DOCS[t0]) App.type = t0;
    renderTypePicker();

    // Upload
    const dz = $('#dropzone');
    $('#fileInput').addEventListener('change', (e) => {
      const fl = Array.from(e.target.files);
      e.target.value = '';
      handleFiles(fl);
    });
    $('#batchSummary').addEventListener('click', (e) => {
      if (e.target.closest('#btnConflicts')) openConflicts();
    });
    $('#batchBody').addEventListener('click', (e) => {
      const d = e.target.closest('[data-del-batch]');
      const rt = e.target.closest('[data-retry-batch]');
      if (rt) {
        retryBatch(rt.dataset.retryBatch);
        return;
      }
      if (d) {
        confirmClick(d, () => deleteBatch(d.dataset.delBatch), 'Bấm lần nữa để xóa');
        return;
      }
      const tr = e.target.closest('[data-bi]');
      if (tr) viewBatch(+tr.dataset.bi);
    });
    ['dragenter', 'dragover'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('drag');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove('drag');
      })
    );
    dz.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    // Chặn trình duyệt mở file khi thả nhầm ra ngoài vùng
    ['dragover', 'drop'].forEach((ev) =>
      window.addEventListener(ev, (e) => {
        if (!e.target.closest('#dropzone')) e.preventDefault();
      })
    );

    $('#vehInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      handleVehicles(f);
    });
    $('#vehClear').addEventListener('click', (e) =>
      confirmClick(
        e.currentTarget,
        () => setBatchVeh(null, 'Đã bỏ danh sách xe của đợt "' + App.cur().fileName + '".'),
        'Bấm lần nữa để bỏ'
      )
    );
    $('#vehUse').addEventListener('click', () => {
      const c = vehCandidates().find((x) => x.key === $('#vehPick').value);
      if (!c) return;
      const from = c.key === 'legacy' ? 'danh sách chung cũ' : c.label.split(' — ')[0];
      setBatchVeh(
        Object.assign({}, c.veh, { src: 'copy', at: Date.now(), from }),
        'Đợt "' + App.cur().fileName + '" dùng danh sách xe của ' + from + ' (' + c.veh.count + ' xe).'
      );
    });
    $('#vehTpl').addEventListener('click', downloadSampleXlsx);
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-sample-xlsx]');
      if (a) {
        e.preventDefault();
        downloadSampleXlsx();
      }
    });
    renderVehicles();

    $('#sheetSelect').addEventListener('change', (e) => {
      const name = e.target.value;
      applyReadConfig((c) => {
        c.sheet = name;
        c.mapping = {};
        c.headerRow = null;
      });
    });
    const batchTplSelect = $('#batchTemplateSelect');
    if (batchTplSelect) {
      batchTplSelect.addEventListener('change', (e) => {
        const tplId = e.target.value;
        const b = App.cur();
        if (!b || !b.wb) return;
        applyReadConfig((c) => {
          if (!tplId) {
            b.templateId = null;
            b.templateName = null;
            b.fallbackUnit = null;
            b.headerNames = null;
            b.templateError = null;
            c.headerRow = null;
            c.fallbackUnit = null;
            c.mapping = {};
          } else if (HAK.ExcelTemplate) {
            const tpl = HAK.ExcelTemplate.get(tplId);
            if (tpl) {
              b.templateId = tpl.id;
              b.templateName = tpl.name;
              b.fallbackUnit = tpl.fallbackUnit || null;
              b.headerNames = tpl.headerNames || null;
              c.headerRow = tpl.headerRow || 1;
              c.fallbackUnit = tpl.fallbackUnit || null;
              if (tpl.sheet && b.wb.SheetNames.includes(tpl.sheet)) {
                c.sheet = tpl.sheet;
              }
              const ws = b.wb.Sheets[c.sheet || b.sheet];
              if (ws) {
                const G = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
                const hrIdx = Math.max(0, (tpl.headerRow || 1) - 1);
                const headerCells = G[hrIdx] || [];
                const mRes = HAK.ExcelTemplate.matchTemplate(tpl, headerCells);
                c.mapping = mRes.mapping;
                b.templateError = mRes.ok ? null : mRes.errors;
              }
            }
          }
        });
      });
    }
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'btnSwitchAutoDetect') {
        const sel = $('#batchTemplateSelect');
        if (sel) {
          sel.value = '';
          sel.dispatchEvent(new Event('change'));
        }
      }
    });
    $('#btnReparse').addEventListener('click', () => applyReadConfig(() => {}));
    $('#btnUseScope').addEventListener('click', useViewScope);
    $('#btnResetMap').addEventListener('click', () => {
      if (
        applyReadConfig((c) => {
          c.mapping = {};
          c.headerRow = null;
        })
      )
        toast('Đã nhận diện lại các cột.', 'info');
    });
    $('#plateSearch').addEventListener(
      'input',
      debounce(() => {
        if (App.ds && App.ds.ok) renderPlates();
      }, 150)
    );
    $('#prevPrev').addEventListener('click', () => {
      App.previewPage--;
      renderPreview();
    });
    $('#prevNext').addEventListener('click', () => {
      App.previewPage++;
      renderPreview();
    });

    route();
    updateChips();
    if (HAK.Dashboard) HAK.Dashboard.init();
    if (HAK.Search) HAK.Search.init();
    if (HAK.Issued)
      HAK.Issued.load().then(() => {
        if (HAK.Chungtu) HAK.Chungtu.render();
        if (location.hash === '#/home' || !location.hash) renderHome();
      });
    if (HAK.Batches) restoreBatches();
  }

  // Khôi phục khóa còn thiếu từ bản sao IndexedDB (nếu có) TRƯỚC khi dựng giao diện
  // v2.6.1: đăng nhập (HAK.Auth) trước khi dựng giao diện — màn đăng nhập che toàn app, dữ liệu cũ giữ nguyên.
  // Nguồn dữ liệu (SQLite / trình duyệt) quyết định TRƯỚC mọi thứ: bị chặn thì dừng hẳn, không dựng giao diện trên nguồn sai.
  const storageGate = () =>
    (HAK.Storage ? HAK.Storage.whenReady() : Promise.resolve()).then(() => {
      if (HAK.Storage && HAK.Storage.mode === 'blocked') {
        HAK.Storage.showBlocked();
        return false;
      }
      return true;
    });
  const start = () =>
    storageGate().then((open) => {
      if (!open) return null;
      return (HAK.Backup ? HAK.Backup.boot() : Promise.resolve())
        .catch((e) => console.warn('Backup.boot:', e))
        .then(() => (HAK.Auth ? HAK.Auth.require() : null))
        .then(init);
    });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
