# Bản 2.13.0 — OCR đọc đúng khối lượng, đơn giá, tàu, hàng, ngày và địa chỉ

OCR hợp đồng / chứng thư trước đây bỏ sót nhiều ô vì chữ OCR thật bị lỗi: mất dấu, dính chữ (`MVMCQUEENV.26053HJ`, `ngay25/5/2026den ngay30/5/2026`), dấu nháy lạc (`TU'OI`), số bị tách (`USD17 4.00`, `23.789, 17`), chữ `o` thay số 0 (`6,00o`), nhãn và số nằm ở hai dòng. Bộ đọc mới (`js/doc-extract.js`) chịu được các lỗi này.

**Thêm hợp đồng** (Danh mục → ＋ Thêm → đính kèm PDF → Đọc bằng OCR Windows)
- **KL hợp đồng (BDMT):** cộng các lô (vd 9.000 + 9.000 = 18.000; 6.000 + 12.000 = 18.000), nhận cả dòng "Số lượng là: 6.500 BDMT", "QUANTITY 20,000.00BDMT"; không lấy nhầm số trong điều kiện kỹ thuật (4.000bdmt…).
- **Đơn giá + tiền tệ:** "USD176.00 per bone dry metric ton", "USD17 4.00" (= 174), "173,00 USD/BDMT", "UNIT PRICE USD 173.00/BDMT"; loại phí ủy thác, phạt, demurrage, phí giám định.
- **Số hợp đồng, ngày ký** ("Date: 27-July 2026", "lập vào ngày 26 tháng 06 năm 2026"), **tên hàng** (bỏ chữ "Product :"), **địa chỉ** bên bán / bên mua; hợp đồng ủy thác nhận đúng bên ủy thác / bên nhận ủy thác.

**Thêm thực hiện** (đính kèm chứng thư giám định)
- **Tên tàu** `M/V MCQUEEN V.26053HJ`, **tên hàng** (`Dăm gỗ keo`), **Ngày cân từ / đến** (từ "Thời gian giám định: Từ ngày … đến ngày …"), KL tươi / khô, độ ẩm, số + ngày chứng thư.
- **Bên giao / bên nhận** kèm **địa chỉ khách hàng** (dòng dưới tên bên). Khách hàng mới → địa chỉ điền vào ô địa chỉ; khách hàng đã có nhưng chưa có địa chỉ → tick sẵn "Địa chỉ của …" để bổ sung vào Danh mục.

**Cách điền:** các ô **đang trống** được **tự điền** và tô **vàng nhạt** (chữ OCR — đối chiếu với PDF gốc rồi mới Lưu); ô đã có dữ liệu thì không bị ghi đè, hiện dưới dạng mục để bạn tick tay rồi bấm "Điền các mục đã tick". Số hiển thị kiểu Việt (18.000; 23.789,17). Nếu OCR không đọc được đơn giá / khối lượng, app báo rõ để nhập tay.

**Giới hạn thật:** app đọc được chữ mà OCR trả về. Nếu OCR Windows bỏ hẳn một dòng (vd dòng giá in đậm + gạch chân trên bản scan) thì không đọc được và app sẽ nhắc nhập tay. Nên cài gói ngôn ngữ **Tiếng Việt** cho Windows (Settings → Time & language → Language) để OCR đọc dấu tốt hơn.

Kiểm tra: 142 kiểm thử tự động (thêm 13 kiểm thử bằng dữ liệu mô phỏng đúng kiểu lỗi OCR); chạy thử trên 6 file mẫu thật (4 hợp đồng + PO + chứng thư, gồm OCR thật từ ảnh scan) và trên giao diện thật với trình hỗ trợ OCR giả lập: hợp đồng ra KL 18.000 / giá 174 USD, chứng thư điền đủ 11 ô. Chưa thử với OCR Windows thật trên máy của bạn.
