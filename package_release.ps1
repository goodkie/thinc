$currentDir = Get-Location
$webappDir = Join-Path $currentDir "webapp"
$releaseFileName = "release.zip"
$releasePath = Join-Path $currentDir $releaseFileName
$tempReleaseDir = Join-Path $currentDir "__temp_release__"

# Clean prior paths
if (Test-Path $tempReleaseDir) { Remove-Item -Path $tempReleaseDir -Recurse -Force }
if (Test-Path $releasePath) { Remove-Item -Path $releasePath -Force }

New-Item -ItemType Directory -Force -Path $tempReleaseDir | Out-Null

# Copy static frontend assets only
Get-ChildItem -Path $webappDir | ForEach-Object {
    $name = $_.Name
    if ($name -ne "node_modules" -and $name -ne "server.js" -and $name -notlike "test_*.js" -and $name -ne "package.json" -and $name -ne "package-lock.json") {
        Copy-Item -Path $_.FullName -Destination $tempReleaseDir -Recurse -Force
    }
}

# Compress to release.zip at project root
Compress-Archive -Path "$tempReleaseDir\*" -DestinationPath $releasePath -Force

# Clean up temporary directories
if (Test-Path $tempReleaseDir) { Remove-Item -Path $tempReleaseDir -Recurse -Force }

# Verify execution result
if (Test-Path $releasePath) {
    $fileSize = (Get-Item $releasePath).Length
    $fileSizeKB = [Math]::Round($fileSize / 1024, 2)
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host "✨ AWS Amplify Release Packaging Completed!" -ForegroundColor Green
    Write-Host "📁 File name: $releaseFileName" -ForegroundColor Green
    Write-Host "⚖️ File size: $fileSizeKB KB ($fileSize bytes)" -ForegroundColor Green
    Write-Host "💾 Path: $releasePath" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
}
