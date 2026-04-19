# LAN se http://<PC-IP>:3000 — localhost kaam kare, IP nahi: aksar Windows Firewall inbound 3000 block karti hai.
# Administrator PowerShell se ek baar chalao:  npm run allow-dev-port
# Ya: Win+X → Terminal (Admin) → cd project → .\scripts\allow-next-dev-port-windows.ps1

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "ERROR: Administrator PowerShell se chalao (Right-click Terminal / PowerShell → Run as administrator)." -ForegroundColor Red
  exit 1
}

$ruleName = "Pocket Ledger — Next.js dev TCP 3000 (LAN)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Rule already exists: $ruleName" -ForegroundColor Green
  exit 0
}

# Private + Public: Wi‑Fi kabhi-kabhi "Public network" dikha kar block karti hai
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private, Public, Domain | Out-Null
Write-Host "Done: inbound TCP 3000 allowed. Run npm run dev, then open http://<this-PC-LAN-IP>:3000 on phone/other PC." -ForegroundColor Green
