@echo off
chcp 65001 >nul
title Microrrutas local
cd /d "%~dp0web"

if not exist node_modules (
    echo === Instalando dependencias ^(solo la primera vez^) ===
    call npm install
    if errorlevel 1 goto error
)
if not exist .env.local (
    echo Falta web\.env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY ^(vea web\.env.example^).
    goto error
)

echo.
echo Abriendo http://localhost:5173/subsanaciones.html
echo Desde el celular ^(misma Wi-Fi^): use la direccion "Network" que aparece abajo.
echo Para detenerlo: Ctrl + C o cierre esta ventana.
echo.
start "" http://localhost:5173/subsanaciones.html
call npm run dev -- --host
exit /b 0

:error
echo.
echo No se pudo iniciar.
pause
exit /b 1
