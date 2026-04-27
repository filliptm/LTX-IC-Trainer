@echo off
setlocal

rem Install script for LTX-IC-Trainer (Windows).
rem
rem Usage:
rem   install.bat                       (cu128 + webui, default)
rem   set CUDA_EXTRA=cu124 ^&^& install.bat
rem   set SKIP_FRONTEND=1 ^&^& install.bat

cd /d "%~dp0"

if "%CUDA_EXTRA%"=="" set CUDA_EXTRA=cu128
if "%SKIP_FRONTEND%"=="" set SKIP_FRONTEND=0

if /I not "%CUDA_EXTRA%"=="cu124" if /I not "%CUDA_EXTRA%"=="cu128" if /I not "%CUDA_EXTRA%"=="cu130" (
    echo error: CUDA_EXTRA must be one of cu124, cu128, cu130 ^(got: %CUDA_EXTRA%^)
    exit /b 1
)

where uv >nul 2>&1
if errorlevel 1 (
    echo error: 'uv' is not installed. Install it from https://github.com/astral-sh/uv and re-run.
    exit /b 1
)

echo ==^> Installing Python deps with uv ^(--extra %CUDA_EXTRA% --extra webui^)
rem Clear VIRTUAL_ENV so uv targets the project's .venv instead of a stale
rem ambient env var from a previously-activated shell.
set "VIRTUAL_ENV="
uv sync --extra %CUDA_EXTRA% --extra webui
if errorlevel 1 exit /b 1

if "%SKIP_FRONTEND%"=="1" (
    echo ==^> SKIP_FRONTEND=1, skipping frontend build
    echo Done.
    exit /b 0
)

where node >nul 2>&1
if errorlevel 1 (
    echo error: 'node' is not installed ^(need Node 20+ for the webui frontend^).
    echo        Install Node, then re-run, or set SKIP_FRONTEND=1 to skip.
    exit /b 1
)

where corepack >nul 2>&1
if errorlevel 1 (
    echo error: 'corepack' is not available. It ships with Node 16.10+; please update Node.
    exit /b 1
)

echo ==^> Building webui frontend
rem Use `corepack pnpm` directly: avoids `corepack enable` which writes shims
rem into the global Node install dir and fails on Windows without admin.
rem The pnpm version is pinned via the "packageManager" field in frontend\package.json.
pushd src\ltx_ic_lora_trainer\webui\frontend
call corepack pnpm install
if errorlevel 1 ( popd & exit /b 1 )
call corepack pnpm build
if errorlevel 1 ( popd & exit /b 1 )
popd

echo.
echo Done. Launch the webui with: run.bat
endlocal
