# Bản 2.14.0 — Tờ khai hải quan, khai bổ sung, giấy nộp tiền, trạng thái hợp đồng

**Danh mục → tab 🛃 Tờ khai hải quan** (tab mới). Cấu trúc cha – con:

| Bảng | Nội dung |
|---|---|
| **Tờ khai hải quan** (cha) | Số tờ khai, **ngày mở tờ khai**, **lần khai**, loại hình, hợp đồng + đợt thực hiện, tàu, hàng, KL, trị giá hóa đơn, tỷ giá, **thuế xuất khẩu phải nộp**, **trạng thái** |
| **Khai bổ sung** (con) | Số tờ khai bổ sung, ngày, lần, lý do, KL và thuế xuất khẩu sau bổ sung |
| **Giấy nộp tiền** (con) | Số giấy, ngày nộp, loại (Thuế xuất khẩu / Lệ phí), nội dung, số tiền |

**Trạng thái tờ khai:** Đã mở tờ khai → Chờ thông quan → Đã thông quan. Đổi ngay ở cột Trạng thái hoặc ở khung chi tiết bên dưới; app lưu ngày của từng trạng thái.

**Trạng thái hợp đồng:** cột mới "Trạng thái" ở bảng hợp đồng. Hợp đồng là **Đang thực hiện**; khi **mọi tờ khai** của hợp đồng đã **Đã thông quan** thì tự chuyển **Đã hoàn thành** (app báo bằng thông báo). Tờ khai đã xóa không tính; hợp đồng chưa có tờ khai nào vẫn là Đang thực hiện. Nếu thêm tờ khai mới chưa thông quan, hợp đồng quay lại Đang thực hiện.

**Thuế xuất khẩu:** phải nộp = thuế của khai bổ sung **mới nhất** (nếu có), nếu không thì thuế tờ khai gốc. Đã nộp = tổng giấy nộp tiền loại "Thuế xuất khẩu"; lệ phí (vd lệ phí mở tờ khai 20.000 đ) tính riêng. Còn phải nộp = phải nộp − đã nộp.

**Nhập nhanh**
- **⬆ Nhập tờ khai từ file:** file `.xls/.xlsx` "Bản xác nhận nội dung tờ khai" (chọn nhiều file một lần). App đọc đủ số tờ khai, ngày mở, loại hình, tàu, vận đơn, hàng, HS, KL, đơn giá, trị giá, tỷ giá, thuế suất, thuế phải nộp, số chứng thư (trong ô ghi chú). Tự gắn hợp đồng + đợt thực hiện khi **trùng tên tàu** hoặc **trùng số TKHQ** đã nhập ở đợt thực hiện; đợt đã có tờ khai khác thì chỉ gắn hợp đồng.
- **⬆ Nhập khai bổ sung từ file** (ở khung chi tiết): đọc file tờ khai bổ sung, mở sẵn biểu mẫu để kiểm tra rồi Lưu.
- **🔎 Đọc tờ khai bằng OCR** (PDF hoặc ảnh chụp) và **🧾 Đọc giấy nộp tiền (OCR)**: OCR Windows đọc, app hiện bản đề xuất tô vàng để đối chiếu rồi mới Lưu. Giấy nộp tiền: mỗi dòng (số tờ khai + số tiền) được gắn vào tờ khai trùng số; số lệch 1–2 chữ số được gợi ý kèm nhắc kiểm tra; chưa có tờ khai thì chọn "＋ Tạo tờ khai …". Nhập lại cùng giấy không bị nhân đôi dòng.
- HAKDocs.exe nay đọc được cả **ảnh JPG / PNG / BMP**, không chỉ PDF. Cần cài lại bộ setup để có bản mới.

**Đợt thực hiện hợp đồng:** form có mục **Tờ khai hải quan** — chọn tờ khai thì ô Số TKHQ tự điền, hiện ngày mở tờ khai, lần khai, thuế xuất khẩu phải nộp / đã nộp / còn lại. Bảng các đợt thực hiện thêm cột Ngày mở TK, Lần khai, Thuế XK phải nộp, TT tờ khai.

**Báo cáo → 🛃 Tình hình khai hải quan và nộp thuế:** số tờ khai theo trạng thái, thuế phải nộp / đã nộp / còn phải nộp, lệ phí đã nộp, từng tờ khai kèm trạng thái hợp đồng. Lọc theo ngày mở tờ khai cùng bộ lọc năm / ngày của trang; **📊 Xuất Excel** gồm 3 sheet: Tờ khai, Khai bổ sung, Giấy nộp tiền.

**Dữ liệu:** nằm trong Danh mục nên đi theo **Sao lưu toàn bộ**, nhập bản sao lưu (gộp theo số tờ khai, bảng con gộp theo mã dòng), Lưu trữ năm.

**Giới hạn thật**
- Chưa thử OCR Windows thật trên ảnh chụp giấy nộp tiền: ảnh chụp nghiêng, mờ hoặc bị dấu mộc đè dễ đọc sai số. Luôn đối chiếu với giấy gốc; app không lưu ảnh, chỉ lưu số liệu.
- Hai file mẫu `…701721` và `…701722` cùng ngày mở nhưng khác số lượng và thuế (551.696.640 và 563.502.948); giấy nộp tiền mẫu ghi `…701720`. App đọc đúng như trên file / ảnh và không tự coi tờ khai nào là bổ sung của tờ khai nào: nếu 722 là khai bổ sung của 721 thì chọn tờ khai 721 → Nhập khai bổ sung từ file (rồi xóa tờ khai 722 độc lập).

Kiểm tra: 153 kiểm thử tự động (11 kiểm thử mới cho đọc tờ khai, giấy nộp tiền, thuế, trạng thái hợp đồng, gộp sao lưu); chạy thử trên giao diện thật với 2 file .xls mẫu: nhập 2 tờ khai tự gắn hợp đồng theo tàu, OCR giấy nộp tiền (giả lập), đổi trạng thái → hợp đồng "Đã hoàn thành", báo cáo.
