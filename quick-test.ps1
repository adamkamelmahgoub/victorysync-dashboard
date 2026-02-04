# Test the API endpoints directly with curl
Write-Host "Testing VictorySync API..." -ForegroundColor Green

# Test 1: Get recordings for test@test.com
Write-Host "`n1. Testing /api/recordings with org_id=test-org..." -ForegroundColor Yellow
$response = curl -s -H "x-user-id: test@test.com" "http://localhost:4000/api/recordings?org_id=test-org" 2>&1
Write-Host "Response status: $LASTEXITCODE"
if ($response -match '"error"' -or $response -match '"message"') {
    Write-Host "Error response:" -ForegroundColor Red
    $response | ConvertFrom-Json -ErrorAction SilentlyContinue | ConvertTo-Json -Depth 3
} else {
    Write-Host "Data received (first 500 chars):" -ForegroundColor Green
    $response.Substring(0, [Math]::Min(500, $response.Length))
}

# Test 2: Check if user exists in org_users
Write-Host "`n2. Checking database for test@test.com..." -ForegroundColor Yellow
$dbCheck = @"
SELECT COUNT(*) as user_count FROM org_users WHERE user_id = 'test@test.com';
SELECT COUNT(*) as org_count FROM organizations;
SELECT ou.user_id, ou.org_id, o.name FROM org_users ou LEFT JOIN organizations o ON ou.org_id = o.id LIMIT 5;
"@

Write-Host $dbCheck

# Test 3: Check if any recordings exist
Write-Host "`n3. Checking for recordings in database..." -ForegroundColor Yellow
$recordingCheck = @"
SELECT COUNT(*) as recording_count FROM mightycall_recordings;
SELECT recording_id, org_id, phone_number FROM mightycall_recordings LIMIT 3;
"@

Write-Host $recordingCheck

# Test 4: Admin check - what orgs exist?
Write-Host "`n4. Available organizations..." -ForegroundColor Yellow
$orgCheck = @"
SELECT id, name, created_at FROM organizations LIMIT 10;
"@

Write-Host $orgCheck
