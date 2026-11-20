@echo off
chcp 65001 >nul
title AuraCraft Discord Botu
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js kurulu degil. https://nodejs.org adresinden LTS surumunu kur, sonra bu dosyayi tekrar ac.
  pause
  exit /b
)
if not exist .env (
  copy .env.example .env >nul
  echo [BILGI] .env dosyasi olusturuldu. Simdi Not Defteri acilacak: DISCORD_TOKEN ve GUILD_ID satirlarini doldurup kaydet, sonra bu dosyayi tekrar ac.
  notepad .env
  pause
  exit /b
)
if not exist node_modules (
  echo Paketler kuruluyor, bu birkac dakika surebilir...
  call npm install
)
:A
node src/index.js
echo.
echo Bot kapandi. 5 saniye sonra yeniden baslatilacak. Kapatmak icin bu pencereyi kapat.
timeout /t 5 >nul
goto A
