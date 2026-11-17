# Nghiệm thu rà soát — toàn vẹn cha–con, số liệu, gói phát hành (v2.21.2 → bản vá chưa phát hành)

Nền: `main` **7b12df6** (nội dung v2.21.2; mốc 9c21a34 trong yêu cầu đã cũ — main đã nhận thêm PR #16 và #17). Nhánh làm việc: `claude/ra-soat-phat-hanh` (chưa commit). Baseline: 421 unit test, 25 ca accept:release; sau thay đổi: 430 unit test, 27 ca accept:release.

## 1. Sơ đồ cha–con thực tế

```
customers ──(exporterId / principalId / buyerId)──► contracts ──details[] (con nhúng: contractId = cha)
                                                     │  └─ details[].certificateFiles / sourcePdfId ──► attachments (kho riêng)
                                                     ├─ addenda[] (con nhúng; contractQty = tính lại từ phụ lục còn hiệu lực)
                                                     └─ contractFiles ──► attachments
customs (tờ khai; contractId → contracts, detailId → details[].id)
   ├─ supplements[]  (khai bổ sung; số tờ khai bổ sung riêng)
   └─ payments[]     (giấy nộp tiền; kind tax | fee | refund = hoàn thuế)
archive meta (hồ sơ cân; contract = id CHI TIẾT hợp đồng; cid = công ty)   ─ data gz: các dòng phiếu cân + bản chụp thông số (certSnap…)
yearbook records (Sổ hồ sơ năm)   ·   batches / batchdata (đợt Excel + file gốc)   ·   issued (nhật ký chứng từ)
```

| Bảng | Khóa định danh | Khóa liên kết | Kho lưu | Xóa |
|---|---|---|---|---|
| customers | `k-…` | — | `hak.catalog.v1` (localStorage + kv IndexedDB) | `deletedAt` (mềm) |
| contracts | `hd-…` | exporter / principal / buyer → customers | như trên | `deletedAt` + `revision`; `closeRev` (đóng / mở lại) |
| details | `ct-…` (duy nhất toàn danh mục) | `contractId` → contracts | nhúng trong contract | `deletedAt` ("Ngừng dùng") |
| addenda | `pl-…` | nhúng | nhúng | `deletedAt`; KL hiện hành tính lại |
| customs | `tk-…`, số tờ khai 12 chữ số (duy nhất trong tờ khai đang dùng) | `contractId`, `detailId` | `hak.catalog.v1` (`data.customs`) | `deletedAt` |
| supplements / payments | `bs-…` / `nt-…` | nhúng trong customs | nhúng | `deletedAt` |
| archive | hash nội dung (`a…`) | `meta.contract` → detail; `meta.cid` | IndexedDB `hak-archive` (meta + data) | xóa thật qua Xuất & dọn |
| yearbook | `record.id` | — | IndexedDB kv `hak.yearbook.v1` | — |
| attachments | id | — | IndexedDB `attachments` | — |

Số lượng thực tế của dữ liệu thử `accept` (sao lưu → `tools/integrity-audit.cjs`): 1 hợp đồng · 2 chi tiết · 1 phụ lục · 2 tờ khai · 2 khoản nộp · 1 hồ sơ cân gắn chi tiết; **0 lỗi toàn vẹn**. Chạy trên sao lưu thật: `node tools/integrity-audit.cjs <HAK_SaoLuuToanBo.zip>`.

## 2. Phát hiện (đầu vào → tái hiện → mong đợi → thực tế)

| # | Mức | Phát hiện | Đầu vào | Mong đợi | Thực tế (trước sửa) | Xử lý |
|---|---|---|---|---|---|---|
| F1 | **Cao — sai số liệu thuế** | Nhập bổ sung cộng đôi khoản nộp | Hai máy cùng tờ khai 308629701721, cùng giấy nộp tiền DN0206/26 · 1.000.000 nhập riêng (id khác); `CM.merge` | 1 khoản; đã nộp 1.000.000; nộp thừa 0 | 2 khoản; đã nộp **2.000.000**; nộp thừa **1.000.000 giả** | Sửa `customs-model.js` (gộp theo giấy nộp tiền như quy tắc đã xác nhận); nghi trùng thiếu số giấy → giữ cả hai + báo; kết quả khôi phục nêu số khoản. Test hồi quy lỗi trên mã cũ |
| F2 | Trung bình | Phiên bản hợp đồng tụt khi nhập bản cùng nội dung, phiên bản cao hơn | Máy rev 2, bản nhập rev 3, nội dung giống (fuzz 600 ca, ca 371) | rev ≥ 3, không tăng thêm | rev 2 → sau đó hai máy "cùng phiên bản" khác nội dung bị báo xung đột giả | Sửa `contract-model.js` (`max`); test hồi quy |
| F3 | Thấp | Khai bổ sung trùng số nhập hai máy | Cùng số tờ khai bổ sung, id khác | 1 lần khai | 2 dòng | Gộp theo số; test |
| F4 | Thấp | Ngừng dùng chi tiết / hợp đồng còn tờ khai, hồ sơ cân gắn vào không có thông báo | Ngừng dùng chi tiết có 1 tờ khai | Giữ liên kết lịch sử + báo cần đối soát | Giữ liên kết (đúng) nhưng im lặng | `catalog.js` báo số tờ khai / hồ sơ còn gắn; e2e kiểm |
| F5 | **Cao — quy trình phát hành** | Workflow ghi đè Release đã đăng | Merge vào main khi số phiên bản không đổi | Release / SHA-256 / ghi chú không đổi sau công bố | Release v2.21.2: tag ở `ba46e89` nhưng Release & file cài bị thay bằng bản dựng `7b12df6` (SHA-256 `fd0a1857…` → `6b54dd42…`) | `build-setup.yml` kiểm tra Release đã có thì không đăng lại; test cấu hình |
| F6 | — | (tự gây, đã sửa trước khi commit) Mình ghi đè nhầm `integrity-model.js` / `integrity.test.cjs` đã có | — | giữ API cũ | API đổi | Khôi phục bản gốc, mở rộng tương thích (`audit(data, metas, opts)`, `relations`) |

Đã kiểm, **không phải lỗi**: KL gốc trống ≠ 0; phụ lục 500 khi gốc trống, tính lại, ngừng dùng phụ lục cuối; nhập bổ sung 700 v4 ← 500 v2 giữ v4, nhập lặp cùng kết quả; mở lại hợp đồng giữ khi nhập bản đóng cũ; sửa một chi tiết chỉ đổi đúng chi tiết; fuzz `mergeCatalog` 600 ca + fuzz `CustomsModel.merge` 800 ca: sau sửa 0 vi phạm (idempotent, không mất bản ghi, không giảm phiên bản, không cộng đôi).

## 3. Quy tắc nghiệp vụ còn mơ hồ (chờ xác nhận, chưa đổi hành vi) — mục 17–24 trong `docs/QUY_TAC_NGHIEP_VU_CAN_XAC_NHAN.md`

Hợp đồng chưa gắn công ty hiện cho mọi công ty · chọn hợp đồng của công ty khác khi lập hồ sơ · ngừng dùng chi tiết còn chứng từ gắn · khoản đã xóa ở máy này mà máy kia còn khoản tương đương · khai bổ sung trùng số · phiên bản khi nhập cùng nội dung · khôi phục dừng cả lần khi một hợp đồng vi phạm quy tắc · mỗi chi tiết một tờ khai hay nhiều.

## 4. Bảng ca nghiệm thu

| Ca | Kết quả | Gói / môi trường |
|---|---|---|
| Hợp đồng nhiều chi tiết / phụ lục / tờ khai: sửa một chi tiết chỉ đổi bản ghi đó; hồ sơ lịch sử giữ số liệu lúc lưu | Đạt | unit (`integrity-parent-child`, `cert`), Node |
| Phụ lục 500 khi KL gốc trống; tính lại; ngừng dùng phụ lục cuối; gốc 0 ≠ trống | Đạt | unit |
| Nhập 500 v2 vào máy 700 v4; nhập lặp; hợp đồng mở lại; bản đóng cũ | Đạt | unit + fuzz |
| Liên kết tệp đính kèm; lỗi ghi giữa chừng (khôi phục dừng, chạy lại) | Đạt | rà soát toàn vẹn; `storage-faults` (Chromium) |
| Hai cửa sổ cùng sửa (Danh mục, Sổ năm, đợt Excel, Lưu trữ) | Đạt | Chromium Linux, cùng profile |
| Khoản nộp trùng khi gộp hai máy (F1) | Đạt sau sửa | unit |
| Ngừng dùng có chứng từ gắn: giữ liên kết + báo | Đạt | e2e:customs (Chromium) |
| Nhập tờ khai Excel / OCR (giả lập) / nhập lại / khai bổ sung / hoàn thuế / hủy | Đạt | e2e:customs (OCR giả lập) |
| Hai tàu cùng ngày, mã phiếu trùng đuôi, Word / Excel / PDF đọc lại | Đạt | accept:release 27/27 |
| BDMT 5.000 = 4.000 + 1.000; nợ 20 / nộp thừa 20 riêng | Đạt | accept:release, e2e:reports |
| Báo cáo qua 31/12–01/01; chưa phân bổ; 5 mẫu + bảng chéo kho × hình thức; quyền công ty | Đạt | e2e:reports, carrier (Chromium; quyền công ty mô phỏng bằng đổi công ty làm việc) |
| Google Sheets gián đoạn / đổi thứ tự / Code.gs < v3; Đóng năm hai lần dở | Đạt | unit (Sheet mô phỏng, ZIP thật trong test) |
| Số âm ngoặc, mã giữ số 0 đầu, kg / MT / BDMT, kiểu ô Excel | Đạt | unit (`parse-num`, `numfmt`, Excel đọc lại) |
| `npm ci`, check, format:check, lint (0 cảnh báo), test 430/430, quality, diff --check | Đạt | Node 22 |
| smoke, ui-audit (141 màn), e2e, e2e:carrier, e2e:reports, e2e:customs, accept:release | Đạt | Chromium 153 Linux |
| Portable `dist/app` sạch (106 tệp): smoke, e2e:customs, accept:release, snapshot hải quan | Đạt | mở `file://` offline |
| Release v2.21.2: file cài tải về khớp SHA-256 GitHub (`6b54dd42…`), phiên bản bên trong 2.21.2, nội dung khớp bản dựng từ `7b12df6` (khác `HAKDocs.exe` CI dựng, `app.ico`, kiểu xuống dòng LICENSE) | Đạt | file `.exe` từ Release, giải nén bằng 7-Zip |
| Actions trên `7b12df6`: Build Windows setup #59 thành công; quality + accept-windows (Edge) PR #17 thành công | Đạt | GitHub Actions |
| Actions trên các thay đổi mới (nhánh chưa đẩy) và workflow `build-setup.yml` đã sửa | **Chưa xác minh** | chạy được sau khi tạo PR / gộp; workflow đăng Release chỉ chạy trên main / tag |
| Cài bản trước → nâng cấp bằng `.exe` → lối tắt → lưu file qua HAKDocs → đọc lại hợp đồng / đợt cân | **Chưa xác minh** | cần VM / máy Windows |
| Hết dung lượng thật; Edge / Chrome Windows cho mã mới; OCR Windows thật; tài khoản giới hạn công ty thật | **Chưa xác minh** | xem báo cáo trước |

## 5. Gói nghiệm thu
- Portable: `dist/app/` (build sạch) và `dist/HAK_portable_ra-soat.zip` — SHA-256 `9b38cd50743e5cec053e461eac36200d7376f853d4c4cbac45b21dab4ea1df5e` (2.229.076 byte; đóng gói bằng JSZip, ngày cố định 2026-01-01). Phiên bản trong gói: 2.21.2.
- Công cụ: `tools/integrity-audit.cjs`, `tools/customs-snapshot.cjs`, `tools/accept.cjs --release`, `tools/e2e-customs.cjs`.

## 6. Nâng cấp, sao lưu, quay lui
1. Trước khi cài / nhập: **Sao lưu toàn bộ** (zip) và chạy `node tools/integrity-audit.cjs <zip>` nếu cần kiểm chứng.
2. Nhập bản sao từ máy khác dùng **Nhập bổ sung** (mặc định): giữ bản mới hơn; nay nêu số khoản nộp trùng đã bỏ / nghi trùng.
3. Quay lui: cài lại file `.exe` bản trước (giữ đường dẫn cài mặc định); dữ liệu nằm trong hồ sơ trình duyệt nên không đổi theo bản cài; sau khôi phục có nút **Hoàn tác** (chụp trước khi ghi đè).
4. Không có thay đổi định dạng dữ liệu lưu trữ trong đợt này.

## 7. Kết luận: **Sẵn sàng có điều kiện**
Lỗi chặn: F1 (sai tổng thuế khi nhập bổ sung) có ở bản v2.21.2 đang phát hành; đã sửa trong workspace nhưng chưa vào main / chưa có bộ cài. Điều kiện: (a) duyệt và gộp các thay đổi này, **nâng số phiên bản** (đề xuất 2.21.3) để dựng bộ cài mới — với workflow đã sửa, không nâng phiên bản thì Release cũ sẽ không bị ghi đè; (b) xác nhận các quy tắc mục 17–24 (không chặn phát hành); (c) chạy cài / nâng cấp / lối tắt / HAKDocs trên Windows với đúng file `.exe` mới và đối chiếu SHA-256; (d) Actions xanh trên đúng commit phát hành. **Chưa tạo tag, chưa đăng Release, chưa thay dữ liệu thật — chờ xác nhận.**
