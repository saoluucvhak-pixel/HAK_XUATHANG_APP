# Đánh giá lưu trữ: có cần chuyển sang SQLite không?

**Kết luận: GIỮ IndexedDB.** Không đề xuất SQLite ở thời điểm này. Bàn giao thay vào đó: 3 sửa nhỏ đã làm và kiểm thử (một sửa lỗi toàn vẹn dữ liệu, hai sửa tốc độ), cùng lộ trình tối ưu IndexedDB có số đo và điều kiện để xem xét lại SQLite.

Mốc: `main` 9c21a34 (v2.21.2). Mọi thử nghiệm dùng dữ liệu mẫu tự sinh và hồ sơ trình duyệt tạm; không đụng dữ liệu thật.

## 1. Lý do quyết định (tóm tắt có số)

| Câu hỏi | Số đo | Kết luận |
|---|---|---|
| Hiệu năng hiện tại có gây đau không? | Ở mức lớn nhất (1.500 hồ sơ = ngưỡng nhắc dọn của app, 150.000 phiếu): lưu hồ sơ 15 ms, mở hồ sơ 1 ms, sao lưu toàn bộ 1,7 s, khôi phục vào máy trống 1,5 s (+0,8 s kiểm tra). Chỗ chậm nhất: mở báo cáo kỳ theo ngày cân lần đầu **2,6 s** (sau sửa 1,9 s; lần sau 3 ms nhờ bộ nhớ đệm) và lưu một hồ sơ vào Sổ hồ sơ năm **0,42 s** | Chậm nhưng chấp nhận được; không phải lỗi chức năng |
| SQLite nhanh hơn bao nhiêu? | Cùng dữ liệu: lấy phiếu của một tháng 20 ms (SQLite gốc), 49 ms (SQLite WASM), 45 ms (qua HTTP localhost như HAKDocs); thêm 1 hồ sơ 0,9 ms | Nhanh hơn khoảng 40–130 lần bản hiện tại **lúc nạp báo cáo lần đầu** |
| Có cách rẻ hơn đạt cùng tốc độ không? | Mô phỏng "chỉ mục phiếu" ngay trong IndexedDB: đọc toàn bộ 301 ms, lọc theo tháng bằng chỉ mục 51 ms, thêm 1 hồ sơ 0,7 ms | **Có.** Bằng SQLite WASM mà không đổi nơi lưu |
| Lỗi mất / hỏng dữ liệu khi ghi dở? | 16 ca giả lập: trước sửa 2 ca lỗi (meta mồ côi khi lỗi đồng bộ giữa hai lần ghi), sau sửa 15 đạt + 1 chưa xác minh được (xem §4) | Là lỗi **mã**, không phải giới hạn của IndexedDB; SQLite không cần để sửa |
| Hai cửa sổ ghi đè nhau? | Sổ hồ sơ năm, Danh mục, đợt Excel: cửa sổ thứ hai bị từ chối có thông báo; Lưu trữ theo mã nội dung: không nhân đôi, không mất bản | Đã có kiểm soát đồng thời; đạt |
| Chi phí chuyển đổi | HAKDocs hiện **không có API dữ liệu** (chỉ OCR, lưu / mở tệp tải về); chế độ portable (không HAKDocs) vẫn phải dùng IndexedDB → hai nguồn dữ liệu. SQLite WASM phải xuất lại **toàn bộ** tệp mỗi lần ghi (85 ms ở 16,7 MB, tăng tuyến tính; bộ nhớ 159 MB) | Cao, rủi ro lớn, lợi ích không vượt chỉ mục IndexedDB |

Điều kiện xem xét lại SQLite: xem §7.

## 2. Khảo sát lưu trữ hiện tại

### 2.1 Nguồn dữ liệu thực tế

| Nguồn | Nơi lưu | Khóa nhận diện | Phiên bản / kiểm soát đồng thời | Nội dung |
|---|---|---|---|---|
| Lưu trữ hồ sơ (`archive.js`) | IndexedDB `hak-archive` v1: `meta`, `data` | `id` = băm cyrb53 của (loại + thông số + dải dòng + tổng) → cùng nội dung cùng mã | `meta.sv` (phiên bản thống kê); không cần khóa vì mã theo nội dung | `meta`: tàu, kỳ, số chuyến, kg, xe trả về, hợp đồng; `data`: `gz:`+base64 của JSON {thông số, các dòng phiếu} |
| Cài đặt, Danh mục (hợp đồng, chi tiết, phụ lục, tờ khai, giấy nộp tiền…) (`config.js`, `catalog.js`) | **localStorage** `hak.catalog.v1`, `hak.config.v1`… **và** bản sao IndexedDB `hak-app`.`kv` (cùng khóa) | Mã bản ghi (`hd-…`, `ct-…`, `tk-…`, `bs-…`, `pl-…`) ổn định | Lưu Danh mục có kiểm tra "snapshot" trong một giao dịch kv; `revision` từng hợp đồng | Một đối tượng JSON lớn (`v:3`) |
| Sổ hồ sơ năm (`yearbook.js`) | IndexedDB `hak-app`.`kv` khóa `hak.yearbook.v1` (**không** có bản localStorage) | `record.id` (≤160 ký tự) | `revision` toàn sổ (so sánh trong giao dịch) + `record.revision` | **Một bản ghi duy nhất** chứa mọi hồ sơ năm kèm toàn bộ dòng phiếu |
| Đợt Excel đã nạp (`records.js`) | `hak-app`: `batches` (thông số) + `batchdata` (file gốc `ArrayBuffer`) | `type|tênFile` | `rev` kiểm tra trong một giao dịch hai kho | Thông số + file gốc |
| Nhật ký chứng từ (PXK / BKLS) | `hak-app`.`issued` | `id` | — | Số chứng từ đã lập |
| Tệp đính kèm, mẫu BKLS | `hak-app`.`attachments`, `bklsTemplates` | `id` | — | PDF (base64), mẫu |
| Thư mục sao lưu mặc định | `hak-app`.`handles` (File System Access) | — | — | Tay cầm thư mục |
| Tài khoản, phiên, phạm vi công ty, chủ đề, đồng bộ Sheet… | localStorage `hak.auth.v1`, `hak.scope.v1`, `hak.gsync.v2`, `hak.theme`… (+ bản sao kv) | khóa `hak.*` | — | Nhỏ |
| Sao lưu toàn bộ | Tệp `.zip` (1 tệp `HAK_SaoLuuToanBo.json` bên trong) do người dùng lưu | — | khôi phục "Nhập bổ sung" so phiên bản từng bản ghi; có chụp "trước khi khôi phục" (`hak.prerestore.v1`) để hoàn tác | Mọi kho trên |
| Đóng năm (`year-close.js`) | Tệp ZIP + xác minh băm; chỉ dọn kho sau khi đối chiếu | năm + băm tệp | trạng thái đóng dở, tiếp tục được | Hồ sơ năm + đợt cân |

**Quan hệ giữa các kho:** không có khóa ngoại. `meta.contract` trỏ tới **chi tiết** hợp đồng (`ct-…`) trong Danh mục; tờ khai (`data.customs`) trỏ `contractId` / `detailId`; hồ sơ năm và đợt Excel độc lập. Toàn vẹn tham chiếu do mã ứng dụng giữ.

### 2.2 Chế độ chạy và dữ liệu gắn với đâu

- **Portable** và **bộ cài Windows** mở cùng một `index.html` bằng trình duyệt mặc định (`file://`). Bộ cài chỉ thêm **HAKDocs** (`installer/native/HAKDocs.cs`).
- **HAKDocs** là máy chủ HTTP localhost (cổng 31879, một thể hiện nhờ mutex, mã bảo vệ trong `native/hakdocs-token.js`) với các đường: `/status`, `/ocr`, `/save-download`, `/download-files`, `/downloads`, `/verify-download`. **Không lưu và không đọc dữ liệu nghiệp vụ.** Không có HAKDocs app vẫn chạy đủ (trừ OCR và lưu tệp qua hộp thoại Windows; có đường tải trình duyệt dự phòng).
- **Dữ liệu gắn với hồ sơ trình duyệt (profile) và nguồn `file://`**, không gắn với đường dẫn cài: đo bằng CDP, nguồn lưu trữ của trang là `file://`. Đổi trình duyệt (Edge ↔ Chrome), đổi profile hoặc xóa dữ liệu duyệt web thì dữ liệu "mất" với app — được giảm nhẹ bằng sao lưu `.zip` và tự sao lưu ra thư mục đã chọn. Đây là rủi ro thật, nhưng **SQLite không giải quyết được trong chế độ portable** (không có HAKDocs), chỉ giải quyết được ở chế độ Windows nếu HAKDocs giữ tệp trên đĩa.

## 3. Số đo

Môi trường: Linux, Intel Xeon 2,1 GHz 4 nhân, 15,7 GB RAM, Node 22.23.4, **Chromium 153 headless** với `launchPersistentContext` (hồ sơ trên đĩa, không ẩn danh). **Chưa đo trên Edge / Chrome Windows và đĩa của máy người dùng.** Dữ liệu mẫu: mỗi phiếu ~13 trường; tệp gốc đợt Excel ~90 byte / phiếu. Kích cỡ:

| Mức | Hồ sơ | Phiếu / hồ sơ | Tổng phiếu |
|---|---|---|---|
| Nhỏ | 50 | 40 | 2.000 |
| Vừa | 500 | 60 | 30.000 |
| Lớn | 1.500 (ngưỡng `SOFT_WARN`) | 100 | 150.000 |

### 3.1 IndexedDB hiện tại (bản main)

| Thao tác (ms, trừ khi ghi khác) | Nhỏ | Vừa | Lớn |
|---|---|---|---|
| Lưu 1 hồ sơ (trung vị) | 2,5 | 6,0 | 15,5 |
| Lưu 1 đợt Excel (trung vị) | 0,6 | 0,6 | 0,6 |
| Mở hồ sơ (`Archive.load`, trung vị) | 1,1 | 1,4 | 1,1 |
| Danh sách hồ sơ (`list`) | 0,5 | 4,9 | 13,4 |
| Báo cáo kỳ ngày cân — đọc phiếu lần đầu (`prepareTickets`) | 53 | 833 | **2.641** |
| — lần sau (bộ nhớ đệm) | 0 | 1 | 3 |
| — tính (`compute`, theo ngày cân) | 5 | 34 | 155 |
| Sổ hồ sơ năm: thêm 1 hồ sơ (trung vị) | 6 | 84 | **416** |
| Dung lượng đã dùng | 0,9 MB | 2,7 MB | 18,7 MB |
| Sao lưu: dựng JSON + nén zip | 23 + 50 | 147 + 289 | 410 + 1.292 |
| Sao lưu: kích thước JSON → zip | 0,9 → 0,1 MB | 7,5 → 1,3 MB | 27,7 → 5,6 MB |
| Khôi phục vào máy trống: kiểm tra + ghi | 42 + 85 | 186 + 588 | 825 + 1.458 |

Phân rã thời gian đọc báo cáo (mức lớn): đọc IndexedDB thô 40 ms; giải mã base64 26 ms; **gunzip 1.560 ms** (tuần tự) hay 953 ms (song song 16); `JSON.parse` 85 ms. Phần chậm là giải nén từng hồ sơ, không phải IndexedDB. Thử `structuredClone` thay `JSON` cho Sổ hồ sơ năm làm **chậm hơn** (416 → 567 ms) nên không dùng.

### 3.2 SQLite (cùng dữ liệu, cùng thao tác)

Lược đồ thử: `record` + `ticket` (khóa kép `record_id, idx`, khóa ngoại `ON DELETE CASCADE`), chỉ mục `ticket(weigh_ts)`, `ticket(ticket)`, `record(company, year)`.

| Thao tác (ms) | SQLite gốc (`node:sqlite` 3.53.4, ≈ HAKDocs) | SQLite WASM (sql.js 1.12, trong trình duyệt) |
|---|---|---|
| Nhập toàn bộ (mức lớn) | 789 | 1.352 |
| Thêm 1 hồ sơ (mức lớn) | 0,9 | (xuất lại cả tệp: 11 + ghi IndexedDB 74 = **~85**) |
| Mở 1 hồ sơ | 0,2 | 0,6 |
| Phiếu của 1 tháng (12,5–12,7 nghìn dòng) | 19,6 | 48,5 |
| Tổng theo tháng | 5,8 | 10,6 |
| Quét phiếu trùng toàn bộ | 24,6 | — |
| Kích thước tệp | 16,9 MB | 16,7 MB |
| Sao lưu (`VACUUM INTO`) / mở bản sao | 82 / 0,1 | — |
| Nạp lại sau khi mở app | — | đọc 31 + mở 13 (+ khởi tạo WASM 79; bộ nhớ ~159 MB) |

Qua HTTP localhost có mã bảo vệ (giống kênh HAKDocs, máy chủ Node thay HAKDocs .NET): ping 2,8 ms, lấy 12,5 nghìn dòng của một tháng 45 ms. Đây chỉ là ước lượng kênh; HAKDocs-SQLite thật chưa được xây dựng.

### 3.3 Phương án tối ưu trong IndexedDB (mô phỏng)

"Chỉ mục phiếu": mỗi hồ sơ có thêm một bản ghi phiếu rút gọn **không nén** trong kho riêng, có chỉ mục theo ngày cân đầu / cuối.

| | Vừa (500 × 60) | Lớn (1.500 × 100) |
|---|---|---|
| Đọc toàn bộ phiếu (thay `prepareTickets` 833 / 2.641 ms) | 74 | 301 |
| Hồ sơ có phiếu trong một tháng, qua chỉ mục | 14 | 51 |
| Thêm 1 bản ghi | 0,6 | 0,7 |
| Kích thước rút gọn (không nén) | 5,3 MB | 26,6 MB |

## 4. Lỗi ghi giữa chừng và hai cửa sổ

Harness `tools/storage-faults.cjs`: tiêm lỗi vào `IDBObjectStore.put` ở lần ghi thứ n, hai kiểu: **abort** (giao dịch bị hủy như hết dung lượng lúc ghi) và **throw** (ngoại lệ đồng bộ khi đang dựng giao dịch).

| Ca | Trước sửa | Sau sửa |
|---|---|---|
| F1 Lưu hồ sơ Lưu trữ lỗi (abort / throw) | abort Đạt; **throw LỖI**: `meta` đã ghi, `data` chưa → hồ sơ mồ côi (meta 2, data 1), chạy lại không sửa được | Đạt cả hai |
| F2 Lưu đợt Excel lỗi | Đạt cả hai | Đạt |
| F3 Sổ hồ sơ năm lỗi ghi | Đạt (phiên bản không đổi) | Đạt |
| F4 Danh mục lỗi ghi | Đạt (bản lưu giữ nguyên) | Đạt |
| F5 Khôi phục nhiều kho dừng giữa chừng rồi chạy lại | abort Đạt (báo "DỪNG GIỮA CHỪNG" nêu kho đã nhập / chưa chạy, chạy lại đủ); **throw LỖI**: còn 1 hồ sơ thiếu dữ liệu sau khi chạy lại | Đạt cả hai |
| F6a Sổ hồ sơ năm: hai cửa sổ cùng phiên bản cũ | Đạt (cửa sổ 2 bị từ chối, thông báo) | Đạt |
| F6b Danh mục: hai cửa sổ cùng sửa | Đạt ("Danh mục đã thay đổi") | Đạt |
| F6c Đợt Excel cùng tên | Đạt (bản cũ bị từ chối, bản mới giữ nguyên) | Đạt |
| F6d/F6e Lưu trữ từ hai cửa sổ: cùng / khác nội dung | Đạt (1 hồ sơ / 2 hồ sơ, không mất bản nào) | Đạt |
| F7 Hết dung lượng thật (giới hạn CDP 20 KB) | **Chưa xác minh**: trình duyệt không áp giới hạn nên không gây được lỗi thật; ca tương đương đã phủ bằng F1–F5 (abort) | Chưa xác minh |

Nguyên nhân F1/F5 (throw): `writeTx` trong `archive.js` không hủy giao dịch khi `work(tx)` ném lỗi sau lần `put` đầu → phần đã ghi bị commit. Khả năng xảy ra ngoài đời thấp (cần ngoại lệ đồng bộ giữa hai lần ghi), nhưng hậu quả là dữ liệu không toàn vẹn nên đã sửa.

## 5. Thay đổi đã làm (trong worktree, chưa commit)

1. `app/js/archive.js` — `writeTx`: gắn bộ xử lý trước, và nếu `work(tx)` ném lỗi thì `tx.abort()` rồi từ chối. Test mới `tests/archive-save.test.cjs` (ca `put2`) **lỗi trên mã cũ, đạt trên mã mới**. Sửa luôn F5-throw.
2. `app/js/archive.js` — `trim()` dùng `count()` thay `getAll('meta')` (mỗi lần lưu trước đây đọc cả danh sách meta). Lưu 1 hồ sơ mức lớn: trung vị 15,5 → 12,2 ms.
3. `app/js/report.js` — `prepareTickets` đọc song song theo lô 8, kết quả đặt lại đúng thứ tự cũ; lỗi từng hồ sơ vẫn ghi vào `errors`. Mức lớn: 2.641 → 1.856 ms (−30%). Test mới ở `tests/report-unallocated.test.cjs`: thứ tự khóa giữ nguyên dù hồ sơ xong lệch nhau, song song tối đa 8, dùng lại bộ nhớ đệm.
4. Công cụ đo đưa vào `tools/` để chạy lại: `bench-storage`, `bench-decode`, `bench-index`, `bench-sqlite`, `bench-http`, `storage-faults`. Kết quả thô ở `docs/danh-gia-luu-tru-2026-11/`.

Kiểm tra trên worktree: `npm run check`, `format:check`, `lint`, `quality`, `git diff --check` đạt; `npm test` 417/417 (+2 test mới); `smoke`, `e2e`, `e2e:carrier`, `e2e:reports`, `accept:release` đạt.

## 6. Lộ trình tối ưu IndexedDB (đề xuất, chưa làm)

**Giai đoạn 1 — chỉ mục phiếu (đáng làm nhất).** Thêm kho `tickets` vào `hak-archive` (v2): mỗi hồ sơ một bản ghi phiếu rút gọn (đúng các trường mà `prepareTickets` đang dựng: `i, id, ticket, date, plate, net, carrier, uid, ret, link`) + chỉ mục ngày cân đầu / cuối. Đây là dữ liệu **dẫn xuất**: nguồn sự thật vẫn là `data` (gzip), không đổi định dạng sao lưu / khôi phục / đóng năm; chỉ mục dựng lại được và có thể xóa an toàn.
- Dựng khi lưu hồ sơ (cùng giao dịch `meta` + `data` + `tickets`) và nền khi mở app đối với hồ sơ cũ (`ensureStats` đã có cơ chế bổ sung số liệu theo `sv`).
- Sau khôi phục / nhập bản sao: dựng lại cho các hồ sơ mới.
- Mục tiêu đo được: báo cáo lần đầu ở mức lớn ≤ 0,5 s (mô phỏng 0,3 s), ở mức vừa ≤ 0,15 s.
- Nghiệm thu: cùng bộ dữ liệu, phiếu từ chỉ mục **bằng** phiếu giải nén trực tiếp từng hồ sơ (so từng khóa, kg, cờ trả về); mất chỉ mục → báo cáo vẫn đúng (rơi về đường cũ); chạy lại `storage-faults` cho `tickets` (giao dịch ba kho: hủy thì không còn bản ghi lệch).
- Rủi ro: dung lượng ×~1,4 (26,6 MB ở mức lớn); phải nâng phiên bản IndexedDB có thể bị chặn khi nhiều tab mở bản cũ (đã có `onversionchange`).

**Giai đoạn 2 — tách Sổ hồ sơ năm theo bản ghi** (chỉ khi cần). Hiện một bản ghi kv chứa cả sổ: thêm 1 hồ sơ ghi lại toàn bộ (416 ms ở 17 MB; 84 ms ở 3,4 MB). Tách mỗi hồ sơ một khóa + một bản ghi đầu mang `revision` đưa thao tác về < 1 ms (mô phỏng chỉ mục: 0,7 ms). Đây là **đổi định dạng lưu trữ**: cần giữ `Yearbook.read()` trả đúng đối tượng cũ cho sao lưu / đóng năm, chuyển đổi một chiều có sao lưu zip trước, và thử mở lại bằng bản cũ. Chỉ làm khi Sổ năm thực tế vượt vài MB và người dùng thấy chậm khi lưu.

**Giai đoạn 3 — vận hành.** Bật `navigator.storage.persist()` và cảnh báo rõ trong màn Sao lưu khi mở app bằng trình duyệt / profile khác với lần đã sao lưu; không phụ thuộc SQLite.

## 7. Khi nào xem xét lại SQLite

Chỉ khi có **ít nhất một** điều kiện sau, đã được đo trên máy thật:
1. Nhiều người / nhiều máy dùng chung một nguồn dữ liệu (cần khóa ghi thật và truy vấn dùng chung).
2. Dữ liệu vượt xa mức đã đo (ví dụ > 500.000 phiếu hoạt động) mà chỉ mục IndexedDB (giai đoạn 1) vẫn cho báo cáo > 3 s trên máy người dùng.
3. Yêu cầu nghiệp vụ cần truy vấn tùy ý nhiều bảng (không còn là các màn hình cố định).
4. Có quyết định chỉ hỗ trợ chế độ Windows + HAKDocs (bỏ portable) và muốn dữ liệu **không phụ thuộc profile trình duyệt**.

Nếu xảy ra, phương án nên chọn là **SQLite do HAKDocs giữ trên đĩa** (không phải SQLite WASM, vì WASM phải ghi lại toàn bộ tệp mỗi lần và tốn bộ nhớ), với các nguyên tắc sơ bộ (chưa thiết kế chi tiết, chưa thử nghiệm):
- Một nguồn ghi duy nhất tại mỗi thời điểm (HAKDocs hoặc IndexedDB), không bao giờ cả hai cùng sửa; chuyển nguồn bằng cờ có phiên bản.
- API theo nghiệp vụ (không phơi bày SQL), truy vấn tham số hóa, giao dịch có `revision` như hiện nay.
- Di trú: sao lưu `.zip` trước → nhập vào cơ sở dữ liệu mới → đối chiếu từng nhóm (số hồ sơ, phiếu, tổng kg, xe trả về, thuế, trạng thái đóng năm, tệp đính kèm, hai công ty) → chuyển nguồn; bản IndexedDB cũ giữ nguyên để quay lui.
- Cần kiểm thử riêng: HAKDocs dừng / khởi động lại giữa giao dịch, hai cửa sổ cùng ghi, mở bằng bản cũ, hết dung lượng.

## 8. Rủi ro và điều kiện nghiệm thu của kết luận này

**Chưa xác minh / giới hạn của đánh giá:**
- Chưa đo trên Edge / Chrome Windows và máy thật của người dùng (đĩa HDD, RAM thấp); số đo là của Chromium Linux headless.
- Không biết quy mô dữ liệu thật của người dùng; mức "lớn" là ngưỡng nhắc dọn của app, không phải số liệu thật. **Việc nên làm trước tiên:** chạy `tools/bench-storage.cjs` trên bản sao dữ liệu thật hoặc xem số hồ sơ / phiếu thực tế để biết đang ở mức nào.
- HAKDocs-SQLite thật chưa được xây dựng; số HTTP chỉ là ước lượng kênh bằng máy chủ Node.
- Hết dung lượng thật không gây được (F7).
- Hai cửa sổ chỉ thử trong cùng một profile trình duyệt, Linux.

**Điều kiện nghiệm thu cho các thay đổi ở §5 (đã đạt trên Linux):** bộ kiểm thử đạt; `storage-faults` không còn ca lỗi; báo cáo kỳ cho số liệu y hệt trước (`e2e:reports`, `accept:release`). Còn lại trước khi phát hành: chạy lại `tools/storage-faults.cjs` và `tools/bench-storage.cjs lớn` trên Edge Windows và đọc báo cáo kỳ trên bản sao dữ liệu thật.

## 9. Chạy lại các phép đo

```bash
node tools/bench-storage.cjs all kq.json      # IndexedDB: nhỏ / vừa / lớn
node tools/bench-decode.cjs 1500 100          # phân rã thời gian đọc báo cáo
node tools/bench-index.cjs 1500 100           # mô phỏng chỉ mục phiếu
node tools/storage-faults.cjs kq.json         # lỗi ghi giữa chừng + hai cửa sổ
npm i --no-save sql.js@1.12.0 && SQLJS=node_modules/sql.js/dist node --no-warnings tools/bench-sqlite.cjs all kq.json
node --no-warnings tools/bench-http.cjs       # kênh HTTP localhost (ước lượng)
```
Đặt `HAK_BROWSER_CHANNEL=msedge` để đo bằng Edge trên Windows.
