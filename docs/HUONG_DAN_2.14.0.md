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

**Cập nhật 2.14.1 — giấy nộp tiền mẫu mới:** OCR đọc thêm Số giấy nộp tiền (vd 6753554), Mã hiệu (262021301A), Số tham chiếu (20 chữ số), Người nộp thuế, Kỳ thuế / ngày quyết định, Mã chương (754), Mã NDKT (1851), Mã ĐBHC (48TTT). Số tiền lấy cột Số tiền VND. Giấy không ghi số tờ khai thì dòng nộp tự gắn tờ khai bạn đang mở (đổi được trong ô "Gắn vào tờ khai"). Ô nào OCR không đọc được thì để trống để nhập tay.

**Cập nhật 2.14.4 — gợi ý khai bổ sung:** khi hai tờ khai cùng số vận đơn (vd …721 và …722), tờ khai số lớn hơn hiện nút **Chuyển thành khai bổ sung của …721**. Sau khi chuyển: thuế phải nộp lấy theo lần bổ sung, chênh lệch hiện bên cạnh (vd +11.806.308), giấy nộp tiền đã gắn được chuyển sang tờ khai gốc.

**Cập nhật 2.14.7 — báo cáo tình hình thực hiện hợp đồng:** Báo cáo tổng hợp → 📑 Tình hình thực hiện hợp đồng. Mỗi hợp đồng một dòng: KL hợp đồng, KL thực hiện (BDMT), % và KL còn lại, giá trị USD, số chứng thư, số tờ khai / đã thông quan, thuế xuất khẩu phải nộp, đã nộp thuế, lệ phí đã nộp, còn phải nộp, trạng thái (Đang thực hiện / Đã hoàn thành). Dòng nhỏ bên dưới là từng đợt: tàu, chứng thư (số, ngày), KL, tờ khai và trạng thái, thuế, lệ phí. Tờ khai gắn hợp đồng mà chưa gắn đợt hiện thành dòng riêng. "Còn phải nộp" âm nghĩa là đã nộp nhiều hơn số phải nộp. Lọc theo ngày ký hợp đồng và trạng thái; **📊 Xuất Excel** có sheet Hợp đồng và sheet Chi tiết thực hiện.

**Cập nhật 2.14.8 — bộ lọc smart và PDF:** tab Tờ khai hải quan và hai báo cáo (Tình hình thực hiện hợp đồng; Tình hình khai hải quan và nộp thuế) dùng bộ lọc smart như các màn hình khác (ô tìm không dấu, bộ lọc nhanh, bộ lọc nâng cao, lưu bộ lọc). Nút **🖨️ Tải PDF** dựng bản in A4 ngang đúng phần đang lọc rồi mở hộp thoại in: chọn máy in "Lưu dưới dạng PDF", nên tắt "Đầu trang và chân trang". Excel và PDF cùng xuất phần đang lọc. Bộ lọc năm / ngày ở đầu trang Báo cáo không còn áp cho hai báo cáo này; dùng khoảng ngày trong chính bộ lọc của từng báo cáo.

**Cập nhật 2.15.0 — trang "Tình hình hợp đồng" (theo phiếu cân):** menu **📑 Tình hình hợp đồng** nằm ngay dưới Báo cáo tổng hợp (báo cáo tổng hợp và hai báo cáo hợp đồng / khai hải quan trong đó vẫn giữ nguyên). Trang lấy phiếu cân từ các hồ sơ đã xuất trong 🗄️ Lưu trữ (Xuất khẩu, Ủy thác, Xuất bán, Trao đổi) có gắn hợp đồng:
- Mỗi hợp đồng một dòng: số hồ sơ, **số chuyến xe**, KL qua cân, xe trả về, **thực giao**, **kho xuất**, tàu, thời gian cân, chênh lệch MT chứng thư − thực giao, chứng thư, tờ khai đã thông quan, thuế phải nộp / còn phải nộp, trạng thái. Dòng nhỏ bên dưới là từng đợt thực hiện.
- **Bấm vào một dòng** (hợp đồng hoặc đợt) để xem **chi tiết xuất hàng từng xe**: ngày, giờ cân 1 / 2, số phiếu, biển số, tài xế, đơn vị vận chuyển, kho xuất, KL, hồ sơ, xe trả về (tô vàng), số BKLS. Có **bộ lọc smart** (tìm không dấu, biển số, đơn vị vận chuyển, tài xế, kho xuất, hồ sơ, khoảng ngày, chỉ xe trả về); **Xuất Excel** và **Tải PDF** đúng phần đang xem.
- Hồ sơ cân chưa gắn được hợp đồng hiện ở dòng "(chưa gắn hợp đồng)" kèm cảnh báo.

**Gắn đợt giao hàng vào hợp đồng (2.15.0):** hợp đồng có trước, giao hàng sau; gắn một đợt giao hàng (một lần tải phiếu cân / lập phiếu xuất kho, có thể kéo dài nhiều ngày) vào hợp đồng chính là **thực hiện hợp đồng**.
- Vào **📑 Tình hình hợp đồng**: khung **📥 Đợt giao hàng chưa gắn hợp đồng** hiện sẵn các đợt (hình thức, hồ sơ, tàu, từ ngày → đến ngày, số xe, tấn, kho xuất). Tick một hoặc nhiều đợt cùng hình thức → **Gắn … vào hợp đồng…** → chọn hợp đồng. Hoặc bấm **＋ Gắn đợt** ngay ở dòng hợp đồng.
- **Điều kiện gắn:** hợp đồng **Xuất khẩu** và **Ủy thác XK** phải có **tàu** và **tờ khai hải quan** trước (chưa có tờ khai thì chưa thực hiện được hợp đồng) — hợp đồng còn thiếu hiện mờ kèm "thiếu: tàu + tờ khai hải quan". Hợp đồng **Xuất bán** và **Trao đổi** không cần tàu, tờ khai (chưa có chi tiết thì app tự tạo chi tiết trống).
- **Gỡ:** mở chi tiết hợp đồng → bảng "Các đợt giao hàng của hợp đồng" → **Gỡ khỏi hợp đồng**.
- Trung chuyển / điều chuyển (chưa bán) **không gắn hợp đồng**, không tính vào thực giao.
- Ở trang **Tạo biên bản**, ô "Chọn dòng chi tiết hợp đồng" cũng khóa hợp đồng Xuất khẩu / Ủy thác chưa đủ tàu + tờ khai.
