@echo off
title Musubi Tuner (LTX-2) - Training Manager
cd /d "%~dp0"

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Starting LTX-2 webui...
echo http://localhost:7860
echo.

python -m ltx_ic_lora_trainer.webui --host 127.0.0.1 --port 7860

pause
