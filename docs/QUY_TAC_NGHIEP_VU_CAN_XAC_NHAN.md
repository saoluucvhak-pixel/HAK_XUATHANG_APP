# Quy tắc nghiệp vụ cần xác nhận (rà soát logic số liệu — bản chưa phát hành)

Các quy tắc dưới đây đã được **suy ra từ mã nguồn / tài liệu hiện có** để app chạy nhất quán; chưa có tài liệu nghiệp vụ chính thức. Cần người phụ trách xác nhận.

1. **"Hoàn thành" của hợp đồng.** Tài liệu (HUONG_DAN_2.14.0) chỉ định nghĩa điều kiện *thông quan* (mọi tờ khai đã thông quan). App nay hiển thị 4 trạng thái riêng
   (tiến độ · thông quan · thuế · thực giao). Nhãn cũ "Đã hoàn thành" đổi thành "Đã thông quan đủ tờ khai" (tự động) và "Đã đóng hợp đồng" (người dùng bấm).
   Cần quyết định: hợp đồng *thật sự hoàn thành* khi nào — đủ KL theo chứng thư? đã giao đủ (thực giao ≥ KL)? đã nộp đủ thuế? hay chỉ khi người dùng đóng?
2. **Nhận diện phiếu cân trùng.** Phiếu = công ty + số phiếu + ngày cân + biển số (có số phiếu); không có số → công ty + ngày + giờ cân 1 + biển số; thiếu cả hai → không nhận diện, luôn tính.
   Cần xác nhận: số phiếu có lặp lại theo ngày / theo trạm cân không? Có trường "nguồn cân / trạm cân" riêng nào không (app chưa lưu)? Nếu có, nên đưa vào khóa nhận diện.
3. **Xung đột phiếu.** Khác khối lượng / cờ xe trả về / liên kết hợp đồng + tàu → tính tạm theo hồ sơ mới nhất, báo "chờ đối soát". Cần xác nhận hồ sơ nào được coi là đúng khi chưa đối soát.
4. **Cùng phiếu đi qua nhiều nghiệp vụ** (kho gửi → xuất khẩu / ủy thác): số theo từng loại vẫn tính đủ; "tổng thực giao" loại trùng giữa các loại. Cần xác nhận cách báo cáo mong muốn.
5. **Sai số BDMT ≈ MT × (1 − độ ẩm/100).** Suy ra từ cách làm tròn trong generator.js: ±0,01 tấn + MT × 5e-7. Chỉ cảnh báo + xác nhận, không chặn lưu. Cần xác nhận sai số chính thức (hoặc quy định của đơn vị giám định).
6. **Thuế.** Còn nợ và nộp thừa cộng riêng từng tờ khai (không bù trừ); tờ khai không có thuế gốc / bổ sung → "chưa xác định nghĩa vụ"; lệ phí tách riêng. Khai bổ sung mới nhất chưa có số thuế → cảnh báo (tính theo lần có số thuế gần nhất).
   Cần xác nhận: nộp thừa của tờ khai này có được bù cho tờ khai khác của cùng hợp đồng / doanh nghiệp không (nếu có thì cần số liệu bù trừ chính thức từ cơ quan thuế).
7. **Giấy nộp tiền trùng.** Cùng giấy (số giấy hoặc số tham chiếu) + cùng loại + cùng số tiền + không khác NDKT / chương / ĐBHC / kỳ thuế → coi là cùng khoản. Cần xác nhận mã nào bắt buộc để phân biệt hai khoản cùng số tiền trong một giấy.
8. **Chứng từ cũ.** Bản chụp số liệu chứng thư lưu trong hồ sơ Lưu trữ (params.certSnap); mở / in lại chứng từ dùng giá trị đã lưu, không đọc lại Danh mục.
9. **Gộp trạng thái đóng hợp đồng.** Phiên bản đóng (closeRev) cao hơn thắng; cùng phiên bản mà khác trạng thái (hai máy cùng sửa) → lấy bản có ngày đóng / mở lại muộn hơn, hòa thì giữ bản trên máy nhận. Cần xác nhận cách xử lý xung đột này.
