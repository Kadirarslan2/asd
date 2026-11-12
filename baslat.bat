@echo off
title KampAtes Bot
if not exist node_modules call npm install
:A
node src/index.js
echo Bot kapandi, 5 saniye sonra yeniden baslatiliyor...
timeout /t 5 >nul
goto A
