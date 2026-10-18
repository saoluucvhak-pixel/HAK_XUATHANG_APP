# Kết quả kiểm tra — 17/10/2026

- App: npm test đạt 9/9; bao gồm Excel serialize/load, tổng cộng và dữ liệu không đổi.
- npm run check: tất cả JS app phân tích cú pháp thành công; tài nguyên JS/CSS/libs được tham chiếu trong index tồn tại.
- HAK_SMART_FILTER gốc: 8/8 test đạt. HAK_CODE_QUALITY_TEST gốc: 4/4 test đạt.
- npm run quality: 1 cảnh báo file app/js/pages.js dài, có từ trước; không có debugger hoặc file trùng theo scanner. Số cạnh phụ thuộc bằng 0 vì app dùng global HAK; không suy ra kiến trúc không có chu kỳ.
- UI harness qa-report.html: tìm "dai duong" khớp "ĐẠI DƯƠNG", kết quả 12,50 tấn qua cân / 2,50 trả về / 10,00 thực giao; chọn Trung chuyển gửi kho cho kết quả rỗng; ngày đảo ngược hiển thị lỗi và vô hiệu hóa xuất Excel.
- Trang app thật khởi động tới màn hình tạo tài khoản lần đầu. Không tạo tài khoản hoặc thay đổi mật khẩu.
- Bản portable loại công cụ mở khóa / xóa dữ liệu. NSIS đã sửa quy tắc loại file nhưng chưa biên dịch setup.exe.

Chưa chạy trọn luồng Word/PDF/BKLS, đồng bộ Google Sheet và phục hồi dữ liệu; chưa nghiệm thu bốn theme hoặc mọi kích thước màn hình. Cần kiểm thử trên bản sao dữ liệu thực trước khi triển khai.
