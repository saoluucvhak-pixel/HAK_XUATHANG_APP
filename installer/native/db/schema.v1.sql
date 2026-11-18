-- Schema SQLite v1 của HAK Quản lý xuất hàng (bản Windows, do HAKDocs giữ trên đĩa).
-- Quy ước:
--  * Mọi mã định danh / số chứng từ là TEXT (giữ số 0 đầu). Không bao giờ để SQLite tự chuyển kiểu.
--  * NULL = chưa có / không áp dụng; 0 = số không; '' (chuỗi trống) chỉ nằm trong cột doc (JSON) — cột kiểu số luôn NULL hoặc số.
--  * Khối lượng (kg, MT, BDMT) lưu SỐ NGUYÊN theo 1/1000 đơn vị (cột *_milli): 21050,5 kg = 21050500. Tiền VND: INTEGER (đồng). Tỷ giá: TEXT thập phân.
--  * Cột doc = bản JSON ĐẦY ĐỦ của bản ghi (nguồn giữ nguyên mọi trường); cột kiểu là phần chiếu để ràng buộc / truy vấn và được kiểm tra khớp doc khi ghi.
--  * rev = phiên bản bản ghi, do máy chủ tăng khi ghi (khóa lạc quan). deleted_at = ngừng dùng (không xóa cứng bản ghi nghiệp vụ).
--  * Khóa ngoại BẮT BUỘC cho quan hệ cha–con cấu trúc; quan hệ tới danh mục khách hàng và hồ sơ Lưu trữ → chi tiết hợp đồng là tham chiếu mềm (kiểm bằng rà soát toàn vẹn).
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;

CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  val TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  name TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  no TEXT,
  type TEXT,
  exporter_id TEXT,
  principal_id TEXT,
  buyer_id TEXT,
  qty_milli INTEGER,
  closed_at TEXT,
  reopened_at TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX contracts_no ON contracts(no);

CREATE TABLE contract_details (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  ship TEXT,
  qty_milli INTEGER,
  bdmt_milli INTEGER,
  cert_no TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX contract_details_contract ON contract_details(contract_id);

CREATE TABLE contract_addenda (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  no TEXT,
  date TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX contract_addenda_contract ON contract_addenda(contract_id);

CREATE TABLE customs_decls (
  id TEXT PRIMARY KEY,
  no TEXT NOT NULL,
  contract_id TEXT REFERENCES contracts(id),
  detail_id TEXT REFERENCES contract_details(id),
  status TEXT,
  round INTEGER,
  tax_vnd INTEGER,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX customs_decls_contract ON customs_decls(contract_id);
CREATE INDEX customs_decls_detail ON customs_decls(detail_id);
-- Số tờ khai: CHỈ MỤC thường (không duy nhất). Dữ liệu cũ có thể có số trùng (HAK.Integrity báo 'dup-decl-no'); ràng buộc cứng ở đây sẽ chặn MỌI lần lưu Danh mục sau di trú.
-- Việc không cho nhập trùng do ứng dụng đảm nhiệm; việc phát hiện trùng do HAK.Integrity.
CREATE INDEX customs_decls_no ON customs_decls(no);

CREATE TABLE customs_supplements (
  id TEXT PRIMARY KEY,
  decl_id TEXT NOT NULL REFERENCES customs_decls(id),
  no TEXT,
  tax_vnd INTEGER,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX customs_supplements_decl ON customs_supplements(decl_id);

CREATE TABLE customs_payments (
  id TEXT PRIMARY KEY,
  decl_id TEXT NOT NULL REFERENCES customs_decls(id),
  receipt_no TEXT,
  kind TEXT,
  amount_vnd INTEGER,
  date TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX customs_payments_decl ON customs_payments(decl_id);

-- Lưu trữ hồ sơ cân (thay hak-archive). id = mã nội dung (cyrb53) như hiện nay.
CREATE TABLE archive_records (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  type TEXT,
  title TEXT,
  ship TEXT,
  from_ts INTEGER,
  to_ts INTEGER,
  detail_id TEXT,
  trips INTEGER,
  kg_milli INTEGER,
  ret_trips INTEGER,
  ret_kg_milli INTEGER,
  sv INTEGER,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER,
  deleted_at TEXT,
  meta TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX archive_records_company ON archive_records(company_id, type);
CREATE INDEX archive_records_detail ON archive_records(detail_id);
CREATE INDEX archive_records_from ON archive_records(from_ts);

CREATE TABLE archive_data (
  record_id TEXT PRIMARY KEY REFERENCES archive_records(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,   -- nguyên chuỗi "gz:<base64>" như IndexedDB (đọc lại giải nén như cũ)
  sha256 TEXT,
  size INTEGER
) WITHOUT ROWID;

-- Chỉ mục phiếu: DẪN XUẤT từ archive_data (dựng khi lưu hồ sơ); xóa / dựng lại an toàn.
CREATE TABLE archive_tickets (
  record_id TEXT NOT NULL REFERENCES archive_records(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  ticket_no TEXT,
  plate TEXT,
  weigh_ts INTEGER,
  net_milli INTEGER,
  returned INTEGER NOT NULL DEFAULT 0,
  carrier TEXT,
  uid TEXT,
  PRIMARY KEY (record_id, idx)
) WITHOUT ROWID;
CREATE INDEX archive_tickets_ts ON archive_tickets(weigh_ts);
CREATE INDEX archive_tickets_no ON archive_tickets(ticket_no);

CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  type TEXT,
  filename TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER,
  doc TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE batch_files (
  batch_id TEXT PRIMARY KEY REFERENCES batches(id) ON DELETE CASCADE,
  bytes BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE issued (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  kind TEXT,
  no TEXT,
  period TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX issued_scope ON issued(company_id, kind, period);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  mime TEXT,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  bytes BLOB,                -- NULL khi tệp nằm ngoài DB (path)
  path TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  doc TEXT
) WITHOUT ROWID;

CREATE TABLE bkls_templates (
  id TEXT PRIMARY KEY,
  version TEXT,
  effective_from TEXT,
  rev INTEGER NOT NULL DEFAULT 1,
  doc TEXT NOT NULL
) WITHOUT ROWID;

-- Nhật ký thao tác (chỉ thêm, không sửa / xóa).
CREATE TABLE audit_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT,
  company_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  field TEXT,
  before TEXT,
  after TEXT,
  reason TEXT
);
CREATE INDEX audit_entity ON audit_log(entity, entity_id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log chỉ được thêm'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log chỉ được thêm'); END;

-- Phiên bản hồ sơ đã lưu / đã xuất (mở và in lại đúng bản đã lưu).
CREATE TABLE record_versions (
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  saved_at INTEGER NOT NULL,
  actor TEXT,
  reason TEXT,
  state TEXT,
  template_id TEXT,
  doc TEXT NOT NULL,
  PRIMARY KEY (record_id, version)
) WITHOUT ROWID;

-- Bản ghi không nhập được khi di trú (mồ côi, vi phạm khóa ngoại…): giữ nguyên để người dùng đối chiếu.
CREATE TABLE quarantine (
  id TEXT PRIMARY KEY,       -- nguồn|bảng|mã bản ghi|trường: ghi lại được nhiều lần (idempotent)
  source TEXT NOT NULL,      -- 'catalog' (phần chiếu) | 'migration' (di trú)
  record_id TEXT,
  reason TEXT NOT NULL,
  doc TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX quarantine_source ON quarantine(source);
