@echo off
rem Exit code 0 when a LEARN dev server (ops\scripts\dev\server.ts) runs on
rem this PC, whatever its port; 1 when none does.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'ops[\\/]scripts[\\/]dev[\\/]server\.ts' }) { exit 0 } else { exit 1 }"
