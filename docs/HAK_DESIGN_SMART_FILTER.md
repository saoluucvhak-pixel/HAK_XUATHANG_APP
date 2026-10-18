# HAK Enterprise + Smart Filter — bản hoàn thiện giao diện

## Phạm vi

- Phong cách mặc định HAK Luxe (navy/champagne/ivory) trên sidebar, topbar, dashboard, form, bảng, tab, modal và đăng nhập. Có thêm Classic, Neutral và Champagne; phong cách tách biệt với lựa chọn sáng/tối. Chỉ ghi khóa hak.design.theme, không sửa hồ sơ nghiệp vụ.
- Dùng core + browser + hai UI adapter của HAK_SMART_FILTER. Adapter app nằm ở app/js/hak-filters.js; CSS host theo hợp đồng token của HAK-Enterprise-Design-System.
- Bộ lọc xem trước Nhập liệu: tìm không dấu, nhiều biển số/ĐVVC, ngày/kỳ, dòng cảnh báo; thống kê, bảng nhãn, bảng xe và xem trước cùng tập dòng. Bộ lọc này riêng với bộ lọc lập chứng từ, có ghi rõ trên UI.
- 7 trang biên bản: cùng UI bộ lọc, chip, preset theo từng hình thức; điều kiện được đưa vào params.filter.smart. Generator, Word/PDF/Excel, BKLS, lưu hồ sơ và tải lại đều gọi cùng filterRows. Rào files/exclude/groups khi chuyển hình thức vẫn áp trước bộ lọc mới. Không đổi công thức khối lượng hoặc xe trả về.
- Báo cáo: chọn nhiều loại, tìm, khoảng ngày/kỳ, chip/preset; Excel dùng model sau lọc.
- Lưu trữ: loại hồ sơ, người lập, từ khóa và ngày bắt đầu (hồ sơ không có ngày dùng ngày cập nhật); luôn lọc phạm vi công ty trước.
- Danh mục Hợp đồng/Chi tiết thực hiện/Khách hàng: bộ lọc và preset riêng từng tab. Hợp đồng lọc ngày ký; khách hàng lọc theo loại. Không thay đổi dữ liệu danh mục khi lọc.
- Nhật ký chứng từ: loại chứng từ, hình thức, từ khóa, ngày lập; dùng phạm vi truy cập đã có của Issued.list.

## Điều chỉnh adapter nguồn

Bản sao smart-filter.js hỗ trợ input date ISO của app, đổi nhãn Kỳ lương thành Kỳ báo cáo, nhường focus cho dialog lưu preset và chốt từ khóa khi rời ô trước khi xuất. filter-popover.js khôi phục focus vào nút thay thế sau khi áp dụng. Đây là các chỉnh sửa host có chủ đích, không phải bản sao nguyên vẹn. Commit nguồn vẫn lưu ở HAK_SOURCES.json.

Design repo hiện cung cấp đặc tả và CSS contract ngắn, không có toàn bộ token của LUONG_HAK; bảng màu và CSS trong app là bản triển khai theo đặc tả cho app này, không tuyên bố sao chép nguyên vẹn giao diện của app khác.

## Kiểm tra đã thực hiện

- 19/19 kiểm thử app đạt: bộ lọc, ngày, nhiều giá trị, preset riêng màn hình, hồi quy phạm vi chuyển hình thức, không sửa dữ liệu đầu vào, giữ dữ liệu nghiệp vụ khi đổi theme, Excel round-trip, đóng gói loại công cụ cứu hộ.
- npm run check đạt; quality scanner còn 1 cảnh báo pages.js dài (có từ bản gốc). Scanner không đánh giá hết quan hệ qua global HAK.
- UI với dữ liệu giả: nguyen an → Nguyễn An, 1 phiếu/12,50 tấn; ĐVVC Đà Nẵng → 2 phiếu/22,50 tấn; Nhập liệu hoi an → 1 dòng/15,00 tấn, các bảng và tổng khớp.
- Lưu/khôi phục preset, hủy không đổi điều kiện, chặn ngày đảo ngược; Shift+Tab giữ trong drawer; Escape đóng và trả focus về nút mở.
- Báo cáo chọn Xuất khẩu + Xuất bán → 2/3 hồ sơ; Lưu trữ tìm bien dong → đúng hồ sơ; Danh mục và nhật ký dựng được adapter.
- Xuất Excel trực tiếp từ trang Xuất khẩu sau lọc: file chỉ có QA001, net 12.500 kg; tổng công thức SUM và bảng theo ngày khớp. File này được tạo bằng dữ liệu giả.
- Bốn theme, cả sáng/tối, kiểm tra viewport 1366x768 và 1920x1080, không tràn ngang toàn trang. Drawer ở 390x844 không có điều khiển vượt biên.
- Ảnh trước/sau và mobile lưu cùng deliverable. Kiểm thử UI dùng harness tách riêng, không thêm tài khoản, không đưa mã bỏ qua đăng nhập vào app hay bộ cài.

## Giới hạn

Chưa kiểm thử tất cả trường hợp Word/PDF/BKLS với hồ sơ thật; chưa thử đồng bộ Google Sheet, khôi phục dữ liệu thật hoặc cài/nâng cấp/gỡ trên máy sản xuất. Setup chưa ký số. Sao lưu app trước khi cập nhật và giữ nguyên thư mục cài/trình duyệt cũ.
