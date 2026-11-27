/**
 * help.js — 📘 Hướng dẫn trong app (v2.6.5, Thủy chốt phương án A 27/09/2026).
 * Nội dung HTML tĩnh: chế độ đăng nhập, cài máy trạm và thao tác trong ứng dụng.
 * Có nút In / lưu PDF.
 * Liên kết từ nơi khác: phần tử có data-help="<id mục>" → mở trang Hướng dẫn và cuộn tới mục đó.
 */
(function (root) {
  'use strict';
  const HAK = (root.HAK = root.HAK || {});
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** [id, tiêu đề, nội dung HTML] */
  const SECTIONS = [
    [
      'help-install',
      'Cài đặt và chế độ đăng nhập',
      '<ol><li>Khi cài mới, chọn <b>Bỏ qua · Một người sử dụng</b> để mở ứng dụng trực tiếp, hoặc chọn <b>Sử dụng tài khoản đăng nhập</b> và tạo tên đăng nhập, mật khẩu. Cất mã khôi phục ở nơi an toàn.</li>' +
        '<li><b>Cài đặt → Tài khoản</b> cho phép đổi chế độ. Để chuyển sang một người sử dụng, nhập đúng tên đăng nhập và mật khẩu hiện tại.</li>' +
        '<li>Máy nâng cấp từ bản cũ cần đăng nhập bằng tài khoản Quản trị cũ một lần. App chuyển tài khoản đó thành tài khoản duy nhất của máy và cấp mã khôi phục mới.</li>' +
        '<li>Quên mật khẩu: bấm <b>Quên mật khẩu?</b>, nhập tên đăng nhập và mã khôi phục để đặt mật khẩu mới.</li></ol>' +
        '<p>Đăng nhập là khóa mở giao diện ứng dụng offline. Quyền truy cập tệp và cơ sở dữ liệu cục bộ thuộc về tài khoản Windows.</p>' +
        '<p><b>Cài đặt → Chung → Gói cấu hình cài đặt</b> dùng để chuyển công ty, kho, mẫu Word, danh mục và Google Sheet sang máy khác. Máy trạm dùng các công ty được chọn trong gói. Tài khoản đăng nhập được tạo riêng trên từng máy.</p>',
    ],
    [
      'help-flow',
      'Quy trình lập hồ sơ',
      '<p>Luồng đúng: <b>Danh mục → Nhập liệu (bảng cân) → Chọn phiếu → Lưu hồ sơ → Xuất chứng từ → Báo cáo.</b> Đầu trang biên bản có thanh "Đang làm việc" cho biết công ty, hình thức, đợt cân, hợp đồng và phạm vi phiếu.</p>' +
        '<ul><li><b>Nhập liệu:</b> chọn file Excel; nhãn <b>✔ Đã lưu</b> hiện khi đợt đã ghi xong, <b>⚠ Chưa lưu bền</b> kèm nút "Thử lưu lại" nếu lỗi. Nạp lại file trùng tên sẽ hỏi xác nhận thay đợt.</li>' +
        '<li><b>Ba phạm vi khác nhau:</b> "Lọc xem trước" (Nhập liệu — chỉ để xem), "Phạm vi lập chứng từ" (trang biên bản — tập phiếu sẽ lập), "Kỳ báo cáo" (Báo cáo). Bấm <b>Dùng phạm vi đang xem</b> ở Nhập liệu để chuyển điều kiện sang trang biên bản.</li>' +
        '<li><b>Chọn phiếu:</b> "Chọn … dòng đang hiển thị" chỉ chọn các dòng thấy (300 mỗi lần); "Chọn tất cả … kết quả" chọn hết kết quả lọc. Dán số phiếu: khớp đúng số trước, nếu mơ hồ sẽ hiện bảng để bạn xác nhận.</li>' +
        '<li><b>Một ngày hai tàu:</b> lập tàu A (lọc giờ cân / số phiếu hoặc Chọn phiếu…) → Lưu hồ sơ → <b>Thêm mới</b> cho tàu B trên cùng đợt cân; cột "Đã gán" cho biết phiếu đã thuộc tàu khác. Mở lại A vẫn đúng lựa chọn của A.</li>' +
        '<li><b>Phiếu bỏ khác xe trả về:</b> phiếu bỏ bị loại khỏi hồ sơ; xe trả về vẫn thuộc đợt cân nhưng được đánh dấu trả về.</li>' +
        '<li><b>Thêm mới:</b> xóa sạch phiếu bỏ, xe trả về, phiếu chọn riêng, bộ lọc và liên kết hợp đồng của hồ sơ trước; nếu còn thay đổi chưa lưu sẽ hỏi Lưu / Bỏ thay đổi / Quay lại.</li>' +
        '<li><b>Nhập từ bản sao:</b> Cài đặt → <b>💾 Sao lưu &amp; khôi phục</b> → khối ③ <b>Khôi phục</b> (một nút, tự nhận file toàn bộ / tháng / năm). Chọn <b>Nhập bổ sung</b> (giữ dữ liệu mới hơn trên máy; nhập lặp không đổi gì) hoặc <b>Khôi phục (ghi đè)</b> danh mục &amp; cài đặt về thời điểm sao lưu (có nút <b>↶ Hoàn tác khôi phục</b>). Nếu dừng giữa chừng, thông báo nêu kho đã nhập, kho chưa chạy và phần hoàn tác được.</li>' +
        '<li><b>Đổi sheet / dòng tiêu đề / ánh xạ cột:</b> app đọc thử trước. Có dòng trùng hoàn toàn (cùng số phiếu, biển số, giờ cân) hoặc kết quả không hợp lệ thì <b>không áp dụng</b> — giữ nguyên cấu hình đang dùng và nêu sheet, số phiếu, dòng Excel cần xử lý.</li>' +
        '<li><b>Báo cáo theo ngày cân:</b> hồ sơ không đọc được hoặc phiếu thiếu / sai ngày cân được tách thành <b>chưa phân bổ</b> (khung vàng + sheet "Chưa phân bổ" trong Excel); tháng / năm chỉ gồm phần đã xác minh, không tự dồn vào ngày bắt đầu hồ sơ.</li>' +
        '<li><b>Mẫu báo cáo (Báo cáo tổng hợp):</b> chọn 1 trong 5 mẫu — <i>Tổng hợp theo kỳ</i> (so với kỳ trước cùng độ dài), <i>Phân tích theo tàu / kho / ĐVVC</i> (Top N + Khác, tỷ lệ xe trả về có mẫu số), <i>Tiến độ và đối chiếu hợp đồng</i> (BDMT gốc / hiện hành / chứng thư, MT thực giao), <i>Hải quan và công nợ thuế</i> (công ty → hợp đồng → tờ khai, không bù trừ), <i>Ngoại lệ cần đối soát</i>. Từ dòng tổng bấm <b>Hồ sơ / Phiếu cân / Hồ sơ hợp đồng / Giấy nộp tiền</b> để tra về nguồn. Màn hình, Excel và PDF cùng một kết quả và cùng phạm vi công ty.</li>' +
        '<li><b>Đồng bộ Google Sheet dừng giữa chừng:</b> thông báo nêu đã ghi / lỗi / chưa chạy theo lô hoặc theo trang; bấm đồng bộ lại là gửi tiếp, không nhân đôi dòng. Bốn trang hợp đồng cần Code.gs bản 3 (dán lại mã mới).</li>' +
        '<li><b>Đóng năm dở:</b> Sổ hồ sơ theo năm → <b>Tiếp tục đóng năm</b> → chọn lại đúng file ZIP; nếu có hồ sơ sửa sau khi đóng dở, app báo cần đối chiếu và không dọn.</li>' +
        '<li><b>Danh mục thay đổi:</b> khi hợp đồng/danh mục đổi sau lúc mở hồ sơ, app báo "Danh mục đã thay đổi" (giá trị cũ/mới); giá trị bạn gõ tay được giữ. Hồ sơ đã lưu mở lại theo đúng nội dung lúc lưu.</li></ul>',
    ],

    [
      'help-veh',
      'Bảng cân + danh sách xe, tài xế theo từng đợt (v2.7.2)',
      '<p><b>Mỗi đợt xuất hàng có danh sách xe &amp; tài xế riêng</b> — chỉ áp cho bảng cân của đợt đó, không dùng cho lô / tàu khác.</p><ol>' +
        '<li>Tải <b>file Excel mẫu</b>: Nhập liệu → khung <b>Danh sách xe &amp; tài xế</b> → <button type="button" class="btn btn-sm btn-outline-success py-0" data-sample-xlsx>⬇ Tải file Excel mẫu</button>. 1 file = 1 đợt: sheet <b>BANG CAN</b> (phiếu cân) + <b>DS XE - TAI XE</b> (biển số, tài xế, SĐT, mã ĐVVC).</li>' +
        '<li>Điền xong → Nhập liệu → chọn hình thức → thêm file làm đợt. App tự đọc danh sách xe trong file; cột <b>DS xe</b> của bảng đợt ghi số xe và số biển số khớp.</li>' +
        '<li>File cân lấy từ phần mềm cân (không có sheet DS XE): bấm dòng đợt → <b>⬆ Gắn file danh sách xe</b>, hoặc <b>Dự phòng — dùng danh sách của đợt khác</b> (★ = đợt gần nhất).</li></ol>' +
        '<ul><li>Đợt chưa có danh sách: báo đỏ "🚚 Chưa có" + cảnh báo; Tài xế / Đơn vị vận chuyển để trống trên biên bản, BKLS, PXKKVCNB.</li>' +
        '<li>Chuyển Xuất hàng kho gửi sang hình thức khác: đợt chép mang theo danh sách xe của đợt gốc.</li></ul>',
    ],

    [
      'help-autobk',
      'Tự sao lưu mỗi ngày + Sức khỏe dữ liệu (v2.7.5)',
      '<p>Dữ liệu app nằm trong trình duyệt của máy — hỏng / xóa trình duyệt là mất. Từ v2.7.5 app <b>tự sao lưu mỗi ngày</b> vào 1 thư mục anh chọn:</p><ol>' +
        '<li>⚙️ Cài đặt → <b>💾 Sao lưu &amp; khôi phục</b> → khối ④ <b>🔁 Tự sao lưu định kỳ</b> / ⑤ Thư mục → <b>📁 Chọn thư mục tự sao lưu…</b> → chọn thư mục (nên là thư mục <b>Google Drive / OneDrive</b> đồng bộ, hoặc ổ D) → bấm <b>Cho phép</b> (Allow) khi trình duyệt hỏi quyền sửa file.</li>' +
        '<li>Bấm <b>▶ Sao lưu vào thư mục ngay</b> để tạo bản đầu tiên. Chọn số bản giữ (mặc định 10).</li>' +
        '<li>Từ đó mỗi ngày, lần đầu mở app (sau khoảng 20 giây) app ghi <span class="mono">HAK_TuDong_&lt;ngày&gt;_&lt;giờ&gt;.zip</span>, đọc lại kiểm tra, rồi xóa bản <span class="mono">HAK_TuDong_*.zip</span> cũ hơn số bản giữ (không đụng file khác).</li></ol>' +
        '<ul><li>Chrome / Edge thường <b>hỏi lại quyền</b> sau mỗi lần mở trình duyệt: Tổng quan hiện dòng 🔁 → bấm <b>Cho phép &amp; sao lưu</b> (trình duyệt có lựa chọn "Cho phép mỗi lần truy cập" thì chọn để khỏi hỏi lại).</li>' +
        '<li>Nút <b>⬇ Sao lưu toàn bộ</b> giờ ra file <b>.zip</b> (nhẹ hơn ~3 lần). <b>⬆ Khôi phục toàn bộ</b> nhận cả .zip lẫn file .json của bản cũ. Khôi phục từ bản tự sao lưu: chọn file HAK_TuDong_….zip trong thư mục.</li>' +
        '<li><b>🩺 Sức khỏe dữ liệu</b> ở Tổng quan: 5 ô xanh / vàng / đỏ — bộ nhớ trình duyệt, cài đặt (localStorage), số hồ sơ Lưu trữ, sao lưu gần nhất, tự sao lưu. Ô vàng / đỏ: rê chuột xem cách xử lý.</li></ul>',
    ],

    [
      'help-arch',
      'Lưu trữ theo năm — Sổ hồ sơ năm, sao lưu, Đóng năm (v2.10 – 2.11)',
      '<p><b>App không tự xóa hồ sơ.</b> Hồ sơ lập ra tự vào 🗄️ Lưu trữ; trang Lưu trữ hiện 200 dòng mỗi lần, bấm <b>Hiện thêm</b> để xem tiếp (tìm kiếm / lọc vẫn tìm trong toàn bộ).</p>' +
        '<p><b>Sổ hồ sơ theo năm</b> (nút trên thanh đầu): chọn <b>Năm</b> làm việc, bấm <b>Lưu hồ sơ</b> trên biểu mẫu để lưu dù chưa xuất file. Trong sổ có thể <b>Mở / Sửa</b>, <b>Lưu trữ / Khôi phục</b> (ẩn / hiện lại, không xóa), tải <b>PDF kèm theo</b>. Năm tính theo <b>ngày bắt đầu</b> của hồ sơ.</p><ol>' +
        '<li><b>Sao lưu năm</b>: ghi 1 file ZIP của năm đang chọn (hồ sơ, các phiên bản, dữ liệu cân, hợp đồng / PDF đã chụp). Dữ liệu vẫn nằm trên máy.</li>' +
        '<li><b>Khôi phục năm</b>: chọn file ZIP / JSON → app kiểm tra rồi gộp, giữ bản mới hơn. <b>Đưa bản sao hồ sơ cũ vào năm này</b>: chép hồ sơ Lưu trữ cũ vào sổ năm (không sửa bản gốc).</li>' +
        '<li><b>Đóng năm ra file và dọn kho</b> (bật <b>Xem tất cả công ty</b>): app ghi ZIP <span class="mono">HAK_NamDaDong_&lt;năm&gt;.zip</span>, <b>đọc lại file trên đĩa</b> để so mã kiểm tra, rồi mới hỏi xác nhận gỡ hồ sơ khỏi máy. Hủy hoặc kiểm tra sai thì không dọn. Xong app tự tải lại.</li>' +
        '<li><b>Mở file năm cũ (chỉ xem)</b>: xem / xuất lại Word, Excel, PDF, BKLS từ file đã đóng mà không nhập lại vào máy. <b>Về kho đang làm việc</b> để thoát chế độ xem.</li></ol>' +
        '<ul><li>Hồ sơ Lưu trữ cũ vẫn có nút <b>📦 Xuất &amp; dọn hồ sơ cũ</b> (theo <b>ngày cập nhật</b>, không theo năm) — nên dùng Đóng năm cho gọn.</li>' +
        '<li>Giữ file ZIP năm ở nơi an toàn: <b>Sao lưu toàn bộ không tự chép các ZIP năm</b>. Mất ZIP = mất dữ liệu năm đã dọn.</li>' +
        '<li>Báo cáo tổng hợp chỉ tính hồ sơ đang có trên máy — đóng năm nào thì báo cáo năm đó trống cho tới khi khôi phục. Báo cáo có ô <b>Năm</b> và bảng / sheet <b>Theo năm</b>.</li></ul>',
    ],

    [
      'help-tabs',
      'Trang biên bản: nhập theo 5 tab (v2.7.0)',
      '<p>Mỗi trang biên bản chia ô nhập thành các tab, cùng thứ tự ở mọi hình thức (trang nào không có vùng đó thì bỏ tab):</p><ol>' +
        '<li><b>Dữ liệu cân</b> — lọc khoảng ngày, chọn xe trả về.</li>' +
        '<li><b>Hợp đồng &amp; bên</b> — chọn hợp đồng, tên tàu, các bên, hợp đồng ủy thác, chứng thư giám định. Điều chuyển: <b>Quyết định &amp; chiều</b> (chiều điều chuyển, kho đi / đến, số và ngày Quyết định).</li>' +
        '<li><b>Kho &amp; cảng</b> — kho xuất / bàn cân, cảng / nơi giao.</li>' +
        '<li><b>Biên bản</b> — tháng, ngày lập, mẫu biên bản (Xuất bán: <b>Giá &amp; biên bản</b>).</li>' +
        '<li><b>BKLS</b> — số BKLS, hệ số, bên mua, nguồn gốc, <b>Mã HS</b> (v2.7.6: Xuất khẩu / Ủy thác mặc định 4401220090, hàng nội địa để trống → in dấu chấm; sửa theo tờ khai hải quan), các bản cần tạo. Ô <b>"Bản tổng: liệt kê BKLS từng xe…"</b> (mặc định bật, v2.7.1): mục 5 "Hồ sơ kèm theo" của BKLS tổng ghi tổng số BKLS con, số xe, rồi từng ngày → từng BKLS con (số, KL MT – BDMT, số xe, tài xế); bản tổng thành nhiều tờ, "Tổng số tờ" tự đếm. Bỏ tick = bản tổng gọn 1 trang như cũ.</li></ol>' +
        '<ul><li>Dấu trên tab: <b class="text-success">✓</b> đủ ô bắt buộc · <b class="text-danger">số đỏ</b> còn thiếu (chưa tạo được biên bản) · <b class="text-warning">số vàng</b> ở tab BKLS = còn thiếu nếu muốn tạo BKLS. Rê chuột lên tab để xem thiếu ô nào.</li>' +
        '<li>Bấm <b>Tạo biên bản</b> / <b>Tạo BKLS</b> khi còn thiếu → app tự mở đúng tab và tô đỏ ô cần nhập.</li>' +
        '<li>Nút <b>Tiếp ›</b> / <b>‹ Quay lại</b> ở cuối mỗi tab; mở lại trang thì app nhớ tab đang làm. Kết quả tự tính và các nút Tạo luôn ở khung bên phải (điện thoại: bên dưới).</li></ul>',
    ],

    [
      'help-convert',
      'Xuất hàng kho gửi → Xuất khẩu / Ủy thác / Xuất bán',
      '<p>Hàng ở <b>kho gửi</b> xuất đi để bán, xuất khẩu hoặc ủy thác: trang <b>Xuất hàng kho gửi</b> chỉ lập <b>biên bản giao nhận hàng xuất kho gửi</b> (không lập BKLS). BKLS lập ở hình thức đích — khi hàng chuyển chủ sở hữu.</p><ol>' +
        '<li>Nhập liệu → <b>Xuất hàng kho gửi</b> → thêm file Excel cân của đợt.</li>' +
        '<li>Trang Xuất hàng kho gửi: nhập tàu, bên gửi, kho, lọc ngày, chọn xe trả về → <b>⚡ Tạo biên bản</b>.</li>' +
        '<li>Khung <b>➡ Chuyển sang hình thức khác</b> → bấm <b>Xuất khẩu</b>, <b>Ủy thác</b> hoặc <b>Xuất bán</b>. App chép đúng các phiếu cân đang lọc sang trang đích, điền sẵn tàu, bên gửi (→ đơn vị xuất khẩu / bên ủy thác / bên bán), kho xuất, xe trả về (Xuất bán: tự loại xe trả về).</li>' +
        '<li>Trang đích: <b>chọn hợp đồng</b> (bên nhận ủy thác / bên mua theo hợp đồng) → nhập <b>Số BKLS</b> → <b>⚡ Tạo biên bản</b> → <b>🧾 Tạo BKLS</b> (Tổng + Từng xe, Word + PDF).</li></ol>' +
        '<ul><li><b>Mỗi đợt chỉ 1 hình thức.</b> Đợt đã chuyển có nhãn "➡ đã chuyển sang …" (Nhập liệu và trang kho gửi). Muốn đổi hình thức: Nhập liệu → hình thức đã chuyển → <b>Xóa</b> đợt đã chép → chuyển lại. Chuyển lại đúng hình thức cũ = cập nhật.</li>' +
        '<li>Trang đích hiện dòng "Phạm vi chuyển từ Xuất hàng kho gửi…" — chỉ lấy đúng đợt đã chuyển. Tải lại app thì phạm vi lọc về mặc định → bấm Chuyển sang lần nữa (cùng hình thức) để mang lại.</li>' +
        '<li>Báo cáo đơn vị vận chuyển không cộng trùng xe giữa hồ sơ kho gửi và hồ sơ đã chuyển.</li></ul>',
    ],

    [
      'help-errors',
      'E. Lỗi thường gặp',
      '<div class="tbl-wrap" style="max-height:none"><table class="table table-sm align-middle help-tbl"><thead><tr><th>Báo lỗi</th><th>Nguyên nhân</th><th>Xử lý</th></tr></thead><tbody>' +
        [
          ['Sai tên đăng nhập hoặc mật khẩu', 'Gõ sai / Caps Lock', 'Nhập lại hoặc dùng mã khôi phục'],
          ['Sai nhiều lần', 'Sai 5 lần liên tiếp', 'Chờ 30 giây'],
          ['Đây là file Sao lưu toàn bộ…', 'Chọn nhầm file khi nhập gói', 'Chọn file HAK_GoiCaiDat_….json'],
          [
            'Google Sheet: Không kết nối được / Sai mã bí mật',
            'Mạng chặn, Web App chưa "Bất kỳ ai", mã trong app khác Code.gs',
            'Xem mục Đồng bộ Google Sheet trong HUONG_DAN.md',
          ],
        ]
          .map((r) => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>')
          .join('') +
        '</tbody></table></div>',
    ],
  ];

  function machineInfo() {
    const A = HAK.Auth;
    if (!A || !A.current || !A.current()) return '';
    const st = A.stationCos ? A.stationCos() : null,
      cos = (HAK.Config && HAK.Config.data.companies) || [];
    const nm = (id) => {
      const c = cos.find((x) => x.id === id);
      return c ? c.short || c.name : id;
    };
    return (
      '<ul class="sum-list mb-0"><li><span>Máy này</span><b>' +
      (st ? 'Máy trạm · ' + esc(st.map(nm).join(', ')) : 'Máy chính · mọi công ty') +
      '</b></li><li><span>Chế độ sử dụng</span><b>' +
      (A.usesAccount() ? 'Tài khoản ' + esc(A.current().username) : 'Một người sử dụng') +
      '</b></li></ul>'
    );
  }

  let built = false;
  function render() {
    const box = $('#helpRoot');
    if (!box) return;
    if (!built) {
      box.innerHTML =
        '<div class="card mb-3"><div class="card-body d-flex flex-wrap align-items-start gap-3">' +
        '<div class="flex-grow-1" style="min-width:240px"><h5 class="mb-1">📘 Hướng dẫn cài đặt, đăng nhập &amp; khôi phục</h5><div class="small muted">Bản đang chạy: <b>v' +
        esc(HAK.VERSION || '?') +
        '</b>. In ra hoặc lưu PDF để đưa cho người cài máy.</div>' +
        '<div class="help-toc no-print mt-2">' +
        SECTIONS.map(
          (s) =>
            '<button type="button" class="btn btn-sm btn-outline-primary" data-help-go="' +
            s[0] +
            '">' +
            esc(s[1].replace(/^[A-F]\. /, '')) +
            '</button>'
        ).join('') +
        '</div></div>' +
        '<div style="min-width:260px;flex:1 1 280px" id="helpInfo"></div>' +
        '<div class="no-print d-flex flex-column gap-2"><button type="button" class="btn btn-primary" id="helpPrint">🖨 In / lưu PDF</button><button type="button" class="btn btn-outline-secondary" id="helpUpdate">🔄 Kiểm tra bản mới</button><div class="small" id="helpUpdateMsg" role="status"></div></div></div></div>' +
        SECTIONS.map(
          (s) =>
            '<div class="card mb-3 help-sec" id="' +
            s[0] +
            '"><div class="card-header">' +
            esc(s[1]) +
            '</div><div class="card-body">' +
            s[2] +
            '</div></div>'
        ).join('');
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-help-go]');
        if (b) go(b.dataset.helpGo);
        if (e.target.closest('#helpPrint')) root.print();
        const ub = e.target.closest('#helpUpdate');
        if (ub && HAK.Update) {
          const msg = $('#helpUpdateMsg');
          ub.disabled = true;
          msg.className = 'small muted';
          msg.textContent = 'Đang kiểm tra…';
          HAK.Update.check()
            .then((v) => {
              msg.className = 'small ' + (v.state === 'new' ? 'text-warning-emphasis' : 'text-success');
              msg.innerHTML =
                esc(v.text) +
                (v.state === 'new'
                  ? ' <a href="' +
                    esc(v.latest.url) +
                    '" target="_blank" rel="noopener">Tải về</a>' +
                    (v.latest.sha256 ? '<div class="mono small">SHA-256: ' + esc(v.latest.sha256) + '</div>' : '')
                  : '');
            })
            .catch((err) => {
              msg.className = 'small text-danger';
              msg.textContent = err.message || String(err);
            })
            .finally(() => {
              ub.disabled = false;
            });
        }
      });
      built = true;
    }
    const info = $('#helpInfo');
    if (info) info.innerHTML = machineInfo();
  }
  function go(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /** Mở trang Hướng dẫn tại mục id (dùng cho liên kết data-help ở các thẻ khác). */
  function open(id) {
    if (location.hash !== '#/help') location.hash = '#/help';
    else render();
    setTimeout(() => go(id), 80);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-help]');
    if (!a) return;
    e.preventDefault();
    open(a.dataset.help);
  });

  HAK.Help = { render, open, SECTIONS };
})(window);
