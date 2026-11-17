/**
 * customs-export.js — Xuất Excel của hai báo cáo hải quan (ExcelJS): một nguồn tính với màn hình (reportList / contractReportList).
 * Tách từ customs.js (không đổi công thức / giao diện / lưu trữ); giữ API HAK.Customs trong customs.js.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const { hasNum, vnDate } = HAK.Util || (typeof require === 'function' ? require('./util.js') : {}); // hàm dùng chung (util.js)
  const { CM, contractOf, cstatus, custName, toast } = HAK.CustomsCommon;
  const { csRepView, reportList } = HAK.CustomsReport;
  const { contractReportList, ctView, typeLabel } = HAK.ContractReport;

  async function exportReport() {
    const rows = reportList(),
      view = csRepView(),
      tu = view ? view.getState().tu || '' : '';
    if (!rows.length) {
      toast('Chưa có tờ khai để xuất.', 'warning');
      return;
    }
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report,
      wb = R.newWorkbook(),
      NI = '#,##0',
      ND = '#,##0.##';
    const sub =
      'Nguồn: tab Tờ khai hải quan trong Danh mục' +
      (view ? ' · Bộ lọc: ' + view.describe() : '') +
      '. Thuế phải nộp lấy theo lần khai bổ sung mới nhất (nếu có).';
    R.buildSheet(
      wb,
      'Tờ khai',
      'TÌNH HÌNH KHAI HẢI QUAN VÀ NỘP THUẾ',
      sub,
      [
        { h: 'Số tờ khai', w: 16 },
        { h: 'Ngày mở', w: 12 },
        { h: 'Lần khai', w: 8, n: NI },
        { h: 'Loại hình', w: 9 },
        { h: 'Hợp đồng', w: 20 },
        { h: 'Trạng thái hợp đồng', w: 16 },
        { h: 'Tàu', w: 24 },
        { h: 'Hàng hóa', w: 28 },
        { h: 'KL (BDMT)', w: 12, n: ND },
        { h: 'Trạng thái tờ khai', w: 16 },
        { h: 'Ngày thông quan', w: 14 },
        { h: 'Thuế XK phải nộp (đ)', w: 18, n: NI },
        { h: 'Đã nộp thuế (đ)', w: 16, n: NI },
        { h: 'Còn phải nộp (đ)', w: 16, n: NI },
        { h: 'Lệ phí đã nộp (đ)', w: 16, n: NI },
      ],
      rows.map((d) => {
        const t = CM().totals(d),
          c = contractOf(d.contractId);
        return [
          d.no,
          vnDate(d.openDate),
          d.round || 1,
          d.type || '',
          c ? c.no : '',
          c ? cstatus(c.id).label : '',
          d.ship || '',
          d.goods || '',
          d.qtyBdmt,
          CM().STATUS[d.status],
          vnDate(CM().statusDate(d, 'cleared')),
          t.payable,
          t.paidTax,
          t.remaining,
          t.paidFee,
        ];
      }),
      { total: true }
    );
    R.buildSheet(
      wb,
      'Khai bổ sung',
      'KHAI BỔ SUNG',
      sub,
      [
        { h: 'Tờ khai gốc', w: 16 },
        { h: 'Số tờ khai bổ sung', w: 18 },
        { h: 'Ngày', w: 12 },
        { h: 'Lần', w: 8, n: NI },
        { h: 'Lý do', w: 40 },
        { h: 'KL (BDMT)', w: 12, n: ND },
        { h: 'Thuế XK sau bổ sung (đ)', w: 20, n: NI },
      ],
      rows.flatMap((d) =>
        CM()
          .active(d.supplements)
          .map((x) => [d.no, x.no, vnDate(x.date), x.round, x.reason, x.qtyBdmt, x.taxVnd])
      )
    );
    R.buildSheet(
      wb,
      'Giấy nộp tiền',
      'GIẤY NỘP TIỀN VÀO NGÂN SÁCH NHÀ NƯỚC',
      sub,
      [
        { h: 'Tờ khai', w: 16 },
        { h: 'Số giấy nộp tiền', w: 16 },
        { h: 'Mã hiệu', w: 14 },
        { h: 'Số tham chiếu', w: 24 },
        { h: 'Ngày nộp', w: 12 },
        { h: 'Kỳ thuế / ngày quyết định', w: 14 },
        { h: 'Loại', w: 16 },
        { h: 'Nội dung', w: 30 },
        { h: 'Mã chương', w: 10 },
        { h: 'Mã NDKT', w: 10 },
        { h: 'Mã ĐBHC', w: 10 },
        { h: 'Số tiền VND', w: 16, n: NI },
      ],
      rows.flatMap((d) =>
        CM()
          .active(d.payments)
          .map((x) => [
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
            x.dbhc,
            x.amount,
          ])
      ),
      { total: true }
    );
    const name = 'TinhHinhKhaiHaiQuan_' + (tu ? tu.slice(0, 4) : 'TatCa') + '.xlsx';
    if (
      !(await HAK.Word.Files.saveBlob(
        new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        name
      ))
    )
      return;
    toast('Đã xuất: ' + name, 'success');
  }

  async function exportContractReport() {
    const model = contractReportList(),
      view = ctView(),
      tu = view ? view.getState().tu || '' : '';
    if (!model.length) {
      toast('Chưa có hợp đồng để xuất.', 'warning');
      return;
    }
    if (!root.ExcelJS && HAK.UI.needLib) await HAK.UI.needLib('exceljs');
    const R = HAK.Report,
      wb = R.newWorkbook(),
      NI = '#,##0',
      ND = '#,##0.00',
      num = (v) => (hasNum(v) ? +v : null);
    const sub =
      'Nguồn: Danh mục (hợp đồng, chi tiết hợp đồng, chứng thư) và tab Tờ khai hải quan (tờ khai, giấy nộp tiền)' +
      (view ? ' · Bộ lọc: ' + view.describe() : '') +
      '. Thuế phải nộp theo lần khai bổ sung mới nhất.';
    R.buildSheet(
      wb,
      'Hợp đồng',
      'TÌNH HÌNH THỰC HIỆN HỢP ĐỒNG',
      sub,
      [
        { h: 'Hình thức', w: 14 },
        { h: 'Số hợp đồng', w: 24 },
        { h: 'Ngày ký', w: 12 },
        { h: 'Bên mua', w: 30 },
        { h: 'Hàng hóa', w: 26 },
        { h: 'KL hợp đồng (BDMT)', w: 16, n: ND },
        { h: 'Đơn giá', w: 12, n: ND },
        { h: 'Số đợt', w: 8, n: NI },
        { h: 'KL thực hiện (BDMT)', w: 16, n: ND },
        { h: '% thực hiện', w: 11, n: '0.0' },
        { h: 'KL còn lại (BDMT)', w: 16, n: ND },
        { h: 'Giá trị thực hiện (USD)', w: 18, n: ND },
        { h: 'Số chứng thư', w: 11, n: NI },
        { h: 'Số tờ khai', w: 10, n: NI },
        { h: 'Đã thông quan', w: 12, n: NI },
        { h: 'Thuế XK phải nộp (đ)', w: 18, n: NI },
        { h: 'Đã nộp thuế (đ)', w: 16, n: NI },
        { h: 'Lệ phí đã nộp (đ)', w: 16, n: NI },
        { h: 'Còn phải nộp (đ)', w: 16, n: NI },
        { h: 'Trạng thái hợp đồng', w: 18 },
      ],
      model.map((m) => {
        const c = m.c,
          t = m.tot;
        return [
          typeLabel(c.type),
          c.no || '',
          vnDate(c.date),
          custName(c.buyerId),
          c.contractProduct || '',
          num(c.contractQty),
          num(c.priceUsd),
          t.details,
          t.bdmt,
          t.pct,
          t.left,
          t.usd,
          t.certs,
          t.decls,
          t.cleared,
          t.payable,
          t.paidTax,
          t.paidFee,
          t.remaining,
          m.st.label,
        ];
      })
    );
    R.buildSheet(
      wb,
      'Chi tiết thực hiện',
      'CHI TIẾT THỰC HIỆN: CHỨNG THƯ · TỜ KHAI · NỘP THUẾ · LỆ PHÍ',
      sub,
      [
        { h: 'Số hợp đồng', w: 24 },
        { h: 'Tàu / chuyến', w: 24 },
        { h: 'Hàng hóa', w: 24 },
        { h: 'Số chứng thư', w: 20 },
        { h: 'Ngày chứng thư', w: 13 },
        { h: 'KL tươi (MT)', w: 13, n: ND },
        { h: 'KL khô (BDMT)', w: 14, n: ND },
        { h: 'Giá trị (USD)', w: 16, n: ND },
        { h: 'Giá trị (VNĐ)', w: 18, n: NI },
        { h: 'Số tờ khai', w: 16 },
        { h: 'Ngày mở tờ khai', w: 13 },
        { h: 'Lần khai', w: 8, n: NI },
        { h: 'Trạng thái tờ khai', w: 16 },
        { h: 'Thuế XK phải nộp (đ)', w: 18, n: NI },
        { h: 'Đã nộp thuế (đ)', w: 16, n: NI },
        { h: 'Lệ phí đã nộp (đ)', w: 16, n: NI },
        { h: 'Còn phải nộp (đ)', w: 16, n: NI },
      ],
      model.flatMap((m) =>
        m.rows.map((r) => {
          const d = r.detail,
            x = r.decl;
          return [
            m.c.no || '',
            d ? d.ship || '' : '',
            d ? d.product || m.c.contractProduct || '' : '',
            d ? d.certNo || '' : '',
            d ? vnDate(d.certDate) : '',
            num(r.mt),
            num(r.bdmt),
            num(r.usd),
            num(r.vnd),
            x ? x.no : '',
            x ? vnDate(x.openDate) : '',
            x ? x.round || 1 : null,
            x ? CM().STATUS[x.status] : '',
            num(r.payable),
            x ? r.paidTax : null,
            x ? r.paidFee : null,
            num(r.remaining),
          ];
        })
      ),
      { total: true }
    );
    const name = 'TinhHinhThucHienHopDong_' + (tu ? tu.slice(0, 4) : 'TatCa') + '.xlsx';
    if (
      !(await HAK.Word.Files.saveBlob(
        new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        name
      ))
    )
      return;
    toast('Đã xuất: ' + name, 'success');
  }

  HAK.CustomsExport = { exportContractReport, exportReport };
})(window);
