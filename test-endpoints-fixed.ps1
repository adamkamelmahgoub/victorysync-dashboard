#!/usr/bin/env powershell
# Test all API endpoints - FIXED VERSION

$baseUrl = "http://localhost:4000"
$headers = @{
    "x-user-id" = "a5f6f998-1234-5678-9abc-def012345678"
    "Content-Type" = "application/json"
}

Write-Host "========================================" -ForegroundColor Magenta
Write-Host "VICTORYSYNC DASHBOARD - ENDPOINT TESTS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# Test 1: Get all organizations
Write-Host "1. Testing GET /api/admin/orgs" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/admin/orgs" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: OK" -ForegroundColor Green
    Write-Host "   Organizations found: $($data.orgs.Count)" -ForegroundColor Yellow
    if ($data.orgs.Count -gt 0) {
        Write-Host "   Organization List:" -ForegroundColor DarkCyan
        $data.orgs | ForEach-Object { Write-Host "      $($_.name)" }
    }
} catch {
    Write-Host "   Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Get recent calls
Write-Host "2. Testing GET /api/calls/recent?limit=1000" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/calls/recent?limit=1000" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   📊 Calls found: $($data.items.Count)" -ForegroundColor Yellow
    if ($data.items.Count -gt 0) {
        Write-Host "   📋 Sample Calls (first 3):" -ForegroundColor DarkCyan
        $data.items | Select-Object -First 3 | ForEach-Object { 
            Write-Host "      • From: $($_.fromNumber) → To: $($_.toNumber) | Status: $($_.status) | Time: $($_.startedAt.Substring(0, 19))"
        }
    }
} catch {
    Write-Host "   ❌ Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Get queue summary
Write-Host "3. Testing GET /api/calls/queue-summary" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/calls/queue-summary" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   📊 Queues found: $($data.queues.Count)" -ForegroundColor Yellow
    if ($data.queues.Count -gt 0) {
        Write-Host "   📋 Queue Summary (first 5):" -ForegroundColor DarkCyan
        $data.queues | Select-Object -First 5 | ForEach-Object { 
            Write-Host "      • $($_.name): Total=$($_.totalCalls), Answered=$($_.answered), Missed=$($_.missed)"
        }
    }
} catch {
    Write-Host "   ❌ Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Get time series data
Write-Host "4. Testing GET /api/calls/series?range=day" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/calls/series?range=day" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   📊 Time buckets found: $($data.points.Count)" -ForegroundColor Yellow
    if ($data.points.Count -gt 0) {
        Write-Host "   📋 Call Distribution (sample):" -ForegroundColor DarkCyan
        $data.points | Where-Object { $_.totalCalls -gt 0 } | Select-Object -First 5 | ForEach-Object {
            Write-Host "      • $($_.bucketLabel.Substring(11, 5)): $($_.totalCalls) calls (answered: $($_.answered))"
        }
    }
} catch {
    Write-Host "   ❌ Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Get SMS messages
Write-Host "5. Testing GET /api/sms/messages?limit=1000" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/sms/messages?limit=1000" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   📊 SMS messages found: $($data.messages.Count)" -ForegroundColor Yellow
    if ($data.messages.Count -gt 0) {
        Write-Host "   📋 Sample SMS Messages (first 3):" -ForegroundColor DarkCyan
        $data.messages | Select-Object -First 3 | ForEach-Object {
            Write-Host "      • From: $($_.sender) → To: $($_.recipient) | Direction: $($_.direction) | Time: $($_.created_at.Substring(0, 19))"
        }
    }
} catch {
    Write-Host "   ❌ Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Get user profile
Write-Host "6. Testing GET /api/user/profile" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/user/profile" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   👤 User Email: $($data.user.email)" -ForegroundColor Yellow
    Write-Host "   🔐 Global Role: $($data.profile.global_role)" -ForegroundColor Yellow
} catch {
    Write-Host "   ❌ Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Get user organizations
Write-Host "7. Testing GET /api/user/orgs" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/user/orgs" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   📊 User organizations: $($data.orgs.Count)" -ForegroundColor Yellow
    if ($data.orgs.Count -gt 0) {
        Write-Host "   📋 Organization List:" -ForegroundColor DarkCyan
        $data.orgs | ForEach-Object { Write-Host "      • $($_.name)" }
    }
} catch {
    Write-Host "   ❌ Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 8: Get client metrics
Write-Host "8. Testing GET /api/client-metrics" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/client-metrics" -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   ✅ Status: OK" -ForegroundColor Green
    Write-Host "   📊 Dashboard Metrics:" -ForegroundColor Yellow
    Write-Host "      • Total calls: $($data.metrics.total_calls)"
    Write-Host "      • Answered calls: $($data.metrics.answered_calls)"
    Write-Host "      • Answer rate: $($data.metrics.answer_rate_pct)%"
    Write-Host "      • Avg wait: $($data.metrics.avg_wait_seconds)s"
} catch {
    Write-Host "   ❌ Status: ERROR - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "✅ TEST COMPLETE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
