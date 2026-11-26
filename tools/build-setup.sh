#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Kịch bản đóng gói bộ cài đặt Windows (NSIS) trực tiếp trên máy
# Giống hệt luồng thực thi của GitHub Actions (build-setup.yml)
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Kiểm tra công cụ makensis
if ! command -v makensis &> /dev/null; then
  echo "Chưa cài đặt makensis. Đang cài qua apt-get..."
  sudo apt-get update && sudo apt-get install -y nsis
fi

# Đọc số phiên bản chuẩn
VERSION=$(grep -oP '!define VERSION "\K[^"]+' installer/setup.nsi)
echo "=========================================================="
echo "BẮT ĐẦU ĐÓNG GÓI BỘ CÀI ĐẶT WINDOWS: HAK_QuanLyXuatHang"
echo "Phiên bản: v${VERSION}"
echo "=========================================================="

# Chuẩn bị thư mục installer/app
echo "1. Chuẩn bị tài nguyên ứng dụng (installer/app)..."
rm -rf installer/app
cp -r app installer/app

# Reset token bảo vệ
echo "window.HAK_DOCS_TOKEN='';" > installer/app/native/hakdocs-token.js

# Copy icon
cp installer/icon/app.ico installer/app/app.ico

# Loại bỏ các file công cụ cứu hộ nội bộ không gửi người dùng
rm -f installer/app/MoKhoa_1Lan*.html installer/app/XoaSach_DuLieu*.html installer/app/.hakquality.json

# Đóng gói bằng makensis
echo "2. Biên dịch bộ cài đặt NSIS..."
(
  cd installer
  makensis -DVERSION="${VERSION}" setup.nsi
)

# Di chuyển và đối chiếu file
echo "3. Xuất file cài đặt vào thư mục dist/..."
mkdir -p dist
OUTPUT_FILE="dist/HAK_QuanLyXuatHang_Setup_v${VERSION}.exe"
mv installer/HAK_QuanLyXuatHang_Setup.exe "$OUTPUT_FILE"

# Dọn dẹp thư mục tạm
rm -rf installer/app

# Kiểm tra dung lượng và tính mã băm SHA-256
echo "=========================================================="
echo "ĐÃ ĐÓNG GÓI THÀNH CÔNG BỘ CÀI ĐẶT TRÊN MÁY!"
ls -lh "$OUTPUT_FILE"
echo "Mã băm SHA-256:"
sha256sum "$OUTPUT_FILE"
echo "=========================================================="
