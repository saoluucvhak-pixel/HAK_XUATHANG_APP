# Bản 2.12.6 — Sửa nguyên nhân gốc trong HAKDocs.exe

`HAKDocs.exe` (trình hỗ trợ lưu tệp + OCR Windows) được sửa và **biên dịch lại tự động từ mã nguồn** `installer/native/HAKDocs.cs` trên GitHub Actions mỗi lần dựng bộ cài (không còn dùng file `.exe` dựng sẵn cũ).

Các lỗi gốc đã sửa:
1. **"OCR is processing another document"**: lưu tệp và OCR dùng chung một khóa, chỉ cho một yêu cầu một lúc và từ chối ngay yêu cầu thứ hai. Nay lưu tệp có hàng đợi riêng (đợi tối đa 10 phút thay vì từ chối); OCR vẫn xử lý từng tài liệu một.
2. **Hộp Lưu nằm sau cửa sổ trình duyệt** ("Chờ chọn nơi lưu quá 3 phút"): hộp Lưu nay được đưa lên trên cùng (xin quyền foreground của Windows).
3. **"Failed to fetch" khi tệp lớn**: yêu cầu quá 36 MB bị đóng kết nối giữa chừng nên trình duyệt chỉ thấy lỗi mạng. Nay trình hỗ trợ đọc bỏ phần dữ liệu và trả lời rõ 413.
4. **Tự tắt sau 4 giờ không dùng**: nâng lên 24 giờ.

Kiểm thử tự động trên máy Windows của GitHub mỗi lần dựng: chạy `HAKDocs.exe --serve`, kiểm tra `/status`, thao tác danh sách tệp, và yêu cầu 40 MB phải nhận đúng mã 413.

Chưa kiểm thử hộp Lưu thật (cần thao tác người dùng) trên máy Windows có giao diện.
