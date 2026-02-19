#!/usr/bin/env powershell
# Test all API endpoints

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
    $response = Invoke-WebRequest -Uri "$baseUrl/api/admin/orgs" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   Organizations found: $($data.orgs.Count)" -ForegroundColor Yellow
    if ($data.orgs.Count -gt 0) {
        $data.orgs | ForEach-Object { Write-Host "   - $($_.name) (ID: $($_.id.Substring(0,8))...)" }
    }
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Get recent calls
Write-Host "2. Testing GET /api/calls/recent" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/calls/recent?limit=1000" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   Calls found: $($data.items.Count)" -ForegroundColor Yellow
    if ($data.items.Count -gt 0) {
        Write-Host "   Sample call data:" -ForegroundColor DarkGray
        $data.items[0] | ConvertTo-Json -Compress | Write-Host
    }
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Get queue summary
Write-Host "3. Testing GET /api/calls/queue-summary" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/calls/queue-summary" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   Queues found: $($data.queues.Count)" -ForegroundColor Yellow
    if ($data.queues.Count -gt 0) {
        $data.queues | Select-Object -First 3 | ForEach-Object { 
            Write-Host "   - $($_.name): Total=$($_.totalCalls), Answered=$($_.answered), Missed=$($_.missed)"
        }
    }
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Get time series data
Write-Host "4. Testing GET /api/calls/series?range=day" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/calls/series?range=day" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   Time buckets found: $($data.points.Count)" -ForegroundColor Yellow
    if ($data.points.Count -gt 0) {
        Write-Host "   Sample data points:" -ForegroundColor DarkGray
        $data.points | Select-Object -First 3 | ForEach-Object {
            Write-Host "   - $($_.bucketLabel): $($_.totalCalls) calls"
        }
    }
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Get SMS messages
Write-Host "5. Testing GET /api/sms/messages" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/sms/messages?limit=1000" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   SMS messages found: $($data.messages.Count)" -ForegroundColor Yellow
    if ($data.messages.Count -gt 0) {
        Write-Host "   Sample SMS data:" -ForegroundColor DarkGray
        $data.messages[0] | ConvertTo-Json -Compress | Write-Host
    }
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Get user profile
Write-Host "6. Testing GET /api/user/profile" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/user/profile" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   User data:" -ForegroundColor Yellow
    if ($data.user) {
        Write-Host "   - Email: $($data.user.email)"
        Write-Host "   - ID: $($data.user.id.Substring(0,8))..."
    }
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Get user organizations
Write-Host "7. Testing GET /api/user/orgs" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/user/orgs" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   User organizations: $($data.orgs.Count)" -ForegroundColor Yellow
    if ($data.orgs.Count -gt 0) {
        $data.orgs | ForEach-Object { Write-Host "   - $($_.name)" }
    }
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 8: Get client metrics
Write-Host "8. Testing GET /api/client-metrics" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/client-metrics" -Headers $headers -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json
    Write-Host "   Status: ✅ OK" -ForegroundColor Green
    Write-Host "   Metrics:" -ForegroundColor Yellow
    Write-Host "   - Total calls: $($data.metrics.total_calls)"
    Write-Host "   - Answered calls: $($data.metrics.answered_calls)"
    Write-Host "   - Answer rate: $($data.metrics.answer_rate_pct)%"
    Write-Host "   - Avg wait: $($data.metrics.avg_wait_seconds)s"
} catch {
    Write-Host "   Status: ❌ ERROR" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "TEST COMPLETE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
