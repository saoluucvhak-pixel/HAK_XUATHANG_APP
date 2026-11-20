; ===========================================================================
;  HAK - Bo cai dat "QUAN LY XUAT HANG" (offline HTML/JS app)
;  Tao boi Claude cho Le Thanh Phu Thuy - HAK Group
; ===========================================================================
Unicode true

!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "HAK - Quan ly xuat hang"
!ifndef VERSION
  !define VERSION "2.25.4"
!endif
OutFile "HAK_QuanLyXuatHang_Setup.exe"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "HAK - Quan ly xuat hang"
VIAddVersionKey "CompanyName" "HAK Group"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "HAK Quan ly xuat hang Setup"

; Cai theo tung nguoi dung (khong can quyen Admin), duong dan CO DINH de
; du lieu da luu trong trinh duyet (localStorage gan voi duong dan file)
; khong bi mat moi khi cai lai / cap nhat phien ban moi.
InstallDir "$LOCALAPPDATA\HAK\QuanLyXuatHang"
InstallDirRegKey HKCU "Software\HAK\QuanLyXuatHang" "InstallDir"
RequestExecutionLevel user
Var StageDir
Var PreviousDir
Var StageOwned
Var OldMoved
Var NewInstalled

;--------------------------------
; Giao dien

!define MUI_ABORTWARNING
!define MUI_ICON "app\app.ico"
!define MUI_UNICON "app\app.ico"

!define MUI_WELCOMEPAGE_TITLE "Cai dat / Cap nhat: HAK - Quan ly xuat hang"
!define MUI_WELCOMEPAGE_TEXT "Chuong trinh nay se cai dat (hoac cap nhat) ung dung QUAN LY XUAT HANG cua HAK Group len may tinh nay.$\r$\n$\r$\nUng dung chay hoan toan OFFLINE bang trinh duyet (khong can Internet, khong gui du lieu ra ngoai).$\r$\n$\r$\nLuu y: giu nguyen duong dan cai dat mac dinh de KHONG bi mat du lieu (cac dot da nhap, nhat ky chung tu...) da luu tu ban truoc."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\native\HAKDocs.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Mo ung dung ngay bay gio"
!define MUI_FINISHPAGE_LINK "Xem huong dan su dung (HUONG_DAN.md)"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR\HUONG_DAN.md"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  SetErrorLevel 1
FunctionEnd

Function un.onInit
  SetErrorLevel 1
FunctionEnd

;--------------------------------
; Cai dat

; HAKDocs.exe chay ngam (--serve) sau khi dung app nen khoa file khi cap nhat -> dung truoc khi ghi de / go cai.
; CHI dung HAKDocs cua thu muc cai nay (stop-hakdocs.ps1 loc theo duong dan $INSTDIR\native\), KHONG dung theo ten tien trinh de khong anh huong ban cai / ban portable khac.
!macro StopHakDocs SCRIPT
  nsExec::Exec 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${SCRIPT}" -InstallDir "$INSTDIR"'
  Pop $0
  Sleep 1200
!macroend

Section "Ung dung Quan ly xuat hang" SecApp
  SectionIn RO
  ; A silent extraction failure must not look like a successful update.
  SetErrorLevel 1
  StrCpy $StageOwned 0
  StrCpy $OldMoved 0
  StrCpy $NewInstalled 0
  InitPluginsDir
  File "/oname=$PLUGINSDIR\stop-hakdocs.ps1" "stop-hakdocs.ps1"
  !insertmacro StopHakDocs "$PLUGINSDIR\stop-hakdocs.ps1"
  System::Call 'kernel32::GetCurrentProcessId() i .r9'
  StrCpy $StageDir "$INSTDIR.hak-stage-$9"
  StrCpy $PreviousDir "$INSTDIR.previous-v${VERSION}-$9"
  IfFileExists "$StageDir" install_failed
  IfFileExists "$PreviousDir" install_failed
  ClearErrors
  CreateDirectory "$StageDir"
  IfErrors install_failed
  StrCpy $StageOwned 1
  SetOutPath "$StageDir"
  ; ban sao de go cai dat dung (Uninstall khong co $PLUGINSDIR cua bo cai)
  File "/oname=$StageDir\stop-hakdocs.ps1" "stop-hakdocs.ps1"
  ; Recovery/reset utilities must never ship to end users.
  File /r /x "MoKhoa_1Lan*.html" /x "XoaSach_DuLieu*.html" /x ".hakquality.json" "app\*.*"
  IfErrors install_failed
  WriteUninstaller "$StageDir\Uninstall.exe"
  IfErrors install_failed
  FileOpen $0 "$StageDir\.hak-installation" w
  IfErrors install_failed
  FileWrite $0 "HAK-QuanLyXuatHang-v1"
  FileClose $0
  IfErrors install_failed
  IfFileExists "$StageDir\index.html" 0 install_failed
  IfFileExists "$StageDir\native\HAKDocs.exe" 0 install_failed
  IfFileExists "$StageDir\Uninstall.exe" 0 install_failed

  ; Extract the whole payload first. Never overwrite a live installation file by file.
  ; Keep the complete previous directory (including any user-added files) for recovery.
  SetOutPath "$TEMP"
  IfFileExists "$INSTDIR" 0 install_new
  IfFileExists "$INSTDIR\.hak-installation" check_install_marker
  IfFileExists "$INSTDIR\index.html" 0 install_failed
  IfFileExists "$INSTDIR\native\HAKDocs.exe" 0 install_failed
  Goto preserve_old
check_install_marker:
  ClearErrors
  FileOpen $0 "$INSTDIR\.hak-installation" r
  IfErrors install_failed
  FileRead $0 $1
  FileClose $0
  StrCmp $1 "HAK-QuanLyXuatHang-v1" 0 install_failed
preserve_old:
  ClearErrors
  Rename "$INSTDIR" "$PreviousDir"
  IfErrors install_failed
  StrCpy $OldMoved 1
install_new:
  ClearErrors
  Rename "$StageDir" "$INSTDIR"
  IfErrors install_failed
  StrCpy $StageOwned 0
  StrCpy $NewInstalled 1
  ClearErrors

  WriteRegStr HKCU "Software\HAK\QuanLyXuatHang" "InstallDir" "$INSTDIR"

  ; Shortcut ngoai Desktop va trong Start Menu - gan icon rieng (app.ico), khong dung icon trang mac dinh
  CreateDirectory "$SMPROGRAMS\HAK"
  CreateShortcut "$SMPROGRAMS\HAK\Quan ly xuat hang.lnk" "$INSTDIR\native\HAKDocs.exe" "" "$INSTDIR\app.ico" 0
  CreateShortcut "$DESKTOP\HAK - Quan ly xuat hang.lnk" "$INSTDIR\native\HAKDocs.exe" "" "$INSTDIR\app.ico" 0

  ; Uninstaller + muc trong "Apps & features"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "DisplayName" "HAK - Quan ly xuat hang"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "Publisher" "HAK Group"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang" "NoRepair" 1
  IfErrors install_failed
  ${If} $OldMoved == 1
    DetailPrint "Previous installation preserved: $PreviousDir"
  ${EndIf}
  SetErrorLevel 0
  Goto install_done
install_failed:
  Call CleanupFailedInstall
  SetErrorLevel 1
  DetailPrint "Installation failed. Close HAK and applications using its files, then retry."
  IfSilent +2
  MessageBox MB_OK|MB_ICONSTOP "Cai dat chua hoan tat. Ban cu duoc giu lai neu chua thay the thanh cong. Hay dong ung dung dang dung tep HAK va thu lai."
  Abort
install_done:
SectionEnd

Function CleanupFailedInstall
  SetOutPath "$TEMP"
  ${If} $NewInstalled != 1
  ${AndIf} $OldMoved == 1
    ClearErrors
    Rename "$PreviousDir" "$INSTDIR"
    ${If} ${Errors}
      DetailPrint "Restore previous installation manually from: $PreviousDir"
    ${Else}
      StrCpy $OldMoved 0
    ${EndIf}
  ${EndIf}
  ${If} $StageOwned == 1
    ; Only our newly-created, process-specific staging directory is removed.
    RMDir /r "$StageDir"
  ${EndIf}
FunctionEnd

Function .onInstFailed
  Call CleanupFailedInstall
  SetErrorLevel 1
FunctionEnd

;--------------------------------
; Go cai (KHONG dong du lieu trinh duyet - chi xoa file chuong trinh)

Section "Uninstall"
  SetErrorLevel 1
  !insertmacro StopHakDocs "$INSTDIR\stop-hakdocs.ps1"

  RMDir /r "$INSTDIR\css"
  RMDir /r "$INSTDIR\js"
  RMDir /r "$INSTDIR\libs"
  RMDir /r "$INSTDIR\templates"
  RMDir /r "$INSTDIR\workers"
  RMDir /r "$INSTDIR\native"
  Delete "$INSTDIR\index.html"
  Delete "$INSTDIR\HUONG_DAN.md"
  Delete "$INSTDIR\app.ico"
  IfFileExists "$INSTDIR\css\*.*" uninstall_failed
  IfFileExists "$INSTDIR\js\*.*" uninstall_failed
  IfFileExists "$INSTDIR\libs\*.*" uninstall_failed
  IfFileExists "$INSTDIR\templates\*.*" uninstall_failed
  IfFileExists "$INSTDIR\workers\*.*" uninstall_failed
  IfFileExists "$INSTDIR\native\*.*" uninstall_failed
  IfFileExists "$INSTDIR\index.html" uninstall_failed
  IfFileExists "$INSTDIR\HUONG_DAN.md" uninstall_failed
  IfFileExists "$INSTDIR\app.ico" uninstall_failed
  Delete "$INSTDIR\stop-hakdocs.ps1"
  Delete "$SMPROGRAMS\HAK\Quan ly xuat hang.lnk"
  RMDir "$SMPROGRAMS\HAK"
  Delete "$DESKTOP\HAK - Quan ly xuat hang.lnk"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang"
  DeleteRegKey HKCU "Software\HAK\QuanLyXuatHang"
  Delete "$INSTDIR\Uninstall.exe"
  ; The tiny ownership marker is intentionally retained for safe reinstall,
  ; together with any user-added files. Never recursively remove this directory.
  RMDir "$INSTDIR"
  SetErrorLevel 0
  ; CHINH SACH DU LIEU: co so du lieu SQLite nam NGOAI thu muc cai ($LOCALAPPDATA\HAK_XUATHANG\data) nen KHONG bao gio bi xoa khi go / nang cap.
  IfSilent +2
  MessageBox MB_OK|MB_ICONINFORMATION "Da go chuong trinh HAK - Quan ly xuat hang.$\r$\n$\r$\nDu lieu cua ban (SQLite) duoc GIU LAI tai:$\r$\n$LOCALAPPDATA\HAK_XUATHANG\data$\r$\n$\r$\nCai lai chuong trinh se dung lai du lieu nay. Chi xoa thu muc tren khi chac chan khong con can du lieu (hay sao luu truoc)."
  Goto uninstall_done
uninstall_failed:
  SetErrorLevel 1
  DetailPrint "Uninstall incomplete: application files are still in use or not writable. Registration is retained for retry."
  IfSilent +2
  MessageBox MB_OK|MB_ICONSTOP "Chua go het tep chuong trinh. Hay dong app va ung dung dang dung tep HAK, sau do thu lai. Du lieu SQLite van duoc giu nguyen."
  Abort
uninstall_done:
SectionEnd
