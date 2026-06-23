$backendDir = Join-Path $PSScriptRoot 'gis-tools-backend'
$node = 'C:\Program Files\nodejs\node.exe'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outLog = Join-Path $backendDir "server-$timestamp.out.log"
$errLog = Join-Path $backendDir "server-$timestamp.err.log"

Add-Content -Path $outLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] starting backend with PowerShell..."

$listeners = netstat -ano | Select-String -Pattern ':3000\s+.*LISTENING'
foreach ($listener in $listeners) {
  $parts = ($listener.Line -split '\s+') | Where-Object { $_ }
  $processId = $parts[-1]
  if ($processId -match '^\d+$') {
    Add-Content -Path $outLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] stopping old process $processId on port 3000"
    Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue
  }
}

Start-Process -FilePath $node `
  -ArgumentList 'src/index.js' `
  -WorkingDirectory $backendDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog
