# Hướng dẫn: lưu dữ liệu bằng SQLite (bản Windows) — chuyển, sao lưu, quay lui

Áp dụng cho bản Windows đã cài bằng bộ cài (có HAKDocs). Bản HTML / portable giữ nguyên IndexedDB; mọi hướng dẫn sao lưu cũ vẫn đúng.

## 1. Dữ liệu nằm ở đâu

| Chế độ | Nơi lưu | Thanh bên hiện |
|---|---|---|
| SQLite (sau khi chuyển) | `%LOCALAPPDATA%\HAK_XUATHANG\data\hak.db` (kèm `hak.db-wal`, `hak.db-shm`, thư mục `backups\`) | Dữ liệu: **SQLite** |
| Trình duyệt (chưa chuyển, hoặc portable) | IndexedDB của trình duyệt / profile đang mở | Dữ liệu: **Trình duyệt** |
| Bị chặn | — | Dữ liệu: **BỊ CHẶN** |

* Thư mục dữ liệu nằm **ngoài** thư mục cài (`%LOCALAPPDATA%\HAK\QuanLyXuatHang`). **Cài đè (nâng cấp) và gỡ chương trình không xóa dữ liệu**; gỡ xong có hộp thoại nhắc đường dẫn. Muốn xóa hẳn dữ liệu, tự xóa thư mục `HAK_XUATHANG\data` sau khi đã sao lưu.
* Khi đã chuyển sang SQLite, dữ liệu mới **chỉ** ghi vào SQLite. IndexedDB cũ được giữ nguyên (không xóa) để quay lui nhưng không nhận dữ liệu mới.
* Đường dẫn có dấu tiếng Việt / khoảng trắng dùng được (UTF-8).

## 2. Chuyển dữ liệu sang SQLite

**Trước khi làm:** đóng các cửa sổ / tab khác của app; có chỗ lưu bản sao lưu ZIP (ổ khác càng tốt).

Vào **Cài đặt › Chung › Nơi lưu dữ liệu** (thẻ chỉ hiện ở bản Windows khi HAKDocs trả lời) → **Bắt đầu chuyển sang SQLite**. App tự đi qua các bước và hiện kết quả từng bước:

| Bước | Việc | Nếu lỗi |
|---|---|---|
| ① | Tạo ZIP sao lưu toàn bộ, **đọc lại** và đối chiếu số hồ sơ / khóa; bạn chọn nơi lưu ZIP | Hủy chọn nơi lưu hoặc ZIP không đọc lại được → **dừng**, chưa đổi gì |
| ② | Chụp dữ liệu nhất quán (chụp hai lần so dấu vân tay; đổi giữa chừng thì chụp lại, tối đa 3 lần) | "Dữ liệu đang thay đổi" → đóng cửa sổ khác rồi bấm Thử lại |
| ③ | Nhập vào SQLite (**chưa kích hoạt**; app vẫn chạy trên IndexedDB) | Báo bước và **mã bản ghi** đang nhập; bấm Thử lại (nhập lặp được, không nhân đôi) |
| ④ | Đọc **lại** từ SQLite và so từng bản ghi, tệp (SHA-256), tổng kg / MT / thuế / số dòng, toàn vẹn khóa ngoại | Bảng sai lệch theo **mã bản ghi nguồn**; không cho kích hoạt |
| ⑤ | **Kích hoạt**: sao lưu SQLite trước kích hoạt rồi bật nguồn chính | Máy chủ từ chối nếu số bản ghi lệch |

Sau ⑤ app tự tải lại; thanh bên hiện "Dữ liệu: SQLite".

**Dữ liệu nguồn hỏng** (hồ sơ thiếu dữ liệu phiếu, đợt Excel mất tệp gốc, trùng mã…) làm bước nhập **dừng trước khi ghi bất cứ gì** và liệt kê từng mã bản ghi. Danh mục có bản ghi mồ côi (vd tờ khai trỏ hợp đồng không còn) vẫn chuyển được: bản ghi **không bị bỏ**, giá trị gốc giữ nguyên, ghi vào bảng `quarantine` kèm lý do và hiện ở bước ④ để bạn đối chiếu.

## 3. Sao lưu và khôi phục khi dùng SQLite

* **Sao lưu toàn bộ (.zip)** hoạt động như cũ (cùng định dạng, cùng nút ở Cài đặt › Chung). Tự sao lưu ra thư mục đã chọn vẫn dùng được.
* Bản sao nhất quán của chính tệp SQLite: HAKDocs tạo bằng `VACUUM INTO` vào `…\data\backups\` (tên đã lọc, kèm SHA-256); app tự tạo một bản `pre-activate-…db` ngay trước khi kích hoạt.
* **Nhập / khôi phục ZIP** (cũ hoặc mới) theo đúng quy tắc cũ: nhập bổ sung theo phiên bản, bản cũ không ghi đè bản mới, khoản nộp thuế không cộng đôi khi nhập từ hai máy.
* Không sao chép tệp `hak.db` bằng tay khi app đang chạy (còn tệp `-wal`). Nếu cần chép: đóng app (HAKDocs tự thoát sau khi đóng trình duyệt hoặc dừng bằng trình gỡ), chép **cả** `hak.db`, `hak.db-wal`, `hak.db-shm`.

## 4. Quay lui về IndexedDB

**Cài đặt › Chung › Nơi lưu dữ liệu › Quay lui về IndexedDB.** Việc này **chỉ tắt cờ nguồn chính**; dữ liệu SQLite **không bị xóa**.

> **Dữ liệu phát sinh sau khi chuyển** chỉ có trong SQLite. Muốn đưa về bản cũ: **trước khi quay lui**, bấm **Sao lưu toàn bộ** (khi còn đang ở SQLite) → quay lui → dùng **Nhập bổ sung** với ZIP đó. Nhập theo phiên bản nên bản mới thắng bản cũ, không nhân đôi.

## 5. Chuyển sang máy khác

1. Máy cũ: **Sao lưu toàn bộ (.zip)**.
2. Máy mới: cài app, mở một lần (tạo tài khoản), **Nhập bổ sung** ZIP, rồi (tùy chọn) chuyển sang SQLite như mục 2.
3. (Nâng cao) cùng phiên bản app: đóng app ở máy cũ, chép cả `hak.db`, `hak.db-wal`, `hak.db-shm` vào cùng đường dẫn ở máy mới trước khi mở app lần đầu.

## 6. Khi app báo "BỊ CHẶN"

Nghĩa là **lần trước đã dùng SQLite** nhưng lần này app không kết nối / không đọc được cơ sở dữ liệu (HAKDocs chưa chạy, tệp bị thay, đường dẫn đổi…). App dừng để bạn không sửa nhầm dữ liệu cũ trong trình duyệt.

1. Đóng app, mở lại bằng **lối tắt HAK** (lối tắt khởi động HAKDocs).
2. Nếu vẫn lỗi: kiểm tra tệp `%LOCALAPPDATA%\HAK_XUATHANG\data\hak.db` còn không.
3. Cần xem dữ liệu ngay: dùng bản sao lưu ZIP gần nhất (Nhập bổ sung vào bản portable hoặc máy khác).
4. Không xóa IndexedDB của trình duyệt để "thử cho hết lỗi" — đó là bản nguồn cũ dùng để quay lui.

## 7. Thông tin kỹ thuật tóm tắt

* SQLite do HAKDocs gọi qua `winsqlite3.dll` có sẵn trong Windows 10 1809+ / 11 (cần SQLite ≥ 3.27; HAKDocs kiểm khi mở).
* Chế độ ghi bền: WAL + `synchronous=FULL`; khóa ngoại bật trên từng kết nối; mất điện / tắt đột ngột: SQLite tự phục hồi lần mở sau (đã thử bằng cách kết thúc tiến trình giữa giao dịch).
* Khối lượng lưu theo 1/1000 (kg, MT, BDMT); tiền VND số nguyên; mã và số chứng từ là chuỗi (giữ số 0 đầu).
* Chi tiết kiến trúc, schema, API và giới hạn đã biết: `docs/SQLITE_KIEN_TRUC.md`. Kết quả kiểm chứng: `docs/NGHIEM_THU_SQLITE.md`.
