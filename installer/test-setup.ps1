param(
  [Parameter(Mandatory=$true)][string]$SetupPath,
  [string]$ExpectedVersion='2.22.2',
  [switch]$AllowExistingInstall
)
$ErrorActionPreference='Stop'
$setup=(Resolve-Path -LiteralPath $SetupPath).Path
$base=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$root=Join-Path $base ('hak-install-test-'+[guid]::NewGuid().ToString('N'))
$install=Join-Path $root 'app'
$keys=@('HKCU\Software\HAK\QuanLyXuatHang','HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang')
$hadKeys=@($keys|ForEach-Object {Test-Path ($_.Replace('HKCU\','HKCU:\'))})
if(($hadKeys -contains $true) -and !$AllowExistingInstall){throw 'An existing HAK installation is registered. Use a disposable Windows user or explicitly allow a backed-up test.'}
$links=@(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'HAK - Quan ly xuat hang.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'HAK\Quan ly xuat hang.lnk')
)
$hadLinks=@($links|ForEach-Object {Test-Path -LiteralPath $_})
New-Item -ItemType Directory -Path $root | Out-Null
for($i=0;$i -lt $keys.Count;$i++){
  if($hadKeys[$i]){& reg.exe export $keys[$i] (Join-Path $root "$i.reg") /y | Out-Null; if($LASTEXITCODE -ne 0){throw 'Cannot back up existing registry'}}
  if($hadLinks[$i]){Copy-Item -LiteralPath $links[$i] -Destination (Join-Path $root "$i.lnk")}
}
function Run-Setup {
  $p=Start-Process -FilePath $setup -ArgumentList "/S /D=$install" -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
  if($p.ExitCode -ne 0){throw "Setup failed with exit $($p.ExitCode)"}
}
function Verify-Install {
  $text=Get-Content (Join-Path $install 'js\version.js') -Raw
  if(!$text.Contains("HAK.VERSION = '$ExpectedVersion'")){throw 'Installed application version mismatch'}
  if((Get-Item (Join-Path $install 'native\HAKDocs.exe')).Length -lt 80000){throw 'Obsolete native helper'}
  $reg=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang'
  if($reg.DisplayVersion -ne $ExpectedVersion -or $reg.InstallLocation -ne $install){throw 'Uninstall metadata mismatch'}
  if($reg.UninstallString -ne ('"'+(Join-Path $install 'Uninstall.exe')+'"')){throw 'Uninstall command must quote the path'}
  $shell=New-Object -ComObject WScript.Shell
  foreach($link in $links){
    if(!(Test-Path -LiteralPath $link)){throw "Missing shortcut $link"}
    if($shell.CreateShortcut($link).TargetPath -ne (Join-Path $install 'native\HAKDocs.exe')){throw 'Shortcut target mismatch'}
  }
  if(Get-ChildItem -LiteralPath $install -File | Where-Object Name -Match '^(MoKhoa_1Lan|XoaSach_DuLieu)|^\.hakquality\.json$'){throw 'Development/reset utility shipped'}
}
try {
  $data=Join-Path $root 'SQLite data outside app'
  New-Item -ItemType Directory -Path $data | Out-Null
  $sentinel=Join-Path $data 'hak.db'
  [IO.File]::WriteAllBytes($sentinel,[byte[]](0,1,2,127,128,255))
  $hash=(Get-FileHash -LiteralPath $sentinel).Hash
  Run-Setup
  Verify-Install
  'PASS fresh install, shortcuts, version and uninstall metadata'
  [IO.File]::WriteAllText((Join-Path $install 'user-note.txt'),'preserve user-added files')
  Run-Setup
  Verify-Install
  $previous=@(Get-ChildItem -LiteralPath $root -Directory -Filter "app.previous-v$ExpectedVersion-*")
  if($previous.Count -ne 1){throw 'Expected exactly one preserved previous installation'}
  if((Get-Content (Join-Path $previous[0].FullName 'user-note.txt') -Raw) -ne 'preserve user-added files'){throw 'Previous user file was lost'}
  'PASS upgrade swaps complete application and preserves previous user files'
  $occupied=Join-Path $root 'not a HAK installation'
  New-Item -ItemType Directory -Path $occupied | Out-Null
  $foreignFile=Join-Path $occupied 'user-file.txt'
  [IO.File]::WriteAllText($foreignFile,'keep this file')
  $failed=Start-Process -FilePath $setup -ArgumentList "/S /D=$occupied" -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
  if($failed.ExitCode -eq 0){throw 'Failed install reported success'}
  if((Get-Content -LiteralPath $foreignFile -Raw) -ne 'keep this file'){throw 'Failed install changed destination file'}
  Verify-Install
  'PASS failed install returns nonzero, retains destination and registered application'
  $un=Start-Process -FilePath (Join-Path $install 'Uninstall.exe') -ArgumentList "/S _?=$install" -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
  if($un.ExitCode -ne 0){throw "Uninstall failed with exit $($un.ExitCode)"}
  if((Test-Path (Join-Path $install 'index.html')) -or (Test-Path (Join-Path $install 'native\HAKDocs.exe'))){throw 'Application payload remains'}
  if(Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\HAK_QuanLyXuatHang'){throw 'Uninstall registration remains'}
  if((Get-FileHash -LiteralPath $sentinel).Hash -ne $hash){throw 'Uninstall changed data outside installation'}
  if(!(Test-Path (Join-Path $previous[0].FullName 'user-note.txt'))){throw 'Uninstall removed previous user files'}
  Run-Setup
  Verify-Install
  if((Get-FileHash -LiteralPath $sentinel).Hash -ne $hash){throw 'Reinstall changed external data'}
  'PASS uninstall/reinstall preserves data outside the application'
} finally {
  for($i=0;$i -lt $keys.Count;$i++){
    if($hadKeys[$i]){& reg.exe import (Join-Path $root "$i.reg") | Out-Null}
    else{Remove-Item -LiteralPath ($keys[$i].Replace('HKCU\','HKCU:\')) -Recurse -Force -ErrorAction SilentlyContinue}
    if($hadLinks[$i]){Copy-Item -LiteralPath (Join-Path $root "$i.lnk") -Destination $links[$i] -Force}
    else{Remove-Item -LiteralPath $links[$i] -Force -ErrorAction SilentlyContinue}
  }
  $resolved=[IO.Path]::GetFullPath($root)
  if(!$resolved.StartsWith($base.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'hak-install-test-*'){throw 'Unsafe test cleanup path'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
