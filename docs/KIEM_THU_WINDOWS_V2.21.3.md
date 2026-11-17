# Bảng các bước thử trên Windows — bộ cài v2.21.3

Mục đích: xác minh phần CI không làm được — **cài / nâng cấp bằng đúng file `.exe`, mở từ lối tắt, HAKDocs (lưu file, OCR), đọc lại dữ liệu**.
Chỉ dùng **dữ liệu thử** (không dùng dữ liệu thật). Máy thử: Windows 10/11 sạch hoặc VM, có Microsoft Edge.

| Mục | Giá trị cần ghi |
|---|---|
| Bộ cài thử | `HAK_QuanLyXuatHang_Setup_v2.21.3.exe` · Release v2.21.3 · commit `03497da` |
| SHA-256 công bố | `048d228e8cdc5d926ecb29ceb4da8da9911ac351e1a7c4a977585e46474deb4f` |
| Bản cài trước (để nâng cấp) | v2.21.2 (hoặc bản trước bất kỳ trên trang Releases) |
| Người thử / ngày / máy / phiên bản Windows | |

## A. Chuẩn bị
| # | Bước | Kết quả mong đợi | Kết quả (Đạt / Lỗi / Ghi chú) |
|---|---|---|---|
| A1 | Tải bộ cài v2.21.3 và bộ cài bản trước từ trang Releases | Tải được cả hai | |
| A2 | PowerShell: `Get-FileHash .\HAK_QuanLyXuatHang_Setup_v2.21.3.exe` | Trùng SHA-256 công bố ở trên | |
| A3 | Chuẩn bị file thử: dùng nút **Tải file Excel mẫu** trong app (Nhập liệu), 1 PDF hợp đồng mẫu, 1 file tờ khai `.xls` mẫu | Có đủ file | |

## B. Cài bản trước và tạo dữ liệu mẫu
| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| B1 | Cài bản trước, giữ **đường dẫn mặc định** (`%LOCALAPPDATA%\HAK\QuanLyXuatHang`) | Cài xong, có lối tắt | |
| B2 | Mở app từ **lối tắt**, tạo tài khoản quản trị, chọn công ty | Vào được trang Tổng quan | |
| B3 | Nhập liệu → chọn hình thức **Xuất khẩu** → nạp file Excel mẫu | Nhãn "✔ Đã lưu", ghi lại **số phiếu** và **tổng tấn** của đợt | |
| B4 | Danh mục: thêm 1 hợp đồng có 2 chi tiết (tàu A, tàu B) và 1 tờ khai | Lưu được; ghi lại KL hợp đồng, số tờ khai, thuế | |
| B5 | Trang **Xuất khẩu**: lập hồ sơ **tàu A** (lọc theo giờ cân), bỏ 1 phiếu, đánh dấu 1 xe trả về → **Lưu hồ sơ** → **Tạo biên bản (Word)** | Có file Word; ghi lại **số phiếu, tấn qua cân, xe trả về, thực giao** | |
| B6 | **Thêm mới** → lập hồ sơ **tàu B** → Lưu hồ sơ | Hai hồ sơ riêng, phiếu tàu B không lẫn tàu A | |
| B7 | Cài đặt → Chung → **Sao lưu toàn bộ (.zip)** | Có file `.zip` — cất lại để dùng ở mục G | |
| B8 | Chụp màn hình Tổng quan và Báo cáo tổng hợp | Ghi lại số "Thực giao đã lập hồ sơ" và tổng theo hình thức | |

## C. Nâng cấp lên v2.21.3
| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| C1 | Đóng app, chạy bộ cài **v2.21.3** (không gỡ bản cũ), giữ đường dẫn mặc định | Cài đè thành công, không báo lỗi | |
| C2 | Mở app từ **lối tắt** | Góc trên bên trái hiện **v2.21.3** | |
| C3 | Đăng nhập bằng tài khoản đã tạo ở B2 | Vào được, không phải tạo lại tài khoản | |

## D. Đọc lại dữ liệu sau nâng cấp (đối chiếu với mục B)
| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| D1 | Nhập liệu | Đợt Excel còn nguyên, **số phiếu và tổng tấn trùng B3** | |
| D2 | Danh mục | Hợp đồng, 2 chi tiết, tờ khai còn nguyên (số liệu trùng B4) | |
| D3 | Sổ hồ sơ năm → mở lại **tàu A** | Đúng phiếu, **phiếu bỏ và xe trả về như B5**, tên tàu đúng | |
| D4 | Mở lại **tàu B** | Đúng phiếu của tàu B | |
| D5 | Lưu trữ | Hồ sơ đã xuất vẫn còn; bấm **Word** dựng lại được và số liệu trùng B5 | |
| D6 | Báo cáo tổng hợp và Tổng quan | Số trùng B8 (thực giao khớp nhau giữa hai màn hình) | |

## E. HAKDocs (lưu file, in PDF)
| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| E1 | Xuất lại **Word**, **Excel**, **PDF** của hồ sơ tàu A | Hộp lưu file / thư mục tải về mở được, file được ghi ra đĩa | |
| E2 | Mở từng file vừa lưu | Word, Excel, PDF mở được; **tiếng Việt đủ dấu**; số phiếu, tấn khớp màn hình | |
| E3 | PDF nhiều trang (báo cáo dài, nếu có) | Tiêu đề bảng lặp ở mọi trang; cột nằm trong khổ trang | |
| E4 | Thử mở `index.html` trực tiếp (không qua lối tắt) | Ghi nhận khác biệt (HAKDocs/OCR không kết nối) — chỉ để biết, không phải lỗi | |

## F. OCR (cần HAKDocs / Windows OCR)
| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| F1 | Danh mục → hợp đồng → đính kèm PDF hợp đồng mẫu → **Đọc bằng OCR Windows** | Hiện các trường đề xuất kèm trang và dòng bằng chứng; bên bán / bên mua **không bị đảo** | |
| F2 | Danh mục → tờ khai → **Đọc tờ khai bằng OCR** (PDF hoặc ảnh) | Đề xuất số tờ khai, ngày, thuế, khối lượng; so với bản in | |
| F3 | Nhập tờ khai từ file `.xls` | Nhập được; nhập lại thì báo "đã có", không nhân đôi | |

## G. Nhập bổ sung / khôi phục
| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| G1 | Sửa 1 hợp đồng (đổi KL), rồi Cài đặt → **Nhập / Khôi phục từ bản sao** → chọn file `.zip` ở B7 → **Nhập bổ sung** | Hộp xem trước nêu số hợp đồng; **dữ liệu mới hơn trên máy được giữ**; nhập lặp không đổi gì | |
| G2 | Chọn **Khôi phục (ghi đè)** với cùng file | Danh mục về đúng thời điểm sao lưu; có nút **Hoàn tác khôi phục** | |

## H. Gỡ cài đặt và cài lại
| # | Bước | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| H1 | Gỡ cài đặt từ Windows (Apps), rồi cài lại v2.21.3 | Ghi nhận **dữ liệu còn hay mất** (cần biết để hướng dẫn người dùng; luôn sao lưu trước khi gỡ) | |

## Ghi nhận lỗi
Với mỗi dòng **Lỗi**: chụp màn hình (có góc phiên bản v2.21.3), ghi bước, dữ liệu vào, kết quả mong đợi, kết quả thực tế; gửi kèm file `.zip` sao lưu nếu liên quan dữ liệu.

## Kết luận thử
- [ ] Mọi mục A–G Đạt → bộ cài đạt điều kiện triển khai rộng.
- [ ] Có mục Lỗi → ghi rõ mục, mức ảnh hưởng (mất dữ liệu / sai tổng / bộ cài không chạy là **chặn phát hành**).
