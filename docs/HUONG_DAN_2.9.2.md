# Bản 2.9.2 — Hợp đồng, chứng thư và tạo mẫu BKLS

Cài bản 2.9.2, đóng và mở lại ứng dụng bằng lối tắt HAK để dùng OCR Windows mới. Sao lưu toàn bộ trước khi cập nhật.

## Hợp đồng

Tên hàng hóa hợp đồng và KL hợp đồng (BDMT) nằm ở phần thông tin chung và hiện trên danh sách hợp đồng. Các dòng chi tiết giữ TKHQ, tàu/chuyến và dữ liệu thực hiện; tên hàng thực hiện hoặc KL phân bổ có thể sửa riêng khi cần. Tổng KL hợp đồng không bị nhân theo số dòng thực hiện. Hợp đồng cũ được lấy tên hàng và tổng khối lượng từ các dòng cũ khi chưa có thông tin chung; các dòng, PDF và số liệu thực hiện vẫn được giữ.

Đính kèm PDF hợp đồng → Đọc bằng OCR Windows → chọn đề xuất Tên hàng hóa hợp đồng, KL hợp đồng rồi Điền các mục đã chọn. Các đề xuất phân bổ theo lô là tùy chọn, không cần tạo lại dòng chỉ để điền thông tin chung. Đã đối chiếu tên hàng và khối lượng bằng hai PDF mẫu đã cung cấp.

## Chứng thư

Mở Chi tiết / thực hiện → đính kèm chứng thư → OCR. Có đề xuất tàu/chuyến, khối lượng tươi/khô, ngày và hai ô Bên giao trên chứng thư, Bên nhận trên chứng thư. Hai bên được ghép với danh mục khi trùng tên chính xác hoặc MST; tên mới phải được kiểm tra trước khi lưu. Chọn đề xuất bên giao / nhận rồi bấm Điền bên này; các ô số liệu dùng nút Điền các ô đã chọn.

Giới hạn còn lại: Windows OCR en-US trên máy thử vẫn bỏ qua phần trăm độ ẩm in đậm của chứng thư mẫu. Nếu đã đọc được KL tươi và KL khô, app đưa thêm đề xuất độ ẩm tính bằng `(1 − BDMT / MT) × 100`, làm tròn 4 chữ số; ghi rõ **tính từ khối lượng, chưa đọc trực tiếp dòng độ ẩm**. Cần đối chiếu với chứng thư, không coi đây là kết quả OCR trực tiếp. Khi đọc được dòng độ ẩm trực tiếp, app ưu tiên giá trị đó. OCR tiếng Việt có thể sai dấu; PDF gốc được giữ để đối chiếu.

## BKLS

Chọn **Mẫu 01/BKLS Thông tư 84/2025/TT-BNNMT**. Mẫu A4, Times New Roman 11,5 pt, lề trái 3 cm, các lề còn lại 2 cm. Hình QR của mẫu HAK hiện hành đã được đặt lại ở vùng trên bên phải; đây là hình có sẵn của mẫu hiện hành, không phải QR động chứa dữ liệu hồ sơ mới. Mục hồ sơ kèm theo của mẫu mới chỉ ghi **Hợp đồng số…**, không liệt kê từng xe. Số hợp đồng lấy từ hợp đồng đang chọn hoặc ô Số hợp đồng của biên bản. Nếu chưa có số thì chừa dấu chấm để bổ sung.

Word và PDF/In dùng chung nguồn DOCX. Khi in, chọn A4, tỷ lệ 100%, tắt đầu/chân trang trình duyệt và xem trước rồi lưu PDF.

## Tạo mẫu trước khi tải lên đồng bộ

Mở Tạo BKLS → **Tạo mẫu từ file Word có sẵn**:

1. Chọn DOCX tối đa 5 MB. App phân tích nội dung thân văn bản, bảng, đầu trang và chân trang.
2. Bôi chọn phần chữ cần thay trong từng ô đoạn văn, rồi chọn trường dữ liệu. Có nút gợi ý theo nhãn thường gặp; kiểm tra từng vùng đã gán. Bấm Bỏ nếu gán nhầm.
3. Gán ít nhất Số BKLS và Khối lượng. Các trường Khối lượng, Số lượng, Thông tin vận chuyển chỉ điền giá trị, vì nhãn đã có sẵn trong Word.
4. Bấm **Tạo mẫu & kiểm tra**, sau đó **Tải mẫu đã tạo**. Mở bằng Word để kiểm tra bố cục. Hình QR và các nội dung không gán được giữ nguyên; bản gốc không bị sửa.
5. Bấm **Tải mẫu lên / đồng bộ**, chọn mẫu đã tạo. Mẫu được thêm vào danh sách để xuất BKLS. Chuyển file mẫu sang máy khác và tải lên tương tự để đồng bộ; đây là đồng bộ bằng file, không tự đồng bộ qua mạng. Sao lưu toàn bộ cũng mang theo mẫu đã đăng ký.

Luồng tạo mẫu tham khảo TEMPLATEBUILDER.gs của https://github.com/saoluucvhak-pixel/hosovay_hak. Trình tạo hiện hỗ trợ thay vùng chữ trong một đoạn; chưa hỗ trợ tự nhân bảng hoặc xóa hàng ví dụ.

## Kiểm tra và phạm vi bàn giao

61 kiểm thử tự động đạt; đã chạy kiểm tra cú pháp và kiểm tra chất lượng HAK; còn một cảnh báo tệp pages.js dài. Đã tạo BKLS bằng bộ điền thật và trình tạo mẫu, chuyển bằng Microsoft Word và kiểm tra toàn bộ trang. Chưa kiểm tra thao tác trực tiếp trong trình duyệt hoặc hộp thoại in trên máy người dùng. Bộ cài được kiểm tra giải nén và đối chiếu tệp; không cài đè lên dữ liệu thật trong bước thử. PDF hợp đồng, chứng thư và kết quả OCR riêng không được đóng gói vào bộ cài hay mã nguồn. Bản này đóng gói cục bộ, chưa đẩy lên GitHub.

Lập lại mẫu chuẩn từ tài liệu tham chiếu: chạy tools/normalize-bkls-form01.py rồi tools/restore-bkls-qr.py để thêm hình QR hiện hành. Hai công cụ chỉ thay tệp đầu ra, không sửa tài liệu tham chiếu.
