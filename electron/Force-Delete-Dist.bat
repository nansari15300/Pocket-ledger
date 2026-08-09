@echo off
taskkill /F /IM "Pocket Ledger.exe" >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul
rmdir /s /q "C:\Balgram\Online Project\electron\dist"
rmdir /s /q "C:\Balgram\Online Project\electron\dist-build"
echo done
pause
