@echo off
rem Hidden launcher: skip if photo sync server already running on port 8788
netstat -ano | findstr ":8788" >nul 2>nul
if not errorlevel 1 exit /b 0
call "%~dp0start-server.cmd"
