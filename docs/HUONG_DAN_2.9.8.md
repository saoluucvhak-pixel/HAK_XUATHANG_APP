# Bản 2.9.8 — Chọn nơi lưu mỗi lần tải

Tham khảo HAK_KHO_OFFLINE/src/main.js, luồng file:save với dialog.showSaveDialog. App xuất hàng dùng SaveFileDialog của Windows qua tiện ích HAKDocs vì ứng dụng hiện chạy trong trình duyệt.

Cài bản mới, mở lại app bằng lối tắt. Mỗi lần xuất Word, Excel, ZIP hoặc tải mẫu sẽ hiện Lưu thành: chọn thư mục, đổi tên, tạo thư mục mới ngay trong hộp thoại. Có cảnh báo khi ghi đè. Bấm Hủy để dừng tải. Không tự rơi về tải nền nếu tiện ích chưa kết nối. PDF vẫn dùng hộp thoại in → Lưu dưới dạng PDF.

Giữ nút Tải về để mở Downloads hoặc tạo thư mục con theo năm. Giới hạn mỗi yêu cầu lưu qua tiện ích khoảng 26 MB dữ liệu; file lớn hơn cần chia nhỏ đợt xuất.

88 kiểm thử tự động đạt; tiện ích Windows biên dịch thành công; chưa kiểm tra trực quan hộp thoại trong lượt này.
