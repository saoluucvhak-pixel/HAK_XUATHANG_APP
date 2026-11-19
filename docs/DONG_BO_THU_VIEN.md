# Đồng bộ thư viện dùng chung HAK (v2.24.0, 19/11/2026)

Đối chiếu mã trong app với các repo tham chiếu do chủ dự án chỉ định. Mục đích: app dùng đúng bản tốt nhất; phần app sửa riêng được ghi lại để đưa ngược lên repo gốc.

| Repo gốc | Bản trong app | Kết quả |
|---|---|---|
| `HAK_SMART_FILTER` (commit `555d29c`, V10.3) | `app/libs/hak-smart-filter/` | `browser.js` giống. **Đã đưa vào app (v2.24.0):** giữ tiêu điểm đúng ô + vị trí cuộn khi ngăn Bộ lọc nâng cao vẽ lại; tiêu đề ngăn là tên màn hình (không lộ `screenId`). |
| `HAK_CODE_QUALITY_TEST` v0.2.0 | `tools/hak-quality/` | Giống hệt (`src/`). |
| `HAK-Enterprise-Design-System` | `app/css/hak-enterprise-components.css` | Giống hệt. App tự kiểm tương phản WCAG AA trong `tools/ui-audit.cjs`. |
| `HAK_ACCOUNTING_REPORT_STANDARD` | `app/js/numfmt.js` | Không cần đổi: -0 hiển thị "0", số lớn không sai. |
| `HAK_OCR_ENGINE` | — | Dành cho OCR chấm công; app dùng OCR Windows qua HAKDocs. Giữ nguyên tắc chung "thà để trống còn hơn đọc sai chắc chắn" (quy tắc 27/28). |
| `HAK_AI_SKILLS` | — | Checklist `hak-data-integrity`, `hak-migration-manager`, `hak-release-builder` dùng khi nghiệm thu (issue #29). |

## Phần app CÓ mà repo gốc `HAK_SMART_FILTER` CHƯA CÓ (chủ dự án đưa ngược lên repo gốc)
1. `core`: `applyPreset()` trả thêm `stale` — điều kiện tham chiếu mục đã xóa / đổi tên được GIỮ và báo "Điều kiện hết hiệu lực: <nhãn> (x/y mục)" (M2.1, v2.22.4).
2. `core`: `discardCorrupt()` sao lưu kho hỏng sang khóa có mốc thời gian, không ghi đè bản sao trước.
3. `ui`: không xử lý phím khi đang có hộp thoại gốc (`dialog[open]`) mở; ô tìm nhanh chốt giá trị khi rời ô (trước khi nút Xuất nhận cú bấm).
4. `ui/filter-popover.js`: sau khi Áp dụng, trả tiêu điểm về nút lọc nhanh vừa được vẽ lại.
5. Nhãn chung cho mọi app ("Kỳ báo cáo", "Dữ liệu nghiệp vụ") thay cho nhãn riêng app lương ("Kỳ lương", "Dữ liệu lương").

Kho bộ lọc đã lưu trong app đi qua `HAK.Filters.presetStorage` (bọc `HAK.Store`, bền trên SQLite — v2.22.5); thư viện nhận `storage` tiêm từ ngoài nên không phải sửa.
