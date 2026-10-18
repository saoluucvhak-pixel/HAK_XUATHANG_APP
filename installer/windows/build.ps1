$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
Push-Location $PSScriptRoot
try {
 & $compiler /nologo /target:winexe /platform:x64 /optimize+ /out:HAK_QuanLyXuatHang_Setup.exe /resource:payload.zip,HAK.Payload /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:Microsoft.CSharp.dll HAKSetup.cs
 if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
} finally { Pop-Location }
