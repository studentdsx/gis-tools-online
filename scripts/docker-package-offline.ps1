param(
  [string]$OutputDir = "docker-dist"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.docker.example" ".env"
}

Get-Content ".env" | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
    return
  }

  $parts = $line.Split("=", 2)
  [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
}

$tag = if ($env:GIS_TOOLS_IMAGE_TAG) { $env:GIS_TOOLS_IMAGE_TAG } else { "latest" }
$frontendImage = if ($env:FRONTEND_IMAGE) { $env:FRONTEND_IMAGE } else { "gis-tools-frontend" }
$backendImage = if ($env:BACKEND_IMAGE) { $env:BACKEND_IMAGE } else { "gis-tools-backend" }
$postgisImage = if ($env:POSTGIS_IMAGE) { $env:POSTGIS_IMAGE } else { "postgis/postgis:16-3.4" }

$frontendRef = "${frontendImage}:${tag}"
$backendRef = "${backendImage}:${tag}"

docker compose -f docker-compose.build.yml build
if ($LASTEXITCODE -ne 0) {
  throw "docker compose build failed with exit code $LASTEXITCODE"
}

docker pull $postgisImage
if ($LASTEXITCODE -ne 0) {
  throw "docker pull $postgisImage failed with exit code $LASTEXITCODE"
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\runtime\config" -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\runtime\deploy" -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\runtime\docs" -Force | Out-Null

docker save --output "$OutputDir\gis-tools-images.tar" $frontendRef $backendRef $postgisImage
if ($LASTEXITCODE -ne 0) {
  throw "docker save failed with exit code $LASTEXITCODE"
}

Copy-Item "docker-compose.yml" "$OutputDir\runtime\docker-compose.yml" -Force
Copy-Item ".env.docker.example" "$OutputDir\runtime\.env.docker.example" -Force
Copy-Item "config\*.env.example" "$OutputDir\runtime\config" -Force
Copy-Item "config\nginx.conf" "$OutputDir\runtime\config\nginx.conf" -Force
Copy-Item "deploy\*.sh" "$OutputDir\runtime\deploy" -Force
Copy-Item "docs\docker-deployment.md" "$OutputDir\runtime\docs\docker-deployment.md" -Force
Copy-Item "README.md" "$OutputDir\runtime\README.md" -Force

Compress-Archive -Path "$OutputDir\runtime\*" -DestinationPath "$OutputDir\gis-tools-runtime-files.zip" -Force

tar -czf "$OutputDir\gis-tools-runtime-files.tar.gz" -C "$OutputDir\runtime" .
if ($LASTEXITCODE -ne 0) {
  throw "tar runtime files failed with exit code $LASTEXITCODE"
}

Write-Host "Offline images: $OutputDir\gis-tools-images.tar"
Write-Host "Runtime files:  $OutputDir\gis-tools-runtime-files.zip"
Write-Host "Runtime files:  $OutputDir\gis-tools-runtime-files.tar.gz"
