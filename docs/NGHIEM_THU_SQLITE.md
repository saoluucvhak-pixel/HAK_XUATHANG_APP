# Nghiệm thu: bản Windows lưu dữ liệu bằng SQLite (v2.22.0, chưa phát hành)

## 0. Kết luận

**Chưa sẵn sàng phát hành. Sẵn sàng có điều kiện để duyệt diff và chạy kiểm chứng trên Windows.**

Phần đã kiểm chứng (Linux, Node + Chromium thật, dữ liệu mẫu): lõi SQLite, backend trong app, di trú có đối chiếu / kích hoạt / quay lui qua giao diện, bảng cha–con có khóa ngoại, nhật ký thao tác, bộ cài giữ dữ liệu. Phần **chưa xác minh** và bắt buộc trước khi phát hành: `HAKDocs.exe` (C# + `winsqlite3.dll`) chưa được biên dịch và chạy ở đâu cả; cài mới / nâng cấp / lối tắt / đường dẫn có dấu / Edge với SQLite chưa thử trên Windows thật; một số hạng mục yêu cầu chưa làm (§7).

Điều kiện cụ thể để chuyển thành "Sẵn sàng phát hành":
1. Duyệt diff 7 commit cục bộ (§1) — **chưa đẩy GitHub**.
2. Chạy CI Windows (đẩy nhánh để job `accept-windows` chạy): biên dịch `HAKDocs.exe`, bộ hợp đồng `tools/hakdb/contract.cjs` trên `HAKDocs.exe` thật (thư mục dữ liệu có dấu tiếng Việt), e2e hải quan + `accept:release` trên Edge với SQLite. Hiện các bước này **mới viết, chưa chạy**.
3. Thử tay theo bảng Windows (`docs/KIEM_THU_WINDOWS_V2.21.3.md`, thêm các bước SQLite ở §6) bằng đúng `.exe` do CI dựng.
4. Trả lời các câu hỏi nghiệp vụ ở `docs/SQLITE_KIEN_TRUC.md` §11 (cấp số chứng từ, quyền ép ở máy chủ, chính sách gỡ…).

## 1. Gói và nguồn đã thử

| Mục | Giá trị |
|---|---|
| Nhánh / nền | `claude/sqlite-windows` từ `origin/main` = `d10bb9d` (v2.21.4, đã phát hành) |
| Commit (7, cục bộ, chưa push) | `8fb2ed1` `faa2c5a` `a517a8d` `51c5a0e` `c416132` `ee60d0f` `1538a75` |
| Phiên bản | `app/js/version.js` = `installer/setup.nsi` = **2.22.0** (chưa phát hành; gộp vào main sẽ tự đăng Release) |
| Gói dựng ở Linux | `dist/nghiem-thu-2.22.0/` (bị `.gitignore`): `HAK_Portable_v2.22.0.zip` SHA-256 `4d6d3fb2…acb7`, `HAK_QuanLyXuatHang_Setup_v2.22.0.exe` SHA-256 `c247e486…da2e`; kê khai đầy đủ ở `MANIFEST.txt`, `SHA256SUMS.txt` |
| **Giới hạn của gói** | `app/native/HAKDocs.exe` trong kho là bản dựng **cũ (44 KB, chưa có SQLite)**. Bộ cài chính thức dựng lại bằng `installer/native/build.ps1` trên Windows. Gói Linux **không dùng được để thử SQLite**; chỉ để đối chiếu nội dung app và SHA-256 |
| Actions trên commit | **Chưa có** (chưa đẩy nhánh). Commit nền `d10bb9d` có CI xanh |

## 2. Kết quả từng ca

Loại dữ liệu: **M** = dữ liệu mẫu tự sinh (không dùng dữ liệu thật). Môi trường: Linux, Node 22.23.4, Chromium (Playwright 1.63). Backend: **IDB** = IndexedDB, **SQL** = SQLite qua máy chủ HAKDB tham chiếu (Node `node:sqlite` 3.53.4) — **không phải** `HAKDocs.exe`.

| Ca | Backend | Dữ liệu | Kết quả |
|---|---|---|---|
| `check`, `format:check`, `lint`, `quality`, `git diff --check` | — | — | **Đạt** |
| `npm test` (nền 441 → **506**) | IDB + SQL | M | **Đạt** 506/506 |
| `npm ci` | — | — | **Chưa chạy** (sẽ xóa Playwright cài riêng); `node_modules` có sẵn |
| `smoke` | IDB | M | **Lỗi lần đầu → đã sửa → Đạt** (§4, lỗi 4) |
| `ui-audit` (141 màn hình) | IDB | M | **Đạt** 0 lỗi script, 0 vi phạm |
| `e2e`, `e2e:carrier`, `e2e:reports`, `e2e:customs`, `accept:release` | IDB (đối chứng) | M | **Đạt** (accept 27/27) |
| Cùng 5 kịch bản trên | **SQL** | M | **Đạt** (accept 27/27); toàn vẹn SQLite (`integrity_check` + `foreign_key_check`) đạt sau mỗi lần |
| Di trú qua giao diện (`tools/e2e-migrate.cjs`, 35 kiểm tra) | IDB → SQL | M | **Đạt** |
| Bộ hợp đồng HTTP `tools/hakdb/contract.cjs` | SQL (tham chiếu) | M | **Đạt** |
| Bộ hợp đồng HTTP trên **`HAKDocs.exe`** | HAKDocs thật | — | **Chưa xác minh** |
| Biên dịch `HakDb.cs` / `HAKDocs.cs` | — | — | **Chưa xác minh** (không có `csc`); chỉ kiểm **cú pháp** bằng tree-sitter: 0 lỗi |
| Bộ cài NSIS (biên dịch bằng `makensis` Linux, test cấu hình giữ dữ liệu) | — | — | **Đạt** (biên dịch + test); cài / nâng cấp / gỡ thật: **Chưa xác minh** |
| Edge Windows với SQLite | HAKDocs thật | — | **Chưa xác minh** |
| Dữ liệu thật của người dùng | — | thật | **Chưa xác minh** (chưa có bản sao lưu) |

Phủ theo yêu cầu (kiểm thử đơn vị / tích hợp, đều ở Linux, dữ liệu mẫu):

| Yêu cầu | Test | Kết quả |
|---|---|---|
| Khóa ngoại trên từng kết nối; xóa cha còn con bị chặn | `hakdb-engine` | Đạt |
| NULL / 0 / chuỗi trống; số 0 đầu; tiếng Việt; số lớn / độ chính xác 1/1000 | `hakdb-engine`, `db-sqlite`, `catalog-rows`, `migrate` | Đạt |
| Khóa lạc quan; hai cửa sổ / kết nối cùng sửa | `hakdb-engine`, `db-sqlite` (kvCas, guarded) | Đạt |
| Giao dịch nguyên tử; mất tiến trình giữa giao dịch (SIGKILL) | `hakdb-engine` | Đạt |
| Chống SQL từ trang; token / Origin / phiên / phạm vi công ty; log không lộ bí mật | `hakdb-server`, `hakdb-contract` | Đạt |
| Sao lưu `VACUUM INTO` nhất quán + SHA-256; không ghi đè; tên bị lọc | `hakdb-engine`, `hakdb-server` | Đạt |
| Di trú lặp / dừng giữa chừng / lỗi dung lượng (mô phỏng) / dữ liệu hỏng / sai lệch sau nhập (đến mã nguồn) / kích hoạt bị chặn / quay lui | `migrate` (10) | Đạt |
| Chụp nhất quán khi dữ liệu đổi | `migrate` | Đạt |
| Mất kết nối hoặc DB bị thay sau khi dùng SQLite → **BỊ CHẶN** | `db-sqlite`, `e2e-migrate` (màn chặn) | Đạt |
| Bản portable không thăm dò mạng | `db-sqlite` | Đạt |
| Bản cũ không ghi đè bản mới (nhập từ hai máy), khoản nộp không cộng đôi | test hợp nhất đã có từ v2.21.3 (`backup-merge`, `merge-version`…) — **không chạy lại riêng trên SQLite** | Đạt (IDB); SQLite: dùng chung mã `Backup`/`Merge`, chưa có ca riêng |
| Hai tàu cùng ngày, qua năm, phiếu lặp, xe trả về, BDMT 5.000 = 4.000 + 1.000, tờ khai nợ / nộp thừa, tài khoản giới hạn công ty | `e2e-*`, `accept:release` trên **cả IDB và SQL** | Đạt |
| Đồng bộ Sheets (mô phỏng) | không đổi mã; chạy trong `npm test` | Đạt (không phụ thuộc backend) |
| Đọc lại Word / Excel / PDF | `accept:release` (đọc lại DOCX / XLSX / PDF thật) trên IDB và SQL | Đạt |

## 3. Số đo (Linux, Node + HTTP localhost, **không** phải Edge / Windows / ổ đĩa người dùng)

`tools/bench-sqlite-backend.cjs`; kết quả thô `docs/do-luong/sqlite-backend-linux.json` (CPU Xeon 2,1 GHz × 4, 15,7 GB RAM). Ba mức như đợt đo IndexedDB trước (nhỏ 50×40, vừa 500×60, lớn 1.500×100 = 150.000 phiếu).

| Thao tác (ms) | Nhỏ | Vừa | Lớn | IndexedDB trước (mức lớn) |
|---|---|---|---|---|
| Lưu 1 hồ sơ (trung vị) | 1,6 | 1,5 | 1,3 | 15,5 |
| Mở 1 hồ sơ | 0,8 | 0,6 | 0,5 | 1,1 |
| Danh sách hồ sơ | 1,1 | 2,7 | 7,0 | 13,4 |
| Di trú (nhập + đối chiếu) | 298 | 979 | 2.066 | — (khôi phục sao lưu: 1.500 + 825) |
| Đối chiếu riêng | 29 | 85 | 99 | — |
| Sao lưu (`VACUUM INTO`) | 6 | 15 | 33 | 1.700 (dựng JSON + nén ZIP) |
| Dung lượng tệp DB | <1 MB | 2,5 MB | 7,8 MB | 18,7 MB (IndexedDB) |

**Cách đọc đúng:**
* **Cải thiện** ở thao tác không phụ thuộc kích thước hồ sơ: lưu 1 hồ sơ (~12 lần nhanh hơn), mở hồ sơ, danh sách. Không còn nghịch lý "lưu hồ sơ vào Sổ năm 0,42 s" vì Sổ năm vẫn là một khóa kv (**chưa tách**, xem §7).
* **Không so sánh trực tiếp được:** dữ liệu mẫu lần này nhẹ hơn lần đo IndexedDB (7,8 MB so với 16,9 MB cho cùng 150.000 phiếu: ít trường hơn mỗi phiếu), nên "đọc và giải nén mọi hồ sơ" (80 ms) và sao lưu **không** chứng minh nhanh hơn thực tế. Báo cáo kỳ theo ngày cân vẫn tốn thời gian giải nén gzip ở máy khách (không đổi) — chỉ mục phiếu `archive_tickets` **chưa dựng**.
* **Chậm hơn / chi phí mới:** mỗi thao tác đi qua HTTP localhost (~0,3–1 ms mỗi lời gọi trong đo này); lưu Danh mục đọc lại các bảng chiếu để chỉ ghi dòng đổi (tăng theo cỡ Danh mục, chưa đo riêng).
* **Chưa đo:** Edge / Windows, ổ HDD, RAM thấp, `winsqlite3.dll`.

## 4. Lỗi tìm thấy trong quá trình làm và đã sửa (có tái hiện)

1. **`kvGet` của SQLite trả cả bản ghi `{key,val,ls,ts}` thay vì giá trị** (khác IndexedDB): bắt bởi test `db-sqlite` (kv / kvCas) → sửa.
2. **`batch_files` không có cột `rev`** nhưng client yêu cầu `rev`: test `guarded` lỗi `Cột không có trong batch_files: rev` → sửa (`noRev`).
3. **Tên sao lưu `../../x` sau lọc vẫn chứa `..`** (`.._.._x`): test máy chủ phát hiện → lọc chuỗi `..`; ca này còn làm treo bộ test vì máy chủ không đóng khi assert lỗi → test luôn đóng máy chủ.
4. **Hồi quy `smoke`: `ERR_CONNECTION_REFUSED` ở mỗi lần mở bản portable** (app thăm dò cổng 31879 khi không có HAKDocs) → chỉ thăm dò khi có mã bảo vệ hoặc lần trước đã dùng SQLite; có test không gọi mạng.
5. **Nhật ký thao tác sinh dòng "tạo" cho từng bản ghi khi di trú / nhập lặp làm nhân đôi** → di trú tắt nhật ký hàng loạt, chỉ ghi một dòng "di trú".
6. **Cổng chặn lúc khởi động bị `.catch` của `Backup.boot` nuốt** (vẫn dựng giao diện) → tách cổng ra khỏi chuỗi.
7. **Số tờ khai duy nhất ở mức CSDL sẽ chặn mọi lần lưu Danh mục nếu dữ liệu cũ có số trùng** → bỏ ràng buộc duy nhất (chỉ mục thường); phát hiện trùng vẫn do app và `HAK.Integrity`. (Quyết định thiết kế, ghi ở kiến trúc.)
8. **Bộ bọc e2e** treo vì máy chủ giữ tiến trình; và `accept` mong hồ sơ trống ở mỗi ngữ cảnh → bộ bọc `unref` + xóa dữ liệu mỗi ngữ cảnh.

## 5. Chức năng đã đổi / thêm (chi tiết ở `docs/SQLITE_KIEN_TRUC.md`)

* Kiến trúc: HAKDocs giữ SQLite (`winsqlite3.dll`), dữ liệu `%LOCALAPPDATA%\HAK_XUATHANG\data\hak.db` ngoài thư mục cài; nâng cấp / gỡ không xóa; portable giữ IndexedDB; thanh bên và màn Sao lưu hiện nơi lưu; **BỊ CHẶN** khi mất nguồn.
* Schema v1 (21 bảng), API `/db/*`, di trú, quay lui, nhật ký thao tác, phần chiếu quan hệ Danh mục.
* Giao diện: nhãn "Dữ liệu: …", thẻ "Nơi lưu dữ liệu" (các bước ①–⑤, bảng sai lệch, quay lui), màn chặn.
* Ảnh trước / sau: `docs/anh-sqlite/` — `1-truoc-chuyen-indexeddb.png`, `2-doi-chieu-dat-cho-kich-hoat.png`, `3-sau-chuyen-sqlite.png`, `3b-thanh-ben-sqlite.png`, `4-bi-chan-mat-ket-noi.png` (chụp bằng Chromium Linux, chưa phải Edge).

## 6. Bước thử thêm trên Windows (bổ sung cho `docs/KIEM_THU_WINDOWS_V2.21.3.md`, dùng đúng `.exe` do CI dựng)

| # | Bước | Mong đợi |
|---|---|---|
| S1 | Cài bản trước (v2.21.4), tạo dữ liệu mẫu (đợt Excel, hợp đồng + tờ khai + khoản nộp, hồ sơ, chứng từ), Sao lưu toàn bộ | Có ZIP |
| S2 | Cài đè v2.22.0 (cùng đường dẫn) → mở bằng lối tắt | Dữ liệu vẫn đủ; thanh bên "Dữ liệu: Trình duyệt"; thẻ "Nơi lưu dữ liệu" hiện có thể chuyển |
| S3 | Chuyển sang SQLite (①–⑤) | Mọi bước ✔; `hak.db` có trong `%LOCALAPPDATA%\HAK_XUATHANG\data`; thanh bên "SQLite" |
| S4 | Đóng hẳn app, mở lại bằng lối tắt; so sánh số liệu với bước S1 (tổng phiếu, tấn, thuế, số tờ khai, mã có số 0 đầu) | Khớp |
| S5 | Lưu thêm hồ sơ, đóng / mở; kiểm tra HAKDocs lưu file Word và đọc lại | Đạt |
| S6 | Thử thư mục cài / dữ liệu có dấu tiếng Việt (nếu đổi `HAK_DATA_DIR` hoặc tên người dùng Windows có dấu) | Mở được `hak.db` |
| S7 | Đóng HAKDocs bằng Task Manager rồi mở app không qua lối tắt | Màn **BỊ CHẶN**, dữ liệu không đổi |
| S8 | Gỡ chương trình; cài lại | Hộp thoại nêu đường dẫn dữ liệu; cài lại thấy đủ dữ liệu |
| S9 | Quay lui về IndexedDB; mở lại | Dữ liệu cũ nguyên; dữ liệu mới sau S3 nằm ở SQLite (xuất bằng ZIP rồi Nhập bổ sung) |
| S10 | Hai bản cài ở hai thư mục (nếu có) rồi nâng cấp một bản | Chỉ HAKDocs của thư mục đó bị dừng (đã sửa ở v2.21.4); dữ liệu SQLite dùng chung theo máy (**lưu ý:** một cơ sở dữ liệu cho mỗi tài khoản Windows) |

## 6b. Hướng dẫn sao lưu / nâng cấp / quay lui

Xem `docs/HUONG_DAN_SQLITE.md` (chuyển, sao lưu, quay lui, chuyển máy, khi bị chặn). Điểm then chốt: **sao lưu ZIP trước khi chuyển (app bắt buộc đọc lại)**, IndexedDB cũ không bị xóa, **dữ liệu phát sinh sau khi chuyển chỉ có ở SQLite** — muốn quay về bản cũ phải Sao lưu toàn bộ (khi còn ở SQLite) rồi Nhập bổ sung sau khi quay lui.

## 7. Chưa làm / lỗi và giới hạn còn mở

**Chưa làm (so với yêu cầu):**
* Bố cục và thiết kế giao diện toàn diện (§5 của yêu cầu): chuẩn hóa khoảng cách / cỡ chữ / màu trạng thái, điều hướng theo công việc, màn lập hồ sơ nhóm lại, phân biệt Lọc xem trước / Phạm vi lập chứng từ / Kỳ báo cáo, bảng cố định tiêu đề, bàn phím / focus / tương phản, kiểm 1366×768 · 1920×1080 · màn hẹp. Chỉ có phần giao diện nơi lưu dữ liệu; `ui-audit` hiện có (141 màn hình) vẫn đạt.
* Trạng thái hồ sơ Nháp / Đã lưu / Đã xuất / Đã đóng, `record_versions` (bảng có, chưa có chỗ ghi), mở / in lại đúng bản đã xuất, quản lý phiên bản mẫu Word / BKLS, tiền kiểm "trước khi lưu / xuất" (công ty, tàu, phạm vi, số phiếu, qua cân, trả về, phiếu bỏ, thực giao, ngoại lệ), truy vết số tổng → phiếu → Excel → hồ sơ → bộ lọc → phiên bản dữ liệu (phần truy vết **có sẵn** của báo cáo vẫn dùng).
* Kiểm tra số chứng từ theo công ty / loại / kỳ cấp số — **cần quy tắc** (Q-2).
* Chỉ mục phiếu `archive_tickets` (Q-1) và tách Sổ hồ sơ năm theo bản ghi (Sổ năm vẫn là một khóa kv).
* Sao lưu SQLite trong gói ZIP: ZIP vẫn là bản JSON như cũ; bản `VACUUM INTO` là chức năng riêng của HAKDocs (`/db/backup`), **chưa có nút trên giao diện** và chưa đóng gói chung với tệp / checksum vào ZIP.
* Nhập ZIP vào SQLite có kiểm thử riêng cho "bản cũ không ghi đè mới / không cộng đôi khoản nộp" — hiện dựa trên mã hợp nhất cũ đã có test ở IDB.

**Giới hạn đã biết:**
* Quyền theo người dùng / công ty được máy chủ ép bằng **phiên + phạm vi** (đã test), nhưng tài khoản vẫn là cục bộ (xem Q-3): trang có token tự mở được phiên toàn quyền.
* Một cơ sở dữ liệu cho mỗi tài khoản Windows (không chia sẻ nhiều máy).
* `winsqlite3.dll` có sẵn từ Windows 10 1809; máy cũ hơn không dùng được SQLite (app giữ IndexedDB). HAKDocs kiểm phiên bản SQLite ≥ 3.27 khi mở — **chưa chạy**.
* Số đo hiệu năng chỉ ở Linux / Node.

## 8. Cách chạy lại

```bash
npm test                                              # 506 test
node tools/e2e-sqlite.cjs tools/e2e-reports.cjs       # bất kỳ e2e nào trên SQLite (máy chủ tham chiếu)
node tools/e2e-migrate.cjs                            # di trú qua giao diện (HAK_SHOT_DIR=<thư mục> để chụp ảnh)
node tools/hakdb/contract.cjs http://127.0.0.1:31879 <token>   # bộ hợp đồng trên HAKDocs.exe thật (Windows)
node tools/bench-sqlite-backend.cjs all kq.json       # đo hiệu năng
```
