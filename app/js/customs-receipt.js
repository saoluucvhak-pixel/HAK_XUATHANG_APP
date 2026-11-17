/**
 * customs-receipt.js — Duyệt giấy nộp tiền (OCR mẫu C1-02/NS): nhận diện giấy trùng / gần trùng, gắn vào tờ khai, hoàn thuế, lưu hoặc hủy.
 * Tách từ customs.js (không đổi logic ghi dữ liệu / liên kết hợp đồng — tờ khai; dùng chung commit() của customs.js). Nạp SAU customs.js, được gọi khi người dùng bấm nút.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { $, CM, esc, NF, money, customsList, decls, toast } = HAK.CustomsCommon;
  const { commit, draw, openModal, st } = HAK.CustomsCore;

  const diff = (a, b) => {
    if (a.length !== b.length) return 99;
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  };
  function openReceiptReview(p, text) {
    const list = decls(),
      cur = customsList().find((d) => d.id === st.sel && !d.deletedAt);
    const lines = p.lines.length
      ? p.lines
      : [{ no: '', amount: null, kind: 'tax', content: 'Thuế xuất khẩu', periodDate: '', chapter: '', ndkt: '', dbhc: '' }];
    lines.forEach((ln) => {
      const exact = ln.no && list.find((d) => d.no === ln.no),
        near = !exact && ln.no && list.find((d) => diff(d.no, ln.no) <= 2);
      ln.target = exact ? exact.id : near ? near.id : !ln.no && cur ? cur.id : '';
      ln.near = !!near;
      ln.guess = !ln.no && !!cur;
    });
    const opt = (ln, sel) =>
      '<option value="">— chọn tờ khai —</option>' +
      list
        .map(
          (d) =>
            '<option value="' +
            esc(d.id) +
            '"' +
            (d.id === sel ? ' selected' : '') +
            '>' +
            esc(d.no + (d.ship ? ' · ' + d.ship : '')) +
            '</option>'
        )
        .join('') +
      '<option value="__new">＋ Tạo tờ khai mới theo số đã nhập</option>';
    const inp = (id, v, w, cls) =>
      '<input class="form-control form-control-sm ' +
      (cls || '') +
      '" id="' +
      id +
      '" style="min-width:' +
      w +
      '" value="' +
      esc(v || '') +
      '">';
    const table =
      '<div class="col-12"><div class="sec-title mt-2 mb-1">Các dòng nộp đọc được</div><div class="tbl-wrap"><table class="table table-sm align-middle"><thead><tr><th></th><th>Số tờ khai trên giấy</th><th>Gắn vào tờ khai</th><th>Loại</th><th>Nội dung</th><th>Kỳ thuế</th><th>Chương</th><th>NDKT</th><th>ĐBHC</th><th class="num">Số tiền VND</th></tr></thead><tbody>' +
      lines
        .map(
          (ln, i) =>
            '<tr><td><input class="form-check-input" type="checkbox" id="cs-ln-on-' +
            i +
            '"' +
            (ln.target && ln.amount !== null ? ' checked' : '') +
            '></td><td><input class="form-control form-control-sm mono' +
            (ln.no ? ' ocr-filled' : '') +
            '" id="cs-ln-no-' +
            i +
            '" style="min-width:9.5rem" inputmode="numeric" placeholder="gõ số tờ khai" value="' +
            esc(ln.no || '') +
            '">' +
            (ln.noFuzzy
              ? '<div class="small text-warning" style="font-family:inherit">số đọc được thiếu/thừa chữ số — kiểm tra</div>'
              : '') +
            (ln.near ? '<div class="small text-warning">gần khớp — kiểm tra</div>' : '') +
            (ln.guess
              ? '<div class="small text-warning" style="font-family:inherit;min-width:9rem">giấy không ghi số tờ khai — tự chọn tờ khai đang mở</div>'
              : '') +
            '</td><td><select class="form-select form-select-sm" id="cs-ln-t-' +
            i +
            '" style="min-width:12rem">' +
            opt(ln, ln.target) +
            '</select></td>' +
            '<td><select class="form-select form-select-sm" style="min-width:8.5rem" id="cs-ln-k-' +
            i +
            '"><option value="tax"' +
            (ln.kind === 'tax' ? ' selected' : '') +
            '>Thuế XK</option><option value="fee"' +
            (ln.kind === 'fee' ? ' selected' : '') +
            '>Lệ phí / khác</option></select></td>' +
            '<td>' +
            inp('cs-ln-c-' + i, ln.content, '9rem') +
            '</td><td><input type="date" class="form-control form-control-sm" id="cs-ln-d-' +
            i +
            '" value="' +
            esc(ln.periodDate || '') +
            '"></td><td>' +
            inp('cs-ln-h-' + i, ln.chapter, '4rem') +
            '</td><td>' +
            inp('cs-ln-n-' + i, ln.ndkt, '4.5rem') +
            '</td><td>' +
            inp('cs-ln-b-' + i, ln.dbhc, '5rem') +
            '</td>' +
            '<td><input class="form-control form-control-sm text-end" id="cs-ln-a-' +
            i +
            '" data-numfmt="num" style="min-width:8rem" value="' +
            esc(money(ln.amount)) +
            '"></td></tr>'
        )
        .join('') +
      '</tbody></table></div></div>';
    openModal({
      title: 'Giấy nộp tiền vào NSNN — kiểm tra kết quả OCR',
      saveLabel: 'Lưu các dòng đã tick',
      fields: [
        { id: 'receiptNo', label: 'Số giấy nộp tiền', col: 3 },
        { id: 'formCode', label: 'Mã hiệu', col: 3 },
        { id: 'refNo', label: 'Số tham chiếu', col: 6 },
        { id: 'date', label: 'Ngày nộp', type: 'date', col: 3 },
        { id: 'payer', label: 'Người nộp thuế', col: 9 },
      ],
      values: {
        receiptNo: p.receiptNo,
        formCode: p.formCode,
        refNo: p.refNo,
        date: p.date,
        payer: p.payer + (p.agent ? ' — nộp thay: ' + p.agent : ''),
      },
      extraHtml: table,
      notice:
        (String(text).replace(/\s+/g, '').length < 300
          ? '<div class="alert alert-danger py-2 small">OCR gần như không đọc được chữ nào — ảnh quá nhỏ, mờ hoặc nghiêng. Chụp lại <b>sát tờ giấy, thẳng, đủ sáng</b> (hoặc quét thành PDF) rồi đọc lại; hoặc nhập tay bên dưới.</div>'
          : '') +
        (p.warnings.length
          ? '<div class="alert alert-warning py-2 small">' + p.warnings.map((w) => '⚠ ' + esc(w)).join('<br>') + '</div>'
          : '') +
        '<details class="mb-2"><summary class="small">Xem chữ OCR</summary><pre class="small text-wrap">' +
        esc(text) +
        '</pre></details><div class="small text-muted mb-1">Ảnh chụp nghiêng, mờ hoặc có dấu mộc đè dễ bị đọc sai số — đối chiếu với giấy gốc trước khi lưu. Ô nào OCR không đọc được thì để trống, nhập tay theo giấy gốc. App chỉ lưu số liệu, không lưu ảnh.</div>',
      onOpen() {
        ['receiptNo', 'formCode', 'refNo', 'date', 'payer'].forEach((k) => {
          const el = $('#cs-f-' + k);
          if (el && el.value) el.classList.add('ocr-filled');
        });
        lines.forEach((ln, i) => {
          // gõ / sửa số tờ khai → tự chọn tờ khai trùng số
          $('#cs-ln-no-' + i).addEventListener('input', (e) => {
            const no = CM().digits(e.target.value),
              hit = no && list.find((d) => d.no === no);
            if (hit) {
              $('#cs-ln-t-' + i).value = hit.id;
              $('#cs-ln-on-' + i).checked = true;
            }
          });
        });
      },
      async onSave(v) {
        const picked = [];
        lines.forEach((ln, i) => {
          if (!$('#cs-ln-on-' + i).checked) return;
          const t = $('#cs-ln-t-' + i).value;
          if (!t) throw Error('Dòng ' + (i + 1) + ': chưa chọn tờ khai để gắn.');
          if (t === '__new' && CM().digits($('#cs-ln-no-' + i).value).length < 8)
            throw Error('Dòng ' + (i + 1) + ': gõ số tờ khai để tạo tờ khai mới.');
          const amount = NF().parse($('#cs-ln-a-' + i).value, 'num');
          if (amount === null) throw Error('Dòng ' + (i + 1) + ': số tiền không hợp lệ.');
          picked.push({
            no: CM().digits($('#cs-ln-no-' + i).value) || ln.no,
            declDate: ln.declDate,
            declType: ln.declType,
            target: t,
            amount,
            kind: $('#cs-ln-k-' + i).value,
            content: $('#cs-ln-c-' + i).value.trim(),
            periodDate: $('#cs-ln-d-' + i).value,
            chapter: $('#cs-ln-h-' + i).value.trim(),
            ndkt: $('#cs-ln-n-' + i).value.trim(),
            dbhc: $('#cs-ln-b-' + i).value.trim(),
          });
        });
        if (!picked.length) throw Error('Chưa tick dòng nào để lưu.');
        let n = 0;
        await commit((next) => {
          next.customs = next.customs || [];
          const pool = new Map(); // các khoản đã có TRƯỚC lần nhập này, mỗi khoản chỉ "khớp" được một dòng → hai dòng giống hệt trong cùng giấy vẫn được giữ cả hai
          picked.forEach((x) => {
            let d = x.target === '__new' ? null : next.customs.find((y) => y.id === x.target);
            if (!d) {
              d = CM().newDecl({
                no: x.no,
                openDate: x.declDate || '',
                type: x.declType || '',
                status: 'opened',
                note: 'Tạo từ giấy nộp tiền ' + (v.receiptNo || ''),
                supplements: [],
                payments: [],
              });
              next.customs.push(d);
            }
            if (!pool.has(d.id)) pool.set(d.id, CM().active(d.payments).slice());
            const cand = {
                receiptNo: v.receiptNo,
                refNo: v.refNo,
                kind: x.kind,
                amount: x.amount,
                ndkt: x.ndkt,
                chapter: x.chapter,
                dbhc: x.dbhc,
                periodDate: x.periodDate,
              },
              left = pool.get(d.id),
              at = left.findIndex((y) => CM().samePayment(y, cand));
            if (at >= 0) {
              left.splice(at, 1);
              return;
            } // nhập lại cùng khoản (kể cả đã nhập tay) → không nhân đôi
            // Thiếu dữ liệu nhận diện (vd khoản nhập tay không ghi số giấy) → KHÔNG tự quyết: hỏi để đối soát, mặc định không thêm.
            const maybe = left.findIndex((y) => CM().maybeSamePayment(y, cand));
            if (maybe >= 0) {
              const y = left[maybe];
              if (
                !confirm(
                  'Cần đối soát: dòng ' +
                    money(x.amount) +
                    ' đ (' +
                    (CM().PAY_KIND[x.kind] || x.kind) +
                    ') của giấy ' +
                    (v.receiptNo || v.refNo || '?') +
                    ' có thể TRÙNG khoản đã nhập tay ' +
                    (y.receiptNo || y.refNo ? 'giấy ' + (y.receiptNo || y.refNo) : '(chưa ghi số giấy)') +
                    ' cùng số tiền, tờ khai ' +
                    d.no +
                    '.\n\nBấm OK nếu là khoản KHÁC (vẫn thêm); Hủy nếu là cùng một khoản (bỏ dòng này — bạn có thể bổ sung số giấy vào khoản đã nhập tay).'
                )
              ) {
                left.splice(maybe, 1);
                return;
              }
              left.splice(maybe, 1);
            }
            (d.payments = d.payments || []).push(
              CM().newPay({
                receiptNo: v.receiptNo,
                formCode: v.formCode,
                refNo: v.refNo,
                date: v.date,
                payer: v.payer,
                kind: x.kind,
                content: x.content,
                amount: x.amount,
                periodDate: x.periodDate,
                chapter: x.chapter,
                ndkt: x.ndkt,
                dbhc: x.dbhc,
              })
            );
            d.revision = (d.revision || 0) + 1;
            n++;
          });
        });
        if (picked[0]) {
          const d = customsList().find((y) => y.id === picked[0].target) || customsList().find((y) => y.no === picked[0].no);
          if (d) st.sel = d.id;
        }
        draw();
        toast(
          'Đã lưu ' + n + ' dòng nộp tiền' + (n < picked.length ? ' (bỏ ' + (picked.length - n) + ' dòng đã có)' : '') + '.',
          'success'
        );
      },
    });
  }

  HAK.CustomsReceipt = { openReceiptReview };
})(window);
