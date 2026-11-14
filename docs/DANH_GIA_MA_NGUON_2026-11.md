# Đánh giá mã nguồn nhánh main (v2.16.1) và kết quả xử lý

Danh sách 15 mục đề xuất sau rà soát, và tình trạng ở v2.16.2.

| # | Nội dung | Tình trạng |
|---|----------|-----------|
| 1 | Chèn công thức vào Google Sheet (ô bắt đầu = + - @) | Đã sửa (v2.16.2) |
| 2 | HAKDocs nhận Origin "null" → mã bảo vệ X-HAK-Token | Đã sửa (v2.16.2) |
| 3 | Thư viện cũ (SheetJS, jsPDF) | Đã nâng 0.20.3 / 4.2.1 |
| 4 | archive.js: Promise executor async treo | Đã sửa |
| 5 | Hợp đồng không có tờ khai không thể "Đã hoàn thành" | Đã thêm đóng/mở lại thủ công |
| 6 | Hợp đồng chưa gán công ty gửi về mọi Sheet | Đã sửa |
| 7 | Thứ tự phụ lục khi cùng ngày / không ngày | Đã sửa (seq) |
| 8 | Cột báo cáo theo chỉ số vị trí | Đã chuyển sang khóa cột + test |
| 9 | Mã chết | Đã dọn |
| 10 | Test lập PXK | Đã thêm (pxk-model.js + tests/pxk.test.cjs); tìm ra và sửa lỗi làm tròn kg→tấn |
| 11 | Băm mật khẩu yếu (SHA-256 × 2.000) | Đã chuyển PBKDF2 210.000 vòng, tự nâng cấp khi đăng nhập |
| 12 | Khả năng bảo trì (hàm dùng chung, Prettier, ESLint no-undef trong CI) | Chưa làm |
| 13 | Hiệu năng (58 thẻ script; tải lại Archive nhiều lần) | Chưa làm |
| 14 | Nhắc sao lưu | Đã thêm dải nhắc toàn app |
| 15 | Phát hành (ký mã, nút kiểm tra bản mới) | Chưa làm |
