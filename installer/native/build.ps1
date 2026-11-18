$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$framework = Split-Path $compiler
$metadata = Join-Path $env:WINDIR 'System32\WinMetadata'
$output = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\app\native\HAKDocs.exe'))
New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
$references = @('System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll', (Join-Path $framework 'System.Runtime.dll'), (Join-Path $framework 'System.Runtime.WindowsRuntime.dll'))
foreach ($namespace in @('Foundation','Media','Data','Storage','Graphics','Globalization')) { $references += Join-Path $metadata "Windows.$namespace.winmd" }
$compilerArgs = @('/nologo','/target:winexe','/platform:x64','/optimize+',"/out:$output")
foreach ($reference in $references) { $compilerArgs += "/reference:$reference" }
$schemaSql = Join-Path $PSScriptRoot 'db\schema.v1.sql'
$compilerArgs += "/resource:$schemaSql,hak.schema.v1.sql"   # schema SQLite nhúng vào HAKDocs.exe
$compilerArgs += Join-Path $PSScriptRoot 'HAKDocs.cs'
$compilerArgs += Join-Path $PSScriptRoot 'HakDb.cs'
& $compiler $compilerArgs
if ($LASTEXITCODE -ne 0) { throw 'Windows OCR build failed' }
