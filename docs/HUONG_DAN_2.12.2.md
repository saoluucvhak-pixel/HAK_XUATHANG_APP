# Bản 2.12.2 — Sửa lỗi cài đè khi app đang chạy ngầm

**Lỗi:** cập nhật bộ cài báo `Error opening file for writing: ...\native\HAKDocs.exe` (Abort / Retry / Ignore). Nguyên nhân: `HAKDocs.exe` chạy ngầm (`--serve`) sau khi dùng app nên khóa file.

**Sửa:** bộ cài tự tắt `HAKDocs.exe` (taskkill) trước khi cài đè và trước khi gỡ cài đặt. Dữ liệu trong trình duyệt không bị ảnh hưởng.

**Nếu vẫn gặp lỗi với bộ cài cũ (≤ 2.12.1):** đóng app, mở Task Manager (Ctrl+Shift+Esc) → tab Details → kết thúc `HAKDocs.exe` → bấm **Retry** trong bộ cài. Hoặc chạy bộ cài 2.12.2 trở lên.

Chưa kiểm tra cài đặt / cập nhật trên máy Windows thật (workflow chỉ biên dịch bộ cài).
