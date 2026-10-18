# BKLS và PDF OCR — bản kiểm thử 2.8.0

Bản này bổ sung vào giao diện HAK Enterprise và Smart Filter hiện có.

## Cách sử dụng

1. Sao lưu toàn bộ trong app cũ trước khi cập nhật. Giữ nguyên thư mục cài đặt và trình duyệt đang dùng.
2. Cài setup 2.8.0, mở bằng lối tắt Desktop. Lối tắt khởi động `native/HAKDocs.exe`, sau đó mở app. Bản portable cũng mở bằng tệp này.
3. Danh mục → Hợp đồng → Thêm/Sửa: chọn một hoặc nhiều PDF hợp đồng. Bấm Đọc bằng OCR Windows, đối chiếu PDF gốc, đánh dấu ô muốn điền và bấm Điền các ô đã chọn. Cuối cùng bấm Lưu.
4. Chi tiết thực hiện → chọn chứng thư PDF và thao tác tương tự. Mỗi tệp tối đa 26 MB. Nhiều chứng thư có thể đính kèm; các ô số liệu vẫn đại diện cho một bộ số liệu thực hiện của hợp đồng.
5. Bấm Tạo BKLS: chọn mẫu HAK hiện hành, Mẫu số 01 bạn cung cấp, hoặc Thêm mẫu DOCX mới. Chọn tổng/từng xe/cả hai và Word/PDF/cả hai.
6. Với mẫu mới, PDF mở hộp thoại In. Chọn Lưu thành PDF; xem lại trang in. Nếu hủy in, app không thể xác nhận có tệp PDF đã lưu.
7. Sao lưu toàn bộ có chứa PDF gốc và mẫu mới. Gói cấu hình cài đặt chỉ chuyển cấu hình/danh mục, không chuyển các PDF; dùng Sao lưu toàn bộ để chuyển tài liệu.

## Mẫu Word mới

Nhận DOCX tối đa 5 MB: theo cấu trúc Mẫu số 01 hoặc dùng mã điền sau (ngoặc kép là hai dấu ngoặc nhọn):

`{{SO_BKLS}}`, `{{CHU_LAM_SAN}}`, `{{MST_CHU}}`, `{{DIA_CHI_CHU}}`, `{{BEN_MUA}}`, `{{MST_MUA}}`, `{{DIA_CHI_MUA}}`, `{{KHOI_LUONG}}`, `{{SO_LUONG}}`, `{{VAN_CHUYEN}}`, `{{NGAY_LAP}}`, `{{NGUON_GOC}}`, `{{MA_HS}}`, `{{HO_SO}}`.

Mẫu dùng mã cần có SO_BKLS và KHOI_LUONG. Mẫu không hỗ trợ sẽ báo lỗi. Mẫu số 01 giữ các bảng chi tiết và ghi chú của bản gốc; các ô không có dữ liệu vẫn cần hoàn thiện. Mẫu mới xuất từng xe tối đa 200 xe/lần, mỗi xe một DOCX; nhiều tệp Word được gói ZIP. Mẫu HAK hiện hành giữ cơ chế chia bộ lớn trước đây.

## OCR và dữ liệu

Chạy Windows.Media.Ocr trên máy, không tải PDF lên dịch vụ đám mây. Máy kiểm thử chỉ có bộ nhận dạng en-US; dấu tiếng Việt và ký tự có thể sai. Các đề xuất đều để trống lựa chọn ban đầu, không ghi đè tự động. Trường không nhận dạng được để người dùng nhập và đối chiếu; không suy đoán khối lượng hay độ ẩm còn thiếu. Hợp đồng OA có nhiều lô nên không tự chọn một khối lượng làm tổng hợp đồng.

PDF được lưu nguyên nội dung trong IndexedDB bằng mã SHA-256. Khi bỏ đính kèm chỉ bỏ liên kết khỏi hợp đồng, dữ liệu tệp còn giữ trong bản sao lưu để tránh ảnh hưởng các hồ sơ dùng chung. Đóng cửa sổ sửa mà không Lưu thì PDF mới chưa được ghi vào hồ sơ.

## Kiểm tra đã thực hiện

- 25 kiểm thử tự động: bộ lọc, thiết kế, đọc số liệu, phân biệt đơn giá/phí ủy thác, sao lưu/khôi phục PDF và mẫu, nâng cấp bộ nhớ v3 lên v4.
- Kiểm tra cú pháp toàn bộ script và đường dẫn thư viện nội bộ.
- OCR chứng thư 1 trang, hợp đồng ủy thác 3 trang và toàn bộ hợp đồng OA 23 trang đã cung cấp, bằng API OCR thật của Windows.
- Sinh DOCX bằng mã xuất BKLS thật với dữ liệu giả: các trường chính được điền, bảng chi tiết và styles của mẫu gốc còn nguyên.
- Dịch vụ OCR: trạng thái, CORS cho app file, chặn Origin từ website bên ngoài, từ chối nội dung không phải PDF.
- Công cụ HAK Code Quality báo một cảnh báo độ dài tệp pages.js, không có vòng phụ thuộc được phát hiện.

## Giới hạn kiểm thử

Chưa kiểm tra tương tác giao diện đầu cuối vì trình duyệt công cụ chặn app cục bộ. Chưa kiểm tra dàn trang Word/PDF cuối cùng vì máy thiếu LibreOffice. Chưa chạy cài đặt/cập nhật trên dữ liệu thật; setup được kiểm tra bằng chế độ giải nén và đối chiếu các tệp với nguồn. Chưa ký số. Cần đối chiếu PDF/Word trước khi phát hành chứng từ chính thức.

Không đưa PDF hợp đồng, chứng thư thật hoặc dữ liệu OCR vào gói phát hành. Chưa cập nhật GitHub do phiên kết nối trước bị từ chối quyền ghi.
