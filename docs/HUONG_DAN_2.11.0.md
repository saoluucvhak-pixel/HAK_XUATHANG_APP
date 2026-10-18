# Bản 2.11.0 — Đóng năm ra kho file, xem riêng năm cũ

## Đóng năm
1. Lưu các hồ sơ đang sửa. Đợi app đọc xong các đợt Excel. Đăng nhập Quản trị và chọn xem tất cả công ty ở Lưu trữ.
2. Vào Sổ hồ sơ năm, chọn năm cần đóng, bấm Đóng năm ra file và dọn kho.
3. Chọn nơi lưu ZIP. App đọc lại file đã ghi trên đĩa, so SHA-256 và kích thước với nội dung đã tạo. Hủy hoặc kiểm tra sai thì không dọn.
4. Sau khi kiểm tra đúng, app hiện số hồ sơ/đợt cân sẽ gỡ khỏi kho làm việc để bạn xác nhận. Thành công thì tải lại app để giải phóng dữ liệu trong RAM.

File đóng năm gồm hồ sơ năm (cả các phiên bản và PDF đã chụp trong hồ sơ), bản gốc hồ sơ Lưu trữ của năm và Excel gốc của các đợt chỉ chứa dữ liệu năm đó. Chỉ gỡ những đối tượng đã nằm trong file đã kiểm tra; dữ liệu thay đổi giữa lúc lưu và dọn sẽ chặn giao dịch. Ghi dấu vết file khôi phục trước khi dọn hai kho. Nếu dọn chưa hoàn tất, dấu vết báo trạng thái đang dở, file ZIP vẫn chứa bản khôi phục. Hai kho riêng không có giao dịch chung: lỗi ở kho sau có thể đã dọn kho trước, nhưng dữ liệu đã nằm trong file kiểm chứng.

Đợt lẫn nhiều năm, ngày cân không rõ, chưa đọc được hoặc đợt có liên kết chuyển đổi được giữ lại. Danh mục/hợp đồng dùng chung, PDF trong danh mục và nhật ký số chứng từ giữ nguyên để không làm đứt liên kết hoặc mất cảnh báo trùng. Những phần giữ lại vẫn có thể chiếm bộ nhớ; không cam kết tốc độ máy khi chưa đo dữ liệu thực tế.

## Xem năm cũ
Sổ hồ sơ năm → chọn năm → Chọn file để xem, hoặc Mở file năm cũ (chỉ xem) → chọn ZIP/JSON. App chỉ giải nén file được chọn trong phiên; không tự nhập lại vào IndexedDB và không quét toàn bộ các năm. Có thể mở hồ sơ, xuất lại Word/Excel/PDF/BKLS, tải PDF kèm theo và Excel gốc trong file năm. Đổi file hoặc về kho làm việc giải phóng chế độ xem năm trước. Biểu mẫu chỉ xem không cho ghi hồ sơ/nhật ký mới. Nếu cần sửa, dùng Khôi phục năm để gộp hồ sơ vào kho làm việc; file gốc vẫn giữ nguyên.

Giữ file ZIP ở nơi an toàn. Danh sách trong app chỉ giữ đường dẫn, mã kiểm tra và số lượng, không giữ bản sao nội dung năm đã dọn. Sao lưu toàn bộ sau khi đóng cũng không tự chép các ZIP năm bên ngoài: cần giữ/chuyển các ZIP đó riêng. File sai checksum được từ chối khi mở theo dấu vết.

Kho năm đang làm việc giữ nguyên schema cũ; chưa tách IndexedDB theo từng năm. Giảm tải nhờ gỡ hồ sơ và đợt cân đã đóng khỏi dữ liệu nạp khi khởi động. File lớn vượt khả năng truyền của tiện ích sẽ báo lỗi, không dọn.

## Kiểm tra
107 kiểm thử đạt, gồm ZIP thật mở lại, Hủy, checksum sai, dữ liệu thay đổi, giao dịch thất bại, dọn archive nguyên tử và chế độ xem không nhập lại dữ liệu. Biên dịch tiện ích Windows đạt; đối chiếu SHA/kích thước bằng file mẫu cục bộ đạt. Kiểm tra HAK Quality còn một cảnh báo pages.js dài. Chưa kiểm tra trực quan hoặc đo hiệu năng trên dữ liệu thật của người dùng; chưa chạy đóng/dọn dữ liệu sản xuất. Bộ cài được giải nén và đối chiếu payload.
