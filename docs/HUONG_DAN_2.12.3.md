# Bản 2.12.3 — Sửa chữ vỡ font khi tạo Word và lỗi "Chưa lưu tệp"

**1. Chữ vỡ font ở khung tiến trình** ("Ä ang Ä iá» n dá»¯ liá» u…" thay cho "Đang điền dữ liệu vào mẫu…"): bộ tạo Word nền được nạp từ chuỗi base64 nhưng đưa vào `Blob` sai cách nên chữ tiếng Việt trong mã worker bị mã hóa hai lần. Sửa: đổi base64 → byte rồi mới tạo Blob (`docx-worker.js`). Có kiểm thử riêng. Nội dung file Word không bị ảnh hưởng (dữ liệu đi qua `postMessage`).

**2. "Chưa lưu tệp: OCR is processing another document. Please wait.."**: trình hỗ trợ lưu tệp (`HAKDocs.exe`) chỉ xử lý một yêu cầu một lúc; khi hộp Lưu còn mở hoặc tệp trước chưa xong, yêu cầu kế tiếp bị từ chối (mã 409). Sửa: app tự đợi và thử lại tối đa ~60 giây, báo "đang bận — đang đợi…". Nếu vẫn bận, báo rõ cách xử lý.

**3. "Chưa lưu tệp: Failed to fetch"**: app không nối được trình hỗ trợ lưu tệp. Thường do trình hỗ trợ đã tắt (cài bản mới sẽ tắt nó, hoặc để app quá lâu), hoặc tệp quá lớn (> ~26 MB). Thông báo giờ nêu rõ nguyên nhân bằng tiếng Việt. Cách xử lý: **đóng hết tab app, mở lại bằng lối tắt trên Desktop** (lối tắt khởi động lại trình hỗ trợ). Tệp quá lớn: thu hẹp phạm vi (ngày / số phiếu / biển số) rồi tạo lại.

Chưa sửa: trình hỗ trợ `HAKDocs.exe` vẫn dùng một khóa chung cho OCR và lưu tệp (cần biên dịch lại bản Windows). Chưa kiểm tra trên máy Windows thật.
