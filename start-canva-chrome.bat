@echo off
setlocal
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo [ERROR] لم أجد Google Chrome في المسارات المعتادة.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-RestMethod 'http://127.0.0.1:9222/json/version' -TimeoutSec 2 ^| Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
  echo Chrome الخاص بموظف Canva يعمل بالفعل.
  start "" "https://www.canva.com/ai/"
  exit /b 0
)

if not exist "C:\Kotybook-Chrome-Control" mkdir "C:\Kotybook-Chrome-Control"
echo تشغيل Chrome في ملف مستخدم منفصل خاص بكوتي بوك...
start "Kotybook Canva Chrome" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="C:\Kotybook-Chrome-Control" --profile-directory=Default "https://www.canva.com/ai/"
echo.
echo أول مرة فقط: سجّل الدخول إلى Canva يدويًا داخل هذه النافذة واتركها مفتوحة.
echo لا تستخدم نافذة Chrome الشخصية لهذا الموظف.
endlocal
