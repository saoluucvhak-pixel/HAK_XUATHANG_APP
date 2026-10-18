# Bản 2.12.4 — Tạo BKLS nhanh hơn, hướng dẫn rõ khi hộp Lưu mở

**1. Tạo BKLS tổng không còn kéo theo bản từng xe.**
- Trước đây, tạo lại BKLS từ trang **Lưu trữ** (nút BKLS) không hỏi gì mà dùng 4 ô đã lưu trong hồ sơ — mặc định đều tick — nên luôn tạo cả **BKLS từng xe (Word + PDF)**, rất lâu dù chỉ cần bản tổng.
- Nay mọi đường tạo BKLS (trang biên bản và Lưu trữ) đều mở hộp **Chọn mẫu và hình thức xuất BKLS** với mặc định **BKLS tổng · Word**; muốn từng xe hoặc PDF thì chọn rõ.
- Bỏ 4 ô tick "BKLS Tổng/Từng xe — Word/PDF" ở tab BKLS (hộp chọn thay thế, tránh hai nơi chọn mâu thuẫn). Nút đổi tên thành **Tạo BKLS…**.
- Đo thử trên app thật: BKLS tổng 120 xe và 1.500 xe đều khoảng 1 giây (máy thử); bản từng xe 120 xe khoảng 2 giây, nhiều xe hơn thì lâu hơn.

**2. Hộp Lưu của Windows không thấy → "Chờ chọn nơi lưu quá 3 phút".** Khi lưu tệp, app hiện thông báo: hộp Lưu có thể nằm sau cửa sổ trình duyệt, tìm biểu tượng nhấp nháy ở thanh taskbar. Trong lúc hộp Lưu còn mở, mọi lần lưu khác bị báo "đang bận" — đóng hộp Lưu đang mở trước khi bấm lại.

Chưa kiểm tra trên máy Windows thật; chưa sửa phía `HAKDocs.exe` (cần biên dịch lại bản Windows).
