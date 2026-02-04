@echo off
REM Run diagnostic without using node
PowerShell -Command "
`$headers = @{'x-user-id' = 'test-user'}
`$response = Invoke-WebRequest -Uri 'http://localhost:4000/api/recordings?org_id=test-org' -Headers `$headers -ErrorAction SilentlyContinue
Write-Host 'Status:' `$response.StatusCode
Write-Host 'Response:'
`$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 3 | Select-Object -First 30
" 
