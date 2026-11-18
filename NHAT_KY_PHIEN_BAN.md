# Nhật ký thay đổi — App "Quản lý xuất hàng" (hak-bienban)

## v2.22.5 — Rà soát vòng 3: đóng năm bị ngắt, cảnh báo nhập Excel, thông báo lỗi, kiểm tra toàn vẹn
- **Đóng năm:** đóng lại cùng năm sau khi lần trước bị ngắt (bấm "Đóng năm" thay vì "Tiếp tục đóng năm") không còn để biên nhận "đang dở" của lần trước tồn tại mãi (năm vẫn hiện "đang dở" dù đã đóng xong); biên nhận cũ được giữ làm bằng chứng và ghi bị lần nào thay thế. Kiểm cả IndexedDB và SQLite.
- **Nhập tờ khai từ Excel / khai bổ sung từ Excel:** cảnh báo của bộ đọc (ô thuế dạng ngoặc "(1.200)" theo quy tắc 28, thiếu số tiền thuế / ngày đăng ký) nay HIỆN ra như ở đường OCR; trước đây bị bỏ qua và chỉ báo "Đã nhập 1 tờ khai".
- **Kiểm tra mục lục ↔ nội dung hồ sơ Lưu trữ:** `HAK.Archive.verifyIndex()` (số phiếu, tổng kg, phiếu KL ≤ 0 đã loại); `HAK.Archive.remove` xuất ra để kiểm thử.
- Công cụ: `npm run e2e:archive-ops` (lưu / lưu lặp / xóa kèm lỗi giữa chừng, IndexedDB và SQLite), `npm run e2e:gsync-parity` (Google Sheet GIẢ LẬP chạy đúng Code.gs; chưa kiểm Sheet thật), `npm run e2e:import-warn`; chạy trong CI.
- **Thông báo lỗi:** thông báo lỗi THÔ của trình duyệt / JavaScript (tiếng Anh, "Cannot read properties…", khung stack, đường dẫn tệp, mã ERR_…) không còn hiện cho người dùng; thay bằng câu chung tiếng Việt, bản gốc ghi ở Console (F12). Thông báo tiếng Việt của app giữ nguyên.
- **Giao diện:** `ui-audit` kiểm thêm phần tử chỉ bấm được bằng chuột mà không vào được bằng Tab; test quét mã cho nút Hủy / Đóng và nút mặc định của form (không phá hủy).

## v2.22.4 — Rà soát vòng 2: bộ lọc, lưu trữ, khôi phục, giao diện bàn phím
- **Hộp thoại:** đóng bằng Esc hoặc nút Đóng nay TRẢ tiêu điểm về đúng nút đã mở hộp thoại (trước đây rơi về đầu trang, người dùng bàn phím mất vị trí); hộp thoại chồng nhau chỉ trả khi hộp cuối đóng. Tìm kiếm chung (Ctrl+K) cũng trả tiêu điểm khi đóng; khi đang có hộp thoại mở thì không mở chồng (trước đây tiêu điểm bị giật khỏi ô tìm, gõ nhầm ô).
- **Trạng thái hợp đồng khi đang đối chiếu phiếu cân:** lúc nguồn "chi tiết đã có phiếu cân" chưa tính xong, hợp đồng có thể đổi kết quả hiện "Đang kiểm tra…" (thay vì hiện "Đã hoàn thành" rồi đổi); không tính được thì ghi rõ "chưa đối chiếu được phiếu cân".
- **Khôi phục:** file sao lưu dùng định dạng phiên bản mới hơn bản app đang chạy bị từ chối bằng thông báo rõ (trước đây vẫn chạy và có thể khôi phục thiếu dữ liệu). Kiểm vòng tròn sao lưu → xóa → khôi phục → khôi phục lặp trên cả IndexedDB và SQLite: số liệu trước = sau, không nhân đôi.
- **Bộ lọc:** ô tìm khớp biển số theo dạng chuẩn hóa ("43C11111" tìm ra "43C-111.11") ở bộ lọc phiếu và Chi tiết xuất hàng theo HĐ; bộ lọc đã lưu tham chiếu mục đã xóa / đổi tên nay báo rõ "điều kiện hết hiệu lực" (không rò mã nội bộ).
- **Chọn phiếu / Xe trả về:** hộp dán danh sách mã phiếu phân biệt "đã LOẠI vì khối lượng ≤ 0" với "không tìm thấy".
- Công cụ: `npm run e2e:export-parity` (màn hình = Excel = Word = PDF), `npm run e2e:dialogs`; cả hai chạy trong CI.

## v2.22.3 — Rà soát số liệu: một nguồn trạng thái hợp đồng, bộ đọc số, khử trùng phiếu, báo dòng bị bỏ, xác nhận phạm vi BKLS
- **Trạng thái hợp đồng một nguồn:** "Đã hoàn thành" chỉ khi mọi tờ khai đã thông quan VÀ mọi chi tiết đã có chứng thư **hoặc phiếu cân** đều có tờ khai thông quan. Danh mục, tab Tờ khai, Báo cáo tổng hợp, Chi tiết xuất hàng theo HĐ, Báo cáo thực hiện HĐ, Hồ sơ hợp đồng, Excel / PDF và Google Sheet nay cùng lấy "chi tiết đã có phiếu cân" từ Lưu trữ (tính nền, tự cập nhật khi Lưu trữ / Danh mục / công ty đổi; lần đầu chưa tính xong thì hiện như cũ rồi tự cập nhật). Trước đây Danh mục và vài báo cáo bỏ sót phiếu cân nên báo "Đã hoàn thành" trong khi Báo cáo thực hiện HĐ báo "Đang thực hiện".
- **Bộ đọc số:** số Chứng thư đọc đúng "1,234.56" (trước đây thành 1,23456) và "1,234,567" (trước đây trống); "0.500" = 0,5 ở Chứng thư và Tờ khai. Tờ khai chưa đọc ngoặc là số âm; gặp ô dạng "(…)" thì cảnh báo. Các kết quả đã có test không đổi.
- **Đếm số xe theo biển số chuẩn hóa (quy tắc 26):** "43c-111.11", "43C 11111", "43C-111.11" là MỘT xe ở Nhập liệu, trang biên bản, Lưu trữ, Báo cáo, bản xuất và Tổng quan / Tìm kiếm chung (một khóa chuẩn hóa: bỏ hoa/thường, khoảng trắng, dấu gạch, dấu chấm, dấu tiếng Việt). Khử trùng phiếu giữa các hình thức và giữa các hồ sơ cũng dùng khóa này.
- **Phiếu khối lượng ≤ 0 (quy tắc 29):** phiếu có khối lượng hàng 0 hoặc âm KHÔNG còn được cộng vào số xe / khối lượng ở bất kỳ màn hình hay bản xuất nào (Nhập liệu, trang biên bản, Lưu trữ, Báo cáo, Chi tiết xuất hàng, Word / PDF / Excel, Google Sheet). Khi đọc file, cảnh báo nêu số phiếu và kg bị loại; hồ sơ lưu giữ danh sách (tối đa 50 phiếu) và **Báo cáo › Ngoại lệ cần đối soát** liệt kê riêng. Hồ sơ đã lưu từ trước không bị đổi.
- Hồ sơ đã lưu từ trước bản này giữ nguyên số liệu cũ (không viết lại dữ liệu lịch sử); quy tắc phiếu KL ≤ 0 áp dụng cho hồ sơ lập / lưu từ bản này.
- **Tổng quan:** khử trùng phiếu giữa các hình thức không còn phân biệt hoa/thường và khoảng trắng của biển số / số phiếu (cùng cách với Báo cáo).
- **Nhập Excel:** dòng có số phiếu / biển số nhưng không đọc được khối lượng (ô là chữ) nay được **báo kèm số dòng Excel**, không còn bị tính lẫn vào "dòng tiêu đề / chữ ký".
- **Lập BKLS:** hiện hộp xác nhận phạm vi (công ty · tàu · số phiếu · thực giao) trước khi chọn mẫu, giống Word / PDF / Excel. Dựng lại từ Lưu trữ không hỏi.
- Công cụ: `ui-audit` thêm khổ 768×1024; `npm run e2e:bkls-scope`, `npm run e2e:contract-status`; test chéo bộ đọc số và khóa nhận diện phiếu.

## v2.22.2 — Cài đè có quay lui và nghiệm thu chính bộ cài
- Giải nén đầy đủ vào thư mục tạm trước khi thay thư mục chương trình; không ghi đè từng tệp trong bản đang dùng. Giữ toàn bộ bản cũ tại thư mục `.previous-v...` cạnh thư mục cài, gồm tệp người dùng tự thêm.
- Nếu chưa thay bản mới thành công thì quay lại thư mục cũ; lỗi cài/gỡ trả mã khác 0. Gỡ chưa hết tệp thì giữ thông tin gỡ cài đặt để thử lại.
- Bổ sung DisplayVersion và đặt đường dẫn gỡ trong dấu ngoặc kép.
- Workflow thử chính bộ cài: cài mới, cài đè, giữ tệp cũ, lỗi đích không hợp lệ, gỡ và cài lại; chỉ đưa lên artifact/Release khi các bước này đạt. Dữ liệu SQLite tiếp tục nằm ngoài thư mục cài.

## v2.22.1 — Đóng năm đúng nguồn SQLite và kiểm tra trước khi phát hành
- Đóng năm và tiếp tục đóng năm dùng giao dịch SQLite khi SQLite đang là nguồn chính. Sổ hồ sơ năm, thông số đợt và file Excel gốc được kiểm tra phiên bản trước khi dọn cùng một giao dịch.
- Có thay đổi từ cửa sổ khác hoặc file cân không khớp bản ZIP thì chặn dọn, giữ dữ liệu để đối soát.
- Bổ sung kiểm thử trên SQLite cho đóng năm, sai dữ liệu và xung đột giữa hai cửa sổ.
- Bộ cài chỉ được công bố sau khi workflow HAK quality của đúng commit thành công.
- Nâng PDF.js của công cụ nghiệm thu lên 4.8.69, tắt thực thi biểu thức khi đọc PDF; cập nhật lockfile, npm audit không còn cảnh báo.
- Khôi phục và hoàn tác trên SQLite chờ máy chủ xác nhận từng khóa, kiểm tra xung đột trước khi ghi, chỉ đổi bộ đệm sau khi ghi thành công. Không ghi được bản hoàn tác thì dừng trước khi nhập; lỗi giữa chừng giữ bản chụp để thử lại.

## v2.21.4 — Bộ cài chỉ dừng HAKDocs của đúng thư mục cài; công cụ đối soát dữ liệu
- **Bộ cài:** trước đây khi cài / nâng cấp / gỡ, bộ cài dừng MỌI tiến trình `HAKDocs.exe` theo tên (`taskkill /IM`), có thể làm dừng HAKDocs của một bản cài khác trên cùng máy. Nay `installer/stop-hakdocs.ps1` chỉ dừng tiến trình HAKDocs nằm trong `<thư mục cài>\native\`; bản cài khác không bị ảnh hưởng. CI Windows kiểm bằng 3 bản giả lập (dừng a, còn nguyên b và a2).
- **Công cụ đối soát dữ liệu** `npm run audit:data` (chỉ đọc, không sửa dữ liệu): liệt kê phiếu lặp cùng phạm vi báo cáo, phiếu cùng nhận diện khác khối lượng / cờ xe trả về / liên kết, phiếu đi qua bước nghiệp vụ hợp lệ (kho gửi → hồ sơ đích), phiếu thiếu ngày / thiếu nhận diện, giấy nộp tiền nghi trùng, bản ghi mồ côi, hồ sơ không đọc được — kèm mã hồ sơ nguồn. Có bộ dữ liệu thử đủ ca (`--sample`, `--write-sample`).
- Test mới: `data-audit`, `report-reconcile` (mô hình màn hình ↔ Excel), cấu hình bộ cài. Không đổi công thức, giao diện hay cách lưu dữ liệu.

## v2.22.0 — Bản Windows lưu dữ liệu bằng SQLite (chưa phát hành)
- **Kiểm chứng trên Windows thật (CI):** `HAKDocs.exe` biên dịch bằng `csc`, bộ hợp đồng CSDL, và nghiệm thu Edge trên SQLite (27 ca) đạt. HAKDocs nhận kết nối ngay (trước đó chờ 200 ms mỗi lần); app thử lại yêu cầu đọc khi lỗi mạng tạm thời.
- **Nơi lưu:** bản Windows (có HAKDocs) có thể chuyển nguồn dữ liệu chính sang **SQLite** do HAKDocs giữ tại `%LOCALAPPDATA%\HAK_XUATHANG\data\hak.db` — nằm NGOÀI thư mục cài, không phụ thuộc trình duyệt / profile; nâng cấp và gỡ chương trình **không xóa** dữ liệu (trình gỡ nhắc đường dẫn). Bản HTML / portable (không HAKDocs) **giữ IndexedDB**. Thanh bên luôn hiện "Dữ liệu: SQLite / Trình duyệt / BỊ CHẶN".
- **Chuyển dữ liệu có đối chiếu** (Cài đặt › Chung › "Nơi lưu dữ liệu"): ① sao lưu ZIP và đọc lại để xác minh → ② chụp nhất quán → ③ nhập vào SQLite (chưa kích hoạt, chạy lặp được) → ④ đối chiếu từng bản ghi, tệp (SHA-256), tổng kg / MT / thuế / số dòng, khóa ngoại → ⑤ kích hoạt. Sai lệch báo theo mã bản ghi nguồn; dữ liệu nguồn hỏng dừng trước khi ghi. **Quay lui** về IndexedDB bất cứ lúc nào (IndexedDB cũ không bị xóa; dữ liệu phát sinh sau khi chuyển chỉ có ở SQLite — xuất bằng "Sao lưu toàn bộ" rồi "Nhập bổ sung").
- **Mất kết nối / DB bị thay sau khi đã dùng SQLite → app BỊ CHẶN** (màn hình báo lỗi), không lặng lẽ quay về IndexedDB cũ để tránh sửa nhầm nguồn.
- **Quan hệ cha–con có khóa ngoại thật** (chi tiết / phụ lục → hợp đồng; khai bổ sung / khoản nộp → tờ khai; tờ khai → hợp đồng / chi tiết; dữ liệu phiếu → hồ sơ). Bản ghi cũ mồ côi không chặn lưu: FK = NULL, ghi vào `quarantine` kèm lý do, giá trị gốc giữ nguyên. Số tờ khai trùng của dữ liệu cũ vẫn lưu được (vẫn do HAK.Integrity báo).
- **Nhật ký thao tác** (chỉ thêm, không sửa / xóa): tạo / sửa trường quan trọng (trước → sau) / ngừng dùng / khôi phục / thay liên kết / xóa, kèm người thực hiện; sự kiện chuyển nguồn / quay lui.
- **Khóa lạc quan theo phiên bản bản ghi** cho mọi ghi nhiều kho (đợt Excel, Danh mục, Sổ hồ sơ năm); cửa sổ khác ghi chen vào giữa thì giao dịch bị từ chối, không ghi dở.
- **API cục bộ** `/db/*` của HAKDocs: chỉ `127.0.0.1`, Origin `null`, mã bảo vệ, phiên mang phạm vi công ty (lọc khi đọc, chặn ghi / xóa ngoài phạm vi), giới hạn 36 MB, log không chứa bí mật; không có SQL từ trang web.
- **Hồ sơ đã xuất khi sửa phải có lý do:** Sổ hồ sơ năm hỏi lý do (bắt buộc) trước khi lưu thay đổi nội dung của hồ sơ **đã xuất**; bản cũ được giữ lại kèm trạng thái, lý do, người sửa, thời điểm. Nút **Phiên bản (n)** trong Sổ hồ sơ năm liệt kê các bản và **Xem / in lại bản này** mở đúng bản cũ ở chế độ chỉ xem (không ghi vào kho). Mọi thao tác này vào nhật ký (`HAK.Audit`, ở cả chế độ trình duyệt lẫn SQLite).
- **Giao diện:** công tắc (phạm vi dữ liệu…) đủ vùng bấm 24 px; `ui-audit` kiểm thêm vùng bấm ≥ 24 px, dấu focus khi dùng bàn phím và tiêu đề bảng cố định (kiểm tra đã được chứng minh bắt lỗi).
- Công cụ: `npm run audit:data`, `tools/e2e-sqlite.cjs` (chạy e2e hiện có trên SQLite), `tools/e2e-migrate.cjs`, `tools/bench-sqlite-backend.cjs`, `tools/hakdb/contract.cjs`. Tài liệu: `docs/SQLITE_KIEN_TRUC.md`, `docs/HUONG_DAN_SQLITE.md`, `docs/NGHIEM_THU_SQLITE.md`.
- **Chưa xác minh trên Windows thật** (xem báo cáo nghiệm thu): HAKDocs.exe (C# + winsqlite3) chưa được biên dịch / chạy ngoài CI; cài mới / nâng cấp / lối tắt / đường dẫn có dấu / Edge với SQLite.

## Chưa phát hành — Tái cấu trúc phần hải quan (chỉ tách mã, không đổi công thức / giao diện / lưu trữ)
- `customs.js` (2.618 dòng) tách thành: `customs-common.js` (truy cập dữ liệu, nhãn, bộ lọc, ô số liệu dùng chung), `customs-report.js` (báo cáo hải quan trên màn hình), `customs-contract-report.js` (báo cáo thực hiện hợp đồng + `contractReportModel`), `customs-export.js` (Excel), `customs-print.js` (`printReport`, đặc tả PDF), `customs-receipt.js` (duyệt giấy nộp tiền), `customs-import.js` (nhập Excel / OCR). `customs.js` giữ lõi ghi dữ liệu (`commit`), biểu mẫu, liên kết hợp đồng và facade `HAK.Customs` (23 hàm, giữ nguyên tên).
- Thêm `npm run e2e:customs`, `npm run snapshot:customs` (đối chiếu trước / sau), test `customs-split`. Số liệu màn hình, Excel, bản in PDF, `contractReportModel` và phạm vi công ty giống hệt trước khi tách.

## Chưa phát hành — Nghiệm thu phát hành
- Mẫu "Tiến độ hợp đồng": thêm hai cột "Trong đó" tách BDMT chi tiết ĐÃ có / CHƯA có số chứng thư (4.000 + 1.000 = 5.000); chỉ tiêu và nhãn thống nhất ở màn hình, Excel, PDF. Cách tính tổng và "Còn lại" không đổi.
- `npm run accept:release`: chế độ phát hành bắt buộc Word và PDF, đọc lại DOCX (JSZip) và PDF (pdfjs-dist) không cần công cụ ngoài nên chạy như nhau trên Windows và Linux; kiểm tra tiêu đề lặp mọi trang, đủ dòng, cột trong khổ trang; báo Đạt / Lỗi / Bỏ qua riêng. `HAK_BROWSER_CHANNEL=msedge` để dùng Edge.
- CI chạy e2e, e2e:carrier, e2e:reports và accept:release.

## v2.21.3 — Rà soát toàn vẹn cha–con
- **Sửa lỗi sai số liệu thuế khi nhập bổ sung:** cùng một giấy nộp tiền nhập ở hai máy (khác id) trước đây bị cộng đôi "đã nộp" (nộp thừa giả). Nay gộp theo giấy nộp tiền (cùng quy tắc nhận diện giấy trùng đã xác nhận); khoản thiếu số giấy mà cùng số tiền được giữ cả hai và báo "nghi trùng". Khai bổ sung cùng số cũng gộp một. Kết quả khôi phục nêu số khoản đã bỏ / nghi trùng.
- **Phiên bản hợp đồng** khi nhập bản cùng nội dung nhưng phiên bản cao hơn không còn tụt xuống dưới bản nhập (tránh xung đột giả giữa hai máy).
- **Ngừng dùng chi tiết / hợp đồng** còn tờ khai hoặc hồ sơ cân gắn vào: giữ liên kết lịch sử như cũ và nay có thông báo nêu số bản ghi cần đối soát.
- Mở rộng `HAK.Integrity.audit` (`integrity-model.js`, giữ nguyên cách gọi cũ; thêm `opts.attachmentIds` và `HAK.Integrity.relations`) + mới `tools/integrity-audit.cjs` (rà soát toàn vẹn cha–con trên file sao lưu: khóa trùng, bản ghi mồ côi, con trỏ ngừng dùng, liên kết nhầm công ty, tệp đính kèm thiếu, KL phụ lục lệch, tờ khai bổ sung trùng); `accept` kiểm 0 lỗi toàn vẹn trên sao lưu của dữ liệu thử; test hồi quy (`merge-version`, `contract-model`, `integrity-parent-child`).
- **Quy trình phát hành:** workflow `build-setup.yml` trước đây dựng lại và GHI ĐÈ file cài / SHA-256 / ghi chú của Release đã đăng mỗi khi có commit mới vào main dù số phiên bản không đổi (tag giữ commit cũ nhưng Release trỏ commit mới). Nay kiểm tra Release `v<phiên bản>` đã có thì KHÔNG đăng lại; muốn phát hành bản mới phải nâng số phiên bản.
- Quy tắc nghiệp vụ còn mơ hồ ghi ở `docs/QUY_TAC_NGHIEP_VU_CAN_XAC_NHAN.md` (mục 17–24).

## v2.21.2 — Bảng chéo kho × hình thức
- Mẫu "Phân tích theo tàu / kho / ĐVVC" có thêm bảng **Kho xuất × hình thức** (thực giao kg theo từng ô, tổng hàng / cột, tra về hồ sơ và phiếu cân), cùng tập phiếu đã xác minh với bảng nhóm nên tổng khớp; có trong màn hình, Excel (trang Tổng hợp) và PDF. Chưa có số liệu nhập kho.

## v2.21.1 — Đổi nhãn cột BDMT ở mẫu Tiến độ hợp đồng
- Mẫu báo cáo "Tiến độ hợp đồng": đổi nhãn cột "BDMT theo chứng thư" thành "BDMT theo chi tiết hợp đồng (gồm cả chi tiết chưa có chứng thư)" (và các cột còn lại / % / MT / chênh lệch đi kèm) vì số này vốn cộng mọi chi tiết, không chỉ chi tiết đã có số chứng thư. Cách tính KHÔNG đổi.

## v2.21.0 — Mẫu báo cáo
- Trang Báo cáo tổng hợp có ô **Mẫu báo cáo** với 5 mẫu: (1) Tổng hợp xuất hàng theo kỳ (ngày / tháng / quý / năm / tự chọn; nhóm theo công ty, hình thức, kho; so sánh kỳ trước cùng độ dài, có trạng thái khi kỳ gốc bằng 0 / thiếu dữ liệu); (2) Phân tích theo tàu, kho, đơn vị vận chuyển (tỷ lệ xe trả về và tỷ trọng có mẫu số, sắp xếp, Top N + "Khác"); (3) Tiến độ và đối chiếu hợp đồng (BDMT gốc / hiện hành / chứng thư, MT thực giao, còn lại; lọc thiếu chứng thư / vượt khối lượng / lệch / chưa gắn tờ khai); (4) Hải quan và công nợ thuế (công ty → hợp đồng → tờ khai; phải nộp / đã nộp / đã hoàn / còn nợ / nộp thừa / lệ phí / chưa xác định; giấy nộp tiền và khai bổ sung làm căn cứ); (5) Ngoại lệ cần đối soát.
- Mỗi mẫu dựng MỘT kết quả (`doc`, module `report-tpl.js`) dùng chung cho màn hình, Excel và PDF; tra từ dòng tổng về hồ sơ / phiếu cân / hợp đồng / giấy nộp tiền. Excel: trang Tổng hợp + Chi tiết, ô số / ngày đúng kiểu, số phiếu và số tờ khai giữ dạng văn bản. PDF: khổ giấy và cỡ chữ theo số cột, lặp tiêu đề bảng, biểu đồ cạnh bảng tổng hợp.
- Phiếu cân mang thêm đơn vị vận chuyển; mục chưa phân bổ mang công ty / kho / tàu; thêm `ContractOverview.items()`, `ContractStatus.openTrips()`.
- **Sửa lỗi P1:** chi tiết theo đơn vị vận chuyển (màn hình và Excel "tất cả tàu / đợt") đọc lại TOÀN BỘ dòng của hồ sơ nên lệch bảng tổng khi lọc theo ngày cân (hồ sơ P1 10 tấn 31/12/2025 + P2 20 tấn 01/01/2026, lọc 01/2026: tổng 20 tấn, chi tiết 30 tấn). Nay dùng đúng tập phiếu mà báo cáo tổng hợp đã chấp nhận (đúng kỳ, loại phiếu trùng / xung đột, hồ sơ đang chọn), nêu phần chưa phân bổ ở màn hình và ghi chú Excel.
- Kiểm thử: `carrier-scope.test.cjs` (7 ca), `npm run e2e:carrier`; `report-tpl.test.cjs` (17 ca) và `npm run e2e:reports`; `ui-audit` kiểm cả 5 mẫu.

## v2.20.3 (bản vá)
- Báo cáo kỳ "Ngày cân từng phiếu": hồ sơ không đọc được chi tiết và phiếu thiếu / sai ngày cân không còn bị tự dồn vào ngày bắt đầu hồ sơ; được tách thành **chưa phân bổ** (khung cảnh báo trên Báo cáo, sheet "Chưa phân bổ" và ghi chú phạm vi trong Excel). `prepareTickets` ghi lại hồ sơ đọc lỗi và nguyên nhân. Nhãn căn cứ tính trên màn hình / bản xuất theo căn cứ thực sự dùng. Xuất được Excel khi mọi hồ sơ đều chưa phân bổ. Số tấn trong cảnh báo luôn 2 số lẻ.
- Nhập liệu: đổi sheet / dòng tiêu đề / ánh xạ cột / nhận diện lại cột được đọc thử trước; có dòng trùng hoàn toàn hoặc kết quả không hợp lệ thì không áp dụng, giữ cấu hình hợp lệ gần nhất, báo sheet + số phiếu + dòng Excel (module read-config.js).
- Bảo trì: tách logic gộp đợt thành js/batch-merge.js (test gọi trực tiếp, không đọc mã nguồn); thêm .gitattributes (LF) và Prettier endOfLine "auto" để checkout Windows / Linux cho kết quả như nhau.
- Kiểm thử: report-unallocated, read-config, merge-batches (viết lại), gsync-interrupt (mất phản hồi sau khi Sheet đã ghi, gián đoạn từng trang, hợp đồng đổi phiên bản), restore-resume (khôi phục nhiều kho gián đoạn rồi thử lại); `npm run e2e` luồng xuyên màn hình hai tàu cân xen kẽ.

## v2.20.2 (bản vá)
- Giao diện: sửa tương phản WCAG AA ở cả 4 chủ đề × sáng/tối (nút viền, chữ cảnh báo vàng, nút chính chế độ tối, liên kết, tab đang chọn): 86 → 0 vi phạm trên 80 màn hình; thêm nhãn truy cập cho ô chọn danh sách xe.
- Thêm `npm run ui-audit` (tràn ngang ở 3 kích thước, tương phản, nhãn truy cập, lỗi script) và chạy trong CI; ghi kết quả rà soát vào docs/RA_SOAT_THIET_KE_SO_LIEU_2026-11.md.

## v2.20.1 (bản vá)
- Đọc số âm trong ngoặc kiểu kế toán: "(1.200)" = −1200 (trước đây mất dấu âm thành +1200).

## v2.20.0
- Hoàn thuế: thêm loại khoản "Hoàn thuế" trong bảng Giấy nộp tiền và nút "↩ Nhập hoàn thuế" (điền sẵn số nộp thừa) ở tờ khai có nộp thừa. Hoàn trừ vào số đã nộp: hoàn đủ ⇒ tờ khai tất toán ("Đã nộp đủ"); không bù trừ giữa các tờ khai; nộp thừa hiển thị "chờ hoàn thuế".
- Nạp file Excel có dòng trùng hoàn toàn (cùng số phiếu, biển số, giờ cân) bị cảnh báo và chặn, nêu số dòng Excel cần xóa.
- Số hợp đồng gần giống hợp đồng khác (chỉ khác hoa/thường, khoảng trắng, dấu gạch) → hỏi xác nhận trước khi lưu.
- Ghi các quy tắc nghiệp vụ đã xác nhận ngày 17/11/2026 vào docs/QUY_TAC_NGHIEP_VU_CAN_XAC_NHAN.md.

## Đợt 1–4 nâng cấp nền + rà soát dữ liệu (đã gộp, tiền đề v2.20.0)
- Sửa gộp nhiều đợt Excel của một loại: không còn loại dòng lặp trong CÙNG một file (trước đây thêm một đợt không liên quan làm mất dòng của đợt cũ, tổng kg/phiếu lệch và cảnh báo "trùng giữa các đợt" sai). Chỉ loại phiếu trùng GIỮA các file.
- Sửa đọc số dạng chữ: ".500" / "-.250" đọc 500 / -250 (sai 1.000 lần) → 0,5 / -0,25; "1.5E3" đọc 1,53 → 1500.
- Sửa đọc ngày giờ: ngày không tồn tại (29/02 năm không nhuận, 32/01, tháng 13, giờ 25…) không còn bị tràn sang ngày khác; dòng đó được cảnh báo "Thiếu/sai ngày cân" kèm số dòng Excel.
- Thêm test: tests/merge-batches.test.cjs, tests/parse-edge.test.cjs.
- Thuế: số dư còn nợ / nộp thừa làm tròn 0,01 đ để sai số số thực không tạo ra "nộp thừa 0 đ (1 tờ khai)" hay "còn nợ" vài e-17 đồng.
- Danh mục: so trùng số TKHQ giữa các hợp đồng bỏ khoảng trắng thừa (nhiều dòng hàng dùng chung một TKHQ trong cùng hợp đồng vẫn hợp lệ — quy tắc nghiệp vụ).
- Nhật ký chứng từ: phát hiện trùng số BKLS không phân biệt hoa/thường và khoảng trắng.
- Thêm test: tests/contract-tkhq-dup.test.cjs, tests/customs-rounding.test.cjs, tests/issued-dup.test.cjs.
- Đợt 4: định dạng toàn bộ JS (app/js, tests, tools) bằng Prettier + .editorconfig; CI chạy npm run format:check; npm run format để tự sửa. Đã kiểm chứng cây cú pháp 109/109 file tương đương bản trước (chỉ khác cách viết: khóa đối tượng bỏ nháy, bỏ ngoặc thừa trong chuỗi &&). Tệp sinh tự động/thư viện không định dạng (.prettierignore). Ngưỡng long-file của quality đặt 2.200 dòng (app/.hakquality.json, không đóng gói vào bản phát hành) vì số dòng tăng sau khi định dạng.
- Đợt 2: tách pages.js (1.694 → 903 dòng) thành pages-modals.js, pages-contract.js, pages-filter.js, pages-bkls.js (không đổi hành vi; nạp trước pages.js). Báo cáo quality không còn cảnh báo.
- Test thứ tự nạp script (tests/script-order.test.cjs): mỗi file chỉ đọc HAK.<Tên> lúc nạp khi tên đã được file nạp trước gán.
- Smoke test trình duyệt (npm run smoke) + job CI "smoke": mở app thật, không được có lỗi script.
- CI: npm run quality chặn khi có lỗi cấp error (--fail-on error).

## v2.19.6 (bản vá)
- Bộ lọc nâng cao: khi kho bộ lọc đã lưu bị lỗi, hiện cảnh báo + nút "Tải bản sao" và "Sao lưu kho cũ và tạo kho mới"; bản sao lưu có mốc thời gian nên lần hỏng thứ hai không còn ghi đè bản đầu; báo rõ khi xóa bộ lọc không thành công.
- Công cụ chất lượng (npm run quality) nâng lên bản HAK_CODE_QUALITY_TEST mới (phân tích cú pháp bằng acorn, cổng chất lượng, bỏ cảnh báo vòng phụ thuộc giả của util.js). Thêm devDependency acorn 8.15.0.
- Thêm test kho bộ lọc hỏng (321 test).
- Bảo trì: tách hộp thoại Bỏ phiếu / Chọn phiếu / Xe trả về từ pages.js sang js/pages-modals.js (không đổi hành vi; pages.js giảm ~250 dòng); nạp pages-modals.js trước pages.js.

## v2.19.5 (bản vá)
- Đọc hợp đồng / Purchase Order tiếng Anh bố cục nhiều cột: đúng bên bán – bên mua (Messrs, Seller/Buyer), số PO "2 -2026CY", ngày "03 February 2026", hàng hóa, khối lượng, tàu "V-31".

## v2.19.4 (bản vá)
- Hợp đồng chỉ "Đã hoàn thành" khi mọi chi tiết đã có chứng thư / phiếu cân đều có tờ khai thông quan (xác nhận 17/11/2026).

## v2.19.3 (bản vá)
- Menu sắp theo quy trình; Tổng quan thêm ô Thực giao đã lập hồ sơ (cùng engine Báo cáo) và giải thích chênh lệch; xác nhận phạm vi trước khi xuất; sửa hộp hỏi kẹt khi bấm nhanh.

## v2.19.2 (bản vá)
- Tiếp tục đóng năm: chọn đúng lần đóng dở theo SHA-256 khi cùng năm có nhiều lần đóng dở.

## v2.19.1 (bản vá)
- Thông báo sau khi lưu / xuất kèm dòng đối chiếu; thêm test bộ lọc theo màn hình.

## v2.19.0 — nâng cấp quy trình nhập liệu & lập hồ sơ
- Thêm mới / mở hồ sơ dùng chung một hàm đặt lại trạng thái (xóa phiếu bỏ, xe trả về, phiếu chọn riêng, bộ lọc, liên kết hợp đồng, ảnh chụp); hỏi Lưu / Bỏ / Quay lại khi có thay đổi chưa lưu.
- Đợt cân: lưu file + thông số trong MỘT giao dịch IndexedDB có kiểm tra phiên bản; xác nhận thay đợt; kiểm tra tham chiếu trước khi xóa; nhãn trạng thái lưu.
- Chọn phiếu: chỉ chọn dòng đang hiển thị (300/lần) + "Chọn tất cả kết quả"; dán số phiếu khớp đúng trước; trạng thái Chưa gán/Đã gán/Chưa xác minh; chống kết quả bất đồng bộ cũ; mở hồ sơ nguồn.
- Thanh "Đang làm việc"; thông báo "Danh mục đã thay đổi" (cũ/mới, giữ giá trị gõ tay).
- Bộ lọc: phân biệt Lọc xem trước / Phạm vi lập chứng từ / Kỳ báo cáo; nút "Dùng phạm vi đang xem"; nêu lý do 0 phiếu và điều kiện hết hiệu lực.
- Google Sheet: 4 trang snapshot ghép theo mã bản ghi (Code.gs v3, cần dán lại); ghi chú/công thức đi theo mã; dòng thiếu/trùng mã được giữ và báo; báo đã ghi / lỗi / chưa chạy theo lô và theo trang; gửi lại không nhân đôi.
- Sao lưu: Nhập bổ sung (gộp theo phiên bản, mặc định) tách khỏi Khôi phục (ghi đè); xem trước phạm vi; báo từng kho khi dừng giữa chừng.
- Đóng năm: nút "Tiếp tục đóng năm" sau khi bị gián đoạn, đối chiếu với file ZIP đã xác minh.
- Thông báo sau khi lưu / xuất kèm dòng đối chiếu (công ty · tàu · số phiếu · bỏ · trả về · thực giao); thêm test bộ lọc theo màn hình, xuất lại cùng tập phiếu.
- Thanh "Đang làm việc" thêm Tàu / chuyến và Thực giao.
- Cập nhật HUONG_DAN.md và mục "Quy trình lập hồ sơ" trong Hướng dẫn của app.

## Phase 1 + BKLS trả về
- BKLS Tổng + Từng xe chuyển sang trang "Tạo biên bản" cho 5 hình thức: Xuất khẩu, Ủy thác, Xuất hàng kho gửi, Xuất bán, Trao đổi (Điều chuyển, Trung chuyển không có BKLS).
- Xuất bán / Trao đổi: "Bên mua" tự lấy theo Bên nhận nếu để trống.
- Xe trả về (Xuất khẩu / Ủy thác / Xuất hàng kho gửi): BKLS chính không tính xe trả về; tự tạo thêm BKLS trả về, số = Số BKLS + "-TV", chủ lâm sản = bên mua = bên xuất, vận chuyển đảo chiều (có ô nhập tay nơi nhận).

## Phase 2
- Trang "Chứng từ" chỉ còn lập PXKKVCNB (Excel Bkav); gỡ toàn bộ BKLS khỏi trang này.

## Bộ cài Windows / cách cập nhật
- HAK_QuanLyXuatHang_Setup.exe (NSIS), cài vào %LOCALAPPDATA%\HAK\QuanLyXuatHang — giữ đường dẫn cố định để không mất dữ liệu trình duyệt; shortcut Desktop + Start Menu có icon riêng. Bản mới nhất cũng được lưu vào C:\Users\Administrator\Downloads với tên có số phiên bản (vd HAK_QuanLyXuatHang_Setup_v2.6.1.exe).
- Từ 26/09/2026: Thủy chọn cho Claude cập nhật THẲNG vào thư mục app trên máy (qua Claude desktop, cấp quyền thư mục C:\Users\Administrator\AppData\Local\HAK\QuanLyXuatHang). Mỗi lần cập nhật: sao lưu file cũ vào thư mục _backup_truoc_<phiên bản> trong thư mục app, ghi file mới, đối chiếu md5 TẤT CẢ file với bản chuẩn.
- Lưu ý kỹ thuật khi ghi file lên máy: LUÔN dùng một đường dẫn tạm MỚI trong outputs cho mỗi lần ghi — ghi lại từ cùng đường dẫn tạm cũ sẽ đẩy lên bản cũ đã lưu đệm (gặp 26/09 với catalog.js và 27/09 với bộ cài v2.6.1; cả 2 lần phát hiện nhờ đối chiếu md5).
- Bài học: bộ cài ngày 23–26/9 không được chạy trên máy → app vẫn là bản 22/9 → Thủy thấy lỗi cũ. Luôn kiểm tra phiên bản thực tế trên máy trước khi kết luận.
- Kiểm thử tự động từ v2.6.1: các bài test cũ chạy với lớp tự đăng nhập (PYTHONPATH=/tmp/pwhook, sitecustomize.py nạp sẵn tài khoản "test" + phiên); bài test đăng nhập chạy với HAK_NO_AUTOLOGIN=1.

## v2.1 — Sửa lỗi xe trả về khi gộp nhiều file Excel
- Lỗi: số dòng (idx) trùng giữa các file → chọn 1 xe trả về có thể dính thêm xe ở file khác (sai BKLS trả về, biên bản Xuất khẩu/Ủy thác/Xuất hàng kho gửi).
- Sửa: mỗi xe có mã riêng uid = tên file + số dòng (gán ở mergeSlot); dùng HAK.Generator.retKey() ở mọi nơi. Hồ sơ lưu trữ cũ vẫn đọc được (lùi về idx).
- Lưu ý: các đợt lập TRƯỚC v2.1 mà vừa gộp ≥2 file vừa có xe trả về nên lập lại.

## v2.2 — Hiệu năng BKLS + gợi ý số
- BKLS từng xe > 1.500 xe: tự chia thành nhiều file ≤ 1.000 xe, số BKLS từng xe liên tục, gói 1 ZIP; ≤ 1.500 xe vẫn 1 file như cũ.
- Mức nén file từng xe 6 → 3: 1.048 xe từ 6,4s còn ~5,0s (file lớn hơn ~20%). 11.868 xe: trước treo tab, nay ~66s.
- Cảnh báo trùng số + cảnh báo quá nhiều xe gộp vào một lần bấm xác nhận.
- Gợi ý "Số gần nhất… Dùng số kế tiếp" dưới ô Số BKLS (bỏ qua số -TV).

## v2.3 — Mở app nhanh hơn
- ExcelJS (~0,9 MB) và docx-preview không nạp sẵn nữa; nạp khi bấm Xuất Excel / Tải PDF / Báo cáo Excel (bộ nạp dùng chung HAK.UI.loadScript / needLib, bkls.js dùng lại).
- Mở app nhanh hơn ~20% (197 → 157 ms; máy chậm x4: 518 → 423 ms). Lần Xuất Excel đầu tiên chậm thêm ~0,2 s.
- Không làm được (giới hạn kỹ thuật): đứng hình ~1 s khi ghi file PDF (lệnh output của jsPDF) và ~0,8 s khi đọc file Excel >10.000 dòng — app mở từ file:// nên trình duyệt chặn Web Worker.

## v2.4 — BKLS lưu vào Lưu trữ
- Tạo BKLS tự lưu hồ sơ (thông số + dữ liệu phiếu cân). Biên bản và BKLS cùng đợt ghép chung 1 hồ sơ (các ô bkls* không tính vào mã hồ sơ); hồ sơ luôn giữ thông số BKLS mới nhất.
- Trang Lưu trữ có nút "BKLS" (với hồ sơ đã lập BKLS) để tạo lại BKLS không cần file Excel cân; có xe trả về thì tạo lại cả bộ -TV. Tạo lại không ghi thêm vào nhật ký chứng từ, không cảnh báo trùng với chính nó.
- Sửa giao diện tối: nút "Tạo BKLS" và nút "BKLS" (btn-outline-dark) trước đây gần như không nhìn thấy.

## v2.4.1 — Sửa lỗi Đơn vị vận chuyển hiện "92C / 92H…"
- Triệu chứng (Thủy báo): cột "Đơn vị vận chuyển" trong bảng cân của biên bản hiện 3 ký tự đầu biển số.
- Nguyên nhân tái hiện được (vehicles.js parseWorkbook): cột mã ĐVVC trong danh sách xe không có tiêu đề → app đoán cột theo "chữ ngắn, ít giá trị, điền nhiều nhất"; cột "đầu biển số" cũng thỏa và thắng khi cột mã thiếu dù 1 ô.
- Sửa: chọn cột mã theo số giá trị khớp bảng đổi mã (Cài đặt → Chung), loại cột mà giá trị là phần đầu biển số của chính dòng đó. Danh sách xe đã lưu từ bản cũ: tự bỏ mã sai (để trống thay vì in 92C) và hiện nhắc "upload lại danh sách xe" ở trang Nhập liệu.
- CHƯA XÁC NHẬN với dữ liệu thật: file Thủy gửi (XHANG_T8 + danh sách xe T8) ra ĐVVC đúng trên cả bản cũ lẫn bản mới; biên bản lỗi là ngày 18/09 kho Quế Cường → cần file cân tháng 9 (+ danh sách xe T9 nếu khác) để chốt nguyên nhân. Khả năng còn lại: file cân có sẵn cột bị hiểu là ĐVVC, hoặc cột ĐVVC từng được chọn tay sai.

## v2.4.2 — BKLS mỗi xe đúng 1 trang + có PDF
- Triệu chứng (Thủy báo): BKLS từng xe bị lấn sang trang 2 (phần ký nhảy trang); BKLS không ra file PDF.
- Nguyên nhân 1: mẫu BKLS sát đáy trang — sau đoạn cam kết chỉ dư ~0,1 cm cho bảng ký có chiều cao tối thiểu 3,19 cm (+2 dòng trống cuối ô) → Word đẩy/cắt bảng ký sang trang 2; thêm dòng trống + đoạn ngắt trang riêng sau mỗi xe.
- Nguyên nhân 2 (phát hiện thêm): cả file dùng chung 1 danh sách đánh số → xe thứ 2 ra "6. … 10." thay vì "1. … 5.".
- Nguyên nhân 3: Phase 1 đặt ô "BKLS Tổng/Từng xe — PDF" mặc định TẮT (trang Chứng từ cũ tick sẵn cả 4).
- Sửa (bkls.js, chung cho bản Tổng và Từng xe, không đổi chữ): bỏ chiều cao "chừa chỗ ký" của bảng ký cuối trang (dưới bảng vốn là khoảng trắng tới hết trang → tờ in như cũ); dòng trống giữa các mục thu còn 8pt; bỏ khối trống thừa sau phần ký; sang trang bằng pageBreakBefore; mỗi xe một w:num riêng (startOverride = 1). PDF mặc định bật; form đã lưu được bật 1 lần (hak.mig.bklsPdf.<loại>), sau đó tôn trọng lựa chọn người dùng.
- Kiểm tra (LibreOffice): bình thường / dữ liệu dài nhất có thật / cực đoan → mỗi xe 1 trang, dưới bảng ký còn 1,2–2,2 cm tới lề. Chưa kiểm được trực tiếp trên MS Word.

## v2.5 — Danh mục hợp đồng & khách hàng + báo cáo Xuất hàng + Google Sheet (theo phase)
Quyết định của Thủy (26/09/2026):
- Số BKLS: giữ số app cấp khi tạo BKLS (không đánh lại theo số phiếu); báo cáo lấy đúng số đã cấp.
- Mỗi lô xuất (1 tàu) = 1 hợp đồng = 1 chứng thư.
- Hợp đồng có HÌNH THỨC: Xuất khẩu, Ủy thác xuất khẩu, Xuất bán, Trao đổi (đều theo tàu). Khi in biên bản, trang nào chỉ lọc ra hợp đồng đúng hình thức của trang đó.
- Hai bên của hợp đồng (bán/giao · mua/nhận) đều chọn từ danh mục Khách hàng cho mọi hình thức; công ty trong nhóm (Cài đặt → Công ty) tự có trong danh mục với nhãn "Nội bộ".
- Hợp đồng có bảng phụ "Chi tiết thực hiện" để điền số liệu chứng thư: Số & ngày chứng thư, KL giám định tươi (MT) + khô (BDMT) + độ ẩm, Bên giao / kho xuất, Khoảng ngày cân (tùy chọn lọc xe theo khoảng này).
- Hệ số RMT→BDMT trên BKLS = "Độ khô nhà máy" của hợp đồng (vẫn sửa tay được).
- Google Sheet: đồng bộ 1 chiều app → Sheet (phương án Apps Script Web App).
Tham chiếu: file XUATHANG_DN.xlsx — sheet NL_DH_XB (danh mục lô: STT, Ngày đơn hàng, SỐ TKHQ, TÀU, KHÁCH HÀNG, ĐC KHÁCH HÀNG, TÊN HH_BKLS, ĐƠN GIÁ USD, KL_MT, KL_BDMT, ĐỘ KHÔ, ĐỘ KHÔ NHÀ MÁY, NL từ/đến ngày, Lọc xe, Kho xuất) và NL_PC_XH (nhật ký phiếu cân: số phiếu, giờ cân 1/2, biển số, cân 1/2, KL kg, ĐVVC, tài xế, tấn, ngày xuất, số BKLS, m³ = tấn/0,7, người cân, SỐ TKHQ, tàu xuất). Hai sheet nối theo SỐ TKHQ. KL_MT của lô có thể gồm hàng từ nơi khác (không chỉ kho Đà Nẵng). Trong file mẫu Số BKLS đánh liên tục 1 dãy cho mọi phiếu (001/2025/BKLS…7267/2025/BKLS) và "Ngày xuất" gõ tay (2.040/7.267 phiếu khác ngày cân) — app KHÔNG theo 2 điểm này (xem Phase 3).

### Phase 1 (xong 26/09/2026)
- Module js/catalog.js + trang "📇 Danh mục HĐ & khách hàng" (#/catalog). Lưu ở HAK.Store 'hak.catalog.v1' (tự vào Sao lưu toàn bộ). Sửa: index.html (menu, khung trang, thẻ script), main.js (TITLES, route, init). Không đụng biên bản.

### Phase 1.1 = v2.5.1 (xong, đã cập nhật thẳng vào máy Thủy 26/09/2026; backup: _backup_truoc_v2.5.1)
- 3 tab: 🚢 Hợp đồng · 🧪 Chi tiết thực hiện · 👤 Khách hàng. Lọc theo hình thức; tìm theo tàu / số HĐ / TKHQ / chứng thư / khách hàng.
- Biểu mẫu hợp đồng (thông tin HĐ: hình thức, số, ngày ký, tàu, TKHQ, 2 bên, hàng hóa BKLS, đơn giá + USD/VND, KL tạm tính, độ khô nhà máy, ghi chú). Nhãn 2 bên đổi theo hình thức (Bên xuất khẩu/Khách hàng · Bên ủy thác/Bên nhận ủy thác · Bên bán/Bên mua · Bên giao/Bên nhận); đổi hình thức tự đổi loại tiền. (v2.6.0: phần Chi tiết thực hiện tách ra biểu mẫu riêng.)
- Khách hàng có Loại: Nước ngoài / Trong nước / Nội bộ. Nội bộ: tên, địa chỉ, MST luôn theo Cài đặt, không xóa được. Khách mới tạo ngay trong ô chọn: bên mua HĐ xuất khẩu = Nước ngoài, còn lại = Trong nước.
- Kiểm tra: trùng TKHQ, trùng số HĐ cùng hình thức, độ khô 0–1, độ ẩm 0–100, ngày cân từ ≤ đến; kiểm tra hợp đồng TRƯỚC khi tạo khách mới (tránh khách "mồ côi").
- Dữ liệu Phase 1 tự chuyển: hợp đồng cũ = Xuất khẩu (USD), khách cũ = Nước ngoài. Nhập từ file Xuất hàng: KL_MT/KL_BDMT → KL giám định tươi/khô, NL từ/đến ngày → khoảng ngày cân; có cột "Hình thức" thì nhận luôn. XUATHANG_DN: 12 hợp đồng Xuất khẩu + 2 khách nước ngoài; nhập lại chỉ cập nhật.

### Phase 2 = v2.5.2 (xong, Thủy chọn phương án A; đã cập nhật thẳng vào máy 27/09/2026; backup: _backup_truoc_v2.5.2)
- Trang Xuất khẩu / Ủy thác / Xuất bán / Trao đổi có nhóm "📑 Hợp đồng (từ Danh mục)" ở đầu form: ô chọn chỉ liệt kê hợp đồng đúng hình thức của trang (mới nhất trước), nút ↻ Điền lại, nút 📇 Danh mục. Danh mục thêm/sửa/xóa → danh sách tự cập nhật (sự kiện hak:catalog); lựa chọn được nhớ theo form.
- Chọn hợp đồng → điền 1 lần vào ô sẵn có (vẫn sửa tay được): tàu; số / ngày / KL tạm tính HĐ; số, ngày chứng thư, KL giám định tươi/khô, độ ẩm (Ủy thác); Bên giao = bên bán/giao nếu là công ty nội bộ (không thì lấy Bên giao hàng ở Chi tiết thực hiện); Bên nhận = bên mua/nhận nếu nội bộ; kho xuất (+ "Kho xuất" ghi phụ lục ở Ủy thác); hệ số BKLS = độ khô nhà máy; đơn giá (Xuất bán, chỉ khi HĐ tính VND); khoảng ngày cân nếu HĐ bật lọc.
- Bên mua trên BKLS: Xuất khẩu / Ủy thác → điền tên, MST, địa chỉ bên mua/nhận của HĐ. Xuất bán / Trao đổi: bên nhận nội bộ → để trống (BKLS tự lấy theo Bên nhận như cũ); bên nhận ngoài nhóm → ô Bên nhận giữ nguyên (chỉ chọn được công ty nội bộ), điền vào Bên mua BKLS + ghi chú rõ.
- Hỏi trước khi ghi đè: ô "nhập tay" = khác rỗng, khác mặc định, khác giá trị app điền lần trước (lưu hak.ctfill.<loại>) → khung vàng liệt kê cũ → mới, nút "Dùng số liệu hợp đồng" / "Giữ như đang nhập". Ô do app điền thì đổi hợp đồng là thay luôn không hỏi. Ô thuộc hợp đồng mà HĐ mới không có số liệu → để trống (tránh sót số liệu HĐ trước).
- Số điền dạng Việt (13.010,81); đúng 3 chữ số lẻ thì thêm 0 (49,9810) để parseNum không hiểu thành phần nghìn.
- HĐ bật lọc ngày mà file cân không có phiếu trong khoảng → cảnh báo đỏ ngay dưới ô chọn. Nạp file cân mới → giữ khoảng ngày của HĐ đang chọn.
- Lưu trữ: contractId có trong thông số hồ sơ nhưng KHÔNG tính vào mã hồ sơ (cùng đợt vẫn 1 hồ sơ, hồ sơ cũ không bị tách).
- Không sửa generator / mẫu Word / bkls.js / Chứng từ. Tên hàng (TÊN HH_BKLS) chưa đưa vào BKLS (mẫu BKLS cố định). Hàm ánh xạ đặt trong pages.js để catalog.js không phụ thuộc ID ô form.

### Phase 3 = v2.5.3 (xong 27/09/2026, phương án A + Ngày xuất = ngày cân; phạm vi 4 hình thức có cột Hình thức; backup: _backup_truoc_v2.5.3)
- Trang Báo cáo có thẻ "📑 Xuất hàng theo hợp đồng": bảng mỗi hợp đồng 1 dòng + nút "📊 Xuất Excel Xuất hàng" → file XuatHang_YYYYMMDD.xlsx. Dùng lại lọc ngày + chống trùng + tick hồ sơ của trang Báo cáo.
- Sheet NL_DH_XB: 16 cột đúng tên/thứ tự file mẫu (tiêu đề ở dòng 1) + cột bổ sung nền xám (Hình thức, Số HĐ, Bên bán/giao, Đơn giá VND, Số/ngày chứng thư, Số hồ sơ, Cân từ/đến ngày, Số xe, KL qua cân, Xe trả về, KL trả về, Thực giao, KL_MT − thực giao, Số BKLS từ/đến, Ghi chú, Mã lô (app)).
- Sheet NL_PC_XH: 16 cột đúng mẫu + Hình thức, Xe trả về (x), Số HĐ, Hồ sơ, Mã lô (app). Ngày xuất = ngày cân; M3 = tấn ÷ 0,7; SỐ TKHQ dạng số; Số BKLS = số app cấp (soBkls-0001…, trả về soBkls-TV-0001…) tính lại bằng HAK.Bkls.tripNo theo đúng thứ tự xe lúc tạo BKLS.
- Hồ sơ → hợp đồng: meta.contract → nếu không có thì ghép theo tên tàu chuẩn hóa khi khớp đúng 1 HĐ cùng hình thức; không ghép được → trống TKHQ + cảnh báo + sheet "Chưa gắn HĐ".
- Kiểm tra: số BKLS từng xe trong báo cáo khớp 100% và cùng thứ tự với file Word BKLS.

### Phase 4 = v2.5.4 — Đồng bộ Google Sheet (xong 27/09/2026; bấm nút khi muốn · thay cả lô · Sheet đích = XUATHANG_DN https://docs.google.com/spreadsheets/d/1ZZ2iUwkkKe8wXdztA7mL-v9j6fmgY5c5rlDdI1sNoAk; backup: _backup_truoc_v2.5.4)
- Sheet XUATHANG_DN thật (đọc qua Google Drive 27/09): NL_PC_XH 7.267 phiếu năm 2025 + NL_DH_XB 12 lô, đúng 16 cột mẫu, KHÔNG có công thức; cột TÀU XUẤT ở NL_PC_XH đang trống.
- js/gsync.js (HAK.GSync): Cài đặt → Chung → "☁ Đồng bộ Google Sheet" (URL Web App, mã bí mật, 📋 Sao chép Code.gs điền sẵn mã, 🔌 Kiểm tra kết nối); cấu hình 'hak.gsync.v1'. Code.gs sinh từ HAK.GSync.codeGs(token).
- Báo cáo → thẻ Xuất hàng: nút "☁ Đồng bộ Google Sheet" (bấm 2 lần) + dòng "Đồng bộ gần nhất".
- Quy tắc ghi: chỉ gửi lô CÓ hồ sơ cân trong khoảng lọc. NL_PC_XH: xóa mọi dòng của lô được gửi (khớp "Mã lô (app)" hoặc SỐ TKHQ) rồi ghi lại cuối sheet. NL_DH_XB: cập nhật tại chỗ (giữ STT), lô mới thêm cuối. Cột tìm theo tên tiêu đề, thiếu thì tự thêm bên phải. Gửi theo nhóm ≤ 4.000 phiếu/lần; LockService.
- report.js: xhSheetRows() dùng chung cho Excel và Google Sheet.
- CHƯA kiểm với Google thật (proxy môi trường chặn script.google.com) → Thủy cài Code.gs + "Kiểm tra kết nối" trên máy là bước xác nhận cuối. Dự phòng: phương án B (file Excel trong thư mục Google Drive + script đọc định kỳ).

## v2.6 — Chi tiết thực hiện riêng · Đăng nhập · Chọn công ty xuất (theo phase)
Yêu cầu Thủy 27/09/2026: "chi tiết hợp đồng cho nhập riêng tại tab chi tiết, để đỡ sửa hợp đồng; cho màn hình đăng nhập và chọn công ty xuất ngay từ đầu". Thủy chọn: 1a nhiều người dùng + 2 quyền (Quản trị / Nhân viên) · 2a chọn công ty = mặc định + lọc (có "Xem tất cả công ty"; số BKLS/PXK theo dãy của công ty) · 3a mỗi người dùng được gán công ty được làm.

### Phase A = v2.6.0 (xong 27/09/2026; backup: _backup_truoc_v2.6.0)
- catalog.js: biểu mẫu hợp đồng bỏ phần ② (chỉ còn thông tin HĐ); biểu mẫu RIÊNG "Chi tiết thực hiện" (openExec) — khung đối chiếu chỉ xem (hình thức, tàu, số/ngày HĐ, 2 bên, TKHQ, độ khô NM) + ô chứng thư (số/ngày, KL tươi/khô + độ khô thực tế, độ ẩm, bên giao, kho xuất, ngày cân, lọc xe). Mở bằng nút Nhập/Sửa ở tab 🧪 hoặc nút 🧪 ở bảng hợp đồng.
- Lưu: mỗi biểu mẫu chỉ ghi đúng ô của nó (EXEC_FIELDS / INFO_FIELDS), phần còn lại giữ nguyên từ hợp đồng → sửa HĐ không mất số liệu chứng thư và ngược lại. Dữ liệu vẫn chung 1 bản ghi hợp đồng → chọn HĐ ở biên bản, báo cáo, Google Sheet không phải sửa.

### Phase B = v2.6.1 — Đăng nhập (xong 27/09/2026; backup: _backup_truoc_v2.6.1; bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.1.exe)
- Module mới js/auth.js (HAK.Auth). Dữ liệu 'hak.auth.v1' = { users:[{id, username, name, role admin|staff, companies[], disabled, salt, hash}], rec:{salt,hash} } — nằm trong Sao lưu toàn bộ. Mật khẩu băm SHA-256 thuần JS × 2.000 vòng + muối (~30 ms, khớp chuẩn Node crypto). Phiên: sessionStorage 'hak.session' (giữ tới khi đóng trình duyệt).
- Lần đầu: màn "Tạo tài khoản quản trị" → mã khôi phục XXXX-XXXX-XXXX (chỉ hiện 1 lần; sao chép / tải .txt; phải tick "đã cất" mới tiếp tục). Quên mật khẩu Quản trị: nhập mã khôi phục + tên đăng nhập Quản trị → đặt mật khẩu mới → cấp mã mới. Sai 5 lần → chờ 30 giây. Tài khoản bị khóa không vào được.
- Màn đăng nhập che toàn app (body.auth-locked); main.js khởi động: Backup.boot → Auth.require → init. Thanh trên: 👤 tên + 🔒 Đăng xuất.
- Cài đặt → tab mới "👤 Tài khoản": đổi họ tên / mật khẩu của mình; Quản trị có bảng Người dùng (thêm, sửa, khóa/mở, đặt lại mật khẩu, quyền, công ty được làm — bắt buộc ≥ 1), "🔑 Tạo mã khôi phục mới". Luôn còn ≥ 1 Quản trị đang dùng.
- Nhân viên (body.role-staff, ẩn ở giao diện): Cài đặt chỉ thấy tab Tài khoản; Danh mục chỉ xem (ẩn Thêm / Nhập file / Sửa / 🧪 / Xóa); Lưu trữ ẩn nút xóa + Khôi phục; nhật ký chứng từ ẩn nút xóa dòng.
- Người lập: archive meta.by (người thao tác gần nhất) + meta.createdBy (người lập đầu); Issued rec.by; hiện ở Lưu trữ (dòng 👤) và cột "Người lập" ở nhật ký chứng từ; dữ liệu cũ "(trước v2.6)".
- Sửa lỗi gốc phát hiện khi kiểm thử (có từ v2.5.2, chạy lặp mới lộ ~1/3–1/5 lần): sau khi tải lại trang, ô "Chọn hợp đồng" đôi khi trống vì catalog.js đọc dữ liệu lúc nạp script (có thể là bản cũ), còn trang biên bản dựng TRƯỚC Catalog.init. Sửa: main.js gọi Catalog.init() trước Pages.init(). Chạy lặp 6/6 đúng.
- Lưu ý đã nói với Thủy: đăng nhập offline = chặn người lạ + ghi người lập, không phải bảo mật máy chủ.

### Phase C = v2.6.2 — Công ty làm việc (xong 27/09/2026; backup: _backup_truoc_v2.6.2; bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.2.exe)
- auth.js: sau đăng nhập chọn công ty (allowedCos: Quản trị = mọi công ty trong Cài đặt, Nhân viên = công ty được gán còn tồn tại; 1 công ty → vào thẳng; 0 → báo "chưa được gán công ty"). Lưu phiên 'hak.session'.co + nhớ lần trước 'hak.auth.lastco'. Phiên còn nhưng công ty bị bỏ quyền → chọn lại. Thanh trên: nút 🏢 <tên rút gọn> ▾ → màn đổi công ty (có Hủy; chọn xong tải lại app).
- Bên xuất mặc định mỗi lần mở app: pages.js companyDefaults() đặt giaoId = công ty + khoGiaoId = kho xuất mặc định của công ty (companyAttr 'khoXuat') cho mọi trang trừ Điều chuyển; chungtu.js withCompany() đặt "Của" + "Xuất kho tại". Vẫn đổi được trên trang. Số BKLS / PXK vốn đã theo dãy của công ty (giaoId / cua).
- Phạm vi dữ liệu: HAK.Auth.scopeIds(key) (mặc định [công ty đang làm]; công tắc "Xem tất cả công ty" → Quản trị: null = tất cả, Nhân viên: các công ty được làm) + scopeSwitch(key) + sự kiện 'hak:scope'; nhớ ở 'hak.scope.v1'. Áp cho Danh mục (catalog), Lưu trữ (archive), Báo cáo (report — kéo theo thẻ Xuất hàng, Excel, Google Sheet; lô chỉ có trong danh mục cũng lọc).
- Hợp đồng "liên quan" công ty (Catalog.relatedTo): công ty là bên bán/giao, bên mua/nhận hoặc bên giao hàng; HĐ chưa gán bên nội bộ nào → mọi công ty đều thấy. Ô "Chọn hợp đồng" ở trang biên bản: nhóm "Hợp đồng của <cty>" trước, "Hợp đồng công ty khác" sau (không ẩn).
- Hồ sơ Lưu trữ có meta.cid (= giaoId) từ nay; hồ sơ cũ → Auth.companyOfMeta() dò theo tên rút gọn bên giao.
- Sửa sót Phase B: nút "🗑 Xóa tất cả" ở Lưu trữ nay ẩn với Nhân viên.
- Kiểm tra (pc.py): QT thấy 4 công ty; chọn Đại Hiệp → các trang giaoId=dh + kho w_dh, Điều chuyển không đổi, Chứng từ Của=dh + kho Đại Lộc; ô chọn HĐ nhóm đúng; Danh mục DH chỉ XK-DH + HĐ chưa gán, bật tất cả thấy XK-HAK, công tắc được nhớ; Lưu trữ / Báo cáo DH 1 hồ sơ, tất cả 2; đổi sang HAKQN → giaoId qn/kho w_qc; NV 1 công ty vào thẳng (không có ▾); NV 2 công ty "xem tất cả" chỉ dh+qn; NV bị bỏ DH → vào thẳng QN. Hồi quy toàn bộ + đăng nhập + Google Sheet đạt; tối/điện thoại không tràn; không lỗi JS. Lớp tự đăng nhập test: phiên có co:'hak'.

## v2.6.3+ — Cài cho nhiều công ty (Thủy chốt 27/09/2026: 1a mỗi công ty máy riêng + 1 máy vẫn chọn được nhiều công ty · 2a mỗi công ty 1 FILE Google Sheet riêng · 3a gói cấu hình cài đặt; "tài khoản quản trị đặt khi cài từng máy" → gói chỉ mang tài khoản Nhân viên; thêm yêu cầu: app .exe riêng để khôi phục khi quên mật khẩu Quản trị)

### D1 = v2.6.3 — Google Sheet theo từng công ty (xong 27/09/2026; backup: _backup_truoc_v2.6.3)
- gsync.js: cấu hình 'hak.gsync.v2' = { cos: {cid: {url, token, last}}, migV1 }. Bản cũ 'hak.gsync.v1' (Sheet XUATHANG_DN) tự chuyển thành cấu hình của HAK (1 lần, khi chưa cấu hình công ty nào); v1 giữ nguyên làm bản lưu.
- Cài đặt → Chung → ☁: bảng mỗi công ty 1 dòng (URL, mã bí mật 👁 🎲, 📋 Code.gs có sẵn mã của công ty đó, 🔌 Kiểm tra, trạng thái).
- Đồng bộ (Báo cáo → ☁): mỗi lô về Sheet của công ty BÊN XUẤT (công ty của hồ sơ đầu tiên của lô — Auth.companyOfMeta); công ty chưa cài Sheet → bỏ qua + báo; lỗi 1 công ty không chặn công ty khác; báo kết quả theo từng Sheet. Dòng trạng thái theo công ty đang xem.
- Kiểm tra (t5.py, máy chủ giả nhiều Sheet chạy Code.gs thật): chuyển v1→HAK; ĐH sai/đúng mã; HAKQN chưa cài báo đúng; Code.gs mỗi công ty mang đúng mã; chỉ HAK → chỉ Sheet HAK; xem tất cả → HAK + ĐH đúng Sheet, HAKQN bỏ qua; lần 2 không nhân đôi; Sheet HAK giữ 12 lô 2025. Hồi quy toàn bộ đạt.
- Ghi chú kỹ thuật (xác minh bằng đo): trình duyệt kiểm thử đôi khi mở trang mới với localStorage trống ngay sau khi hồ sơ trình duyệt mới được tạo; dữ liệu ghi qua HAK.Store có bản sao IndexedDB và Backup.boot tự khôi phục → module phải đọc dữ liệu SAU Backup.boot (đúng với GSync, Auth; Catalog đã sửa ở v2.6.1). Đo 40 lần ghi-rồi-tải-lại trên hồ sơ đã khởi tạo: 0 lần đọc sai.

### D2 + D3 = v2.6.4 — Gói cấu hình cài đặt + công cụ khôi phục Quản trị (xong 27/09/2026; backup: _backup_truoc_v2.6.4 (auth.js, backup.js, report.js, index.html, HUONG_DAN.md); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.4.exe; công cụ Downloads\HAK_KhoiPhucQuanTri\HAK_KhoiPhucQuanTri.exe + mã nguồn _ma_nguon\)
Thủy duyệt D3: "1. đồng ý 2. a (giao diện trình duyệt cục bộ) 3. a (giữ mã khôi phục 12 ký tự, không bắt buộc khi có khóa nhóm)".
- D2 backup.js: packBuild / packExport / packRead / packSummaryHtml / packApply / packMsg; file 'hak-bienban-pack' v1 = { config (HAK.Config.data), tpl {hak.tpl.*}, catalog, gsync {cid:{url,token}} (bỏ trạng thái last), auth: HAK.Auth.packOut() = {users: chỉ Nhân viên, groupPub} }. Không gồm Quản trị, Lưu trữ, đợt Excel, nhật ký, danh sách xe.
  Nhập: config + mẫu Word trong gói → thay; Danh mục → gộp theo id (ô trống của gói không xóa số liệu máy); gsync → thay url/token từng công ty, giữ last; Nhân viên → HAK.Auth.packIn gộp theo tên đăng nhập (trùng Quản trị máy → bỏ qua + báo; trùng Nhân viên → cập nhật, giữ id máy). Xem trước tóm tắt rồi mới áp dụng → tải lại.
  UI: thẻ admin-only "📦 Gói cấu hình cài đặt" ở Cài đặt → Chung (#packBody, #pkOut, #pkIn, #pkPreview, #pkApply); màn tạo Quản trị lần đầu có link "📦 Cài máy mới? Nhập gói cấu hình trước" (#auPack → screenPack).
  auth.js require(): màn tạo Quản trị khi CHƯA CÓ QUẢN TRỊ (trước: khi chưa có người dùng) — vì gói chỉ mang Nhân viên.
- D3 công cụ Go (/home/claude/khoiphuc: main.go + ui.html nhúng; Go 1.24 crypto/pbkdf2): GOOS=windows -H=windowsgui, 6,4 MB. Web cục bộ 127.0.0.1:<cổng ngẫu nhiên>/?t=<mã phiên>, API cần header X-Token, kiểm Host (chống DNS rebinding), CSP, tự thoát 20 phút; cờ -nobrowser / -key / -urlfile (kiểm thử).
  File HAK_KhoaKhoiPhuc.key cạnh exe: {app 'hak-recovery-key', pub, salt, nonce, ct = AES-256-GCM(khóa bí mật 32 byte, AAD = pub), PBKDF2-SHA256 600.000 vòng}. Không ghi đè khi đã có khóa. Đổi mật khẩu chủ giữ nguyên khóa.
  Ký: "HAK-RESET|1|<mã yêu cầu 12 ký tự không gạch>|<tên đăng nhập thường>|<hết hạn unix giây>" → mã phản hồi base64url(4 byte hết hạn + r||s 64 byte) = 91 ký tự, hạn 24 giờ. Dấu vân tay = 16 hex đầu SHA-256(chuỗi base64 khóa công khai), nhóm 4.
- D3 app auth.js: d.groupPub {key, fp, at}; d.chal {c, at} giữ tới khi dùng / tạo mới. Thẻ admin-only "🛡 Khóa khôi phục của nhóm" ở 👤 Tài khoản (#gkBody, #gkKey, #gkSave, #gkDel — kiểm tra import WebCrypto trước khi lưu). Màn Quên mật khẩu có link "🛡 … Dùng công cụ khôi phục của nhóm" (#auTool → screenForgotTool: #auChal, #auResp); kiểm tra chữ ký bằng WebCrypto ECDSA P-256; hết hạn / quá 2 ngày → từ chối; thành công → đặt mật khẩu, mở khóa, xóa d.chal (dùng 1 lần). screenRecovery(code, next, optional) — có khóa nhóm thì thêm nút "Bỏ qua".
- Sửa lỗi gốc phát hiện khi chạy hồi quy (có từ khi ExcelJS nạp khi cần): nút Excel "ĐVVC theo tàu" ở Báo cáo báo "Thư viện ExcelJS chưa được nạp" nếu trong phiên chưa bấm nút Excel khác — toExcelCarrier thiếu needLib('exceljs'). Đã thêm.
- Kiểm tra: pd2.py (xuất gói: đúng thành phần, không xe/lưu trữ/last; NV không thấy thẻ; máy mới nhập gói trước khi tạo QT → 4 công ty, địa chỉ sửa, Sheet 2 công ty, mẫu Word, HĐ, NV đăng nhập được bằng mật khẩu cũ; máy đang dùng: QT trùng tên bỏ qua, HĐ giữ số chứng thư của máy + nhận bên bán từ gói, HĐ riêng giữ, Sheet thay url giữ last) · pd3.py (công cụ: mật khẩu chủ < 8, file khóa không lộ khóa bí mật, API thiếu token / Host khác → 403; app: khóa sai bị từ chối, dấu vân tay khớp; sai mật khẩu chủ, mã yêu cầu sai độ dài, ký cho tên khác, sửa 1 ký tự, tên không phải QT → từ chối; đúng → vào app; dùng lại mã phản hồi → từ chối; đổi mật khẩu chủ → khóa không đổi, ký lại được; máy có khóa nhóm → nút Bỏ qua mã khôi phục) · bản Windows chạy trong Wine: tạo khóa + ký, Node WebCrypto xác minh chữ ký đúng, hết hạn đúng 24 giờ, thoát được. Hồi quy p2, p3, pa, v24, v242, t_phase2, t_phase2b, t_bkls_pages, t49, t50, t52, pb, pc, t5 đạt (cat4 lỗi thời từ v2.6.0 — thay bằng pa); điện thoại / tối không tràn; không lỗi JS. Thiết bị md5 46/46 khớp.

### D4 + Hướng dẫn = v2.6.5 — Máy trạm theo công ty + 📘 Hướng dẫn trong app (xong 27/09/2026; Thủy: "chọn A và làm D4"; backup: _backup_truoc_v2.6.5 (auth.js, backup.js, gsync.js, main.js, style.css, index.html, HUONG_DAN.md); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.5.exe)
- Lý do: Quản trị máy trạm (v2.6.4) thấy mọi công ty + mã bí mật Sheet mọi công ty + thay được khóa nhóm.
- D4 auth.js: 'hak.auth.v1'.station = { cos:[id], at } (máy trạm). station() → allowedCos lọc theo máy (Quản trị máy trạm chỉ công ty của máy); scopeIds "xem tất cả" ở máy trạm = allowedCos (không còn null); form Người dùng chỉ tick công ty của máy; Quản trị tạo lần đầu nhận companies = station; thẻ Khóa khôi phục ở máy trạm chỉ xem (không dán / gỡ). packOut(ids): Nhân viên có công ty trong ids (companies cắt theo ids) + station; packIn: gói có station → đặt, gói đầy đủ → xóa (máy chính); bản chạy thử (dry) làm trên bản sao. Export: stationCos.
- D4 backup.js: packBuild(ids) — ids null = gói đầy đủ; máy trạm chỉ xuất trong phạm vi của mình; gsync chỉ công ty của gói; hợp đồng lọc Catalog.relatedTo (liên quan + chưa gán); tên file HAK_GoiCaiDat_<TênRútGọnKhôngDấu>_YYYYMMDD.json. packApply: gói máy trạm xóa cấu hình Sheet công ty khác trên máy. UI: ô "Gói cho công ty" (#pkCos [data-pkco], #pkKind); tick đủ = máy chính. Tóm tắt có dòng "Loại gói" (+ cảnh báo khi gói đầy đủ bỏ giới hạn máy trạm).
- D4 gsync.js renderTable: chỉ công ty allowedCompanies().
- Hướng dẫn (phương án A): js/help.js (HAK.Help = {render, open, SECTIONS}) — trang #/help, menu 📘 Hướng dẫn; mục: Mô hình cài đặt, Phân quyền (bảng QT máy chính / QT máy trạm / NV), A Chuẩn bị máy chính, B Cài máy trạm, C Cập nhật, D Quên mật khẩu, E Lỗi thường gặp, F Bảo quản công cụ; ô "Máy này / Bạn / Khóa nhóm"; mục lục cuộn (scroll-margin 72px); 🖨 In / lưu PDF (CSS in: bảng vừa trang, không cắt dòng — 5 trang A4). Mục admin-only ẩn với Nhân viên. data-help="<id>" ở bất kỳ đâu → mở trang và cuộn tới mục (đã gắn ở thẻ Gói cấu hình và thẻ Khóa khôi phục). main.js: TITLES.help + route. HUONG_DAN.md rút gọn 2 mục v2.6.4 thành 1 mục tóm tắt trỏ về 📘.
- Kiểm tra: pd4.py (gói QN: chỉ Sheet QN, NV cắt còn QN, HĐ QN + chưa gán; máy trạm: vào thẳng QN, xem tất cả = [qn], bảng Sheet chỉ QN, ô gói chỉ QN, khóa nhóm chỉ xem, form NV chỉ QN, NV 2 công ty vào thẳng QN, xuất gói vẫn là máy trạm QN; nhập gói đầy đủ → máy chính 4 công ty; máy chính nhập gói QN → Sheet chỉ còn QN) · ph.py (QT thấy 8 mục, NV 4 mục và không thấy cách khôi phục QT; điện thoại / tối không tràn; liên kết từ thẻ gói cuộn đúng; PDF in 5 trang đủ cột). Hồi quy p2, p3, pa, v24, v242, t_phase2, t_phase2b, t_bkls_pages, t49, t50, t52 (1 lần chậm quá hạn click khi chạy liền mạch, chạy lại 3/3 đạt), pb, pc, t5, pd2, pd3 đạt; không lỗi JS. Thiết bị md5 47/47 khớp.

### v2.6.6 — Khôi phục toàn bộ "giữ tài khoản đang dùng" (xong 27/09/2026; Thủy: "ok theo hướng đó"; backup: _backup_truoc_v2.6.6 (backup.js, help.js, HUONG_DAN.md); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.6.exe; zip trọn bộ Downloads\HAK_QuanLyXuatHang_TronBo_v2.6.6_20260927.zip)
- Bối cảnh: Thủy hỏi gỡ / cài lại có vào được khi quên mật khẩu → KHÔNG (tài khoản ở bộ nhớ trình duyệt; Chrome/Edge dùng chung 1 vùng nhớ cho mọi file://; bộ gỡ chỉ xóa file chương trình). Đường cuối: mở bằng trình duyệt khác → QT mới → Khôi phục toàn bộ — nhưng trước đây file sao lưu ghi đè cả 'hak.auth.v1' → QT mới biến mất, lại bị khóa.
- backup.js: restoreFile(file, { keepAuth }) — bỏ qua AUTH_KEYS = ['hak.auth.v1', 'hak.auth.lastco'] (giữ tài khoản, khóa nhóm, loại máy trạm, mã khôi phục của máy). Ô #bkKeepAuth "Giữ tài khoản đang dùng trên máy này" (mặc định tick) cạnh nút Khôi phục toàn bộ; toast ghi rõ giữ / lấy tài khoản. Nút khôi phục thêm admin-only (thừa an toàn — tab Chung vốn chỉ Quản trị).
- help.js mục D: "Gỡ app rồi cài lại có vào được không?" + "Cách cuối cùng". HUONG_DAN.md thêm 1 dòng.
- Kiểm tra pr.py: sao lưu máy "cu" → trình duyệt mới tạo QT "moi" → khôi phục có tick: vẫn đăng nhập "moi", chỉ còn tài khoản moi, khóa nhóm của máy giữ, HĐ từ sao lưu về đủ; bỏ tick: về màn đăng nhập, tài khoản "cu" (như cũ). Hồi quy t49, t50, p2, v24, pb, ph, pd2 đạt.

### v2.6.7 Phase 1 — Xuất hàng kho gửi không BKLS + Trao đổi không lên Sheet (xong 28/09/2026; backup: _backup_truoc_v2.6.7 (pages.js, config.js, report.js, HUONG_DAN.md); CHƯA dựng bộ cài — dựng sau Phase 2)
Thủy chốt 28/09/2026: "1. bỏ Trao đổi KHÔNG đồng bộ lên Google Sheet, còn lại liên quan Trao đổi để nguyên · 2. chuyển từ kho gửi: phương án A (sao chép đợt) — ví dụ xuất ở kho gửi HAK có biên bản giao nhận hàng xuất kho gửi; hàng đó ủy thác cho Đại Hiệp thì có biên bản giao nhận ủy thác với Đại Hiệp; khi xuất không còn là chủ sở hữu thì lập BKLS tổng + từng xe Word và PDF · 3. Ủy thác: bên nhận ủy thác chọn theo hợp đồng · 4. mỗi đợt 1 hình thức".
- pages.js: PAGE_NO_BKLS = ['xuatkhogui'] + pageBkls(type) thay BKLS_TYPES[type] !== undefined ở phần giao diện (nút #bkls-, ô gợi ý số, disabled, hasBkls); bỏ bklsGroup khỏi DOCS.xuatkhogui. BKLS_TYPES / BKLS_HAS_RETURNED giữ xuatkhogui → hồ sơ cũ tạo lại BKLS được (Lưu trữ gọi generateBkls(type, src)).
- config.js: HAK.CHUNGTU.xuatkhogui.bkls = false (Tổng quan không nhắc "chưa lập BKLS" cho kho gửi).
- report.js #repGsXH: lọc bỏ lô L.type === 'traodoi' (báo cáo + Excel Xuất hàng vẫn có Trao đổi). Dòng Trao đổi đã gửi lên Sheet trước đây giữ nguyên (không tự xóa).
- Kiểm tra p7a.py: trang kho gửi không còn ô/nút BKLS, tạo biên bản được; BKLS hồ sơ kho gửi cũ tạo lại đủ 4 file; đồng bộ chỉ Xuất bán lên Sheet, Trao đổi vẫn ở thẻ Xuất hàng. Hồi quy t_bkls_pages, t_bkls_travel, t_bkls_verify_content, t_phase2(b), p2, p3, pa, v24, v242, pc, t5 đạt. Thiết bị md5 47/47.

### v2.6.7 Phase 2 — ➡ Chuyển Xuất hàng kho gửi sang Xuất khẩu / Ủy thác / Xuất bán (xong 28/09/2026; Thủy "ĐỒNG Ý"; backup: _backup_truoc_v2.6.7_phase2 (pages, generator, records, main, report, help, HUONG_DAN); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.7.exe; zip trọn bộ v2.6.7)
- pages.js: CONV_FROM = { xuatkhogui: ['xuatkhau','uythac','xuatban'] }; khung "➡ Chuyển sang hình thức khác" (nút [data-conv], #convState-<type>) dưới nút tạo; convertTo(src, dst): phạm vi đang lọc → các đợt (tên file từ r.uid) → chặn nếu đợt đã conv sang hình thức khác → HAK.App.copyBatches → điền trang đích: ship, giaoId (bên gửi), khoGiaoId (kho xuất), wh (Ủy thác ← whLabel) + saveForm; ST[dst].filter = {groups, from, to, files, exclude (Xuất bán: xe trả về), fromType, fromShip}; đích có xe trả về → ST.returned = danh sách nguồn. collect() đưa filter.files / filter.exclude vào params (lưu cả vào hồ sơ Lưu trữ). renderConv: #convNote-<type> "Phạm vi chuyển từ …" ở khung lọc; "Đặt lại bộ lọc" bỏ giới hạn. Bên nhận ủy thác / bên mua: chọn hợp đồng ở trang đích (Thủy chốt).
- generator.js filterRows: thêm filter.files (giữ dòng có uid thuộc các file) + filter.exclude (loại theo retKey) — không có 2 khóa này thì như cũ.
- main.js: App.copyBatches(src, list, dst) — dùng chung workbook đã đọc (hoặc đọc lại từ file lưu), lưu bền file cho loại đích (Batches.save), đợt đích from = {type, fileName}, đợt gốc conv = {to}; cùng tên → thay. Nạp lại file cùng tên giữ conv/from; xóa đợt đích → xóa conv của đợt gốc; restoreBatches đọc conv/from; bảng đợt ở Nhập liệu có nhãn "➡ đã chuyển sang …" / "⬅ chép từ …".
- records.js: Batches.saveMeta lưu conv, from; Batches.bytes(type, fileName).
- report.js: tripKey(); loadGroupRows khử trùng lượt cân trong nhóm (hồ sơ đích trước, kho gửi sau); Excel ĐVVC bỏ xe kho gửi đã có ở hồ sơ hình thức khác (kể cả Xuất bán nằm nhóm khác).
- help.js: mục "Xuất hàng kho gửi → Xuất khẩu / Ủy thác / Xuất bán" (mọi người dùng). HUONG_DAN.md thêm 1 dòng.
- Kiểm tra p7b.py: kho gửi (lọc 16–17/08, 2 xe trả về) → Ủy thác: tàu/bên/kho/lọc/file/2 xe trả về mang sang, 395 xe; chọn HĐ UT-01 → bên nhận = Đại Hiệp; tạo biên bản + BKLS; chuyển tiếp sang Xuất bán bị chặn; tải lại app: đợt chép + nhãn còn; xóa đợt Ủy thác → chuyển Xuất bán được, loại 2 xe trả về (393 xe); Lưu trữ đủ 3 hồ sơ; Excel ĐVVC nhóm tàu 395 xe (không 790). Hồi quy t_bkls_pages, t_bkls_travel, t_phase2(b), p2, p3, pa, v24, v242, t52, t49, pb, pc, t5, p7a, pd4, ph đạt; điện thoại / tối không tràn; không lỗi JS. Thiết bị md5 47/47.

### v2.6.8 — Sửa lỗi BKLS Ủy thác: "Vận chuyển từ" luôn là "Công ty TNHH Hoàng Anh Khôi" (xong 29/09/2026; Thủy báo bằng ảnh BKLS_Uythacxuatkhau_5956XH-2026 từng xe; duyệt "Ok bạn"; backup: _backup_truoc_v2.6.8 (pages.js, bkls.js); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.8.exe)
- Nguyên nhân gốc: BKLS lấy điểm đi / đến từ p.khoGiaoId / p.khoNhanId (pages.js generateBkls → xuatKhoTai / noiDen), nhưng trang Ủy thác KHÔNG có 2 ô này (chỉ có ô "wh" = chữ ghi phụ lục) → rỗng → bkls.js ghi cứng 'Công ty TNHH Hoàng Anh Khôi' / 'Cảng Tiên Sa Đà Nẵng' (cả bản Tổng lẫn Từng xe). Xuất khẩu / Xuất bán / Trao đổi có đủ 2 ô → không bị.
- pages.js DOCS.uythac: thêm nhóm "Kho xuất / cảng": khoGiaoId (def w_dh; mặc định theo kho xuất của công ty làm việc — companyDefaults; theo hợp đồng c.whId; chuyển từ kho gửi mang sang) + khoNhanId (def w_ts). BKLS trả về (TV) của Ủy thác: nơi đến = "Kho nhận xe trả về" (returnWh) trước, rồi mới đến kho xuất (giữ như kết quả cũ).
- bkls.js: bỏ 2 chuỗi ghi cứng; diemDiOf(g) = kho xuất → địa chỉ chủ lâm sản → "………"; diemDenOf(g) = nơi đến → "………". Hồ sơ Ủy thác cũ trong Lưu trữ (không có ô kho) tạo lại BKLS → "Vận chuyển từ" = địa chỉ chủ lâm sản, "đến" = "………".
- Kiểm tra p8.py / p8b.py: Ủy thác bên ĐH, kho ĐH → Cảng Dung Quất: BKLS tổng + 144 trang từng xe ghi đúng "Thôn Phú Quý, Xã Đại Lộc… đến: Cầu cảng Dung Quất", 0 dòng HAK cứng; hồ sơ cũ → địa chỉ chủ ĐH + "………". Hồi quy t_bkls_pages, t_bkls_travel, t_bkls_verify_content, t_phase2(b), p2, p3, pa, v24, v242, p7b, pc đạt.
- Việc của Thủy: BKLS 5956XH-2026 đã in sai → mở trang Ủy thác, chọn đúng Kho xuất / Cảng, tạo lại BKLS cùng số.

### v2.6.9 — Mẫu Ủy thác cân khung + gọn 1 trang; Cài đặt Công ty / Kho / Mã ĐVVC có Sửa / Xóa / Lưu (xong 29/09/2026; Thủy "1. A 2. CHẶN HẲN 3. CÓ THÊM Ô 'KHO XUẤT MẶC ĐỊNH' — MẪU ỦY THÁC THỐNG NHẤT"; backup: _backup_truoc_v2.6.9 (settings.js, templates-data.js, style.css, UyThac.docx, index.html, HUONG_DAN.md); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.6.9.exe)
- Mẫu Ủy thác: Thủy bác bản thiết kế lại ("để mẫu như cũ, chỉ cân chỉnh khung") → GIỮ NGUYÊN nội dung mẫu gốc; chỉ đổi độ rộng bảng đầu 63/37 (tools/fix_table_widths.py --table 0 --ratio 63,37: tcW + gridCol + layout fixed) và giảm giãn dòng phần biên bản (tools/tighten_spacing.py: 350→120, 300/250→100, 150→60, 120→40; lề ô 60→30) → biên bản 1 trang có chữ ký, phụ lục (ngang) từ trang 2. Bỏ "giữ với dòng sau" trong ô bảng (làm cả bảng nhảy trang). templates-data.js dựng lại bằng embed_templates.py. Mẫu Word tự nạp (hak.tpl.UyThac) vẫn ưu tiên như cũ.
- settings.js: sửa theo hộp thoại (phương án A) — ensureModal (#setModal), openForm(title, fields, onSave → {errors, warnings}; cảnh báo phải bấm Lưu lần 2), commit(msg). Bảng Công ty / Kho / Mã ĐVVC chỉ xem + nút ✏ Sửa / 🗑 Xóa (điện thoại: chỉ biểu tượng). Xóa CHẶN HẲN khi đang dùng: companyUsage (hợp đồng, nhân viên, máy trạm, Sheet, công ty đang làm việc, hồ sơ Lưu trữ, công ty cuối cùng), whUsage (kho xuất mặc định của công ty, hợp đồng, form đã lưu khoGiaoId/khoNhanId, kho cuối cùng). Công ty thêm ô "Kho xuất mặc định" (khoXuat). Kiểm tra: tên + tên tắt bắt buộc, tên tắt không trùng; MST trùng → cảnh báo; kho trùng mã / tên → cảnh báo; ĐVVC trùng mã (chuẩn hóa) → lỗi. Tab Chung: nháp gDraft + 💾 Lưu / Hủy (#gSave/#gCancel/#gState), rời trang khi chưa lưu → nhắc.
- index.html / style.css: tiêu đề thẻ, bảng xuống dòng, ẩn cột phụ trên điện thoại. HUONG_DAN.md thêm mục "Cài đặt Công ty / Kho / Mã ĐVVC (v2.6.9)".
- Kiểm tra ps.py (form, kiểm tra dữ liệu, chặn xóa "công ty đang làm việc" / "kho xuất mặc định của HAK2", điện thoại, tối) + hồi quy p2, p3, pa, v24, v242, t_phase2(b), t_bkls_pages, t_bkls_travel, t49, t50, t52, pb, pc, t5, pd2, pd4, ph, p7b, p8 đạt; không lỗi JS. Test cũ t4, t20, t32, t6 (/tmp/pw) dựa vào ô nhập trực tiếp cũ → lỗi thời. Thiết bị md5 47/47 khớp (759cde90…).
- Tiếp theo (Thủy): duyệt lần lượt từng mẫu còn lại (Xuất khẩu, Xuất bán, Xuất hàng kho gửi, Trung chuyển gửi kho, Trao đổi, Điều chuyển) — giữ nội dung, chỉ cân khung + gọn 1 trang, gửi bản xem trước duyệt từng mẫu.

### v2.7.0 — Giao diện mới + chia TAB vùng nhập liệu ở 7 trang biên bản (xong 29/09/2026; Thủy: "chưa phân vùng và chia thành các tab nhập liệu theo vùng cho chuyên nghiệp" → duyệt bản xem trước; "Điều chuyển để tab 2, chung Quyết định"; backup thiết bị: _backup_truoc_v2.7.0 (pages.js, help.js, style.css, index.html, HUONG_DAN.md); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.7.0.exe; thiết bị 49 file (thêm css/fonts.css, js/icons.js), md5 6d65589a…)
- Tab vùng (pages.js): ZONES = Dữ liệu cân (lọc ngày + xe trả về) · Hợp đồng & bên (HĐ danh mục, tàu, các bên, HĐ ủy thác, chứng thư) · Kho & cảng · Biên bản · BKLS. Mỗi nhóm DOCS có thuộc tính zone; DOCS.zoneLabels đổi tên tab riêng: Điều chuyển { party: 'Quyết định & chiều' } (Chiều điều chuyển + Quyết định chung tab 2 → trang chỉ 2 tab), Xuất bán { doc: 'Giá & biên bản' }. Vùng không có nhóm → bỏ tab (Trung chuyển gửi kho / Xuất hàng kho gửi: 4 tab).
- buildPage: thanh #zones-<type> (.zone-tab[data-zone]) toàn chiều ngang + .zone-body chứa .zone-pane (hidden) + nút ‹ Quay lại / Tiếp › ([data-zone-go]). Mọi ID ô nhập giữ nguyên, ô ở tab ẩn vẫn trong DOM → collect() / tạo biên bản / BKLS / hợp đồng tự điền / chuyển kho gửi không đổi.
- Trạng thái tab: renderZones (gọi cuối updateSummary) + zoneIssues: ✓ đủ · đỏ = thiếu ô bắt buộc (tên tàu; không có phiếu trong phạm vi / chưa có dữ liệu) · vàng ở BKLS (Số BKLS, hệ số, tên bên mua khi không tự lấy). Tách bklsMissing(type, p, needBuyer) dùng chung cho generateBkls và trạng thái tab (không trùng logic).
- focusField / focusError: bấm Tạo biên bản (lỗi generator: tên tàu, độ ẩm, tấn khô, đơn giá, không có phiếu) / Tạo BKLS / Chuyển sang khi thiếu → mở đúng tab + tô đỏ ô (is-invalid, tự bỏ khi sửa). Chuyển từ kho gửi → trang đích mở tab 2 (chọn hợp đồng). Nhớ tab từng trang: localStorage 'hakui.zone' (không tiền tố hak. → không vào sao lưu).
- Giao diện (phương án A): css/fonts.css (Be Vietnam Pro 400–700 nhúng base64, OFL — file:// không nạp được font rời); js/icons.js (HAK.Icons.svg, Lucide ISC) thay emoji menu trái, đầu trang biên bản, nút Tạo biên bản / PDF / Excel / BKLS / xe trả về / chuyển hình thức (không có icon → giữ emoji); khối CSS v2.7.0 cuối style.css: menu gọn 256px đủ 15 mục 1 màn hình, thẻ phẳng, nhãn chữ thường, ô số liệu Tổng quan có vạch màu, tab (điện thoại: tab chưa mở chỉ hiện số). Emoji ở các trang khác (Tổng quan, Nhập liệu, Chứng từ, Báo cáo…) còn giữ — để Phase 2.
- help.js mục mới help-tabs "Trang biên bản: nhập theo 5 tab"; HUONG_DAN.md bước 3 Cách dùng.
- Kiểm tra: tz.py (HAK_ZONES_STRICT=1: 7 trang đúng tab/nhãn, mọi ô nằm trong tab, trạng thái đỏ/vàng/✓, tạo khi thiếu tàu → tab 2 + ô đỏ + focus, BKLS thiếu → tab 5 focus Số BKLS, Tiếp/Quay lại, tải biên bản, nhớ tab sau tải lại, chuyển kho gửi thiếu tàu → focus, chuyển xong → Ủy thác tab 2, collect đủ ô tab ẩn, điện thoại/tối không tràn, 0 lỗi JS). Ảnh chụp 10 trang khác không vỡ bố cục. Hồi quy p2, p3, pa, v23 (PDF in + BKLS PDF), v24, v242, t_phase2(b), t_bkls_pages, t_bkls_travel, t_bkls_verify_content, t49, t50, t52, pc, t5, ph, p7a, p7b, p8, ps + (HAK_NO_AUTOLOGIN=1) pb, pd2, pd4, pr đạt. Móc test /tmp/pwhook: mặc định hiện mọi tab cho test cũ (tắt bằng HAK_ZONES_STRICT=1).

### v2.7.2 (gộp v2.7.1) — BKLS tổng liệt kê BKLS con + ĐVVC · nguồn gốc mặc định mới · danh sách xe RIÊNG TỪNG ĐỢT · file Excel mẫu tải trong app (xong 30/09/2026; đã cài thiết bị (backup _backup_truoc_v2.7.2), md5 50/50 khớp; bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.7.2.exe; file app 50 (thêm js/sample-xlsx.js), md5 danh sách f407aefc…)
- v2.7.1 BKLS tổng (Thủy chốt phương án A): mục 5 "Hồ sơ kèm theo" = dòng tổng (N BKLS từng xe số …-0001 đến …-N; số xe; lượt; số ĐVVC + số BKLS chưa có ĐVVC) → mỗi ngày (đậm: số BKLS, số xe, MT, BDMT) → mỗi ĐVVC trong ngày (nghiêng: số BKLS, số xe) → từng BKLS con 1 dòng "+ BKLS số: …, KL: a MT – b BDMT, số xe: …, tài xế: …" (9,5pt để 1 dòng). Thủy "thiếu đơn vị vận chuyển" → gom theo ĐVVC trong ngày (ghi tên ĐVVC trên từng dòng thì ~35 tờ). bkls.js hoSoOf(lot) {head, rows[{k:'day'|'dv'|'it'}], lines}; applyHoSo (Word: chèn đoạn sau "Hồ sơ kèm theo", "Tổng số tờ" = trường NUMPAGES, giá trị tạm ≈ lines/60); buildPdf ghi mục 5 + "Tờ số(2): 1 Tổng số tờ: N" đúng số trang thật. Ô tick bklsListTrips (tab BKLS, mặc định bật; bỏ = bản tổng 1 trang như cũ); lot.listTrips; trip.donViVc = r.carrier || p.defaultCarrier || Cài đặt chung. Tổng ngày = cộng dòng con (có thể lệch 0,01 BDMT so với mục 3 do làm tròn từng xe). Dữ liệu thử 1.048 xe: Word 18 tờ, PDF 20 tờ.
- v2.7.1 nguồn gốc lâm sản mặc định: "Dăm gỗ keo sản xuất từ nguyên liệu gỗ keo rừng trồng mua từ cá nhân và hộ gia đình" (pages.js NGUON_GOC_DEF + bkls.js DEFAULT_NGUON_GOC); form lưu còn đúng câu cũ → tự đổi (saved()); câu tự sửa giữ nguyên; ô trống → câu mới.
- v2.7.2 danh sách xe riêng từng đợt (Thủy: "kèm cảnh báo và cho dự phòng đợt gần nhất để chọn của lô khác"): batch.veh = {fileName, sheet, count, list, at, src: file|attach|copy|legacy, from?} lưu trong meta đợt (records.js saveMeta). vehicles.js: parseWorkbook ưu tiên sheet có cột tài xế + opts.skip/needDriver (trước đây đọc nhầm sheet bảng cân), fromWorkbook (sheet DS trong chính file đợt), readFileVeh, legacy(), enrich(ds, veh) — veh null → cảnh báo "🚚 Đợt này chưa có danh sách xe…". main.js: handleFile tự đọc DS trong file (thay file cùng tên không có DS → giữ DS cũ); khung "Danh sách xe & tài xế — đợt …": ⬆ Gắn file danh sách xe, Bỏ danh sách, "Dự phòng — dùng danh sách của đợt khác" (#vehPick, ★ = gần nhất, mọi hình thức + danh sách chung cũ), ⬇ Tải file Excel mẫu (#vehTpl, link [data-sample-xlsx] dưới ô thả file + trong Hướng dẫn); cột "DS xe" trong bảng đợt; copyBatches mang theo veh; restore đọc m.veh, đợt lưu từ bản cũ (m.veh undefined) được gắn danh sách chung cũ 1 lần (cờ hak.mig.vehPerBatch). chungtu.js cảnh báo theo đợt. excel.js parseDT: số 0<v<1 = ô giờ Excel.
- File Excel mẫu (tools/build_sample_xlsx.py → LibreOffice recalc → tools/embed_sample_xlsx.py → js/sample-xlsx.js, nạp khi bấm tải): BANG CAN (thông tin đợt, tổng tự tính, cột Số phiếu/Ngày cân/Giờ vào-ra (chữ)/Biển số (chọn từ DS)/Cân 1/Cân 2/KL hàng (công thức)/Kho xuất/Ghi chú/Kiểm tra DS xe), DS XE - TAI XE (Biển số, Họ và tên tài xế, SĐT, Mã ĐVVC chọn, Tên ĐVVC tự tra, Số chuyến trong bảng cân; báo trùng), MA DVVC, HUONG DAN; vùng in tự co theo số dòng (Excel).
- help.js mục help-veh; mục help-tabs thêm ô liệt kê BKLS; HUONG_DAN.md mục Danh sách xe viết lại + BKLS mục 5.
- Kiểm tra: tv.py (file mẫu có DS → 60 xe; file cân không DS → cảnh báo + dự phòng ★; dùng lại / gắn riêng / bỏ; đợt khác không đổi; ô giờ Excel; tải mẫu; tải lại giữ DS; chuyển kho gửi → Ủy thác mang DS), tm.py (chuyển tiếp danh sách chung cũ 1 lần), tb2.py (BKLS tổng có ĐVVC), tng.py (nguồn gốc). Hồi quy p2, p3, pa, v23, v24, v242, t_phase2(b), t_bkls_pages, t_bkls_travel, t_bkls_verify_content, t49, t50, t52, pc, t5, ph, p7a, p7b, p8, ps, tz (tab strict) + pb, pd2, pd4, pr (không tự đăng nhập) đạt; không lỗi JS. Test cũ dùng danh sách xe chung (bklspg*, carrier*, t6–t40 có #vehInput) lỗi thời.

### v2.7.3 — Mật khẩu chủ của nhóm (xong 07/10/2026; Thủy: "còn nếu quên luôn rồi, vì nhiều đơn vị quá" → chọn phương án A; backup thiết bị _backup_truoc_v2.7.3 (auth.js, backup.js, dashboard.js, help.js, HUONG_DAN.md); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.7.3.exe; thiết bị md5 50/50 khớp (6ff2e44a…))
- Bối cảnh: Thủy mất file HAK_KhoaKhoiPhuc.key; Downloads còn HAK_MaKhoiPhuc.txt (06/10/2026) → hướng dẫn dùng mã khôi phục. Nhiều đơn vị → khó nhớ mã từng máy + file key.
- auth.js: d.master = { salt, iter 310000, hash PBKDF2-SHA256(câu chuẩn hóa NFC + gộp khoảng trắng + trim, phân biệt hoa/thường), fp, at } — không lưu câu gốc. screenForgot có nút nổi bật "🔐 Dùng mật khẩu chủ của nhóm" → screenForgotMaster (tên đăng nhập QT + mật khẩu chủ + mật khẩu mới; sai 5 lần khóa 30 giây). Cài đặt → 👤 Tài khoản: thẻ #mpBody (đặt / đổi ≥ 12 ký tự ×2 + xác nhận mật khẩu đăng nhập của mình, Gỡ, máy trạm chỉ xem) + "🖨 In phiếu khôi phục của máy" (printRecoverySheet: loại máy, Quản trị, dấu vân tay mật khẩu chủ / khóa nhóm, sao lưu gần nhất, các bước — không có mật khẩu). Gói cấu hình: packOut/packIn mang master. Tạo QT mới: mã khôi phục không bắt buộc khi đã có khóa nhóm hoặc mật khẩu chủ.
- backup.js: xem trước gói có dòng "Mật khẩu chủ của nhóm"; packMsg. dashboard.js: nhắc sao lưu sau 7 ngày (trước 14, chữ đỏ); Quản trị chưa đặt mật khẩu chủ → nhắc. help.js: A2 đặt mật khẩu chủ (A2b khóa nhóm tùy chọn; công cụ exe gọi "mật khẩu chủ" của file khóa — help ghi rõ "mật khẩu của file khóa"), D quên mật khẩu: cách nhanh nhất bằng mật khẩu chủ; thông tin máy có dòng mật khẩu chủ. HUONG_DAN.md.
- Kiểm tra pm.py: nhắc ở Tổng quan; kiểm tra ngắn / không khớp / sai mật khẩu mình; lưu 1,6 giây, không lưu câu gốc; phiếu in đúng, không lộ câu; gói có master; quên → sai câu / tên NV bị từ chối, đúng (khoảng trắng thừa) vào app, mật khẩu mới dùng được; 5 lần sai khóa 30 giây; máy B cài gói → có mật khẩu chủ, màn mã khôi phục cho bỏ qua, khôi phục bằng mật khẩu chủ được. Hồi quy p2, v24, t_bkls_pages, t5, ph, p7b, ps, t49, pb, pc, pd2, pd4, pr, tz, tv đạt; không lỗi JS.
- Việc của Thủy: đặt mật khẩu chủ ở máy chính → xuất lại Gói cấu hình cho các máy / đơn vị → in phiếu khôi phục từng máy; chép câu ra giấy cất két; tạo lại khóa nhóm (key cũ mất) nếu muốn giữ đường công cụ exe.

### Công cụ hỗ trợ ngoài bộ cài (07/10/2026)
- MoKhoa_1Lan.html (đặt trong thư mục app trên máy Thủy, KHÔNG vào bộ cài): mở khóa 1 lần — đặt lại mật khẩu 1 Quản trị (HAK.Auth._hash), dùng xong tự vô hiệu (cờ hak.unlock.used). Thủy vào lại được thì xóa file.
- XoaSach_DuLieu_HAK.html (Downloads): xóa sạch dữ liệu app trong trình duyệt (localStorage hak*, sessionStorage hak*, IndexedDB hak-app + hak-archive) — phải gõ "XOA HET"; quét lại khóa lúc bấm (tab app đang mở ghi lại hak.form.* khi đóng). Dùng khi bàn giao / dọn máy. Lý do: gỡ / cài lại app không xóa tài khoản vì dữ liệu nằm trong trình duyệt.

### v2.7.4 Phase 1 — Quá tải hồ sơ Lưu trữ (xong 08/10/2026; Thủy: "ĐÃ CÓ SAO LƯU KHI DỮ LIỆU NHIỀU LÊN CHƯA?" → "QUÁ TẢI HỒ SƠ"; backup thiết bị _backup_truoc_v2.7.4 (index.html, HUONG_DAN.md, js/archive.js, js/help.js); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.7.4.exe; thiết bị md5 50/50 khớp (804232ae…))
- archive.js: BỎ tự xóa khi quá 500 hồ sơ (trim() chỉ còn nhắc 1 lần / phiên khi > SOFT_WARN = 1.500, nhãn "nhiều — nên dọn" cạnh số hồ sơ). Trang Lưu trữ hiện PAGE = 200 dòng, nút #archMore "Hiện thêm 200 (còn N)"; tìm kiếm / lọc loại vẫn trên toàn bộ và đặt lại về 200.
- 📦 Xuất & dọn hồ sơ cũ (#archPrune, admin-only; panel #archPrunePanel/#archPruneBody, renderPrune): chọn "Hồ sơ cập nhật trước ngày" (mặc định 1 năm trước, ngày 1) — chỉ tính hồ sơ trong phạm vi công ty đang xem (scopeFilter() dùng chung với danh sách) → ① xuất HAK_LuuTru_HoSoCu_<từ>-<đến>.json (định dạng sao lưu Lưu trữ, pruned:true; qua HAK.Backup.saveBackupBlob) → ② tick "đã kiểm tra file" mới bật nút xóa (confirmClick 2 lần), xóa đúng các id đã xuất. Hủy hộp lưu → không có bước ②. render() tự vẽ lại panel khi đang mở (sau khôi phục / xóa / đổi phạm vi).
- help.js mục help-arch; tiêu đề hướng dẫn "Cập nhật bản v2.7.4"; HUONG_DAN.md mục Lưu trữ + Bộ nhớ & sao lưu.
- Kiểm tra /tmp/zt/arch/tarch.py: nạp 1.600 hồ sơ → không mất hồ sơ nào, có nhắc + nhãn; 200 dòng / Hiện thêm → 400; tìm kiếm; dọn trước 01/10/2025 → 1.068 hồ sơ, file có đúng 1.068, chưa tick thì nút xóa khóa, bấm 1 lần chưa xóa, bấm 2 lần còn 532, không xóa nhầm; ⬆ Khôi phục file → 1.600; điện thoại không tràn; 0 lỗi JS (đã sửa lỗi e.currentTarget null sau await). Hồi quy p2, v24, t_bkls_pages, t5, ph, p7b, ps, t49, pb, pc, pd2, pd4, pr, pm, tz, tv đạt.
- 3 mục còn lại (ZIP, tự sao lưu, sức khỏe dữ liệu) làm ở v2.7.5.

### v2.7.5 — Sao lưu .zip · 🔁 Tự sao lưu vào thư mục (xoay vòng) · 🩺 Sức khỏe dữ liệu (xong 08/10/2026; Thủy "OK EM" cho 3 mục còn lại của đề xuất v2.7.4; backup thiết bị _backup_truoc_v2.7.5 (index.html, HUONG_DAN.md, css/style.css, js/backup.js, dashboard.js, archive.js, help.js); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.7.5.exe; thiết bị md5 50/50 khớp (c75800c9…))
- backup.js: buildFull() (mảng chuỗi JSON) + zipParts() (JSZip DEFLATE 6, bên trong HAK_SaoLuuToanBo.json) → ⬇ Sao lưu toàn bộ ra HAK_SaoLuuToanBo_<ngày>.zip (thiếu JSZip → .json như cũ); saveBackupBlob chọn kiểu file theo đuôi. readJson(file): nhận "PK" = zip hoặc .json; restoreFile + Archive.importFile dùng chung (input accept thêm .zip). Thử: 267 KB JSON → 78 KB zip.
- Tự sao lưu: thư mục chọn bằng showDirectoryPicker mode readwrite, tay cầm HAK.DB 'handles' khóa 'autoDir' (riêng với thư mục mở sẵn 'backupDir'); cấu hình hak.autobk {on, keep 5/10/20/30 (mặc định 10), last{at,ok,name,size,archive | failAt,err}} — KHÔNG đưa vào sao lưu / khôi phục (gắn máy). autoTick sau 20 giây rồi mỗi 30 phút: quá 20 giờ từ lần tốt gần nhất → ghi HAK_TuDong_<yyyymmdd>_<hhmm>.zip, đọc lại so dung lượng, xóa bản HAK_TuDong_*.zip cũ hơn N (regex chặt, không đụng file khác), cập nhật hak.backup.last. Quyền 'prompt' (trình duyệt hỏi lại sau khi mở) → Tổng quan có cảnh báo 🔁 nút [data-autobk-allow] "Cho phép & sao lưu" (requestPermission trong thao tác bấm). Cài đặt → Chung: khối 🔁 (#abPick, #abOn, #abKeep, #abRun, #abForget, bảng các bản trong thư mục). Lỗi → toast 1 lần/phiên + ô đỏ.
- 🩺 Sức khỏe dữ liệu (Tổng quan, #dashHealth, Backup.health()): bộ nhớ trình duyệt (đỏ RAM tạm / >80%; vàng >50% hoặc chưa persisted khi chưa có tự sao lưu tốt), localStorage /5 MB (vàng >60%, đỏ >85%), Lưu trữ (vàng > SOFT_WARN 1.500 — Archive xuất SOFT_WARN), sao lưu gần nhất (vàng >7 ngày, đỏ >14 / chưa có), tự sao lưu (xanh bật + có quyền; đỏ lỗi; còn lại vàng). CSS .hl-*.
- help.js help-autobk; HUONG_DAN.md mục Bộ nhớ & sao lưu.
- Kiểm tra /tmp/zt/ab/tab.py (chạy qua http://localhost:8790 để dùng OPFS làm thư mục thật): nút .zip + kiểu hộp lưu; zip đọc được, không chứa hak.autobk; chọn thư mục → tự bật; 12 bản giả + ghichu.txt → giữ 10, ghichu còn; giữ 5 → 5; bản tự sao lưu đọc lại được; Tổng quan 5 ô "Tốt"; quyền prompt + đến hạn → nút Cho phép → hỏi quyền 1 lần, ghi file, nút mất; quyền sẵn → tự chạy sau ~20 giây; khôi phục .zip / .json cũ (giữ cấu hình tự sao lưu của máy); zip hỏng báo lỗi; điện thoại không tràn; 0 lỗi JS. t33/t36 bản zip (/tmp/zt/ab/t33_zip.py, t36_zip.py: khôi phục đợt Excel sang trình duyệt mới) + t50_nofsapi đạt; tarch.py đạt. Hồi quy run3 đạt (t5 cần chạy server2.js; ph thỉnh thoảng lỗi do test sửa hak.auth.v1 sau lưng app — đo thời gian khởi động cũ/mới bằng nhau ~200 ms).
- Lưu ý vận hành: Chrome/Edge với file:// thường hỏi lại quyền ghi thư mục mỗi lần mở trình duyệt → bấm "Cho phép & sao lưu" ở Tổng quan; nên chọn thư mục Google Drive / OneDrive để có bản ngoài máy.

### v2.7.6 — Ô "Mã HS" trong BKLS (xong 08/10/2026; Thủy hỏi "mã HS B113 là số ở đâu" → là chữ cố định " B11 3" trong mẫu Word BKLS nhúng (js/bkls-assets.js) → chọn phương án A; backup thiết bị _backup_truoc_v2.7.6 (HUONG_DAN.md, js/pages.js, bkls.js, help.js); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.7.6.exe; thiết bị md5 khớp (f0b7040e…))
- pages.js: MA_HS_DEF { xuatkhau, uythac, xuatkhogui: '4401.22.90' } (nội địa trống); bklsGroup(autoBuyer, hasReturned, maHsDef) thêm ô bklsMaHs (col 3, Nguồn gốc còn col 9); maHsOf(type, p): p.bklsMaHs có (kể cả trống) → dùng; chưa có (hồ sơ cũ Lưu trữ / form cũ) → mặc định hình thức. gCommon.maHs.
- bkls.js: commonValues.maHsLine = 'Mã HS (áp dụng đối với lâm sản nhập khẩu, xuất khẩu): ' + (maHs || '……………………') (g.maHs undefined → null = giữ mẫu); applySubstitutions (Word tổng), buildSpliceMap + optional 'maHsLine' (Word từng xe), PDF addBullet(v.maHsLine || snap.maHS).
- Kiểm tra /tmp/zt/hs/ths.py: mặc định XK 4401.22.90; Word tổng / PDF tổng / Word từng xe (1.048 trang) / PDF từng xe đều đúng giá trị mặc định, giá trị sửa (4401.22.10), để trống (dấu chấm); Trao đổi / Xuất bán mặc định trống, Ủy thác 4401.22.90; 0 lỗi JS. Hồi quy run3 đạt (t5 chạy cùng server2.js trong 1 lệnh).
- Lưu ý: mã 4401.22.90 là mặc định em đề xuất (dăm gỗ không thuộc cây lá kim — loại khác); Thủy cần đối chiếu tờ khai hải quan.

### v2.7.7 — Sửa mã HS mặc định thành 4401220090 (xong 08/10/2026; Thủy: "4401220090 nhưng vào phần mềm thì 4401.22.90, mất 2 số không" — gốc lỗi: MA_HS_DEF của v2.7.6 em đặt sai (thiếu "00", có dấu chấm), app KHÔNG tự định dạng ô nhập; backup thiết bị _backup_truoc_v2.7.7 (HUONG_DAN.md, js/pages.js, help.js); bộ cài Downloads\HAK_QuanLyXuatHang_Setup_v2.7.7.exe; thiết bị md5 khớp (2404458d…))
- pages.js: MA_HS_DEF = '4401220090' (xuatkhau, uythac, xuatkhogui); MA_HS_OLD = '4401.22.90': saved() đổi form đã lưu còn đúng giá trị cũ; maHsOf() đổi hồ sơ Lưu trữ lập bằng v2.7.6 khi tạo lại BKLS. Giá trị người dùng gõ khác vẫn in nguyên văn.
- Kiểm tra /tmp/zt/hs/ths2.py: mặc định 4401220090; form Ủy thác lưu 4401.22.90 → 4401220090; gõ 4401220090 / 4401.22.00.90 → Word + PDF in đúng nguyên văn; tải lại giữ giá trị; 0 lỗi JS. Hồi quy p2, t_bkls_pages, v24, tz đạt.

### Còn lại
- Thủy: chạy HAK_KhoiPhucQuanTri.exe tạo khóa nhóm → dán khóa công khai vào app → xuất Gói cấu hình cho các máy.
- Chờ Thủy cài Apps Script và thử đồng bộ Google Sheet thật (mỗi công ty 1 Sheet).
- Nhật ký chứng từ chưa lọc theo công ty; ô Bên giao / Bên nhận biên bản chưa chọn được khách ngoài nhóm.

## Ý tưởng tiếp theo (chưa làm)
- v2.7 Phase 2 (tùy Thủy): phân vùng / tab + biểu tượng mới cho Nhập liệu, Danh mục HĐ, Báo cáo, Tổng quan, Chứng từ.
- Gom mã nguồn (hiện nhiều file JS) thành 1 bản dựng để cài nhanh hơn; kiểm thử tự động đóng gói kèm app.
- Hiện số phiên bản trong app (để biết máy đang chạy bản nào).

## v2.11.2 — Báo cáo theo năm, hiện số phiên bản, sửa hướng dẫn
- Báo cáo: ô chọn Năm, bảng + sheet Excel "Theo năm", tên file xuất có kỳ báo cáo.
- Hiện số phiên bản (js/version.js → sidebar "v2.11.2" và đầu trang Hướng dẫn); tests/version.test.cjs bắt buộc khớp installer/setup.nsi.
- Hướng dẫn (HUONG_DAN.md, trang Hướng dẫn trong app) cập nhật theo Sổ hồ sơ năm / Đóng năm của v2.10–2.11; bỏ mô tả "dọn theo năm v2.8.0" không có trong bản phát hành.
- Bộ cài NSIS dựng tự động trên GitHub Actions (.github/workflows/build-setup.yml).

## v2.12.0 — Bỏ phiếu cân
- generator.js: filterRows nhận filter.omit (khóa G.omitKey = số phiếu|biển số|giờ cân vào) — phiếu bỏ coi như không có ở mọi đầu ra (biên bản, BKLS, Lưu trữ, Báo cáo).
- pages.js: nút 🚫 Bỏ phiếu cân… + hộp thoại (tìm, tick, lý do, khôi phục tất cả); p.filter.omit / omitLog lưu kèm hồ sơ; mở hồ sơ đã lưu nạp lại omitLog; dòng "Đã bỏ N phiếu · −X tấn".
- tests/omit-tickets.test.cjs (3 kiểm thử). 

## v2.12.1 — Cảnh báo phiếu trùng khác khối lượng
- main.js mergeSlot: gom dòng theo G.omitKey; phiếu trùng giữa các file mà khác net/gross/tare → ds.conflicts; mặc định giữ đợt trước, lựa chọn "dùng đợt sau" lưu ở HAK.Store 'hak.dupprefer.<loại>'.
- Khung vàng + nút "Xem & chọn" (hộp thoại từng phiếu, chọn tất cả), toast sau khi nạp, thêm vào ds.warnings.

## v2.12.2 — Sửa lỗi cài đè
- installer/setup.nsi: macro StopHakDocs (taskkill HAKDocs.exe, chờ 1,2 giây) chạy trước khi cài đè và trước khi gỡ cài đặt — HAKDocs.exe tự chạy ngầm (--serve) nên khóa file ("Error opening file for writing ...\native\HAKDocs.exe").

## v2.12.3 — Chữ vỡ font khi tạo Word, lỗi lưu tệp
- docx-worker.js: Blob(atob(...)) mã hóa UTF-8 hai lần → chữ tiếng Việt trong worker thành "Ä ang…"; đổi sang Uint8Array.from(atob(...)). tests/docx-worker.test.cjs thêm kiểm thử (thất bại trước khi sửa).
- word.js saveBlob: thử lại khi HAKDocs trả 409 "OCR is processing another document" (≤ 40 lần × 1,5 giây); lỗi mạng và tệp > ~26 MB báo rõ bằng tiếng Việt. Giữ nguyên nguyên tắc không tự chuyển sang tải của trình duyệt (tests/download-save.test.cjs).

## v2.12.4 — BKLS nhanh hơn, gợi ý hộp Lưu
- pages.js generateBkls: luôn gọi HAK.BklsTemplates.choose (mặc định BKLS tổng · Word) kể cả khi tạo lại từ Lưu trữ (src) — trước đó src dùng 4 ô p.bklsTotal*/Trip* đã lưu (mặc định true) → luôn tạo cả từng xe Word + PDF. Bỏ 4 ô tick; nút "Tạo BKLS…".
- word.js saveBlob: toast gợi ý "Đang mở hộp Lưu của Windows… tìm biểu tượng nhấp nháy ở taskbar"; tests/download-save.test.cjs cập nhật (chỉ đếm toast lỗi / cảnh báo).

## v2.12.5 — Không còn báo lỗi chặn khi lưu tệp
- word.js saveBlob: lỗi mạng / 409 sau thử lại / tệp > ~26 MB / lỗi helper → browserDownload (FileSaver hoặc thẻ <a download>) + toast thông tin, thay cho toast lỗi. AbortError (3 phút) và Hủy hộp Lưu giữ nguyên. Gợi ý "hộp Lưu của Windows" chỉ hiện khi chờ > 1,2 giây. Đảo quyết định cũ "không tự dùng tải của trình duyệt" (người dùng: báo lỗi mỗi lần bấm là rườm rà).
- tests/download-save.test.cjs: 10 kiểm thử (fallback, bận, quá lớn, hủy, gợi ý chậm).

## v2.12.6 — Sửa gốc HAKDocs.exe
- installer/native/HAKDocs.cs: FileBusy riêng cho /save-download, /download-files, /verify-download, /downloads (hàng đợi ≤ 10 phút) — Busy chỉ còn cho /ocr (409 như cũ); ForceForeground (ALT + SetForegroundWindow) cho hộp Lưu; yêu cầu > 36 MB được đọc bỏ rồi trả 413 (trước: ngắt kết nối → "Failed to fetch"); tự tắt sau 24 giờ thay vì 4.
- build-setup.yml: biên dịch HAKDocs.exe bằng installer/native/build.ps1 trước khi đóng bộ cài + smoke test (/status, download-files list, 40 MB → 413).

## v2.12.7 — Ô số có dấu phân cách, BKLS không bị chặn (gồm sửa gốc HAKDocs của 2.12.6)
- numfmt.js (HAK.NumFmt: parse / txt / format / attach): ô data-numfmt="num" (kg, tấn, tiền) và "dec" (độ ẩm, độ khô); pages.js (contractQty, certWet, certDry, unitPrice, moisture) và catalog.js (inp type number → ô chữ + fv trả số máy đọc, báo lỗi nếu không phải số).
- excel.js parseNum: "0,123" → 0.123 (trước 123).
- pages.js generateBkls: không chặn khi thiếu Số BKLS / hệ số / tên bên mua — tự điền hoặc để trống + cảnh báo.
- tests/parse-num.test.cjs, tests/numfmt.test.cjs.

## v2.18.1 — Hộp chọn phiếu có cột "Đã gán cho hồ sơ / tàu"
- Mỗi phiếu hiện nhãn tàu của hồ sơ Lưu trữ khác (cùng công ty, ngày cân giao nhau) đã lấy phiếu đó; "— chưa gán" nếu chưa; "?" nếu thiếu số phiếu / giờ / biển số để nhận diện — tránh gán trùng một phiếu cho hai tàu.

## v2.18.0 — Tách phiếu cân trong cùng ngày (1 ngày chạy 2 tàu) + BKLS nhiều xe
- Phạm vi dữ liệu có thêm ô **Giờ cân từ / đến** (qua nửa đêm được) và **Số phiếu từ / đến** (so theo dãy số cuối của số phiếu). Mỗi tàu lập một hồ sơ với giờ hoặc dãy số phiếu của tàu đó; hai hồ sơ cùng ngày không trùng, không mất phiếu, báo cáo cộng đủ.
- **BKLS nhiều xe**: bỏ giới hạn cứng 200 xe (mẫu BKLS mới) và 100 xe (PDF từng xe). Word từng xe không giới hạn (nhiều file tự gói ZIP); PDF từng xe tự chia thành các đợt in ≤ 150 xe (mỗi lần in 150 xe), mỗi đợt một hộp thoại in, hỏi xác nhận giữa các đợt.
- **Chọn phiếu cân của tàu này**: khi 2 tàu cân xen kẽ trong ngày, tick đúng các phiếu của tàu (hoặc dán danh sách số phiếu); hồ sơ chỉ gồm các phiếu đã chọn, tàu kia lập hồ sơ với phần còn lại; lưu trong hồ sơ, giữ khi chuyển từ Xuất kho gửi.
- Chi tiết hợp đồng (tàu): thêm Giờ cân từ / đến, Số phiếu từ / đến (áp khi tick "Lọc xe theo ngày cân") — chọn tàu ở form lập biên bản là tự điền cả ngày, giờ và số phiếu.
- Phạm vi tách được lưu trong hồ sơ Lưu trữ, ghi vào tóm tắt hồ sơ và ghi chú Excel ("Tách phiếu trong ngày: …"). Hồ sơ cũ không đổi.

## v2.17.1 — Dọn mã dùng chung
- util.js (HAK.Util: hasNum, vnDate) thay cho các bản sao giống hệt ở contract-file, contract-status, customs, gsync-contracts, catalog. Không đổi hành vi; ESLint, 256 test (Node 18 / 20 / 22) và mở thử 17 màn hình + Hồ sơ hợp đồng đạt.
- Chưa áp Prettier cho toàn bộ mã: định dạng lại hàng chục nghìn dòng sẽ tạo thay đổi không thể duyệt; nên làm riêng theo từng file khi sửa.

## v2.17.0 — Rà soát logic nghiệp vụ: phiếu cân, trạng thái, thuế, chứng thư, gộp sao lưu
- Phiếu cân: chống trùng ở cấp PHIẾU (hồ sơ cùng tàu / chi tiết hợp đồng giao nhau về ngày giữ các phiếu riêng, phiếu lặp tính 1 lần); khác khối lượng / xe trả về / liên kết → báo XUNG ĐỘT + tổng chờ đối soát; chống trùng nguyên hồ sơ nay xét thêm công ty + chi tiết hợp đồng (weigh-model.js, Report.prepareTickets). Excel Báo cáo Xuất hàng bỏ đúng các phiếu trùng; thêm sheet "Đối soát phiếu cân".
- Hợp đồng có 4 chỉ tiêu riêng (tiến độ · thông quan · thuế · thực giao). Quy tắc đã xác nhận: hợp đồng "Đã hoàn thành" khi mọi tờ khai đã thông quan (kèm lý do); đóng thủ công hiện "Đã đóng hợp đồng".
- Thuế: còn nợ / nộp thừa cộng riêng từng tờ khai (không bù trừ), tờ khai chưa xác định nghĩa vụ, lệ phí tách riêng; cột mới NỘP THỪA, "Tờ khai chưa xác định thuế"; khai bổ sung mới nhất chưa có số thuế → cảnh báo. Giấy nộp tiền: nhận ra cùng khoản khi nhập tay rồi OCR (chuẩn hóa số giấy, so NDKT / kỳ thuế), giữ các dòng cùng số tiền nhưng khác khoản; nhập tay trùng → hỏi xác nhận.
- Đối chiếu: thiếu dữ liệu (số chứng thư, đơn giá, tỷ giá, MT) hiển thị "Thiếu số liệu đối chiếu" thay vì "Khớp".
- Chứng thư: kiểm tra số âm / BDMT > MT / độ ẩm / công thức BDMT ≈ MT × (1 − độ ẩm) (cert-model.js); lưu bản chụp số liệu + ô khác Danh mục + lý do vào hồ sơ Lưu trữ; ô "Lý do điều chỉnh" ở form lập biên bản.
- Lưu hồ sơ: ghi lỗi IndexedDB nay BÁO LỖI cho người dùng (trước đây lặng lẽ không hiện "đã lưu"); thông số + phiếu cân vẫn cùng 1 giao dịch.
- In PDF: lỗi dựng bảng / hộp thoại in được báo và giao diện trở về bình thường (trước đây kẹt chế độ in); nút PDF trong Hồ sơ hợp đồng không còn nuốt lỗi.
- Mở liên tiếp hai hồ sơ cũ: ô không có trong hồ sơ sau được đưa về mặc định (không mang dữ liệu hồ sơ trước); lưu lại giữ liên kết chi tiết hợp đồng.
- KL hợp đồng gốc để trống + phụ lục: giữ trống qua nhiều lần tính (trước đây lần tính thứ 2 ghi KL phụ lục vào KL gốc); ngừng dùng phụ lục cuối → KL hiện hành trống; form / báo cáo / Excel / PDF / Google Sheet dùng chung originalQty; hồ sơ nghi ghi nhầm (gốc = phụ lục đầu) gắn cờ "cần đối chiếu", không tự sửa.
- Google Sheet NL_HOPDONG / NL_TOKHAI: thêm cột Ở CUỐI (nộp thừa, chưa xác định thuế, số dư ròng, 4 trạng thái); cột cũ giữ vị trí. Cột "Trạng thái hợp đồng" vẫn là "Đang thực hiện" / "Đã hoàn thành"; chỉ hợp đồng đóng thủ công nay hiện "Đã đóng hợp đồng".
- Giấy nộp tiền: khoản nhập tay thiếu số giấy mà cùng số tiền với dòng OCR → hỏi đối soát thay vì tự thêm / tự gộp.
- Đóng / mở lại hợp đồng + gộp bản sao lưu (Gói cấu hình): thêm SỐ PHIÊN BẢN ĐÓNG closeRev (mỗi lần đóng hoặc mở lại +1, bản cao hơn thắng; bản đã phát hành chưa có closeRev: có closedAt = 1, không có = 0). Trước đây bản mở lại (không còn closedAt) gộp với bản đóng cũ vẫn ra "đã đóng". Xung đột cùng phiên bản → bản có mốc ngày muộn hơn.
- Gộp bản sao lưu / Gói cấu hình theo PHIÊN BẢN (revision): bản cũ không còn ghi đè hợp đồng / chi tiết / phụ lục / tờ khai đã sửa ở phiên bản mới hơn (vd máy 700 BDMT phiên bản 4 nhập bản 500 BDMT phiên bản 2 → giữ 700, phiên bản không tăng); bản thiếu phiên bản = 0; cùng phiên bản khác nội dung = xung đột (giữ bản trên máy, báo khi nhập gói); dữ liệu đã ngừng dùng (deletedAt) ở bản mới không sống lại; tệp đính kèm là hợp; nhập lặp lại ổn định.
- Báo cáo tổng hợp: thêm ô "Kỳ báo cáo tính theo" — Ngày bắt đầu hồ sơ (mặc định, đúng cách đọc của các báo cáo lịch sử) hoặc Ngày cân từng phiếu (hồ sơ qua tháng / năm chia từng phiếu về đúng tháng / năm; lọc ngày theo ngày cân; Excel ghi rõ cách tính).
- Khôi phục sao lưu: tự chụp cài đặt + danh mục hiện có trước khi ghi đè; nút "↶ Hoàn tác khôi phục"; không chụp được thì từ chối khôi phục (không đổi gì).
- Mục "Toàn vẹn danh mục" trong sức khỏe dữ liệu: báo tờ khai mồ côi, khóa trùng, khóa ngoại sai, khoản nộp nhập trùng, hồ sơ gắn chi tiết không còn (chỉ báo, không sửa).
- HAK_SMART_FILTER cập nhật e99bb7e (kho bộ lọc lỗi / khác phiên bản không bị ghi đè). Ghi chú phát hành kèm SHA-256 bộ cài.
- Nút "🔄 Kiểm tra bản mới" ở trang Hướng dẫn (chỉ gọi GitHub khi bấm; hiện bản mới + SHA-256 + liên kết tải).
- CI: thêm ESLint (no-undef…) + package-lock.json, chạy kiểm thử cả Node 18 / 20 / 22; lỗi tải artifact không làm đỏ CI. Sửa lỗi ReferenceError ở thẻ "KL gốc" của Hồ sơ hợp đồng do ESLint phát hiện.
- Xem docs/QUY_TAC_NGHIEP_VU_CAN_XAC_NHAN.md.

## v2.16.2 — Rà soát mã nguồn: bảo mật, độ bền, đóng hợp đồng
- Google Sheet: ô văn bản bắt đầu bằng = + - @ được ghi kèm dấu ' (chặn chèn công thức); Code.gs lên VERSION 2 — cần dán lại Code.gs mới vào Apps Script.
- Hợp đồng chưa gán công ty không còn bị gửi về Sheet của mọi công ty.
- HAKDocs.exe: mọi yêu cầu OCR / lưu file / mở thư mục phải kèm mã bảo vệ (X-HAK-Token, file native/hakdocs-token.js do HAKDocs tạo mỗi lần chạy) — chặn trang web ngoài gọi qua Origin "null". CI smoke test: thiếu / sai mã → 403.
- Thư viện: SheetJS 0.20.3, jsPDF 4.2.1 (bản cũ có lỗ hổng đã công bố); đã so kết quả đọc tờ khai .xls, PXK và PDF tiếng Việt với bản cũ — giống nhau.
- Lưu trữ (archive.js): lỗi đồng bộ khi mở giao dịch IndexedDB giờ báo lỗi thay vì treo vô hạn.
- Lập PXK: tách hàm thuần pxk-model.js + bộ test; sửa làm tròn kg→tấn sai ở 286 / 60.000 mức kg tận cùng 5.
- Đóng hợp đồng thủ công (✔ Đóng hợp đồng / Mở lại) cho hợp đồng không có tờ khai; trạng thái "Đã hoàn thành".
- Phụ lục hợp đồng: thứ tự theo ngày, cùng ngày / không ngày theo thứ tự nhập (seq).
- Báo cáo thực hiện hợp đồng: cột có tên khóa (IX) thay cho số thứ tự; test độ dài dòng = số cột.
- Mật khẩu: băm mới PBKDF2-SHA-256 210.000 vòng; tài khoản cũ đăng nhập bình thường và được nâng cấp tự động ở lần đăng nhập đúng kế tiếp (cả mã khôi phục khi đặt lại). Gói cấu hình xuất từ bản này sang máy dùng bản cũ: Nhân viên đăng nhập bằng gói đó sẽ không khớp mật khẩu → cập nhật máy trạm lên 2.16.2.
- Dải nhắc sao lưu ở mọi trang khi có dữ liệu mà > 7 ngày (hoặc chưa lần nào) chưa sao lưu toàn bộ; nút "Để sau 1 ngày".
- Dọn mã chết (CONTRACT_FIELDS, INFO_FIELDS, whName...). Bộ test: 186 test (thêm gsync, pxk, overview, auth-hash).

## v2.16.1 — Giao diện gọn, đồng bộ Google Sheet cho hợp đồng
- Trang "Chi tiết xuất hàng theo hợp đồng": bỏ khung cuộn lồng nhau, bảng vừa khung (không thanh trượt ở màn hình ≥ 1600px); Báo cáo thực hiện hợp đồng bỏ khung cuộn dọc.
- Menu bên trái rộng 288px, tên mục dài tự xuống dòng — không bị che chữ.
- ☁ Đồng bộ Google Sheet cho hợp đồng: sheet NL_HOPDONG, NL_CHUNGTHU (từng chứng thư), NL_TOKHAI, NL_PHULUC (ghi lại toàn bộ bảng, mỗi công ty về Sheet của mình). Cần dán lại Code.gs bản 2 (đã nâng VERSION = 2; script cũ vẫn dùng được cho Xuất hàng, app báo rõ khi thiếu bản mới).
- Excel Báo cáo thực hiện hợp đồng có thêm trang tính Chứng thư, Tờ khai, Phụ lục; Excel và PDF Hồ sơ hợp đồng có thêm bảng/sheet Chứng thư.
- Bộ test mới tests/gsync.test.cjs: chạy nguyên văn Code.gs trong Google Sheet giả + client gsync.js (thay lô, cập nhật tại chỗ, snapshot, từ chối sai mã, script cũ).

## v2.16.0 — Phụ lục hợp đồng, Hồ sơ hợp đồng, Báo cáo thực hiện hợp đồng
- Phụ lục hợp đồng điều chỉnh khối lượng (Danh mục): KL hiện hành theo phụ lục mới nhất, giữ KL gốc; báo cáo ghi "đã điều chỉnh (gốc …)".
- 📋 Hồ sơ hợp đồng (xem riêng 1 hợp đồng): 7 bước quy trình, đối chiếu tờ khai ↔ chứng thư ↔ hợp đồng ↔ thực giao, thuế còn nợ, xuất hàng theo tàu (kho xuất), dòng thời gian; Excel 5 trang tính + PDF.
- Menu mới 🧭 Báo cáo thực hiện hợp đồng: một bảng cho tất cả hợp đồng, 7 nhóm cột theo quy trình (kèm Kho xuất), lọc smart, Excel (nhóm gộp ô, màu) và PDF chia 2 phần.
- Trang 📑 đổi tên thành "Chi tiết xuất hàng theo hợp đồng"; thêm dải 7 bước quy trình dưới mỗi hợp đồng và ô tổng thuế còn nợ.
- Bao gồm các sửa của v2.15.1 (số TKHQ một nguồn, quyền Nhân viên, số lẻ ở báo cáo).

## v2.15.1 — Số TKHQ một nguồn, quyền Nhân viên, sửa số lẻ
- Chi tiết hợp đồng: chọn tờ khai thì ô "Số tờ khai HQ" tự điền và khóa; gõ số chưa có thì khi lưu app hỏi tạo tờ khai (Đã mở) và gắn luôn, hoặc gắn tờ khai đã có.
- Hợp đồng Xuất khẩu / Ủy thác XK lưu chi tiết khi chưa có tờ khai: cảnh báo 2 lần mới cho lưu.
- Quyền Nhân viên: được thêm / sửa / xóa hợp đồng, chứng thư (chi tiết hợp đồng) và tờ khai hải quan; vẫn không nhập hàng loạt từ file, không vào Cài đặt, không xóa hồ sơ Lưu trữ.
- Báo cáo: hết số lẻ dài (-128,39999999999964 → -128,4).

## v2.15.0 — Trang "Tình hình hợp đồng" (theo phiếu cân)
- Menu mới **📑 Tình hình hợp đồng** (dưới Báo cáo tổng hợp; báo cáo tổng hợp giữ nguyên): mỗi hợp đồng có số chuyến xe, số hồ sơ, KL qua cân / xe trả về / thực giao, **kho xuất**, tàu, thời gian cân, chênh lệch MT chứng thư ↔ thực giao, chứng thư, tờ khai, thuế; dòng nhỏ từng đợt thực hiện. Bộ lọc smart (hình thức, bên mua, trạng thái, kho xuất, tàu, chỉ hợp đồng có phiếu cân, chỉ hợp đồng lệch KL).
- **Bấm một dòng** → chi tiết xuất hàng từng xe (ngày, giờ cân 1/2, số phiếu, biển số, tài xế, đơn vị vận chuyển, kho xuất, KL, hồ sơ, xe trả về, số BKLS) có **bộ lọc smart** (tìm không dấu, biển số, đơn vị vận chuyển, tài xế, kho xuất, hồ sơ, khoảng ngày, chỉ xe trả về). Xuất Excel và Tải PDF cho cả bảng tổng hợp và bảng từng xe.

- **Phiếu xuất kho (Chứng từ xuất hàng):** thêm ô **Hợp đồng** ở mục ④; số hợp đồng được điền vào cột **HopDongSo** của mọi phiếu (trước đây để trống). Xuất khẩu / Ủy thác chỉ chọn được hợp đồng đã có tàu + tờ khai hải quan; trung chuyển để trống. Chọn hợp đồng thì "Căn cứ lệnh" (nếu đang trống) tự gợi ý theo số hợp đồng; nhật ký phiếu xuất kho lưu thêm hợp đồng.
- **Nhật ký phiếu xuất kho có 2 nút mới** (trang Chứng từ xuất hàng → "Chứng từ đã lập"): **↻ Tạo lại** nạp lại đợt cân, số phiếu bắt đầu, hợp đồng và các thông số lần lập vào form để tạo lại; **💾 Lưu** tạo lại file ngay với đúng thông số lần trước và lưu (không thêm dòng nhật ký mới, không báo trùng). Từ nay mỗi lần lập lưu đủ thông số; nhật ký cũ (trước bản này) chỉ nạp được đợt, số phiếu, hợp đồng nếu có rồi bấm Tạo.
- **Nút điền bổ sung** (trang Chứng từ xuất hàng, khung "🧩 Điền số hợp đồng vào file phiếu xuất kho đã tạo"): chọn file phiếu xuất kho cũ (nhiều file) + hợp đồng → điền cột HopDongSo (mặc định chỉ dòng trống, có ô tick ghi đè) rồi lưu file mới "…_DaDienHD.xlsx"; file gốc không sửa, số phiếu và các cột khác giữ nguyên. Nhật ký phiếu xuất kho trùng tên file được ghi số hợp đồng.
- **Đổi tên:** "Đợt thực hiện" ở Danh mục thành **"Chi tiết hợp đồng (tàu · chứng thư · tờ khai)"** (nút "＋ Thêm chi tiết hợp đồng", tiêu đề khung, form, báo cáo). Chữ "đợt giao hàng" chỉ dùng cho mỗi lần tải phiếu cân / lập phiếu xuất kho.
- **Gắn đợt giao hàng vào hợp đồng** (trang Tình hình hợp đồng): khung "📥 Đợt giao hàng chưa gắn hợp đồng" liệt kê các hồ sơ cân chưa có hợp đồng (ngày, số xe, tấn, kho xuất); tick rồi bấm "Gắn … vào hợp đồng…" hoặc bấm "＋ Gắn đợt" ở dòng hợp đồng; gỡ được ở bảng "Các đợt giao hàng của hợp đồng". **Điều kiện:** hợp đồng Xuất khẩu / Ủy thác phải nhập **tàu** và **tờ khai hải quan** trước mới gắn được (hợp đồng thiếu hiện mờ); Xuất bán / Trao đổi không cần. Trang Tạo biên bản cũng khóa các dòng hợp đồng Xuất khẩu / Ủy thác chưa đủ tàu + tờ khai.

## v2.14.8 — Bộ lọc smart và PDF cho tờ khai, báo cáo
- Tab 🛃 Tờ khai hải quan dùng bộ lọc smart (tìm kiếm, ngày mở, trạng thái, hợp đồng, tàu, loại hình, còn phải nộp, có khai bổ sung).
- Hai báo cáo mới có bộ lọc smart riêng (hợp đồng: hình thức, bên mua, trạng thái hợp đồng / tờ khai, tàu, còn phải nộp thuế, thiếu chứng thư; tờ khai: như trên) và nút 🖨️ Tải PDF (A4 ngang, đúng phần đang lọc; chọn "Lưu dưới dạng PDF" trong hộp thoại in). Excel cũng xuất đúng phần đang lọc.

## v2.14.7 — Báo cáo tình hình thực hiện hợp đồng + OCR hợp đồng PO
- Báo cáo thêm mục 📑 **Tình hình thực hiện hợp đồng**: mỗi hợp đồng có KL thực hiện / hợp đồng (% và còn lại), giá trị, chứng thư, tờ khai (đã thông quan x/y), thuế XK phải nộp / đã nộp / còn lại, lệ phí đã nộp, trạng thái; dòng nhỏ từng đợt thực hiện (tàu, chứng thư, tờ khai, nộp tiền). Lọc theo ngày ký và trạng thái, xuất Excel 2 sheet.
- OCR hợp đồng dạng Purchase Order: đọc số PO ("PURCHASE ORDER NUMBER"), ngày (2026-6-26), tên hàng (Vietnam Acacia Woodchips), bên bán là HOANG ANH KHOI và bên mua là XIAMEN JIULI (trước đây đọc nhầm vai, bỏ trống số, ngày, hàng).

## v2.14.6 — OCR ảnh nhỏ / mờ
- HAKDocs.exe phóng ảnh nhỏ (vd 579×776 gửi qua Zalo) lên cạnh dài ~2600 px trước khi đọc, và đọc thêm một lượt ở độ phóng khác để bổ sung dòng bị bỏ sót. Giấy nộp tiền: bỏ dòng trùng giữa hai lượt đọc; hiện cảnh báo đỏ khi OCR gần như không đọc được chữ nào (kèm cách chụp lại).
- Cần cài lại bộ setup để HAKDocs.exe mới có hiệu lực.

## v2.14.5 — OCR giấy nộp tiền chịu lỗi hơn
- Số tờ khai: nhận cả khi OCR nhầm chữ/số (3O86…), thiếu hoặc thừa 1 chữ số (kèm cảnh báo), dùng thêm chữ OCR thuần để tìm số; ô số tờ khai trong hộp thoại gõ sửa được và tự chọn tờ khai trùng số.
- Người nộp thuế: nhận khi thiếu dấu ":", tên ở dòng kế, nhãn sai chính tả; có "Người nộp thay" thì ghi kèm.

## v2.14.4 — Gợi ý khai bổ sung
- Tờ khai cùng số vận đơn với một tờ khai có số nhỏ hơn: hiện gợi ý và nút "Chuyển thành khai bổ sung của …". Chuyển xong, tờ khai thành dòng khai bổ sung (thuế sau bổ sung, KL, ngày), giấy nộp tiền đã gắn chuyển sang tờ khai gốc, tờ khai độc lập bị xóa (khôi phục được).

## v2.14.3 — Giấy nộp tiền thuế (mẫu cũ có dòng "Tờ khai HQ số")
- Đọc ngày và loại hình của tờ khai ghi trên giấy ("Tờ khai HQ số(1): … ngày: 11/06/2026 Loại hình XNK(1): B11"); khi tạo tờ khai mới từ giấy nộp tiền thì điền sẵn ngày mở và loại hình. Kiểm thử thêm 2 mẫu thật (DN0106/26, QC0206/26).

## v2.14.2 — Số tờ khai trên giấy nộp tiền
- Đọc số tờ khai ghi theo nhãn ("Tờ khai số: …", "theo TK …"), bị OCR tách khoảng trắng / dấu chấm, hoặc nằm ở dòng nội dung; trước đây chỉ đọc dãy 12 số liền.

## v2.14.1 — OCR giấy nộp tiền mẫu mới
- Đọc thêm Số giấy nộp tiền (vd 6753554), Mã hiệu, Số tham chiếu, Người nộp thuế, Kỳ thuế / ngày quyết định, Mã chương, Mã NDKT, Mã ĐBHC. Giấy không ghi số tờ khai thì tự chọn tờ khai đang mở. Các cột này hiện trong bảng giấy nộp tiền và sheet Excel.

## v2.14.0 — Tờ khai hải quan
- Danh mục có tab 🛃 Tờ khai hải quan: tờ khai là bảng cha; khai bổ sung và giấy nộp tiền là bảng con. Trạng thái Đã mở tờ khai → Chờ thông quan → Đã thông quan.
- Hợp đồng tự chuyển Đang thực hiện → Đã hoàn thành khi mọi tờ khai đã thông quan.
- Nhập tờ khai từ file .xls, OCR tờ khai và giấy nộp tiền (HAKDocs.exe đọc thêm ảnh JPG/PNG/BMP). Đợt thực hiện có ô chọn tờ khai (ngày mở, lần khai, thuế XK phải nộp).
- Báo cáo thêm "Tình hình khai hải quan và nộp thuế" (có xuất Excel).

## v2.13.2 — Gỡ tab trùng trong Danh mục
- Tab "Chi tiết thực hiện" hiển thị y hệt tab "Hợp đồng" nên đã gỡ; tab còn lại đổi tên "Hợp đồng & thực hiện" (bảng hợp đồng + các đợt thực hiện bên dưới).

## v2.13.1 — Nút "Xem" ở đợt nhập liệu
- Bấm "Xem" trên dòng đợt: tự cuộn tới khung "Đợt đang xem" (bảng xem trước), nháy nền vàng và báo số xe · số tấn của đợt.

## v2.13.0 — OCR chịu lỗi: khối lượng, đơn giá, tàu, hàng, ngày, địa chỉ
- js/doc-extract.js (HAK.DocExtract): inspectionPeriod, vessel, product (khôi phục dấu "Dăm gỗ keo"), certificateParties + addressAfter/addressLabelled/respace/tidyName, price (ghép số bị tách, nhãn–số 2 dòng, loại phí/phạt), quantityFallback, tidy. Hàm thuần, kiểm thử Node.
- contract-parser.js: BDMT có lỗi OCR (BDMI, 8DMT), nhãn Quantity ở dòng trước, fallback số trước BDMT, địa chỉ bên, 'c6ng ty', tiêu đề "BEN UY THAC" dính chữ, bỏ "Product :", g6→go.
- document-import.js: certificate dùng bộ đọc mới (ship, product, fromDate/toDate), contractPrice thử bộ mới trước, ngày "Date: 27-July 2026" / "l~p vao ngay"; khung đề xuất dùng chung (makeReview): ô trống TỰ ĐIỀN + tô vàng (.ocr-filled), ô có dữ liệu để tick tay, địa chỉ khách hàng (ô địa chỉ của khách mới, hoặc bổ sung địa chỉ cho khách đã có), nhắc nhập tay khi không đọc được giá / KL, số hiển thị kiểu Việt. Đổi bài thử số hợp đồng: ô trống được điền ngay.
- tests/doc-extract.test.cjs (13 kiểm thử, dữ liệu mô phỏng — không đưa nội dung hợp đồng thật vào kho công khai).
