@echo off
REM Windows kurulumu
cd /d "%~dp0"
where python >nul 2>nul || (echo Python bulunamadi. Kurmak icin:  winget install Python.Python.3.12 & exit /b 1)
where ffmpeg >nul 2>nul || (echo FFmpeg bulunamadi. Kurmak icin:  winget install Gyan.FFmpeg  ^(sonra terminali yeniden acin^))
python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -e ".[llm,dev]"
if not exist .env copy .env.example .env
studio doctor
