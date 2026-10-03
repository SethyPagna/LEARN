@echo off
rem Exit code 0 when something listens on TCP port %1, 1 when the port is free.
rem PowerShell rather than netstat, whose "LISTENING" is translated on
rem non-English Windows.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
