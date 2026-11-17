# Nghiệm thu phát hành — v2.21.3 (main 03497da)

Nền: `main` **03497da** = v2.21.3 (PR #18 đã gộp, Release `v2.21.3` do CI đăng). Mốc 9c21a34 (v2.21.2) là tổ tiên của main. Không có AGENTS.md; workspace sạch khi bắt đầu.
Phần toàn vẹn cha–con (sơ đồ, khóa, F1–F5) xem `docs/NGHIEM_THU_RA_SOAT_2026-11.md`; tài liệu này ghi kết quả chạy lại trên main và các số đo.

## Quyết định nghiệp vụ
Mục 17–24 trong `docs/QUY_TAC_NGHIEP_VU_CAN_XAC_NHAN.md`: **GIỮ NGUYÊN NHƯ APP HIỆN TẠI** (xác nhận 17/11/2026). Không đổi công thức hay dữ liệu lịch sử.

## Bộ kiểm thử nền (Linux / Node 22 / Chromium, chạy lại trong phiên này)
| Lệnh | Kết quả |
|---|---|
| npm ci · check · format:check · lint · quality · git diff --check | Đạt |
| npm test | 430 / 430 |
| smoke · ui-audit (141 màn hình, 0 vi phạm) · e2e · e2e:carrier · e2e:reports · e2e:customs | Đạt |
| accept:release | 27 / 27, không bỏ qua |

GitHub Actions trên đúng commit 03497da: test (18) · test (20) · test (22) · smoke (gồm ui-audit, e2e, accept:release) · **accept-windows (Edge, windows-latest)** — cả 5 job thành công; `Build Windows setup` #60 thành công, Release v2.21.3 đã đăng (SHA-256 `048d228e8cdc5d926ecb29ceb4da8da9911ac351e1a7c4a977585e46474deb4f`).

## Hiệu năng IndexedDB (Chromium, dữ liệu tổng hợp: mỗi hồ sơ 150 phiếu cân)
| Số hồ sơ | Tổng phiếu | Dung lượng | Lập danh sách | Đọc phiếu để báo cáo | Tính báo cáo |
|---|---|---|---|---|---|
| 50 | 7.500 | 0,4 MB | 1 ms | 91 ms | 13 ms |
| 300 | 45.000 | 1,6 MB | 7 ms | 506 ms | 70 ms |
| 1.000 | 150.000 | 5 MB | 22 ms | 1,8 s | 248 ms |

Tăng gần tuyến tính, không có điểm nghẽn: **chưa có căn cứ chuyển SQLite** (khớp đánh giá PR #16). Nếu sau này vượt ~1.000 hồ sơ / năm hoặc đọc phiếu để báo cáo vượt ~5 giây thì mới mở việc riêng (so sánh SQLite WASM, tương thích portable, di trú, đối chiếu, quay lui).

## Tổ chức mã
`customs.js` đã được PR #17 tách thành customs-report / customs-print / customs-import / customs-export / customs-receipt / customs-parser (còn 1.122 dòng giao diện danh sách + chi tiết). Chưa tách thêm trong đợt này (đổi cấu trúc nên làm riêng, có đối chiếu đầu ra trước / sau).

## Gói portable
Dựng từ `git archive HEAD` trong thư mục sạch: 106 file, 6,4 MB, phiên bản 2.21.3. Đọc lại Word / Excel / PDF (PDF 140 dòng nhiều trang: mã phiếu, tiếng Việt, tiêu đề lặp, cột trong khổ trang) do `accept:release` kiểm.

## Chưa xác minh (cần máy / VM Windows thật)
- Cài bản trước với dữ liệu mẫu → nâng cấp lên đúng file `HAK_QuanLyXuatHang_Setup_v2.21.3.exe` → mở từ lối tắt → lưu file bằng HAKDocs → đọc lại hợp đồng, đợt cân, phiếu cùng khối lượng. (CI có `accept-windows` bằng Edge nhưng không cài bộ cài `.exe`.)
- OCR thật bằng HAKDocs (đọc hợp đồng / tờ khai bản scan).
- Google Sheet thật (đã kiểm bằng Sheet mô phỏng: ghi chú theo mã, gián đoạn / chạy lại).

## Kết luận
**Sẵn sàng có điều kiện**: không có lỗi chặn (mất dữ liệu, sai tổng, sai phạm vi công ty, bộ cài hỏng) trong phạm vi đã chạy; điều kiện là thử bộ cài `.exe` + HAKDocs trên Windows thật trước khi triển khai rộng.

## Hướng dẫn nâng cấp / sao lưu / quay lui
1. Trước khi nâng cấp: Cài đặt → Chung → **Sao lưu toàn bộ (.zip)** và cất file.
2. Chạy `HAK_QuanLyXuatHang_Setup_v2.21.3.exe` (giữ đường dẫn cài mặc định để không mất dữ liệu); đối chiếu SHA-256 ở trên.
3. Quay lui: cài lại bản trước, rồi **Nhập / Khôi phục từ bản sao** → chọn **Khôi phục (ghi đè)** (có nút **Hoàn tác khôi phục** cho phần cài đặt và danh mục) hoặc **Nhập bổ sung** nếu chỉ cần lấy lại dữ liệu thiếu. v2.21.3 không đổi định dạng dữ liệu lưu trữ.
