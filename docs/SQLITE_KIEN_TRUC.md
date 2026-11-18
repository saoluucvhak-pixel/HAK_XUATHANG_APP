# Kiến trúc lưu trữ SQLite (bản Windows) — thiết kế và hợp đồng

Trạng thái: **đang triển khai theo nhóm** (xem §12 để biết nhóm nào đã xong / đã kiểm chứng / chưa làm). Người dùng đã quyết định chuyển bản Windows sang SQLite; tài liệu này thay kết luận "giữ IndexedDB" của đợt đánh giá trước (số đo nền ở §10 vẫn dùng làm mốc so sánh).

## 1. Quyết định chính

| Hạng mục | Chọn | Lý do |
|---|---|---|
| Nơi giữ cơ sở dữ liệu | **HAKDocs** (đã có, chạy localhost, một thể hiện) giữ tệp SQLite; giao diện HTML/JS giữ nguyên, truy cập qua HTTP | Giữ giao diện, không thêm runtime; SQLite WASM phải ghi lại cả tệp mỗi lần (đã đo 85 ms ở 16,7 MB, tăng tuyến tính) |
| Thư viện SQLite trong HAKDocs | **`winsqlite3.dll` có sẵn trong Windows 10 1809+/11**, gọi bằng P/Invoke từ C# | Không đóng gói thêm DLL / NuGet, bộ cài không đổi kích thước, không cần trình biên dịch mới (HAKDocs vẫn dựng bằng `csc` .NET Framework 4). **Rủi ro:** phiên bản SQLite theo Windows (không tự chọn) — hợp đồng chỉ dùng tính năng có từ SQLite 3.24 (khóa ngoại, `ON CONFLICT DO UPDATE`, chỉ mục từng phần, `VACUUM INTO` từ 3.27) và HAKDocs kiểm `sqlite3_libversion` lúc mở |
| Vị trí dữ liệu | `%LOCALAPPDATA%\HAK_XUATHANG\data\hak.db` (+ `backups\`) — **ngoài** thư mục cài `%LOCALAPPDATA%\HAK\QuanLyXuatHang` | Cài đè / gỡ chương trình không đụng tới dữ liệu |
| Chính sách khi nâng cấp / gỡ | Nâng cấp: giữ nguyên. Gỡ: **không xóa** thư mục dữ liệu (hỏi, mặc định giữ); thông báo rõ đường dẫn | Tránh mất dữ liệu do thao tác gỡ |
| Chế độ HTML / portable (không HAKDocs) | **Giữ IndexedDB**, đánh dấu rõ trên giao diện ("Dữ liệu: Trình duyệt") | Không có tiến trình giữ tệp; SQLite không thể thay thế ở đó |
| Nguồn chính | Khi `meta.active_backend = 'sqlite'` (do **máy chủ** giữ, đặt sau khi di trú đối chiếu đạt) SQLite là nguồn duy nhất; localStorage chỉ là bản đệm nạp lại **một chiều** từ SQLite mỗi lần mở app | Không bao giờ hai nguồn cùng sửa |
| Mất kết nối / DB bị thay sau khi đã dùng SQLite | **App BỊ CHẶN** (màn hình báo lỗi), không lặng lẽ quay về IndexedDB cũ | Tránh người dùng sửa nhầm nguồn cũ |

## 2. Bản đồ nguồn dữ liệu (trước → sau)

| Dữ liệu | Hiện nay (IndexedDB / localStorage) | Sau (SQLite) | ID / khóa | Phiên bản |
|---|---|---|---|---|
| Cài đặt, tài khoản, phạm vi công ty, chủ đề, đồng bộ Sheet, danh sách xe… (`hak.*`) | localStorage + bản sao kv (IDB `hak-app`) | bảng `kv` (nguồn) + localStorage (bản đệm) | `key` | `rev` (máy chủ) |
| Danh mục: khách hàng, hợp đồng, chi tiết, phụ lục, tờ khai, khai bổ sung, khoản nộp / hoàn thuế | một đối tượng JSON `hak.catalog.v1` (localStorage + kv) | `kv['hak.catalog.v1']` (nguồn app) **và phần chiếu quan hệ** `customers, contracts, contract_details, contract_addenda, customs_decls, customs_supplements, customs_payments` (khóa ngoại, duy nhất số tờ khai, chỉ mục) ghi **cùng giao dịch** | `hd-…`, `ct-…`, `pl-…`, `tk-…`, `bs-…`, `nt-…` | `revision` của bản ghi (trong doc) + `rev` (máy chủ) |
| Sổ hồ sơ năm | một bản ghi kv `hak.yearbook.v1` (không có bản localStorage) | `kv` (như cũ) | `record.id` | `revision` toàn sổ, kiểm bằng `kvCas` |
| Đợt Excel đã nạp | IDB `batches` + `batchdata` (ArrayBuffer) | `batches` + `batch_files` (**BLOB**, kèm `sha256`, `size`; xóa đợt thì xóa tệp — `ON DELETE CASCADE`) | `loại|tênTệp` | `rev` trong doc + `rev` máy chủ |
| Lưu trữ hồ sơ cân | IDB `hak-archive` `meta` + `data` (`gz:`+base64) | `archive_records` (cột kiểu: công ty, loại, ngày từ/đến, chi tiết hợp đồng, số xe, kg, xe trả về…) + `archive_data` (**giữ nguyên chuỗi `gz:`** → đọc / sao lưu như cũ) + `archive_tickets` (chỉ mục phiếu **dẫn xuất**, xóa / dựng lại an toàn) | mã nội dung cyrb53 | `sv`, `rev` |
| Nhật ký chứng từ (PXK / BKLS) | IDB `issued` | `issued` | `id` | `rev` |
| Tệp đính kèm (PDF hợp đồng / chứng thư), mẫu BKLS | IDB `attachments`, `bklsTemplates` | `attachments` (**BLOB** khi base64 mã hóa lại đúng chuỗi cũ, ngược lại giữ trong doc), `bkls_templates` | sha256 / `id` | `rev` |
| Tay cầm thư mục sao lưu (File System Access) | IDB `handles` | **vẫn ở IndexedDB** (không tuần tự hóa được) | — | — |
| Nhật ký thao tác, phiên bản hồ sơ đã xuất | (chưa có) | `audit_log` (chỉ thêm, trigger chặn sửa / xóa), `record_versions` | `seq` / `(record_id, version)` | — |
| Bản ghi không nhập được khi di trú | — | `quarantine` | `id` | — |
| Sao lưu | ZIP (1 tệp JSON) do người dùng lưu | ZIP như cũ **và** bản sao SQLite nhất quán (`VACUUM INTO`) + băm SHA-256 | — | — |
| Đóng năm | ZIP + đối chiếu băm, dọn kho sau khi đạt | như cũ; dọn bằng `closeVerified` (so sánh trong giao dịch) | năm + băm | — |

## 3. Sơ đồ cha–con (khóa ngoại thật trừ mục "mềm")

```
customers ┄┄(mềm: exporter/principal/buyer)┄┄┐
                                              ▼
contracts ──1:n──► contract_details ◄──(FK, NULL nếu mồ côi)── customs_decls ──1:n──► customs_supplements
    │                      ▲                                        │ (FK contract_id)
    └──1:n──► contract_addenda                                      └──1:n──► customs_payments
archive_records ──1:1 CASCADE──► archive_data        archive_records.detail_id ┄(mềm)┄► contract_details
archive_records ──1:n CASCADE──► archive_tickets     batches ──1:1 CASCADE──► batch_files
```

* Khóa ngoại **bắt buộc**: chi tiết / phụ lục → hợp đồng; khai bổ sung / khoản nộp → tờ khai; tờ khai → hợp đồng và chi tiết; dữ liệu / phiếu → hồ sơ Lưu trữ; tệp gốc → đợt.
* **Không xóa cứng** bản ghi nghiệp vụ: ngừng dùng bằng `deleted_at` (giữ liên kết lịch sử). Vì vậy khóa ngoại không dùng `CASCADE` cho dữ liệu nghiệp vụ; xóa cha còn con bị chặn.
* Tham chiếu **mềm** (không FK): khách hàng ← hợp đồng; chi tiết ← hồ sơ Lưu trữ (dữ liệu cũ có thể trỏ tới chi tiết đã mất — `HAK.Integrity` báo `archive-link`). Tờ khai mồ côi trong dữ liệu cũ: cột FK đặt NULL, ghi vào `quarantine`, **doc giữ giá trị gốc**; không chặn lưu và không che giấu.
* Số tờ khai duy nhất trong các tờ khai đang dùng (chỉ mục duy nhất từng phần); ngừng dùng thì được lập lại số đó.

## 4. Chính sách số, NULL và mã

* Mã định danh / số chứng từ / số tờ khai luôn là **TEXT** (giữ số 0 đầu `000123`, `00045`). Không dùng cột số cho mã.
* **NULL** = chưa có; **0** = số không; **chuỗi trống** chỉ nằm trong `doc` — cột kiểu số luôn NULL hoặc số (kiểm thử `NULL, 0 và chuỗi trống khác nhau`).
* Khối lượng (kg, MT, BDMT): số nguyên theo **1/1000 đơn vị** (`*_milli`). Giá trị có nhiều hơn 3 chữ số lẻ được **cảnh báo** khi chiếu (cột kiểu làm tròn, `doc` giữ nguyên). Tiền VND: số nguyên đồng (không phải số nguyên → cảnh báo). Tỷ giá: không có cột kiểu (nằm trong `doc`, giữ số thập phân gốc).
* `doc` (JSON) là bản **đầy đủ** của bản ghi → không mất trường nào, kể cả trường chưa biết ở bản sau; cột kiểu chỉ là phần chiếu. Kiểm thử "chiếu rồi dựng lại bằng đúng bản gốc" (kể cả thứ tự mảng và sự có mặt của khóa).

## 5. API cục bộ của HAKDocs (hợp đồng, đã có bản tham chiếu Node + bộ test)

Không có SQL từ trang web. Chỉ có CRUD theo **bảng / cột lấy từ schema**; mọi giá trị là tham số.

| Điểm cuối | Việc | Ghi chú |
|---|---|---|
| `GET /db/status` | tình trạng: `active`, `schema`, `file`, `dataDir`, `size`, số bản ghi | cần token |
| `POST /db/session` `{scope,user}` · `/db/session/close` | mở / đóng phiên mang **phạm vi công ty** do máy chủ giữ | `scope:null` = mọi công ty |
| `POST /db/tx` `{ops:[…]}` | một giao dịch `BEGIN IMMEDIATE`: `put` (`ifRev`), `del`, `guard`, `clear` (cần `confirm`) | lỗi bất kỳ → không ghi gì; `ifRev`: bỏ = ghi đè, `null` = phải chưa có, số = phải đúng phiên bản |
| `POST /db/query` | `where` (bằng / `in` / `gt gte lt lte ne`), `cols`, `order`, `limit`, `offset`, `count` | cột BLOB chỉ trả khi yêu cầu rõ |
| `POST /db/check` | `integrity_check` + `foreign_key_check` | |
| `POST /db/backup` | bản sao nhất quán `VACUUM INTO` vào `<dữ liệu>\backups`, trả SHA-256 | chỉ phiên toàn quyền; tên được lọc; không ghi đè |

Mã lỗi: `conflict`/`fk`/`unique` → 409, `scope` → 403, `bad-request` → 400, không phiên → 401, thân > 36 MB → 413, `io` → 500; lỗi kèm `table`, `key`, `expected`, `actual`, `opIndex`.

**Bảo mật** (giống kênh OCR / lưu tệp hiện có, cộng thêm): chỉ `127.0.0.1`; `Origin` phải là `null` (trang `file://`) hoặc không có; bắt buộc `X-HAK-Client: documents-v1` và `X-HAK-Token` (so sánh hằng thời gian; token do HAKDocs ghi vào `native\hakdocs-token.js`); phiên (`X-HAK-Session`) quy định phạm vi công ty — bảng có `company_id` bị **lọc khi đọc, chặn khi ghi / xóa ngoài phạm vi**; tệp sao lưu chỉ ghi trong `backups\` với tên đã lọc (`../` bị vô hiệu); **log không chứa token, phiên hay nội dung** (có test).

> **Giới hạn đã biết (cần xác nhận):** tài khoản người dùng hiện là tài khoản **cục bộ** trong `hak.auth.v1`, đăng nhập bằng JavaScript của chính trang; máy chủ không tự xác minh mật khẩu. Phiên và phạm vi công ty ở máy chủ là **lớp phòng thủ thêm** (một trang khác trên máy không có token không gọi được; trang có token vẫn có thể tự mở phiên toàn quyền). Muốn quyền theo người dùng được **ép ở máy chủ** thì phải chuyển tài khoản (băm mật khẩu, vai trò) vào HAKDocs — xem câu hỏi Q-3 ở §11.

## 6. Đồng thời và khóa

* Một kết nối ghi tại một thời điểm (`BEGIN IMMEDIATE`, `busy_timeout` 5 s, WAL, `synchronous=FULL` để bền khi mất điện).
* Hai cửa sổ cùng sửa: **khóa lạc quan theo `rev`** của máy chủ (cộng với `revision` nghiệp vụ trong doc). `HAK.DB.guarded` đọc bản ghi chốt → chạy hàm kiểm của chỗ gọi → gửi `guard ifRev` cùng các thao tác ghi trong **một** giao dịch: cửa sổ khác chen vào giữa thì giao dịch bị từ chối (`e.conflict = true`) và không ghi dở. `HAK.DB.kvCas` làm tương tự cho Danh mục / Sổ hồ sơ năm (thay các giao dịch IndexedDB tự mở).
* Khóa ngoại bật trên **từng kết nối** (`PRAGMA foreign_keys=ON` mỗi lần mở).

## 7. Khởi động, chặn và chỉ báo nguồn dữ liệu

1. `storage.js` gọi `GET /db/status`: `active = 'sqlite'` → mở phiên, nạp lại localStorage từ `kv` (xóa mọi khóa `hak.*` cũ trong bản đệm, **không** đẩy ngược lên SQLite), vào chế độ `sqlite`.
2. Chưa kích hoạt → chế độ `idb`; nếu HAKDocs-SQLite trả lời thì app báo "có thể di trú" (màn di trú, §8).
3. Lần trước đã dùng SQLite (gợi ý `hak-storage-mode`) nhưng nay không kết nối / DB chưa kích hoạt → chế độ `blocked`: màn hình toàn trang nêu nguyên nhân, nút "Thử kết nối lại"; **không dựng giao diện**.
4. Thanh bên luôn hiện "Dữ liệu: SQLite / Trình duyệt / BỊ CHẶN" (rê chuột: đường dẫn tệp). Màn Sao lưu hiển thị đường dẫn tệp SQLite và dung lượng.

## 8. Di trú, sao lưu, quay lui (thiết kế; tiến độ ở §12)

1. **Sao lưu ZIP trước di trú** bằng đúng chức năng "Sao lưu toàn bộ" hiện có, rồi **đọc lại** (giải nén + so số bản ghi) trước khi làm tiếp.
2. **Chụp nhất quán:** đóng băng ghi (khóa giao diện) trong lúc chụp; nếu cửa sổ khác thay đổi (so phiên bản kv / `rev` đợt / số hồ sơ lúc bắt đầu và lúc kết thúc) thì chụp lại.
3. **Nhập vào cơ sở dữ liệu TẠM** (`hak.migrating.db`), không đụng cơ sở dữ liệu thật. Thao tác nhập là `put` theo ID → **chạy lặp được**, dừng giữa chừng thì chạy lại (trạng thái `meta.migration_state` + băm nguồn). Hết dung lượng / dữ liệu hỏng → dừng, giữ nguyên nguồn, báo lý do.
4. **Đối chiếu** (nguồn IndexedDB ↔ cơ sở dữ liệu tạm): số bản ghi từng bảng, quan hệ cha–con (`foreign_key_check`), tổng kg / MT / BDMT, thuế phải nộp / đã nộp, số tệp + SHA-256 từng tệp, số hồ sơ và số phiếu Lưu trữ. Sai lệch được **báo đến mã bản ghi nguồn**; bản ghi vi phạm khóa ngoại vào `quarantine` (giữ nguyên) chứ không bị bỏ.
5. **Kích hoạt** chỉ khi đối chiếu đạt: đặt `meta.active_backend='sqlite'` **trong chính tệp tạm** rồi **đổi tên nguyên tử** thành `hak.db` (cơ sở dữ liệu thật cũ, nếu rỗng, được giữ `hak.pre-activate.db`). Từ lúc này app chạy trên SQLite.
6. **Quay lui:** IndexedDB cũ **không bị xóa**. Cách quay lui: (a) bản ZIP sao lưu bước 1; (b) tắt cờ `active_backend` (HAKDocs `--deactivate`) để app đọc lại IndexedDB cũ — **dữ liệu phát sinh sau di trú chỉ có ở SQLite**: xuất bằng ZIP sao lưu từ SQLite rồi nhập bổ sung vào bản cũ (nhập theo phiên bản, bản cũ không ghi đè bản mới, khoản nộp không cộng đôi).
7. **Chuyển máy:** sao lưu ZIP trên máy cũ → cài app → "Nhập bổ sung" ZIP trên máy mới (hoặc chép `hak.db` + `backups\` khi app đã đóng và cùng phiên bản schema).

## 9. Truy vết, trạng thái và nhật ký (nhóm Q6)

* `audit_log` (chỉ thêm): người, thời điểm, công ty, thao tác, thực thể, trường, giá trị trước / sau, lý do.
* `record_versions`: mỗi lần sửa hồ sơ đã xuất lưu phiên bản + lý do + mẫu dùng; mở / in lại đúng bản đã lưu.
* Truy vết số tổng → phiếu → tệp Excel → hồ sơ → bộ lọc → phiên bản dữ liệu: dựa trên `archive_tickets` (mã hồ sơ, chỉ số dòng, nguồn đợt) và `record_versions`.

## 10. Số đo nền (IndexedDB, Chromium Linux headless, dữ liệu tự sinh — từ đợt đánh giá trước)

Mức lớn (1.500 hồ sơ × 100 phiếu = 150.000 phiếu): lưu 1 hồ sơ 15 ms; mở hồ sơ 1 ms; báo cáo kỳ ngày cân lần đầu 2,6 s (1,9 s sau tối ưu song song); sao lưu 1,7 s; khôi phục 1,5 s (+0,8 s kiểm tra). SQLite gốc cùng dữ liệu: nhập 789 ms; phiếu của một tháng 20 ms; thêm 1 hồ sơ 0,9 ms; tệp 16,9 MB; qua HTTP localhost 45 ms. Các số đo của **backend mới** ở §12.3.

## 11. Câu hỏi cần xác nhận (không chặn phần đã làm)

* **Q-1. Chỉ mục phiếu `archive_tickets`:** dựng khi lưu hồ sơ (cần giải nén tại máy khách) hay nền khi mở app? Đã có bảng; chưa dựng ở nhóm hiện tại.
* **Q-2. Số chứng từ theo công ty / loại / kỳ cấp số:** quy tắc cấp số (liên tục? đặt lại theo kỳ nào? có cho trùng khi "tạo lại" không?) chưa được định nghĩa trong tài liệu nghiệp vụ → **chưa thêm ràng buộc duy nhất** vào `issued`, chỉ có chỉ mục; cần quy tắc để thêm.
* **Q-3. Quyền ép ở máy chủ:** có chuyển tài khoản (băm mật khẩu, vai trò) vào HAKDocs để quyền theo người dùng được kiểm ở máy chủ không? Hiện là lớp phòng thủ thêm (§5).
* **Q-4. Gỡ chương trình:** mặc định giữ thư mục dữ liệu (đề xuất); có cần tùy chọn "xóa cả dữ liệu" trong trình gỡ không?
* **Q-5. Mẫu Word / BKLS:** `ngày áp dụng` và `trường bắt buộc` của từng phiên bản mẫu chưa có định nghĩa → bảng `bkls_templates` có cột `version`, `effective_from`; chưa ép ràng buộc.

## 12. Tiến độ và mức kiểm chứng

(Cập nhật theo từng nhóm; xem `docs/NGHIEM_THU_SQLITE.md` khi có.)
