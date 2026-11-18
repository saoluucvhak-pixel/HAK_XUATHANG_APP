# Nghiệm thu bộ cài v2.22.2

Kế thừa mã ứng dụng và các bản vá SQLite v2.22.1. Đợt nghiệm thu bộ cài v2.22.1 phát hiện ghi đè tệp Word bị từ chối có thể dừng giữa chừng; thư mục có một phần tệp mới nhưng trình gỡ/lối tắt còn cũ. Vì vậy không kết luận nghiệm thu toàn bộ từ 519 kiểm thử ứng dụng và 27 ca xuất báo cáo.

## Thay đổi

- Chuẩn bị đầy đủ chương trình và trình gỡ trong thư mục tạm riêng theo tiến trình, cạnh thư mục cài.
- Khi chuẩn bị thành công mới đổi thư mục cũ sang `.previous-v<phiên bản>-<tiến trình>` rồi đổi thư mục mới về đường dẫn cài hiện tại. Đường dẫn app không đổi nên hồ sơ IndexedDB cũ giữ cùng địa chỉ; SQLite tiếp tục ở ngoài thư mục chương trình.
- Nếu đổi sang bản mới thất bại thì đổi thư mục cũ về. Chỉ xóa thư mục tạm do chính tiến trình vừa tạo; không xóa bản cũ hoặc tệp người dùng tự thêm.
- Lỗi cài/gỡ trả mã khác 0. Gỡ còn tệp chương trình thì giữ trình gỡ, script dừng helper và đăng ký Apps & features để có thể thử lại.
- Apps & features có số phiên bản và đường dẫn gỡ được đặt trong dấu ngoặc kép.
- Dấu nhận diện nhỏ `.hak-installation` được giữ sau gỡ để cài lại đúng thư mục có tệp người dùng còn lại; bộ cài từ chối thay cả một thư mục không nhận diện được là HAK.

## Kiểm thử bắt buộc trong workflow bộ cài

`installer/test-setup.ps1` chạy trên Windows bằng chính EXE vừa dựng, trước bước tải artifact/công bố Release:

1. Cài mới: kiểm phiên bản, native SQLite, lối tắt, đăng ký và loại tệp phát triển/khôi phục.
2. Cài đè: bản mới đầy đủ, tệp người dùng tự thêm còn trong bản cũ được giữ lại.
3. Đích là một tệp có sẵn: cài đặt thất bại với mã khác 0; tệp đó và đăng ký chương trình trước đó không đổi.
4. Gỡ: không còn index/native và đăng ký; dữ liệu mẫu ngoài thư mục app không đổi SHA-256.
5. Cài lại: đầy đủ chương trình, lối tắt và dữ liệu mẫu vẫn giữ nguyên.

Bộ thử dùng thư mục tạm GUID riêng và sao lưu/khôi phục đăng ký/lối tắt. Mặc định từ chối chạy nếu phát hiện bản HAK đã đăng ký trên máy thật; cờ `-AllowExistingInstall` chỉ dùng khi đã chủ động chấp nhận kiểm thử có sao lưu.

## Hướng dẫn triển khai

Sao lưu toàn bộ trước nâng cấp; giữ nguyên đường dẫn cài đang dùng. Sau nâng cấp, thư mục `.previous-v...` là bản chương trình cũ, không phải bản sao SQLite. Không tự xóa thư mục này trước khi đối chiếu dữ liệu và chứng từ. Chứng thư ký số, OCR với chứng từ thực và hộp lưu Windows vẫn cần xác minh riêng; không thay đổi phạm vi đã nêu trong biên bản v2.22.1.
