# Hợp đồng và chi tiết thực hiện bản 2.9.0

## Thay đổi chính

Hợp đồng là bảng cha. Mỗi hợp đồng có nhiều dòng chi tiết/thực hiện ở bảng con. Bên xuất khẩu/nhận ủy thác, bên ủy thác và bên mua là ba vai trò riêng. Số tờ khai hải quan, tên hàng, tàu/chuyến, khối lượng dự kiến và bộ số liệu chứng thư nằm ở từng dòng con.

OCR hợp đồng đọc được các bên, mã số thuế, tên hàng, khối lượng từng lô và phân loại PEFC/NON PEFC theo hai mẫu đã cung cấp. Các mục đọc được đều cần chọn để điền. Nếu tìm đúng một khách hàng có cùng MST, app đề xuất khách hàng đó; tên gần giống không đủ để tự ghép. Tên chưa có được đưa vào ô khách hàng mới để sửa/đối chiếu, chỉ tạo khi Lưu.

## Cập nhật và sử dụng

1. Trong app đang dùng, chọn Sao lưu toàn bộ trước khi cài bản mới. Giữ nguyên thư mục cài và trình duyệt cũ.
2. Chạy Setup 2.9.0, mở bằng lối tắt Desktop. Bản offline mở `app/native/HAKDocs.exe` để bật OCR Windows và mở app.
3. Danh mục → Thêm/Sửa hợp đồng: điền thông tin chung hoặc chọn PDF → Đọc bằng OCR Windows.
4. Chọn những thông tin các bên cần điền và những lô cần thêm. Bấm Điền các mục đã chọn. Xem bảng Chi tiết hợp đồng, kiểm tra lại hàng hóa, TKHQ, khối lượng và tàu. Đơn vị khối lượng hợp đồng của bản này là BDMT.
5. Bấm Lưu. Khi hợp đồng có nhiều lô, mỗi lô là một dòng; tổng hợp đồng là tổng khối lượng dự kiến của các dòng đang dùng. Không nhập lặp lại toàn bộ khối lượng hợp đồng ở mỗi dòng.
6. Chọn hợp đồng ở bảng trên → Chi tiết → Sửa/chứng thư ở dòng cần thực hiện. Tải PDF chứng thư, đọc và điền số liệu riêng cho dòng đó.
7. Khi lập biên bản/BKLS, chọn đúng dòng chi tiết theo tàu, hàng hóa/TKHQ. Số liệu thực hiện của dòng khác không tự nhập sang dòng đang chọn.
8. Ngừng dùng dòng hoặc Lưu trữ hợp đồng giữ lại dữ liệu. Bấm Xem dòng ngừng dùng/Đã lưu trữ để khôi phục. Dữ liệu đang dùng không chọn được các dòng đã ngừng.

## Dữ liệu cũ và sao lưu

Lần lưu đầu tiên sau cập nhật tạo và đọc lại bản sao danh mục cũ trước khi ghi cấu trúc mới. Nếu không xác minh được bản sao, thao tác dừng. Mỗi bản ghi cũ trở thành một hợp đồng và một dòng chi tiết tương ứng; liên kết hồ sơ cũ được giữ qua ID cũ.

Sao lưu toàn bộ gồm PDF, mẫu BKLS, hợp đồng và các dòng con. Gói cấu hình chuyển danh mục nhưng không mang PDF; cần Sao lưu toàn bộ khi chuyển cả chứng từ. Nhập Excel ghép theo hợp đồng, TKHQ và hàng hóa, giữ các dòng con khác đã nhập trước đó.

## Kiểm tra và giới hạn

Đạt 49 kiểm thử tự động, kiểm tra cú pháp toàn bộ script, giải nén 67 tệp bộ cài và đối chiếu mã nguồn. HAK Code Quality còn một cảnh báo về độ dài tệp pages.js. Đã kiểm tra mã đọc trên kết quả OCR Windows của chính hai PDF mẫu, mô hình nhiều dòng, chuyển đổi dữ liệu cũ, lỗi khi ghi, xung đột giữa hai cửa sổ, nhập Excel lặp, sao lưu và liên kết báo cáo. Có thể xem danh sách kiểm tra trong mã nguồn.

Máy kiểm thử chỉ có OCR en-US: dấu tiếng Việt và ký tự vẫn có thể sai. Tên hàng/bên liên quan cần đối chiếu với PDF gốc. Không gửi PDF lên đám mây và không đóng gói tài liệu hợp đồng thật vào bản phát hành.

Chưa xác nhận thao tác giao diện đầu cuối trên bản cài Windows; trình duyệt công cụ chặn truy cập app cục bộ. Chưa xác nhận dàn trang Word/PDF cuối vì thiếu LibreOffice. Bộ cài được kiểm tra giải nén và đối chiếu mã nguồn, chưa thử nâng cấp trên dữ liệu sản xuất. Bản setup chưa ký số. GitHub chưa được cập nhật vì kết nối hiện có không có quyền ghi.
