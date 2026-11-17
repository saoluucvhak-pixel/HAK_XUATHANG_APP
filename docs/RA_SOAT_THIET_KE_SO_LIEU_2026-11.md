# Rà soát giao diện, số liệu, mã nguồn (17/11/2026, v2.20.2)

Tiêu chí lấy từ các repo HAK: `HAK-Enterprise-Design-System` (V10.4 QA), `HAK_ACCOUNTING_REPORT_STANDARD` (khung báo cáo, chính sách số thập phân), `HAK_AI_SKILLS` (hak-ui-designer, hak-code-auditor, hak-data-integrity).

## Giao diện (hak-ui-designer / Design System V10.4)
| Kiểm tra | Cách đo | Kết quả |
|---|---|---|
| Không tràn ngang ở 1366×768, 1920×1080, điện thoại 390×844 | 10 trang × 3 kích thước | Đạt, không phần tử nào ngoài khung nhìn |
| Chữ đạt tương phản WCAG AA (4,5:1; 3:1 chữ lớn) | 4 chủ đề × sáng/tối × 10 trang (80 màn) | **Trước sửa: 86 vi phạm** (nút viền Bootstrap ở chế độ tối ≈ 3,2–3,8:1; chữ vàng "chưa nạp Excel" 1,55:1; nút chính chế độ tối chữ trắng trên nền vàng nhạt 1,7:1; liên kết xanh mặc định 4,06:1). **Sau sửa: 0** |
| Nút / ô nhập có nhãn truy cập | Quét toàn bộ trang | 1 ô thiếu (`#vehPick`) — đã thêm `aria-label` |
| Bàn phím: thứ tự Tab và viền tiêu điểm | Tab qua 5 trang | Đạt (ô giờ báo thiếu viền chỉ ở một ô con khi chạy tự động Chromium; đo bằng `focus()` và Tab đầu tiên đều có viền) |
| Lỗi script | Mọi trang | 0 |

Đã sửa bằng CSS (không đổi logic): `app/css/hak-enterprise-theme.css` (biến thể nút viền / chữ ngữ cảnh / liên kết / nút chính / tab đang chọn cho từng chế độ). Kiểm tra tự động giữ lại: `npm run ui-audit` (110 màn hình, chạy trong CI).

Còn lại (nhỏ): một số vùng bấm < 24 px (ô chọn 15×15 ở "chọn tất cả" trong Chứng từ, công tắc phạm vi 29×15, liên kết trong câu). Chưa sửa vì ảnh hưởng bố cục; cân nhắc tăng vùng bấm.

## Số liệu (HAK_ACCOUNTING_REPORT_STANDARD)
- Làm tròn half-up: so với phép tính số nguyên chính xác trên 300.001 giá trị kg (0 … 300.000), **0 sai lệch**.
- Không làm tròn trước khi tổng hợp: tổng tính từ kg gốc, làm tròn một lần khi hiển thị.
- Excel / Word / PDF / BKLS dùng cùng một hàm lọc dòng (`filterRows`) và cùng tham số → cùng tập dòng.
- Tiền tệ: USD làm tròn xu, VND nguyên đồng, không giả định USD luôn có phần thập phân.
- Nhận định: bộ định dạng BigInt của chuẩn kế toán chỉ dùng cho giá trị vượt giới hạn chính xác của JavaScript (> 9×10¹⁵); số liệu xuất hàng nằm xa dưới ngưỡng này nên chưa cần tích hợp.
- Cộng được theo khoảng ngày (báo cáo theo ngày cân): 4.000 kịch bản ngẫu nhiên, tổng các tháng = tổng kỳ.

## Mã nguồn (hak-code-auditor)
- Lint, 359 test, định dạng Prettier, quality gate: đạt. Phụ thuộc: `npm audit` 0 lỗ hổng.
- Chèn mã (XSS): thử động bằng file Excel chứa `<img onerror>` / `<svg onload>` trong số phiếu, biển số, ghi chú, tài xế → duyệt Nhập liệu, Tổng quan, Xuất khẩu, Chứng từ, Báo cáo, Lưu trữ, Tìm kiếm: **không chạy**.
- Thư viện: SheetJS 0.20.3, JSZip 3.10.2, Bootstrap 5.3.8, jsPDF 4.2.1 (bản mới).

## Đề xuất (chưa làm)
1. **Content-Security-Policy**: chưa có. App chỉ 1 script nội tuyến và không dùng sự kiện nội tuyến nên áp dụng được, nhưng cần `worker-src blob:`, `connect-src http://127.0.0.1:31879 https://script.google.com https://script.googleusercontent.com`, `font-src data:`, `img-src data: blob:` và phải thử đủ luồng xuất Word / PDF / Excel trên máy thật trước khi bật (CSP trong thẻ meta không có chế độ chỉ-báo-cáo).
2. Mật khẩu tối thiểu 8 ký tự (hiện 6).
3. Tăng vùng bấm nhỏ nêu trên.
