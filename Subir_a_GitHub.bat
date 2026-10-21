@echo off
chcp 65001 >nul
title Subir microrrutas a GitHub
cd /d "%~dp0"

echo === Cambios pendientes ===
git status --short
echo.
set "MSG="
set /p MSG=Describa el cambio (Enter = "Actualizacion"): 
if "%MSG%"=="" set "MSG=Actualizacion"

git add -A
git diff --cached --quiet || git commit -m "%MSG%"

echo.
echo === Trayendo cambios de GitHub ===
git pull --rebase --autostash origin main
if errorlevel 1 goto error

echo.
echo === Subiendo a GitHub ===
git push origin main
if errorlevel 1 goto error

echo.
echo Listo: codigo subido a github.com/diegozvanegas-sudo/microrutas
pause
exit /b 0

:error
echo.
echo *** Hubo un problema. Copie el mensaje de arriba y pidale ayuda a Claude. ***
pause
exit /b 1
