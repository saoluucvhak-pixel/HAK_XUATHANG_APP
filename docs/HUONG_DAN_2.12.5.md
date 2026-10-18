# Bản 2.12.5 — Không còn báo lỗi chặn khi lưu tệp

Trước đây mỗi lần lưu (Word, PDF, Excel, BKLS, báo cáo…) app gọi trình hỗ trợ `HAKDocs.exe` để mở hộp Lưu của Windows. Khi trình hỗ trợ đã tắt, đang bận hoặc tệp quá lớn, app báo lỗi ("Failed to fetch", "OCR is processing another document", "Chờ chọn nơi lưu quá 3 phút") và **không lưu được tệp**.

**Từ bản này:** trình hỗ trợ không dùng được → app **tự tải tệp về thư mục Tải xuống của trình duyệt** và báo một dòng thông tin ("Đã tải … về thư mục Tải xuống"). Không còn lỗi chặn.
- Áp dụng khi: trình hỗ trợ tắt / không kết nối được, vẫn bận sau khi đợi, hoặc tệp lớn hơn ~26 MB.
- Khi hộp Lưu của Windows mở bình thường: vẫn dùng như cũ (chọn nơi lưu). Chỉ khi phải đợi hơn ~1 giây mới nhắc "tìm biểu tượng nhấp nháy ở taskbar".
- Bấm Hủy ở hộp Lưu: không tải gì. Chờ quá 3 phút: vẫn báo, vì hộp Lưu có thể còn mở.
- Nhiều tệp cùng lúc: Chrome / Edge có thể hỏi "cho phép tải nhiều tệp" — chọn Cho phép.

Kiểm tra: 123 kiểm thử tự động đạt; chạy thử trên app thật (giả lập trình hỗ trợ tắt và trình hỗ trợ bận) → tệp `.docx` tải về qua trình duyệt, không có lỗi. Chưa thử trên máy Windows thật.
