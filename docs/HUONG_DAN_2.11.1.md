# Bản 2.11.1 — Sửa luồng tạo biên bản/BKLS

Người dùng báo dừng ở Đang tạo trước bước lưu. Đã xử lý những điểm có thể làm giao diện đứng: điền/đóng gói mẫu Word chuyển sang Web Worker, không chặn luồng giao diện; quá 90 giây sẽ dừng worker và báo cách thu hẹp dữ liệu/kiểm tra mẫu. Worker nhúng đủ thư viện và XML DOM để dùng offline từ file, không tải mạng.

BKLS mẫu mới báo tiến độ theo xe, nhường giao diện mỗi 5 xe, kiểm tra giới hạn 200 xe trước khi đọc mẫu. Mẫu hiện hành nhường luồng mỗi 10 xe khi ghép Word. PDF từng xe chặn trên 100 xe mỗi lần trước khi dựng bản in; dùng lọc ngày để chia đợt hoặc chọn Word (mẫu mới vẫn tối đa 200 xe).

Nạp thư viện có hạn chờ 15 giây và cho thử lại. Hộp chọn nơi lưu Windows có cửa sổ chủ đưa ra trước; bỏ màn chờ che app khi chờ chọn nơi lưu. Yêu cầu lưu quá 3 phút báo rõ; nếu hộp Lưu thành vẫn mở hãy đóng trước khi thử lại.

111 kiểm thử đạt. Worker thật xử lý mẫu 3000 dòng trong khi luồng chính vẫn phản hồi; cả 9 mẫu Word đóng gói đều dựng thành công. Kiểm tra timeout, mẫu lỗi, giải phóng worker và hồi quy đạt. Tiện ích Windows biên dịch thành công; bộ cài được giải nén đối chiếu. Chưa kiểm tra trực quan trên trình duyệt của người dùng hoặc tái hiện đúng dữ liệu đang treo; không khẳng định đã xử lý mọi nguyên nhân gây treo.

XML DOM dùng @xmldom/xmldom 0.9.12 từ mã nguồn xmldom/xmldom, lưu nguồn và SHA từng tệp tại tools/vendor/xmldom/SOURCE.json; giấy phép MIT kèm tại app/libs/xmldom-LICENSE.txt. Chạy tools/build-docx-worker.py để tái tạo nguồn worker nhúng.
