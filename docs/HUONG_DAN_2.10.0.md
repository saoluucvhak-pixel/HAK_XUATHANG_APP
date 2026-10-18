# Bản 2.10.0 — Sổ hồ sơ theo năm

1. Chọn Năm làm việc trên thanh đầu. Năm là năm hồ sơ, không tự chia một chuyến qua hai năm.
2. Import cân và nhập thông tin bình thường. Bấm Lưu hồ sơ để lưu dù chưa xuất file. Bấm Thêm mới để bắt đầu hồ sơ khác; app hỏi trước khi thay biểu mẫu.
3. Bấm Sổ hồ sơ năm hoặc Xem năm cũ, chọn năm, bấm Mở / Sửa. Dữ liệu cân, ngày, thông số và xe trả về được mở lại không cần import Excel. Sửa xong bấm Lưu hồ sơ. Phiên bản trước được giữ trong bản sao lưu; chưa có màn hoàn tác từng phiên bản.
4. Bấm Lưu trữ trên dòng hồ sơ để ẩn sử dụng; bấm Khôi phục để dùng lại. Không xóa vĩnh viễn.
5. Hồ sơ cũ: chọn năm → Đưa bản sao hồ sơ cũ vào năm này. Năm suy từ ngày cân bắt đầu. Không sửa/xóa bản gốc. Hồ sơ cũ chưa lưu cấu hình sử dụng cấu hình tại lúc sao chép và PDF còn trong danh mục.
6. Sao lưu năm: lưu ZIP gồm hồ sơ của năm trong phạm vi công ty đang xem, dữ liệu cân, các phiên bản, cấu hình và hợp đồng/PDF liên quan đã chụp khi lưu. Khôi phục năm nhận ZIP/JSON, kiểm tra trước khi ghi, gộp và giữ phiên bản mới hơn; cùng phiên bản khác nội dung thì dừng. Không thay danh mục đang hoạt động bằng thông tin cũ. Danh mục chưa gắn hồ sơ và dữ liệu import chưa lưu không thuộc bản sao năm. Sao lưu toàn bộ cũng bổ sung sổ năm.
7. PDF kèm theo trên dòng hồ sơ cho tải lại các PDF đã lưu trong hồ sơ. Chọn hợp đồng trước khi lưu hồ sơ lần đầu để chụp liên kết; khi mở lại, hợp đồng được giữ cố định, có thể sửa thông số chứng từ. Để dùng hợp đồng khác hãy Thêm mới.

Dữ liệu lưu trong IndexedDB của trình duyệt hiện dùng, giữ cùng đường dẫn app và trình duyệt khi nâng cấp. Sổ năm cần IndexedDB; lỗi ghi sẽ báo, không thay bằng RAM rồi báo đã lưu. Nên sao lưu năm ra file định kỳ và trước khi chuyển máy.

Kiểm tra: 98 kiểm thử tự động đạt, cú pháp/asset đạt. Kiểm tra HAK Quality có 1 cảnh báo cũ pages.js dài. Chưa xác nhận trực quan trên máy người dùng hoặc cài nâng cấp thật; bộ cài chỉ được giải nén kiểm chứng an toàn, không động tới dữ liệu đang dùng.
