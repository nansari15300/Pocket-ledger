# Stop process on port 3000 (Next.js dev) when Ctrl+C doesn't work. Run in a new terminal.
$port = 3000
$conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Stop-Process -Id $conn.OwningProcess -Force
  Write-Host "Stopped process on port $port (dev server)."
} else {
  Write-Host "No process found on port $port."
}
