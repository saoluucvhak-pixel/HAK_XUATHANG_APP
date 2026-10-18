# Bản 2.12.1 — Cảnh báo phiếu trùng khác khối lượng

Khi nạp thêm file Excel **khác tên** mà có phiếu trùng với đợt đã có (cùng số phiếu, biển số, giờ cân vào) nhưng **khối lượng khác** (thường do bản sửa):

1. App báo ngay sau khi nạp và hiện khung vàng "N phiếu trùng giữa các đợt nhưng khác khối lượng" ở mục Dữ liệu gộp (trang Nhập liệu); cảnh báo cũng nằm trong danh sách "Cảnh báo dữ liệu".
2. Bấm **Xem & chọn**: bảng liệt kê từng phiếu với số của đợt trước và đợt sau, chọn **trước** hoặc **sau** cho từng phiếu, hoặc **Dùng đợt sau cho tất cả** / **Giữ đợt trước cho tất cả**.
3. Mặc định vẫn giữ số của **đợt nạp trước** (như các bản cũ); nạp lại file **cùng tên** vẫn thay cả đợt như trước.
4. Lựa chọn được nhớ theo từng loại biên bản, kể cả sau khi đóng mở app. Tổng xe / tấn ở Nhập liệu và trang biên bản cập nhật ngay.

Kiểm tra: chạy thử trên app thật — đợt A (PC001 = 26.150 kg, 78,97 tấn) + đợt sửa khác tên (PC001 = 26.800 kg): hiện cảnh báo; chọn "sau" → 79,62 tấn ở cả Nhập liệu và trang Xuất khẩu. 116 kiểm thử tự động đạt.
Chưa có kiểm thử tự động cho phần gộp đợt (nằm trong main.js cần trình duyệt).
