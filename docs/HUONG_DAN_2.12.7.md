# Bản 2.12.7 — Ô số có dấu phân cách, tạo BKLS không bị chặn

(Gồm cả bản sửa gốc `HAKDocs.exe` — xem `docs/HUONG_DAN_2.12.6.md`; bản 2.12.6 không phát hành riêng.)

**1. Ô nhập số kiểu Việt.** Khi rời ô, số tự hiện dấu `.` hàng nghìn và `,` thập phân: `6500` → `6.500`, `13010,81` → `13.010,81`, `1250000` → `1.250.000`.
- Áp dụng: KL tạm tính (BDMT), KL giám định tươi / khô, đơn giá (đồng/tấn) ở trang biên bản; KL hợp đồng, đơn giá, tỷ giá, KL chi tiết ở Danh mục hợp đồng.
- Độ ẩm (%) và độ khô chỉ là số thập phân: `49,981` luôn là 49,981.
- Ô không phải số (vd `abc`) viền đỏ; ở Danh mục, bấm Lưu sẽ báo rõ ô nào sai. Trước đây ô Danh mục là ô số của trình duyệt: gõ `6.500` ra 6,5 — nay `6.500` là 6500 ở mọi nơi.

**2. Sửa lỗi đọc số.** `0,123` đọc thành 123 (nay 0,123); `0,480` thành 480 (nay 0,48). Chỉ số bắt đầu bằng `0,` mới đổi; `10,123` vẫn là 10123 như file Excel cân (`1,979` = 1979).

**3. Tạo BKLS không còn bị chặn.** Thiếu **Số BKLS** → tự đặt số kế tiếp đã lập (hoặc `001/<năm>/BKLS`); **hệ số** sai → dùng mặc định; thiếu **tên bên mua** → vẫn tạo, ô để trống trên BKLS. Thông báo cuối nêu rõ app đã tự điền / để trống gì.

Kiểm tra: 129 kiểm thử tự động đạt (thêm: định dạng số, đọc số); chạy thử trên app thật ở trang Ủy thác, Xuất bán, Danh mục hợp đồng và tạo BKLS khi chưa điền Số BKLS / bên mua.
