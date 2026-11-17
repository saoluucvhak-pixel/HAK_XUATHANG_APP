/**
 * customs-model.js — Tờ khai hải quan (v2.14.0). Hàm thuần, không DOM → kiểm thử trong Node.
 *  - Bảng CHA: tờ khai hải quan (data.customs[]). Bảng CON: khai bổ sung (supplements[]) và giấy nộp tiền (payments[]).
 *  - Trạng thái tờ khai: opened (Đã mở tờ khai) → waiting (Chờ thông quan) → cleared (Đã thông quan).
 *  - Hợp đồng có 4 trạng thái RIÊNG (v2.17.0): tiến độ thực hiện · thông quan · thuế · thực giao (xem axes). Tài liệu nghiệp vụ (HUONG_DAN_2.14.0) chỉ định nghĩa
 *    điều kiện THÔNG QUAN: mọi tờ khai đang dùng đã thông quan → code 'done', nhãn "Đã thông quan đủ tờ khai"; "Đã hoàn thành" thật sự (đủ KL + đủ thuế + đã đóng) CHƯA được định nghĩa → chỉ có "Đã đóng hợp đồng" do người dùng bấm.
 *  - Thuế xuất khẩu phải nộp = thuế của khai bổ sung mới nhất (nếu có), ngược lại là thuế của tờ khai gốc.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const STATUS = { opened: 'Đã mở tờ khai', waiting: 'Chờ thông quan', cleared: 'Đã thông quan' };
  const STATUS_ORDER = ['opened', 'waiting', 'cleared'];
  const PAY_KIND = { tax: 'Thuế xuất khẩu', fee: 'Lệ phí / khác' };
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const uid = (p) =>
    p +
    (root.crypto && root.crypto.randomUUID
      ? root.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const numOrNull = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
  const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
  const NUM = ['qtyBdmt', 'qtyTon', 'invoiceUsd', 'exchangeRate', 'taxableVnd', 'taxRate', 'taxVnd', 'round'];
  const DECL = [
    'no',
    'openDate',
    'round',
    'type',
    'office',
    'status',
    'statusLog',
    'contractId',
    'detailId',
    'ship',
    'bill',
    'goods',
    'hs',
    'qtyBdmt',
    'qtyTon',
    'invoiceNo',
    'invoiceUsd',
    'exchangeRate',
    'taxableVnd',
    'taxRate',
    'taxVnd',
    'exporter',
    'importer',
    'certNo',
    'relatedNo',
    'changedAt',
    'note',
    'source',
  ];

  function newDecl(v) {
    v = v || {};
    const d = { id: v.id || uid('tk-'), revision: v.revision || 0, supplements: [], payments: [] };
    DECL.forEach((k) => {
      if (v[k] !== undefined) d[k] = copy(v[k]);
    });
    NUM.forEach((k) => {
      d[k] = numOrNull(d[k]);
    });
    d.no = digits(d.no);
    if (!d.round || d.round < 1) d.round = 1;
    if (!STATUS[d.status]) d.status = 'opened';
    if (!Array.isArray(d.statusLog)) d.statusLog = [{ status: d.status, at: d.openDate || '' }];
    if (Array.isArray(v.supplements)) d.supplements = v.supplements.map(newSupp);
    if (Array.isArray(v.payments)) d.payments = v.payments.map(newPay);
    if (v.deletedAt) d.deletedAt = v.deletedAt;
    return d;
  }
  /** Khai bổ sung (bảng con): thuế xuất khẩu SAU bổ sung thay cho thuế của tờ khai gốc. */
  function newSupp(v) {
    v = v || {};
    const s = {
      id: v.id || uid('bs-'),
      no: digits(v.no),
      date: v.date || '',
      round: numOrNull(v.round) || 2,
      reason: v.reason || '',
      taxVnd: numOrNull(v.taxVnd),
      qtyBdmt: numOrNull(v.qtyBdmt),
      note: v.note || '',
    };
    if (v.deletedAt) s.deletedAt = v.deletedAt;
    return s;
  }
  /** Giấy nộp tiền vào NSNN (bảng con): mỗi dòng nộp cho 1 tờ khai. kind: tax | fee. */
  function newPay(v) {
    v = v || {};
    const p = {
      id: v.id || uid('nt-'),
      receiptNo: String(v.receiptNo || '').trim(),
      date: v.date || '',
      amount: numOrNull(v.amount),
      kind: v.kind === 'fee' ? 'fee' : 'tax',
      content: v.content || '',
      note: v.note || '',
      formCode: v.formCode || '',
      refNo: digits(v.refNo),
      periodDate: v.periodDate || '',
      chapter: String(v.chapter || ''),
      ndkt: String(v.ndkt || ''),
      dbhc: String(v.dbhc || ''),
      payer: v.payer || '',
    };
    if (v.deletedAt) p.deletedAt = v.deletedAt;
    return p;
  }
  /** Chuẩn hóa số giấy nộp tiền: chữ hoa, bỏ khoảng trắng / dấu ("dn 0206/26" ≡ "DN0206/26"). */
  const recKey = (v) =>
    String(v == null ? '' : v)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  /**
   * Hai dòng nộp tiền có phải CÙNG MỘT khoản (nhập tay rồi nhập lại từ OCR) không?
   * Cần: cùng giấy (số giấy hoặc số tham chiếu khớp, khi cả hai bên đều có số khác nhau thì KHÔNG trùng) + cùng loại + cùng số tiền,
   * và các mã phân biệt khoản (NDKT, chương, ĐBHC, kỳ thuế) không được khác nhau khi cả hai bên đều có.
   * Hai khoản cùng số tiền nhưng khác NDKT / kỳ thuế là hai khoản nộp khác nhau → giữ cả hai.
   */
  function samePayment(a, b) {
    if (!a || !b) return false;
    const ra = recKey(a.receiptNo),
      rb = recKey(b.receiptNo),
      fa = digits(a.refNo),
      fb = digits(b.refNo);
    const sameDoc = (ra && rb && ra === rb) || (fa && fb && fa === fb);
    if (!sameDoc) return false;
    if (ra && rb && ra !== rb) return false;
    if (fa && fb && fa !== fb) return false;
    if ((a.kind === 'fee' ? 'fee' : 'tax') !== (b.kind === 'fee' ? 'fee' : 'tax')) return false;
    if (numOrNull(a.amount) !== numOrNull(b.amount)) return false;
    return ['ndkt', 'chapter', 'dbhc', 'periodDate'].every((k) => {
      const x = String(a[k] || '').trim(),
        y = String(b[k] || '').trim();
      return !x || !y || x === y;
    });
  }
  /**
   * "Có thể trùng" (chưa đủ dữ liệu nhận diện để quyết định): cùng loại + cùng số tiền, mà một bên thiếu số giấy lẫn số tham chiếu (nhập tay không ghi số)
   * hoặc hai bên không có chung loại số nào để so. Không tự gộp, cũng không tự thêm → đưa ra ĐỐI SOÁT để người dùng quyết định.
   */
  function maybeSamePayment(a, b) {
    if (!a || !b || samePayment(a, b)) return false;
    if (
      (a.kind === 'fee' ? 'fee' : 'tax') !== (b.kind === 'fee' ? 'fee' : 'tax') ||
      numOrNull(a.amount) === null ||
      numOrNull(a.amount) !== numOrNull(b.amount)
    )
      return false;
    const ra = recKey(a.receiptNo),
      rb = recKey(b.receiptNo),
      fa = digits(a.refNo),
      fb = digits(b.refNo);
    if ((ra && rb && ra !== rb) || (fa && fb && fa !== fb)) return false; // có số giấy / tham chiếu khác nhau → chắc chắn là khoản khác
    const none = (r, f) => !r && !f,
      shared = (ra && rb) || (fa && fb);
    return none(ra, fa) || none(rb, fb) || !shared;
  }
  /** Tìm khoản đã có giống p trong danh sách (bỏ qua dòng đã xóa và dòng skipId). */
  const findSamePayment = (list, p, skipId) => (list || []).find((x) => !x.deletedAt && x.id !== skipId && samePayment(x, p)) || null;
  const act = (list) => (list || []).filter((x) => !x.deletedAt);
  const sum = (list, key) => act(list).reduce((a, x) => a + (Number(x[key]) || 0), 0);

  /** Thuế phải nộp / đã nộp / còn lại của 1 tờ khai. */
  function totals(d) {
    const byOrder = (a, b) => a.round - b.round || String(a.date).localeCompare(String(b.date));
    const supp = act(d.supplements)
      .filter((s) => s.taxVnd != null)
      .sort(byOrder);
    const last = supp[supp.length - 1] || null;
    // Lần khai bổ sung MỚI NHẤT (kể cả chưa nhập số thuế): nếu nó mới hơn lần có số thuế → thuế phải nộp đang theo lần cũ, cần nhập thuế lần mới nhất.
    const newest = act(d.supplements).slice().sort(byOrder).pop() || null,
      stale = !!(newest && newest.taxVnd == null && (!last || byOrder(newest, last) > 0));
    const base = d.taxVnd == null ? null : Number(d.taxVnd);
    const payable = last ? Number(last.taxVnd) : base;
    const cent0 = (n) => Math.round(n * 100) / 100;
    const paidTax = cent0(
      act(d.payments)
        .filter((p) => p.kind === 'tax')
        .reduce((a, p) => a + (Number(p.amount) || 0), 0)
    );
    const paidFee = cent0(
      act(d.payments)
        .filter((p) => p.kind === 'fee')
        .reduce((a, p) => a + (Number(p.amount) || 0), 0)
    );
    // Làm tròn 0,01 đ để sai số số thực (0,1 + 0,2 ≠ 0,3) không biến tờ khai đã nộp đủ thành "còn nợ / nộp thừa" vài e-17 đồng.
    const cent = (n) => Math.round(n * 100) / 100;
    const remaining = payable == null ? null : cent(payable - paidTax);
    // owed = còn nợ (≥ 0), over = nộp thừa (≥ 0), undetermined = chưa xác định nghĩa vụ thuế (không có thuế gốc / bổ sung) → không được bù trừ giữa các tờ khai.
    return {
      base,
      payable,
      extra: last && base != null ? Number(last.taxVnd) - base : null,
      paidTax,
      paidFee,
      remaining,
      owed: remaining != null && remaining > 0 ? remaining : 0,
      over: remaining != null && remaining < 0 ? -remaining : 0,
      undetermined: payable == null,
      staleSupplement: stale,
      lastSupplement: last,
    };
  }
  /**
   * Tổng hợp thuế của nhiều tờ khai — KHÔNG bù trừ: còn nợ và nộp thừa cộng riêng từng tờ khai.
   * net = Σ (phải nộp − đã nộp) của các tờ khai đã xác định nghĩa vụ (chỉ để tham khảo, tên chỉ tiêu: "Số dư ròng").
   * @returns {{payable, paidTax, paidFee, owed, over, net, undetermined, paidUndetermined, nOwing, nOver, nSettled, nDecl}}
   */
  function settlement(decls) {
    const o = {
      payable: 0,
      paidTax: 0,
      paidFee: 0,
      owed: 0,
      over: 0,
      net: 0,
      undetermined: 0,
      paidUndetermined: 0,
      nOwing: 0,
      nOver: 0,
      nSettled: 0,
      nDecl: 0,
      nStale: 0,
    };
    act(decls).forEach((d) => {
      const t = totals(d);
      o.nDecl++;
      o.paidTax += t.paidTax;
      o.paidFee += t.paidFee;
      if (t.staleSupplement) o.nStale++;
      if (t.undetermined) {
        o.undetermined++;
        o.paidUndetermined += t.paidTax;
        return;
      }
      o.payable += t.payable;
      o.net += t.remaining;
      o.owed += t.owed;
      o.over += t.over;
      if (t.owed > 0) o.nOwing++;
      else if (t.over > 0) o.nOver++;
      else o.nSettled++;
    });
    return o;
  }
  const mny = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
  /** Câu mô tả thuế đúng với từng khoản (còn nợ / nộp thừa / chưa xác định). */
  function taxText(st) {
    if (!st.nDecl) return 'Chưa có tờ khai';
    const p = [];
    if (st.owed > 0) p.push('Còn nợ ' + mny(st.owed) + ' đ (' + st.nOwing + ' tờ khai)');
    if (st.over > 0) p.push('Nộp thừa ' + mny(st.over) + ' đ (' + st.nOver + ' tờ khai)');
    if (st.undetermined)
      p.push(
        st.undetermined +
          ' tờ khai chưa xác định nghĩa vụ thuế' +
          (st.paidUndetermined ? ' (đã nộp ' + mny(st.paidUndetermined) + ' đ)' : '')
      );
    if (!p.length) p.push(st.payable > 0 || st.paidTax > 0 ? 'Đã nộp đủ thuế' : 'Chưa có thuế phát sinh');
    if (st.nStale) p.push('⚠ ' + st.nStale + ' tờ khai có khai bổ sung mới nhất chưa nhập số thuế (đang tính theo lần trước)');
    return p.join(' · ');
  }
  /**
   * 4 trạng thái riêng của hợp đồng. ctx = { delKg, trips, certBdmt }.
   * progress: tiến độ thực hiện (đóng thủ công / đủ KL chứng thư / đang thực hiện / chưa thực hiện) · customs: thông quan · tax: thuế · delivery: thực giao.
   */
  function axes(contract, customs, ctx) {
    const c = contract || {},
      x = ctx || {},
      list = act(customs).filter((d) => d.contractId === c.id),
      cleared = list.filter((d) => d.status === 'cleared').length;
    const qty = Number(c.contractQty) || 0,
      got =
        x.certBdmt != null
          ? Number(x.certBdmt)
          : (c.details || []).filter((d) => !d.deletedAt).reduce((a, d) => a + (Number(d.bdmt) || 0), 0);
    const need = c.type === 'xuatkhau' || c.type === 'uythac';
    const progress = c.closedAt
      ? { code: 'closed', label: 'Đã đóng hợp đồng', text: 'Đóng ngày ' + c.closedAt }
      : qty > 0 && got + 0.005 >= qty
        ? { code: 'full', label: 'Đã thực hiện đủ KL', text: nfm(got) + ' / ' + nfm(qty) + ' BDMT theo chứng thư' }
        : got > 0 || x.trips > 0
          ? { code: 'running', label: 'Đang thực hiện', text: nfm(got) + (qty > 0 ? ' / ' + nfm(qty) : '') + ' BDMT theo chứng thư' }
          : { code: 'none', label: 'Chưa thực hiện', text: 'Chưa có chứng thư / phiếu cân' };
    const customsAx = !list.length
      ? {
          code: 'none',
          label: need ? 'Chưa có tờ khai' : 'Không có tờ khai',
          text: need ? 'Hợp đồng này cần tờ khai hải quan' : 'Hình thức này không bắt buộc tờ khai',
        }
      : cleared === list.length
        ? { code: 'cleared', label: 'Đã thông quan đủ', text: cleared + '/' + list.length + ' tờ khai đã thông quan' }
        : { code: 'partial', label: 'Chưa thông quan đủ', text: cleared + '/' + list.length + ' tờ khai đã thông quan' };
    const st = settlement(list);
    const taxAx = !list.length
      ? { code: 'none', label: 'Chưa có tờ khai', text: '' }
      : st.owed > 0
        ? { code: 'owing', label: 'Còn nợ thuế', text: taxText(st) }
        : st.undetermined
          ? { code: 'undetermined', label: 'Chưa xác định nghĩa vụ', text: taxText(st) }
          : st.over > 0
            ? { code: 'over', label: 'Nộp thừa', text: taxText(st) }
            : { code: 'paid', label: st.payable > 0 || st.paidTax > 0 ? 'Đã nộp đủ' : 'Chưa có thuế', text: taxText(st) };
    const mtCert = x.mtCert != null ? Number(x.mtCert) : null,
      delT = (x.delKg || 0) / 1000;
    const delivery =
      x.trips > 0
        ? {
            code: 'shipped',
            label: mtCert > 0 && delT + 0.005 >= mtCert ? 'Đã giao đủ MT theo chứng thư' : 'Đã có thực giao',
            text:
              x.trips +
              ' chuyến · ' +
              nfm(delT) +
              ' tấn thực giao (sau trừ xe trả về)' +
              (mtCert > 0 ? ' / ' + nfm(mtCert) + ' tấn MT theo chứng thư' : ''),
          }
        : { code: 'none', label: 'Chưa có phiếu cân', text: mtCert > 0 ? '0 / ' + nfm(mtCert) + ' tấn MT theo chứng thư' : '' };
    return { progress, customs: customsAx, tax: taxAx, delivery, settlement: st };
  }
  const nfm = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('vi-VN');
  function setStatus(d, status, at, by) {
    if (!STATUS[status]) throw Error('Trạng thái tờ khai không hợp lệ.');
    if (d.status === status) return d;
    d.status = status;
    d.statusLog = (d.statusLog || []).concat([{ status, at: at || new Date().toISOString().slice(0, 10), by: by || '' }]);
    d.revision = (d.revision || 0) + 1;
    return d;
  }
  const statusDate = (d, status) => {
    const hit = (d.statusLog || []).filter((x) => x.status === status).pop();
    return hit ? hit.at : '';
  };

  /** Hợp đồng: running (Đang thực hiện) → done (Đã hoàn thành) khi có tờ khai và tất cả đã thông quan. */
  /**
   * Chi tiết hợp đồng "đã có bằng chứng thực hiện" = đã có số chứng thư HOẶC (opt.tripDetails) đã có phiếu cân; trả về những chi tiết CHƯA có tờ khai thông quan gắn đúng chi tiết.
   * Tờ khai chưa gắn chi tiết chỉ được tính cho chi tiết duy nhất khi hợp đồng có đúng 1 chi tiết cần tờ khai (không có gì để nhầm).
   */
  function detailsWithoutClearance(list, contract, opt) {
    const trips = opt && opt.tripDetails ? opt.tripDetails : null;
    const need = ((contract && contract.details) || []).filter(
      (d) => !d.deletedAt && (String(d.certNo || '').trim() || (trips && trips.has(d.id)))
    );
    const clearedBy = new Set(list.filter((d) => d.status === 'cleared' && d.detailId).map((d) => d.detailId));
    const looseCleared = list.filter((d) => d.status === 'cleared' && !d.detailId).length;
    const missing = need.filter((d) => !clearedBy.has(d.id));
    if (missing.length === 1 && need.length === 1 && looseCleared > 0) return [];
    return missing;
  }
  function contractStatus(customs, contractId, contract, opt) {
    const list = act(customs).filter((d) => d.contractId === contractId);
    const cleared = list.filter((d) => d.status === 'cleared').length;
    // Đóng thủ công (hợp đồng Xuất bán / Trao đổi không có tờ khai, hoặc đã giao đủ): contract.closedAt = ngày đóng.
    if (contract && contract.closedAt)
      return { code: 'done', label: 'Đã đóng hợp đồng', total: list.length, cleared, manual: true, closedAt: contract.closedAt };
    const missing = contract && list.length > 0 && cleared === list.length ? detailsWithoutClearance(list, contract, opt) : [];
    const done = list.length > 0 && cleared === list.length && !missing.length;
    // Quy tắc nghiệp vụ ĐÃ XÁC NHẬN (14/11/2026): hợp đồng "Đã hoàn thành" khi mọi tờ khai đã thông quan. Không bao hàm đủ KL / đã nộp thuế / đã giao hết — các chỉ tiêu đó hiển thị riêng (axes).
    return {
      code: done ? 'done' : 'running',
      label: done ? 'Đã hoàn thành' : 'Đang thực hiện',
      basis: done
        ? 'Mọi tờ khai đã thông quan và mọi chi tiết đã có chứng thư / phiếu cân đều có tờ khai thông quan'
        : missing.length
          ? 'Còn ' + missing.length + ' chi tiết chưa có tờ khai thông quan: ' + missing.map((d) => d.ship || d.certNo || d.id).join(', ')
          : '',
      total: list.length,
      cleared,
      missingDetails: missing.map((d) => d.id),
    };
  }
  /**
   * Gợi ý ĐÓNG hợp đồng: đã thực hiện đủ khối lượng hiện hành (Σ KL khô chứng thư ≥ KL hợp đồng) và — với Xuất khẩu / Ủy thác XK — mọi tờ khai đã thông quan.
   * @returns {string} lý do gợi ý, '' nếu chưa nên đóng / đã đóng.
   */
  function closeHint(contract, customs) {
    const c = contract || {};
    if (!c.id || c.closedAt || c.deletedAt) return '';
    const qty = Number(c.contractQty) || 0;
    if (!(qty > 0)) return '';
    const got = (c.details || []).filter((d) => !d.deletedAt).reduce((a, d) => a + (Number(d.bdmt) || 0), 0);
    if (got + 0.005 < qty) return '';
    if ((c.type === 'xuatkhau' || c.type === 'uythac') && contractStatus(customs, c.id, c).code !== 'done') return '';
    return (
      'Đã thực hiện ' +
      Math.round(got * 100) / 100 +
      ' / ' +
      qty +
      ' BDMT' +
      (c.type === 'xuatkhau' || c.type === 'uythac' ? ' và mọi tờ khai đã thông quan' : '') +
      ' — có thể đóng hợp đồng.'
    );
  }
  function validate(d, data) {
    if (!d.no) return 'Chưa nhập số tờ khai.';
    if (d.no.length < 8) return 'Số tờ khai phải là dãy số (thường 12 chữ số).';
    if (!d.deletedAt && (data.customs || []).some((x) => !x.deletedAt && x.id !== d.id && x.no === d.no))
      return 'Số tờ khai ' + d.no + ' đã có trong danh sách.';
    return '';
  }
  function upsert(data, value) {
    const next = copy(data);
    next.customs = Array.isArray(next.customs) ? next.customs : [];
    const d = newDecl(value),
      err = validate(d, next);
    if (err) return { error: err };
    const at = next.customs.findIndex((x) => x.id === d.id);
    if (at >= 0) {
      d.revision = (next.customs[at].revision || 0) + 1;
      next.customs[at] = d;
    } else next.customs.push(d);
    return { data: next, rec: d };
  }
  /** Gộp danh sách tờ khai khi nhập bản sao lưu: theo id, ô trống không ghi đè; bảng con gộp theo id. */
  function merge(local, incoming) {
    const out = copy(local || []);
    const keep = (old, v) => {
      const r = Object.assign({}, old);
      Object.keys(v).forEach((k) => {
        const x = v[k];
        if (x !== null && x !== undefined && x !== '' && !Array.isArray(x)) r[k] = copy(x);
      });
      return r;
    };
    const rev = (x) => Number(x && x.revision) || 0;
    // Bản ghi cùng id: bản có revision CAO HƠN thắng từng ô có giá trị (bản cũ nhập lại không ghi đè); bằng nhau → bản trên máy này thắng. deletedAt theo bản thắng.
    const pick = (a, b, incWins) => {
      const m = incWins ? keep(a, b) : keep(b, a),
        w = incWins ? b : a;
      if (w.deletedAt) m.deletedAt = w.deletedAt;
      else delete m.deletedAt;
      return m;
    };
    const byId = (a, b, incWins) => {
      const r = a.slice();
      (b || []).forEach((x) => {
        const i = r.findIndex((y) => y.id === x.id);
        if (i < 0) r.push(copy(x));
        else r[i] = pick(r[i], x, incWins);
      });
      return r;
    };
    (incoming || []).forEach((d) => {
      const i = out.findIndex((x) => x.id === d.id || (x.no && x.no === d.no && !x.deletedAt && !d.deletedAt));
      if (i < 0) {
        out.push(copy(d));
        return;
      }
      const old = out[i],
        incWins = rev(d) > rev(old),
        m = pick(old, d, incWins);
      m.supplements = byId(old.supplements || [], d.supplements, incWins);
      m.payments = byId(old.payments || [], d.payments, incWins);
      m.statusLog = (old.statusLog || []).length >= (d.statusLog || []).length ? old.statusLog : d.statusLog;
      if (Math.max(rev(old), rev(d)) > 0) m.revision = Math.max(rev(old), rev(d));
      out[i] = m;
    });
    return out;
  }
  /**
   * Điều kiện gắn đợt giao hàng (hồ sơ cân) vào hợp đồng:
   *  - Xuất khẩu / Ủy thác XK: phải nhập TÀU và TỜ KHAI hải quan trước (chưa có tờ khai thì chưa thực hiện được hợp đồng).
   *  - Xuất bán / Trao đổi: không cần tờ khai và tàu.
   * Trả về {need, ok, missing[], detailId}: detailId = chi tiết (tàu) sẽ nhận hồ sơ.
   */
  function readiness(contract, customs) {
    const c = contract || {},
      need = c.type === 'xuatkhau' || c.type === 'uythac';
    const details = (c.details || []).filter((d) => !d.deletedAt);
    if (!need) return { need: false, ok: true, missing: [], detailId: details[0] ? details[0].id : '' };
    const decls = act(customs).filter((d) => d.contractId === c.id);
    const withShip = details.filter((d) => String(d.ship || '').trim());
    const ready = withShip.find((d) => decls.some((x) => !x.detailId || x.detailId === d.id)) || null,
      pick = ready || withShip[0] || null;
    const missing = [];
    if (!withShip.length) missing.push('tàu');
    if (!decls.length) missing.push('tờ khai hải quan');
    return { need: true, ok: !!ready, missing, detailId: pick ? pick.id : '' };
  }
  /** Một chi tiết (tàu) đã đủ điều kiện nhận đợt giao hàng chưa → {ok, missing[]} (xem readiness). */
  function detailReady(contract, detail, customs) {
    const c = contract || {},
      d = detail || {};
    if (!(c.type === 'xuatkhau' || c.type === 'uythac')) return { ok: true, missing: [] };
    const missing = [];
    if (!String(d.ship || '').trim()) missing.push('tàu');
    if (!act(customs).some((x) => x.contractId === c.id && (!x.detailId || x.detailId === d.id))) missing.push('tờ khai hải quan');
    return { ok: !missing.length, missing };
  }
  HAK.CustomsModel = {
    maybeSamePayment,
    samePayment,
    findSamePayment,
    axes,
    settlement,
    taxText,
    closeHint,
    detailReady,
    readiness,
    STATUS,
    STATUS_ORDER,
    PAY_KIND,
    newDecl,
    newSupp,
    newPay,
    active: act,
    sum,
    totals,
    setStatus,
    statusDate,
    contractStatus,
    validate,
    upsert,
    merge,
    copy,
    digits,
  };
  if (typeof module === 'object' && module.exports) module.exports = HAK.CustomsModel;
})(typeof window !== 'undefined' ? window : globalThis);
