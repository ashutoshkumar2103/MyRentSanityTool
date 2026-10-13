param(
  [Parameter(Mandatory=$true)][string]$SourceFile,
  [Parameter(Mandatory=$true)][string]$OutFile
)
$json = Get-Content -Raw $SourceFile | ConvertFrom-Json
$b64 = $json[0].text
$clean = ($b64 -split "`n")[0].Trim('"')
[System.IO.File]::WriteAllBytes($OutFile, [Convert]::FromBase64String($clean))
Get-Item $OutFile | Select-Object FullName, Length
