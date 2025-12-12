param(
  [string]$OrgId = 'd6b7bbde-54bb-4782-989d-cf9093f8cadf',
  [string]$UserId = 'a5f6f998-5dd5-4cdb-88ac-9f27d6f7697a',
  [string]$BaseUrl = 'http://localhost:4000'
)

$headers = @{ 'x-user-id' = $UserId }
Write-Host ('Fetching org details for org: {0}' -f $OrgId)
try {
  $org = Invoke-RestMethod -Uri ("{0}/api/admin/orgs/{1}" -f $BaseUrl, $OrgId) -Headers $headers -TimeoutSec 10
} catch {
  Write-Error ('Failed to GET org details: {0}' -f $_.Exception.Message)
  exit 1
}

Write-Host ('Org name: {0}' -f $org.org.name)

$phones = $org.phones
if (-not $phones) {
  Write-Host 'No phones array in org response; nothing to delete.'; exit 0
}

Write-Host ('Found {0} phones — attempting deletions in order returned.' -f $phones.Count)

foreach ($p in $phones) {
  $id = $p.id
  $num = $p.number
  Write-Host ('`n-> Deleting phone id:"{0}" number:"{1}"' -f $id, $num)
  try {
    $resp = Invoke-RestMethod -Uri ("{0}/api/admin/orgs/{1}/phone-numbers/{2}" -f $BaseUrl, $OrgId, $id) -Method Delete -Headers $headers -TimeoutSec 10
    if ($null -ne $resp) { Write-Host 'Delete returned body:'; $resp | ConvertTo-Json -Depth 5 } else { Write-Host 'Delete returned no body (likely 204)' }
  } catch {
    $e = $_.Exception.Response
    if ($e) {
      $reader = New-Object System.IO.StreamReader($e.GetResponseStream()); $body = $reader.ReadToEnd(); Write-Host ('Delete failed status: {0}' -f $e.StatusCode); Write-Host 'Body:'; Write-Host $body
    } else { Write-Host ('Delete request error: {0}' -f $_.Exception.Message) }
  }
}

Write-Host '`nFetching org details after deletion attempts...'
try { $org2 = Invoke-RestMethod -Uri ("{0}/api/admin/orgs/{1}" -f $BaseUrl, $OrgId) -Headers $headers -TimeoutSec 10 } catch { Write-Error ('Failed to GET org after deletes: {0}' -f $_.Exception.Message); exit 1 }

Write-Host 'Org phones after deletes:'; if ($org2.phones) { ($org2.phones) | ConvertTo-Json -Depth 5 } else { Write-Host '(none)' }
