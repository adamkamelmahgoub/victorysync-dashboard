$txt = Get-Content 'mightycall_swagger.json' -Raw
Write-Output $txt.Length
Write-Output $txt.Substring(0,200)
