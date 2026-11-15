@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\playwright" (
  echo [ERROR] Playwright غير مثبت داخل المشروع.
  echo افتح CMD في مجلد المشروع وشغّل: npm install
  pause
  exit /b 1
)
if not exist "node_modules\pdf-lib" (
  echo [ERROR] pdf-lib غير مثبت داخل المشروع.
  echo افتح CMD في مجلد المشروع وشغّل: npm install
  pause
  exit /b 1
)
node canva-worker\local-worker.js
if errorlevel 1 (
  echo.
  echo انتهى الموظف مع وجود خطأ. راجع مجلد canva-worker\diagnostics
) else (
  echo.
  echo انتهى تشغيل موظف Canva.
)
pause
endlocal
