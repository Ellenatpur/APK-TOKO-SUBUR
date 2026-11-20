cd /d "%~dp0"
@echo off
title [Server] Aplikasi Operasi Toko
color 0B
cls
echo ===================================================================
echo               APLIKASI OPERASI TOKO DAN KASIR
echo ===================================================================
echo.
echo  Sedang menyalakan aplikasi toko...
echo  Jendela aplikasi visual akan terbuka otomatis!
echo.
echo  -----------------------------------------------------------------
echo  INFO PENTING:
echo  Jendela hitam ini adalah MESIN SERVER di balik layar.
echo  Jangan ditutup (silakan di-minimize/perkecil) selama toko buka.
echo  Jika jendela aplikasi tidak terbuka, buka browser Anda ke:
echo  http://localhost:3000
echo  -----------------------------------------------------------------
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [PERHATIAN] Node.js belum terpasang di komputer ini!
    echo Silakan download dan install Node.js (gratis) di:
    echo https://nodejs.org (Pilih yang bertuliskan "LTS")
    echo Setelah di-install, buka kembali file ini.
    echo.
    pause
    exit /b
)

node server.js
pause
