$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if (!(Test-Path 'tmp')) {
  New-Item -ItemType Directory -Path 'tmp' | Out-Null
}

$log = Join-Path $repo 'tmp\live_presence_bridge_runner.log'
Add-Content -Path $log -Value ("[{0}] runner_start" -f (Get-Date).ToString('o'))

while ($true) {
  try {
    & node "scripts\live_presence_bridge.js" --once | Out-Null
    Add-Content -Path $log -Value ("[{0}] tick_ok" -f (Get-Date).ToString('o'))
  } catch {
    Add-Content -Path $log -Value ("[{0}] tick_fail {1}" -f (Get-Date).ToString('o'), $_.Exception.Message)
  }
  Start-Sleep -Seconds 2
}
