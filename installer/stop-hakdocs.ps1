<#
 Dừng HAKDocs.exe CỦA THƯ MỤC CÀI NÀY (bộ cài và gỡ cài đặt dùng chung).
 Trước đây bộ cài dừng theo TÊN tiến trình (taskkill /IM HAKDocs.exe) nên dừng luôn HAKDocs của bản cài / bản portable khác trên cùng máy.
 Nay chỉ dừng tiến trình có đường dẫn nằm trong <InstallDir>\native\ ; không dừng gì nếu không xác định được đường dẫn.
 Dùng: powershell -NoProfile -ExecutionPolicy Bypass -File stop-hakdocs.ps1 -InstallDir "C:\...\QuanLyXuatHang"
#>
param([Parameter(Mandatory = $true)][string]$InstallDir)
$ErrorActionPreference = 'SilentlyContinue'
$native = [System.IO.Path]::GetFullPath((Join-Path $InstallDir 'native')).TrimEnd('\') + '\'
$stopped = 0
foreach ($p in @(Get-Process -Name 'HAKDocs')) {
  $path = $p.Path
  if ($path -and $path.StartsWith($native, [System.StringComparison]::OrdinalIgnoreCase)) {
    Stop-Process -Id $p.Id -Force
    $stopped++
  }
}
Write-Output "HAKDocs da dung: $stopped (thu muc $native)"
exit 0
