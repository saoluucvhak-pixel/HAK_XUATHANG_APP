# Bản 2.12.0 — Bỏ phiếu cân

Trang biên bản (Xuất khẩu, Ủy thác, … ): mục **Phạm vi dữ liệu lấy từ Excel** có nút **🚫 Bỏ phiếu cân…**.

1. Bấm nút → tìm theo số phiếu / biển số → tick **Bỏ** ở phiếu không muốn dùng nữa (nhập nhầm, cân thử, hủy…). Có thể gõ **Lý do bỏ** trước khi tick.
2. Phiếu bị bỏ **coi như không có**: không tính vào tổng xe / tấn, Word, PDF, Excel, BKLS, Lưu trữ và Báo cáo. Dòng "Đã bỏ N phiếu · −X tấn" hiện ở khung kết quả tự tính.
3. Bỏ tick để khôi phục; **Khôi phục tất cả** để bỏ hết các lần bỏ. Dữ liệu trong file Excel không bị đổi.
4. Khi **Lưu hồ sơ**, danh sách phiếu bỏ (số phiếu, biển số, kg, lý do, người, giờ) được lưu kèm hồ sơ để truy vết. Mở lại hồ sơ đã lưu thì phiếu bỏ vẫn không có trong dữ liệu; muốn khôi phục phiếu đã bỏ trong hồ sơ đã lưu, tạo hồ sơ mới từ file Excel (Thêm mới).
5. Phiếu được nhận diện theo **số phiếu + biển số + giờ cân vào** nên vẫn đúng khi nạp lại file Excel đã đổi thứ tự dòng.

Khác với **Chọn xe trả về**: xe trả về vẫn tính vào khối lượng qua cân, chỉ trừ khỏi thực giao và lập BKLS trả về.

Kiểm tra: 116 kiểm thử tự động đạt (có 3 kiểm thử mới); chạy thử trên app thật: bỏ 1 trong 3 phiếu → 78,97 → 53,65 tấn, lưu rồi mở lại hồ sơ vẫn đúng.
Chưa làm: cảnh báo khi nạp file khác tên có phiếu trùng nhưng khác khối lượng (đang giữ số của đợt cũ).
