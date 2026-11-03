@echo off
setlocal enabledelayedexpansion
title Photo Sync Server
cd /d "%~dp0"
set "NODE_EXE="

rem ---- 1) look in system PATH ----
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

rem ---- 2) WorkBuddy bundled node (newest version folder) ----
if not defined NODE_EXE (
  if exist "%USERPROFILE%\.workbuddy\binaries\node\versions" (
    for /f "delims=" %%D in ('dir /b /ad /o-n "%USERPROFILE%\.workbuddy\binaries\node\versions" 2^>nul') do (
      if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\%%D\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\%%D\node.exe"
    )
  )
)

rem ---- 3) common install locations ----
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE (
  echo.
  echo   [X] 没有找到 Node.js，无法启动同步服务。
  echo.
  echo       解决办法：
  echo       1. 安装 Node.js 后重新双击本文件： https://nodejs.org
  echo       2. 或联系我，换用免安装的方式。
  echo.
  pause
  exit /b 1
)

echo.
echo   使用 Node: %NODE_EXE%
echo   正在启动照片同步服务，本窗口请勿关闭...
echo.
chcp 65001 >nul
rem ---- 可选：AI 复核功能（免费视觉大模型，不需要可跳过） ----
rem 到 https://open.bigmodel.cn 免费注册并创建 API Key，然后取消下一行注释并填入你的 Key：
rem set VISION_API_KEY=在这里粘贴你的Key


"%NODE_EXE%" "%~dp0server.js"
echo.
echo   Server stopped. Press any key to close.
pause >nul
