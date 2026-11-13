@echo off
chcp 65001 >nul
cd /d D:\phong-tuong-tac
set "GIT=C:\Program Files\Git\cmd\git.exe"
"%GIT%" remote get-url origin >nul 2>&1
if errorlevel 1 "%GIT%" remote add origin https://github.com/kiemtn06-lgtm/phong-tuong-tac.git
"%GIT%" add -A
"%GIT%" diff --cached --quiet
if not %errorlevel%==0 (
  for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set NOW=%%i
  "%GIT%" commit -m "Cap nhat %NOW%"
)
"%GIT%" push -u origin main
echo.
echo Xong. Neu bao loi "repository not found": hay tao repository phong-tuong-tac tren github.com truoc.
pause
