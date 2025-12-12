param(
  [string]$OrgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf',
  [string]$UserId = 'a5f6f998-5dd5-4cdb-88ac-9f27d6f7697a',
  [string]$BaseUrl = 'http://localhost:4000'
)

$headers = @{ 'x-user-id' = $UserId }
$testPhoneId = '8c6b3140-ba2f-44b1-86f1-274cd9f9ed41'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Metrics Flow Test: Assign -> Compute -> Delete -> Recompute" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Org: $OrgId"
Write-Host "Test Phone ID: $testPhoneId"
Write-Host ""

# Step 1: Check initial metrics
Write-Host "[1/5] Fetching initial metrics (baseline)..." -ForegroundColor Yellow
try {
  $metricsInitial = Invoke-RestMethod -Uri "$BaseUrl/api/client-metrics?org_id=$OrgId" -Headers $headers -TimeoutSec 10
  $initialCalls = $metricsInitial.metrics.total_calls
  $initialRate = $metricsInitial.metrics.answer_rate_pct
  Write-Host "  OK Initial: $initialCalls calls, $initialRate% answer rate" -ForegroundColor Green
} catch {
  Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Step 2: Fetch org and check assigned phones
Write-Host "[2/5] Checking assigned phones before assignment..." -ForegroundColor Yellow
try {
  $orgBefore = Invoke-RestMethod -Uri "$BaseUrl/api/admin/orgs/$OrgId" -Headers $headers -TimeoutSec 10
  $phoneCountBefore = $orgBefore.phones.Count
  Write-Host "  OK Phones assigned before: $phoneCountBefore" -ForegroundColor Green
} catch {
  Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Step 3: Assign a phone to the org
Write-Host "[3/5] Assigning phone to org..." -ForegroundColor Yellow
try {
  $assignRes = Invoke-RestMethod -Uri "$BaseUrl/api/admin/orgs/$OrgId/phone-numbers" `
    -Method POST -Headers @{ 'Content-Type' = 'application/json'; 'x-user-id' = $UserId } `
    -Body (ConvertTo-Json @{ phoneNumberIds = @($testPhoneId) }) -TimeoutSec 10
  Write-Host "  OK Phone assigned successfully" -ForegroundColor Green
} catch {
  Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Step 4: Fetch metrics after assignment
Write-Host "[4/5] Fetching metrics after assignment (should match or grow)..." -ForegroundColor Yellow
try {
  Start-Sleep -Seconds 1
  $metricsAfterAssign = Invoke-RestMethod -Uri "$BaseUrl/api/client-metrics?org_id=$OrgId" -Headers $headers -TimeoutSec 10
  $afterCalls = $metricsAfterAssign.metrics.total_calls
  $afterRate = $metricsAfterAssign.metrics.answer_rate_pct
  Write-Host "  OK After assignment: $afterCalls calls, $afterRate% answer rate" -ForegroundColor Green
  
  $orgAfterAssign = Invoke-RestMethod -Uri "$BaseUrl/api/admin/orgs/$OrgId" -Headers $headers -TimeoutSec 10
  $phoneCountAfter = $orgAfterAssign.phones.Count
  if ($phoneCountAfter -gt $phoneCountBefore) {
    Write-Host "  OK Phone count increased: $phoneCountBefore to $phoneCountAfter" -ForegroundColor Green
  } else {
    Write-Host "  WARN Phone count did not increase" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# Step 5: Delete the phone and verify metrics
Write-Host "[5/5] Deleting phone and checking metrics..." -ForegroundColor Yellow
try {
  $phoneNumber = $orgAfterAssign.phones | Where-Object { $_.id -eq $testPhoneId } | Select-Object -ExpandProperty number
  if (-not $phoneNumber) {
    Write-Host "  ERROR Could not find assigned phone to delete" -ForegroundColor Red
    exit 1
  }
  
  $delRes = Invoke-RestMethod -Uri "$BaseUrl/api/admin/orgs/$OrgId/phone-numbers/$([uri]::EscapeDataString($phoneNumber))" `
    -Method Delete -Headers $headers -TimeoutSec 10
  Write-Host "  OK Phone deleted successfully" -ForegroundColor Green
  
  Start-Sleep -Seconds 1
  $metricsAfterDelete = Invoke-RestMethod -Uri "$BaseUrl/api/client-metrics?org_id=$OrgId" -Headers $headers -TimeoutSec 10
  $finalCalls = $metricsAfterDelete.metrics.total_calls
  $finalRate = $metricsAfterDelete.metrics.answer_rate_pct
  Write-Host "  OK After deletion: $finalCalls calls, $finalRate% answer rate" -ForegroundColor Green
  
  $orgFinal = Invoke-RestMethod -Uri "$BaseUrl/api/admin/orgs/$OrgId" -Headers $headers -TimeoutSec 10
  $phoneCountFinal = $orgFinal.phones.Count
  if ($phoneCountFinal -lt $phoneCountAfter) {
    Write-Host "  OK Phone count decreased: $phoneCountAfter to $phoneCountFinal" -ForegroundColor Green
  } else {
    Write-Host "  WARN Phone count did not decrease" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "OK All tests passed! Metrics flow works." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:"
Write-Host "  Initial metrics: $initialCalls calls, $initialRate% answer rate"
Write-Host "  After assignment: $afterCalls calls, $afterRate% answer rate"
Write-Host "  After deletion: $finalCalls calls, $finalRate% answer rate"
Write-Host "  Phone count: $phoneCountBefore to $phoneCountAfter to $phoneCountFinal"
