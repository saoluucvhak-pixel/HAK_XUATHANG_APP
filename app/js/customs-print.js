/**
 * customs-print.js — Dựng bản in A4 (PDF qua hộp thoại in) và đặc tả PDF của hai báo cáo; printReport dùng chung cho mọi báo cáo khác.
 * Tách từ customs.js (không đổi công thức / giao diện / lưu trữ); giữ API HAK.Customs trong customs.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { hasNum, vnDate } = HAK.Util || (typeof require === 'function' ? require('./util.js') : {}); // hàm dùng chung (util.js)
  const { CM, NF, contractOf, cstatus, custName, esc, money, sums, toast } = HAK.CustomsCommon;
  const { csRepView, reportList } = HAK.CustomsReport;
  const { contractReportList, ctView, sumOf, typeLabel } = HAK.ContractReport;

  /* ---------------- PDF: dựng bản in A4 ngang rồi mở hộp thoại in ("Lưu dưới dạng PDF"), giống nút Tải PDF của biên bản ---------------- */
  const PRINT_CSS =
    '.rp-h{font:bold 13pt Arial,sans-serif;margin:0 0 1mm}.rp-s{font:italic 8pt Arial,sans-serif;color:#444;margin:0 0 3mm}.rp-c{font:bold 9pt Arial,sans-serif;margin:3mm 0 1mm}.rp-pb{break-before:page}' +
    '.rp-t{width:100%;border-collapse:collapse;font:7.5pt Arial,sans-serif;margin-bottom:4mm}.rp-t th{background:#1f4e78 !important;color:#fff !important;border:.3pt solid #808080;padding:1mm;text-align:center}' +
    '.rp-t td{border:.3pt solid #808080;padding:.8mm 1mm;vertical-align:top}.rp-t .n{text-align:right;white-space:nowrap}.rp-t tr.main td{background:#eef3f8 !important;font-weight:bold}.rp-t tr.sub td{font-size:7pt;color:#333}.rp-t tr.total td{background:#d9e2f3 !important;font-weight:bold}.rp-f{font:7pt Arial,sans-serif;color:#666;text-align:right}';
  /** spec: {file, title, sub, tables:[{caption, cols:[{h, n}], rows:[{c:[...], cls}]}]}. Ô trong c là văn bản thường (đã escape ở đây). */
  function printReport(spec) {
    const W = HAK.Word && HAK.Word.Pdf;
    if (W) W.cleanup();
    let host = null,
      css = null;
    const old = document.title;
    // Trả giao diện về bình thường dù dựng bảng / mở hộp thoại in bị lỗi (trước đây lỗi trong setTimeout làm trang kẹt ở chế độ "đang in", trắng màn hình, không báo gì).
    const restore = () => {
      root.removeEventListener('afterprint', done);
      if (host && host.parentNode) host.remove();
      if (css && css.parentNode) css.remove();
      document.body.classList.remove('printing');
      document.title = old;
      if (W) W.cleanup();
    };
    const done = () => {
      root.removeEventListener('afterprint', done);
      setTimeout(restore, 300);
    };
    try {
      host = document.createElement('div');
      host.id = 'printRoot';
      host.innerHTML =
        '<div class="rp-h">' +
        esc(spec.title) +
        '</div><div class="rp-s">' +
        esc(spec.sub) +
        '</div>' +
        spec.tables
          .map(
            (t) =>
              (t.caption ? '<div class="rp-c' + (t.pageBreak ? ' rp-pb' : '') + '">' + esc(t.caption) + '</div>' : '') +
              (t.svg ? '<div class="rp-chart">' + t.svg + '</div>' : '') + // biểu đồ SVG do report-tpl.js dựng (đã thoát nội dung)
              '<table class="rp-t"><thead><tr>' +
              t.cols.map((c) => '<th>' + esc(c.h) + '</th>').join('') +
              '</tr></thead><tbody>' +
              t.rows
                .map(
                  (r) =>
                    '<tr class="' +
                    (r.cls || '') +
                    '">' +
                    r.c
                      .map((x, i) => '<td' + (t.cols[i] && t.cols[i].n ? ' class="n"' : '') + '>' + esc(x == null ? '' : x) + '</td>')
                      .join('') +
                    '</tr>'
                )
                .join('') +
              '</tbody></table>'
          )
          .join('') +
        '<div class="rp-f">HAK · ' +
        esc(new Date().toLocaleDateString('vi-VN')) +
        ' · v' +
        esc(HAK.VERSION || '') +
        '</div>';
      document.body.appendChild(host);
      css = document.createElement('style');
      css.id = 'printPageStyle';
      // spec.orientation: 'portrait' | 'landscape' (mặc định ngang); spec.fontPt: cỡ chữ bảng theo số cột. Tiêu đề bảng lặp lại ở mỗi trang, dòng không bị tách đôi.
      const orient = spec.orientation === 'portrait' ? 'portrait' : 'landscape',
        fpt = Number(spec.fontPt) > 0 ? Number(spec.fontPt) : 7.5;
      css.textContent =
        '@page { size: A4 ' +
        orient +
        '; margin: 10mm; }' +
        PRINT_CSS +
        '.rp-t{font-size:' +
        fpt +
        'pt}.rp-t thead{display:table-header-group}.rp-t tfoot{display:table-footer-group}.rp-t tr{break-inside:avoid}.rp-chart svg{width:100%;max-height:60mm;color:#222}';
      document.head.appendChild(css);
      document.body.classList.add('printing');
      document.title = spec.file;
      root.addEventListener('afterprint', done);
      toast(
        'Trong hộp thoại in, chọn máy in "Lưu dưới dạng PDF" (Save as PDF) rồi bấm Lưu. Nên tắt mục "Đầu trang và chân trang".',
        'info'
      );
    } catch (e) {
      restore();
      return Promise.reject(e);
    }
    return new Promise((ok, no) =>
      setTimeout(() => {
        try {
          root.print();
          ok();
        } catch (e) {
          restore();
          no(e);
        }
      }, 350)
    );
  }
  const m0 = (n) => (hasNum(n) ? money(n) : '');
  function contractPdfSpec() {
    const model = contractReportList(),
      view = ctView(),
      g = (k) => sumOf(model.map((m) => m.tot[k]));
    const rows = [];
    model.forEach((m) => {
      const c = m.c,
        t = m.tot;
      rows.push({
        cls: 'main',
        c: [
          (c.no || c.id) + ' · ' + typeLabel(c.type) + (c.date ? ' · ' + vnDate(c.date) : ''),
          custName(c.buyerId),
          m0(c.contractQty),
          m0(t.bdmt),
          t.pct === null ? '' : NF().txt(Math.round(t.pct * 10) / 10, 'dec') + '%',
          m0(t.left),
          m0(t.usd),
          t.certs + '/' + t.details,
          t.cleared + '/' + t.decls,
          m0(t.payable),
          m0(t.paidTax),
          m0(t.paidFee),
          m0(t.remaining),
          m.st.label,
        ],
      });
      m.rows.forEach((r) =>
        rows.push({
          cls: 'sub',
          c: [
            r.detail ? [r.detail.ship, r.detail.product].filter(Boolean).join(' · ') || 'Đợt thực hiện' : '(tờ khai chưa gắn đợt)',
            r.detail && r.detail.certNo
              ? 'CT ' + r.detail.certNo + (r.detail.certDate ? ' · ' + vnDate(r.detail.certDate) : '')
              : 'chưa có chứng thư',
            '',
            m0(r.bdmt),
            '',
            '',
            m0(r.usd),
            '',
            r.decl ? r.decl.no + ' · ' + CM().STATUS[r.decl.status] : 'chưa có tờ khai',
            m0(r.payable),
            m0(r.paidTax),
            m0(r.paidFee),
            m0(r.remaining),
            '',
          ],
        })
      );
    });
    rows.push({
      cls: 'total',
      c: [
        'TỔNG CỘNG (' + model.length + ' hợp đồng)',
        '',
        m0(sumOf(model.map((m) => m.c.contractQty))),
        m0(g('bdmt')),
        '',
        '',
        m0(g('usd')),
        g('certs') + '/' + g('details'),
        g('cleared') + '/' + g('decls'),
        m0(g('payable')),
        m0(g('paidTax')),
        m0(g('paidFee')),
        m0(g('remaining')),
        '',
      ],
    });
    const N = true;
    return {
      file: 'TinhHinhThucHienHopDong',
      title: 'TÌNH HÌNH THỰC HIỆN HỢP ĐỒNG',
      sub: 'Hợp đồng · chứng thư · tờ khai hải quan · thuế xuất khẩu · lệ phí' + (view ? ' · Bộ lọc: ' + view.describe() : ''),
      tables: [
        {
          cols: [
            { h: 'Hợp đồng / chi tiết' },
            { h: 'Bên mua / chứng thư' },
            { h: 'KL hợp đồng', n: N },
            { h: 'KL thực hiện', n: N },
            { h: '%', n: N },
            { h: 'Còn lại', n: N },
            { h: 'Giá trị USD', n: N },
            { h: 'Chứng thư', n: N },
            { h: 'Tờ khai' },
            { h: 'Thuế phải nộp', n: N },
            { h: 'Đã nộp thuế', n: N },
            { h: 'Lệ phí đã nộp', n: N },
            { h: 'Còn phải nộp', n: N },
            { h: 'Trạng thái' },
          ],
          rows,
        },
      ],
      count: model.length,
    };
  }
  function customsPdfSpec() {
    const rows = reportList(),
      view = csRepView(),
      g = sums(rows),
      N = true;
    const main = rows.map((d) => {
      const t = CM().totals(d),
        c = contractOf(d.contractId);
      return {
        c: [
          d.no,
          vnDate(d.openDate),
          d.round || 1,
          d.type || '',
          c ? c.no : '',
          c ? cstatus(c.id).label : '',
          d.ship || '',
          CM().STATUS[d.status],
          vnDate(CM().statusDate(d, 'cleared')),
          m0(t.payable),
          m0(t.paidTax),
          m0(t.remaining),
          m0(t.paidFee),
        ],
      };
    });
    main.push({
      cls: 'total',
      c: ['TỔNG CỘNG (' + rows.length + ' tờ khai)', '', '', '', '', '', '', '', '', m0(g.payable), m0(g.paid), m0(g.remaining), m0(g.fee)],
    });
    const supp = rows.flatMap((d) =>
      CM()
        .active(d.supplements)
        .map((x) => ({ c: [d.no, x.no || '(trên tờ khai gốc)', vnDate(x.date), x.round, x.reason, m0(x.qtyBdmt), m0(x.taxVnd)] }))
    );
    const pays = rows.flatMap((d) =>
      CM()
        .active(d.payments)
        .map((x) => ({
          c: [
            d.no,
            x.receiptNo,
            x.formCode,
            x.refNo,
            vnDate(x.date),
            vnDate(x.periodDate),
            CM().PAY_KIND[x.kind],
            x.content,
            x.chapter,
            x.ndkt,
            m0(x.amount),
          ],
        }))
    );
    const tables = [
      {
        cols: [
          { h: 'Số tờ khai' },
          { h: 'Ngày mở' },
          { h: 'Lần', n: N },
          { h: 'Loại hình' },
          { h: 'Hợp đồng' },
          { h: 'Trạng thái hợp đồng' },
          { h: 'Tàu' },
          { h: 'Trạng thái tờ khai' },
          { h: 'Ngày thông quan' },
          { h: 'Thuế phải nộp', n: N },
          { h: 'Đã nộp thuế', n: N },
          { h: 'Còn phải nộp', n: N },
          { h: 'Lệ phí đã nộp', n: N },
        ],
        rows: main,
      },
    ];
    if (supp.length)
      tables.push({
        caption: 'Khai bổ sung',
        cols: [
          { h: 'Tờ khai gốc' },
          { h: 'Số tờ khai bổ sung' },
          { h: 'Ngày' },
          { h: 'Lần', n: N },
          { h: 'Lý do' },
          { h: 'KL (BDMT)', n: N },
          { h: 'Thuế sau bổ sung', n: N },
        ],
        rows: supp,
      });
    if (pays.length)
      tables.push({
        caption: 'Giấy nộp tiền',
        cols: [
          { h: 'Tờ khai' },
          { h: 'Số giấy' },
          { h: 'Mã hiệu' },
          { h: 'Số tham chiếu' },
          { h: 'Ngày nộp' },
          { h: 'Kỳ thuế' },
          { h: 'Loại' },
          { h: 'Nội dung' },
          { h: 'Chương' },
          { h: 'NDKT' },
          { h: 'Số tiền VND', n: N },
        ],
        rows: pays,
      });
    return {
      file: 'TinhHinhKhaiHaiQuan',
      title: 'TÌNH HÌNH KHAI HẢI QUAN VÀ NỘP THUẾ',
      sub: 'Thuế phải nộp theo lần khai bổ sung mới nhất' + (view ? ' · Bộ lọc: ' + view.describe() : ''),
      tables,
      count: rows.length,
    };
  }
  async function pdfReport(which) {
    const spec = which === 'ct' ? contractPdfSpec() : customsPdfSpec();
    if (!spec.count) {
      toast(which === 'ct' ? 'Chưa có hợp đồng để in.' : 'Chưa có tờ khai để in.', 'warning');
      return;
    }
    await printReport(spec);
  }
  HAK.CustomsPrint = { contractPdfSpec, customsPdfSpec, pdfReport, printReport };
})(window);
