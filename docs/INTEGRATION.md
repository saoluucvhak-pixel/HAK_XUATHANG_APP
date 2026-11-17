# Tích hợp các repo HAK — 17/10/2026

Xem HAK_DESIGN_SMART_FILTER.md để biết phạm vi tích hợp cuối cùng, các chỉnh sửa UI adapter và bằng chứng kiểm thử. Commit nguồn của 5 repo được cố định trong HAK_SOURCES.json; app không tải mã từ Internet lúc chạy.

- HAK_AI_SKILLS: quy trình hak-code-auditor, hak-data-integrity, hak-smart-filter và hak-ui-designer; hak-release-builder cho bộ cài.
- HAK_SMART_FILTER: core/browser + FilterPopover + Smart Filter UI, nối với generator và các màn hình dữ liệu bằng hak-filters.js.
- HAK-Enterprise-Design-System: CSS contract và đặc tả V10.4, triển khai Luxe/Classic/Neutral/Champagne, sáng/tối, responsive, focus và reduced motion.
- HAK_CODE_QUALITY_TEST: CLI/analyzer trong tools/hak-quality; chạy npm run quality để tạo báo cáo offline. Scanner không bao phủ hết thứ tự script và quan hệ global HAK.
- HAK_ACCOUNTING_REPORT_STANDARD: kế thừa khung kỹ thuật dự thảo về phạm vi lọc, ngày xuất, đơn vị, tổng Excel và phân trang. Không xem đây là xác nhận pháp lý/kế toán. Các mẫu nghiệp vụ gốc giữ nguyên cấu trúc.

## Chạy kiểm tra

Node.js 18+; không cần cài package: npm test, npm run check, npm run quality. Chạy npm run release từ checkout sạch để tạo dist/app; không ghi đè dist/app có sẵn. Bản portable và Setup đều loại công cụ mở khóa/xóa dữ liệu.

## Bộ cài

NSIS có script trong installer/setup.nsi nhưng công cụ NSIS không chạy được trên máy dựng hiện tại. Bộ cài Windows x64 được dựng từ installer/windows/HAKSetup.cs và payload đã kiểm tra checksum. Bản source ZIP kèm payload.zip và build.ps1 để dựng lại bằng trình biên dịch .NET Framework của Windows.

Không đổi thư mục cài cũ hoặc trình duyệt đang dùng; sao lưu trong app trước khi cập nhật. Không ghi dữ liệu nghiệp vụ lên repo. Các giới hạn nghiệm thu được ghi trong HAK_DESIGN_SMART_FILTER.md.

## Đối chiếu 17/11/2026 (v2.19.6)
- HAK_SMART_FILTER: đã ghép bản sửa kho bộ lọc hỏng (sao lưu có mốc thời gian, cảnh báo + nút tải/sao lưu). Giữ nguyên các chỉnh riêng của app (khôi phục tiêu điểm, nhãn "Kỳ báo cáo", commit ô tìm kiếm khi blur).
- HAK_CODE_QUALITY_TEST: tools/hak-quality dùng bản mới (acorn); cần npm ci.
- HAK-Enterprise-Design-System: CSS thành phần giống hệt; hak-enterprise-theme.css là bản chuyển thể cho Bootstrap, không đổi.
- HAK_ACCOUNTING_REPORT_STANDARD: bộ định dạng BigInt chỉ để hiển thị, khác numfmt.js (đọc số nhập); không ghép.
- Commit ghim trong HAK_SOURCES.json cập nhật theo các bản đã đối chiếu.

## Checkout Windows và Linux (xuống dòng)
- `.gitattributes` buộc mã nguồn, cấu hình và tài liệu (`*.js, *.cjs, *.json, *.css, *.html, *.md, *.yml`) về **LF** khi checkout, kể cả máy Windows có `core.autocrlf=true`; nhờ đó `npm run format:check` và các test cho kết quả giống nhau trên Windows và Linux.
- Tệp `app/native/hakdocs-token.js` (do bộ cài Windows ghi) và mã chép nguyên từ repo gốc `tools/hak-quality/**` được giữ nguyên xuống dòng (`-text`).
- Prettier đặt `endOfLine: "auto"`: bản checkout cũ còn CRLF vẫn qua `format:check`. Muốn chuyển bản đang có sang LF: `git add --renormalize .` rồi commit, hoặc xóa và checkout lại.
- Test không còn đọc mã nguồn để tìm hàm (`tests/merge-batches.test.cjs` gọi trực tiếp `HAK.BatchMerge.merge`), nên không phụ thuộc kiểu xuống dòng.
- Kiểm thử trên trình duyệt: `npm run smoke`, `npm run ui-audit`, `npm run e2e` (luồng xuyên màn hình hai tàu cân xen kẽ). Đặt `HAK_CHROMIUM` để dùng Edge/Chrome khác.
