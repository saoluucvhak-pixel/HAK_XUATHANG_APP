# HAK 2.9.4 — sửa OCR số hợp đồng từ PDF

## Cài và sử dụng

Cài bản 2.9.4, đóng tab ứng dụng cũ rồi mở lại bằng lối tắt HAK. Trong phần đính kèm hợp đồng, cần thấy dòng **Bộ đọc số hợp đồng 2.9.4**. Nếu vẫn thấy bản cũ thì mở lại ứng dụng sau khi cập nhật; không dùng tab cũ để kiểm tra bản sửa.

1. Mở hợp đồng và bấm Đọc bằng OCR Windows trên PDF đã đính kèm.
2. Khung **Số hợp đồng nhận dạng được** hiển thị riêng, có số đề xuất, trang và chữ nguồn OCR.
3. Đối chiếu với PDF, sửa ký tự nếu cần, rồi bấm **Điền số hợp đồng**. Nếu ô đã có số, nút ghi **Thay số hợp đồng hiện có**; app không tự ghi đè.
4. Bấm Lưu hợp đồng. Vẫn có thể tích chọn số hợp đồng rồi dùng Điền các mục đã chọn cùng các trường khác.

## Các lỗi đã sửa

- Nhận mã hợp đồng ủy thác khi OCR bỏ sót nhãn ngắn Số: ở đầu dòng, với các tiền tố hợp đồng đã biết. Không lấy số từ tên tệp.
- Nhận mã IWC khi dấu gạch nối giữa năm và số thứ tự bị OCR đọc thành dấu „ hoặc biến thể tương tự. Khung đề xuất ghi rõ đã chuẩn hóa dấu và giữ chữ OCR gốc để đối chiếu.
- Ưu tiên số trên trang đầu, tránh lấy số hợp đồng được nhắc ở các phụ lục phía sau. Không dùng số Purchase Acknowledge thay cho toàn bộ mã hợp đồng IWC, không lấy số tàu, khối lượng hoặc dòng chân trang làm số hợp đồng.
- Giữ chữ Đ nếu chữ OCR đã có Đ, thay vì tự bỏ dấu trong giá trị điền. Giao diện cho sửa số đề xuất trước khi điền vào ô.

## Đã kiểm tra và giới hạn

Đã chạy đúng OCR Windows đang đi kèm app trên trang đầu của bốn PDF mới do người dùng cung cấp, xem hình trang PDF để đối chiếu, rồi đưa kết quả OCR thật qua phần đề xuất và thao tác điền bằng bộ kiểm tra giao diện. Hai mẫu OA nhận đúng mã hợp đồng sau xử lý dấu phân cách. Hai mẫu ủy thác đã nhận đầy đủ cấu trúc mã và số nhưng OCR en-US còn đọc ĐN thành DN: cần sửa Đ/D trong ô đề xuất trước khi điền. Bản này không tự đoán Đ thay cho mọi chữ D trong mã hợp đồng.

77 kiểm thử tự động đạt, gồm nhận số mất nhãn, dấu phân cách OCR, giữ chữ Đ, thứ tự trang và thao tác điền/thay số trong biểu mẫu. Kiểm tra cú pháp đạt; bộ kiểm tra chất lượng HAK còn một cảnh báo về độ dài tệp pages.js. Chưa kiểm tra tương tác trực tiếp trong trình duyệt trên máy người dùng. Bộ cài được kiểm tra giải nén và đối chiếu tệp; chưa cài đè lên dữ liệu thật. PDF mẫu và chữ OCR riêng nằm ngoài mã nguồn/bộ cài. Mã nguồn đóng gói cục bộ, chưa đẩy lên GitHub.

Các chức năng danh mục hàng hóa, đơn giá hợp đồng, tỷ giá và giá trị chứng thư của bản 2.9.3 được giữ lại. Dữ liệu hợp đồng và PDF đã lưu không cần nhập lại; chạy Đọc bằng OCR Windows lại để lấy đề xuất mới.
