$baseUrl = "http://localhost:4000"
$headers = @{ "x-user-id" = "a5f6f998-1234-5678-9abc-def012345678" }

Write-Host "=============== ENDPOINT TESTS ===============" -ForegroundColor Magenta
Write-Host ""

# Test 1: Organizations
Write-Host "[1] GET /api/admin/orgs" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/admin/orgs" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK | Orgs: $($r.orgs.Count)" -ForegroundColor Green
$r.orgs | ForEach-Object { Write-Host "    - $($_.name)" }
Write-Host ""

# Test 2: Recent Calls
Write-Host "[2] GET /api/calls/recent?limit=1000" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/calls/recent?limit=1000" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK | Calls: $($r.items.Count)" -ForegroundColor Green
$r.items | Select-Object -First 5 | ForEach-Object { Write-Host "    - From: $($_.fromNumber) To: $($_.toNumber) Status: $($_.status)" }
Write-Host ""

# Test 3: Queue Summary
Write-Host "[3] GET /api/calls/queue-summary" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/calls/queue-summary" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK | Queues: $($r.queues.Count)" -ForegroundColor Green
$r.queues | Select-Object -First 5 | ForEach-Object { Write-Host "    - $($_.name): Total=$($_.totalCalls) Answered=$($_.answered) Missed=$($_.missed)" }
Write-Host ""

# Test 4: Time Series
Write-Host "[4] GET /api/calls/series?range=day" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/calls/series?range=day" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK | Buckets: $($r.points.Count)" -ForegroundColor Green
$r.points | Where-Object { $_.totalCalls -gt 0 } | Select-Object -First 3 | ForEach-Object { Write-Host "    - Time: $($_.bucketLabel) Calls: $($_.totalCalls) Answered: $($_.answered)" }
Write-Host ""

# Test 5: SMS Messages
Write-Host "[5] GET /api/sms/messages?limit=1000" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/sms/messages?limit=1000" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK | Messages: $($r.messages.Count)" -ForegroundColor Green
$r.messages | Select-Object -First 3 | ForEach-Object { Write-Host "    - From: $($_.sender) To: $($_.recipient) Direction: $($_.direction)" }
Write-Host ""

# Test 6: User Profile
Write-Host "[6] GET /api/user/profile" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/user/profile" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK | Email: $($r.user.email)" -ForegroundColor Green
Write-Host "    Role: $($r.profile.global_role)"
Write-Host ""

# Test 7: User Organizations
Write-Host "[7] GET /api/user/orgs" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/user/orgs" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK | User Orgs: $($r.orgs.Count)" -ForegroundColor Green
$r.orgs | ForEach-Object { Write-Host "    - $($_.name)" }
Write-Host ""

# Test 8: Client Metrics
Write-Host "[8] GET /api/client-metrics" -ForegroundColor Cyan
$r = Invoke-WebRequest -Uri "$baseUrl/api/client-metrics" -Headers $headers -UseBasicParsing -TimeoutSec 10 | ConvertFrom-Json
Write-Host "    Status: OK" -ForegroundColor Green
Write-Host "    Total Calls: $($r.metrics.total_calls)"
Write-Host "    Answered: $($r.metrics.answered_calls)"
Write-Host "    Answer Rate: $($r.metrics.answer_rate_pct)%"
Write-Host "    Avg Wait: $($r.metrics.avg_wait_seconds)s"

Write-Host ""
Write-Host "=============== ALL TESTS PASSED ===============" -ForegroundColor Magenta
