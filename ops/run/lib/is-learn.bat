@echo off
rem Exit code 0 when the app answering on the given port is LEARN (its page
rem title says so), 1 when it is another app. Waits up to a minute: a LEARN
rem that is still starting compiles its first page before it answers.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 ('http://localhost:' + '%~1' + '/'); if ($r.Content -cmatch '<title>[^<]*LEARN') { exit 0 } } catch { }; exit 1"
