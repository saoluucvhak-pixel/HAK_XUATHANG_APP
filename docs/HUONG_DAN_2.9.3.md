# HAK 2.9.3 — Hợp đồng và giá trị thực hiện

## Ký hợp đồng

Màn hình ký hợp đồng chỉ có thông tin chung: số hợp đồng, ngày ký, các bên, tên hàng hóa, KL hợp đồng và đơn giá hợp đồng theo BDMT. Không có bảng dòng chi tiết và không tự tạo dòng thực hiện khi lưu. Hợp đồng cũ vẫn giữ các dòng và chứng thư đã lưu; không tự xóa dữ liệu cũ.

## Danh mục hàng hóa

Trong Danh mục, bấm **Danh mục hàng hóa** để thêm, đổi tên, ngừng dùng hoặc khôi phục. Trường tên hàng trong hợp đồng và đợt thực hiện có danh sách gợi chọn dùng chung; có thể nhập tên mới khi OCR đưa ra tên chưa có. Tên mới được bổ sung khi lưu hợp đồng/đợt thực hiện. Đổi tên danh mục không sửa tên trên hồ sơ lịch sử. Danh mục hàng hóa đi cùng Sao lưu toàn bộ và đồng bộ cấu hình hiện có.

## Đợt thực hiện và chứng thư

Chọn hợp đồng đã lưu → **Thêm đợt thực hiện** khi phát sinh giao hàng. Ghi tàu, TKHQ và đính kèm chứng thư. Không còn đơn giá riêng ở dòng thực hiện; mọi giá trị dùng đơn giá hợp đồng.

- Hợp đồng USD: Giá trị USD = KL khô thực tế trên chứng thư (BDMT) × đơn giá USD/BDMT, làm tròn 2 chữ số thập phân. Giá trị VNĐ = Giá trị USD × tỷ giá VNĐ/USD, làm tròn đến đồng.
- Hợp đồng VND: Giá trị VNĐ = BDMT thực tế × đơn giá VNĐ/BDMT, làm tròn đến đồng; Giá trị USD = Giá trị VNĐ / tỷ giá, làm tròn 2 chữ số.
- Tỷ giá nhập riêng cho từng đợt. Thiếu tỷ giá thì chỉ hiện giá trị theo đồng tiền hợp đồng, ô quy đổi để trống. Thiếu KL khô chứng thư hoặc đơn giá thì không tính tiền; không lấy KL dự kiến hoặc KL tươi thay vào.
- Hai ô giá trị tự tính và chỉ đọc. Khi sửa BDMT hoặc tỷ giá, màn hình cập nhật ngay; khi lưu hoặc sửa đơn giá hợp đồng, giá trị các đợt được tính lại.
- Bảng thực hiện có cột tỷ giá, giá trị USD, giá trị VNĐ. Dòng đã ngừng dùng không cộng vào tổng. Tổng chỉ cộng các giá trị tính được; có thông báo nếu còn thiếu dữ liệu.

Đơn giá dòng cũ được giữ trong dữ liệu để không mất lịch sử nhưng không được dùng trong phép tính mới. Nếu có thay đổi giá thực tế, sửa đơn giá của hợp đồng tương ứng trước khi tính lại.

## OCR số hợp đồng

Đã bổ sung nhận các nhãn **Số HĐ**, **HĐ số**, **Contract No.**, lỗi OCR **S6/S0**, số nằm ở dòng kế tiếp và dấu gạch chéo có khoảng trắng. OCR cũng dùng cách ghép nhãn/giá trị theo vị trí trên trang. Đề xuất số hợp đồng có đoạn chữ nguồn để đối chiếu; chọn rồi bấm Điền các mục đã chọn. OCR hợp đồng chỉ điền thông tin ký kết, không tạo đợt giao hàng.

Đã kiểm tra lại hai PDF hợp đồng mẫu trong môi trường làm việc. Chữ OCR tiếng Việt có thể sai dấu và ký tự; vẫn cần đối chiếu số hợp đồng với PDF gốc. Giới hạn đọc trực tiếp độ ẩm từ chứng thư của bản trước vẫn còn; app ghi rõ nếu phần trăm được tính từ KL tươi/khô.

## Cập nhật và xác minh

Sao lưu toàn bộ trong app, đóng app rồi cài bản 2.9.3. Mở lại bằng lối tắt HAK. Không cần tải lại PDF đã đính kèm. Mẫu BKLS/QR và trình tạo mẫu giữ như bản 2.9.2.

70 kiểm thử tự động đạt, gồm luồng mở biểu mẫu/lưu hợp đồng không tạo đợt, nhập chứng thư và tính/lưu giá trị, số hợp đồng OCR, danh mục hàng hóa và giữ dữ liệu cũ. Đã kiểm tra cú pháp và bộ kiểm tra chất lượng HAK. Chưa kiểm tra tương tác trực tiếp trong trình duyệt trên máy người dùng. Bộ cài được kiểm tra giải nén và đối chiếu tệp, chưa cài đè dữ liệu thật. Mã nguồn được đóng gói cục bộ, chưa đẩy lên GitHub. PDF mẫu và chữ OCR riêng không nằm trong gói phát hành.
