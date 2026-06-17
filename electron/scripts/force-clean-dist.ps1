# Force-delete electron/dist — Cursor band karke EXTERNAL PowerShell se chalao (Win+X → Terminal).
# Cursor khula ho to app.asar lock rehta hai (Sysinternals handle se confirm hua).
$ErrorActionPreference = "Stop"
$dist = Join-Path $PSScriptRoot ".." "dist" | Resolve-Path -ErrorAction SilentlyContinue
if (-not $dist) {
  $dist = Join-Path (Split-Path $PSScriptRoot -Parent) "dist"
}
$dist = [System.IO.Path]::GetFullPath($dist)

Write-Host "[force-clean] Target: $dist" -ForegroundColor Cyan

# Pocket Ledger / Electron processes
foreach ($name in @("Pocket Ledger", "electron")) {
  Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "[force-clean] Stopping $($_.ProcessName) (PID $($_.Id))" -ForegroundColor Yellow
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
}

$cursorProcs = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($cursorProcs) {
  Write-Host ""
  Write-Host "WARNING: Cursor is running — it often locks electron\dist\...\app.asar." -ForegroundColor Red
  Write-Host "  1) Save work, close ALL Cursor windows" -ForegroundColor Red
  Write-Host "  2) Run this script again from Windows PowerShell (outside Cursor)" -ForegroundColor Red
  Write-Host "  OR use: npm run electron:build:win:alt  (skips delete, builds to dist-build)" -ForegroundColor Green
  Write-Host ""
}

if (-not (Test-Path -LiteralPath $dist)) {
  Write-Host "[force-clean] dist already gone." -ForegroundColor Green
  exit 0
}

# takeown + icacls + robocopy empty mirror
$empty = Join-Path ([System.IO.Path]::GetTempPath()) "pl-empty-wipe-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Force -Path $empty | Out-Null
try {
  Get-ChildItem -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
    try { takeown /f $_.FullName 2>$null | Out-Null } catch {}
    try { icacls $_.FullName /grant "${env:USERNAME}:(F)" 2>$null | Out-Null } catch {}
  }
  robocopy $empty $dist /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS | Out-Null
  Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue
} finally {
  Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $dist) {
  Write-Host "[force-clean] FAILED — file still locked. Close Cursor + Explorer, then retry." -ForegroundColor Red
  $handle = Join-Path $env:TEMP "handle64.exe"
  if (Test-Path $handle) {
    Write-Host "Lock holders (handle64):" -ForegroundColor Yellow
    & $handle -accepteula "app.asar" 2>$null | Select-String "pid:"
  }
  exit 1
}

Write-Host "[force-clean] Removed electron/dist" -ForegroundColor Green
exit 0
