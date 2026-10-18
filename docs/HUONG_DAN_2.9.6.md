# Bản 2.9.6 — OCR đơn giá và tiền tệ

Đính kèm PDF hợp đồng → Đọc bằng OCR Windows → chọn Đơn giá và Tiền tệ → Điền các mục đã chọn. Luôn đối chiếu dòng trích dẫn. Hỗ trợ USD/VND đang có trong app; tiền khác chưa tự điền. Nếu nhiều đơn giá khác nhau, không chọn giá tự động.

Đã sửa nhận diện tên hàng méo chữ do OCR trên dòng giá và tách phí ủy thác khỏi giá hàng. Đã kiểm chứng trên PDF người dùng cung cấp bằng Windows OCR. Không đưa PDF hay dữ liệu OCR cá nhân vào bộ cài/mã nguồn.

Đối chiếu HAK_ACCOUNTING_REPORT_STANDARD/docs/REPORT_FORMAT_SPEC.md và chạy HAK_CODE_QUALITY_TEST. Excel lưu ngày dạng ngày thật với dd/mm/yyyy; số là số thật, KL tấn/BDMT và USD hiển thị 2 chữ số lẻ; kg và VND 0 chữ số; tổng cộng từ dữ liệu chưa làm tròn. Đã kiểm thử ghi/đọc lại Excel, bộ lọc, tổng và bảo toàn số TKHQ có số 0 đầu.

85 kiểm thử tự động đạt. Kiểm tra tĩnh có 1 cảnh báo cũ về độ dài pages.js, không có vòng phụ thuộc. Chưa kiểm tra thao tác trực quan trong trình duyệt ở lượt này.
