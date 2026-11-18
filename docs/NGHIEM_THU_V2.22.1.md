# Nghiệm thu v2.22.1

Nền mã nguồn là main `f60f9f8` (v2.22.0). Bản vá sửa bước chốt Đóng năm và Tiếp tục đóng năm khi nguồn chính là SQLite.

## Lỗi và bản sửa

`YearClose.finalize` mở giao dịch IndexedDB trực tiếp, trong khi bước chuẩn bị đã ghi qua SQLite. Khi nguồn chính là SQLite, thao tác không hoàn tất trên đúng kho dữ liệu. Bản sửa chọn backend hiện hành và chốt sổ năm cùng xóa thông số/file cân trong một giao dịch SQLite, có kiểm tra phiên bản sổ năm và từng đợt. Dữ liệu thay đổi được giữ lại để đối soát.

## Kiểm chứng

- Windows, Node 24.21.0, Edge, dữ liệu mẫu trong thư mục SQLite riêng có dấu tiếng Việt.
- 515/515 kiểm thử tự động đạt. Có ca đóng năm, sai file cân, phiên bản sổ cũ và cửa sổ khác thay đợt giữa lúc đọc và ghi.
- Rà tiếp Khôi phục / Hoàn tác phát hiện lỗi ghi nền có thể báo xong trước SQLite. Đã vá và chứng minh 4 ca mới thất bại trước sửa, đạt sau sửa; toàn bộ **519/519** kiểm thử đạt. Lỗi ghi không đổi bộ đệm, bản chụp được giữ và cài đặt đổi ở cửa sổ khác bị chặn ghi đè.
- Edge + SQLite tham chiếu: nhập ZIP hai lần vẫn giữ hợp đồng 700 BDMT / phiên bản 4 (bản sao 500 / v2), một tờ khai, một khoản nộp 1.000.000 đồng; tải lại vẫn đúng. Lỗi ghi mô phỏng qua giao thức được báo thất bại; kiểm tra toàn vẹn SQLite đạt.
- Biên dịch HAKDocs C# từ nguồn trên Windows. Hợp đồng HTTP với winsqlite3 đạt 16/16 ca.
- Bản vá Đóng năm chạy trên HAKDocs thật: giữ hồ sơ năm khác, xóa đúng đợt và file gốc, tăng phiên bản sổ.
- PDF.js cho công cụ nghiệm thu nâng từ 3.11.174 lên 4.8.69; npm audit sau cập nhật đạt 0 lỗ hổng.
- `accept:release` trên Edge và HAKDocs SQLite thật đạt 27/27, 0 bỏ qua. Đọc lại DOCX/XLSX/PDF; kiểm tra hai tàu, xe trả về, thuế, toàn vẹn cha–con và PDF 140 dòng nhiều trang.

## Phát hành

Workflow tạo bộ cài chờ HAK quality của đúng commit thành công trước khi công bố Release. Phiên bản 2.22.1 giữ schema SQLite v1 và định dạng ZIP hiện có. Sao lưu trước khi nâng cấp. Bản HTML chưa kích hoạt SQLite tiếp tục dùng IndexedDB. Việc di trú dữ liệu thực tế cần ZIP nguồn để đối chiếu riêng.
