@echo off
rem Stop the photo sync server (node.exe running server.js) - windowless safe
powershell -NoProfile -Command "$ps = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' }; if ($ps) { $ps | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped PID ' + $_.ProcessId) } } else { Write-Host 'Server is not running.' }"
