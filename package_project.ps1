# The Truth Untold (TT.U) - 자동 백업 및 패키징 스크립트 (PowerShell)
# 이 스크립트는 프로젝트 소스 코드 및 리소스 전체를 깔끔하게 압축하여 단일 zip 백업 파일을 생성합니다.

$ErrorActionPreference = "Stop"

# 1. 경로 설정
$currentDir = Get-Location
$zipFileName = "the_truth_untold_full_backup.zip"
$zipPath = Join-Path $currentDir $zipFileName
$tempBackupDir = Join-Path $currentDir "__temp_backup__"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "🔮 The Truth Untold (TT.U) 백업 패키징 시작" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# 2. 기존 임시 폴더 및 zip 파일이 있다면 먼저 제거
if (Test-Path $tempBackupDir) {
    Write-Host "이전 임시 폴더 정리 중..." -ForegroundColor Gray
    Remove-Item -Path $tempBackupDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Write-Host "기존 백업 파일 교체 중..." -ForegroundColor Gray
    Remove-Item -Path $zipPath -Force
}

# 3. 임시 백업 폴더 생성
Write-Host "임시 백업 디렉토리 생성 중..." -ForegroundColor Gray
New-Item -ItemType Directory -Force -Path $tempBackupDir | Out-Null

# 4. 백업할 핵심 개별 파일 리스트 복사
$filesToBackup = @(
    "manifest.json",
    "background.js",
    "content.js",
    "content_merged.js",
    "analyzer.js",
    "dictionary.js",
    "overlay.css",
    "popup.html",
    "popup.js",
    "style.css",
    "icon.png",
    "logo.png",
    "leaf.png",
    "trigger_icon.png",
    "merge_scripts.py",
    "RESTORE_POINT.md",
    "AGENT_INSTRUCTIONS.md",
    "BACKUP_GUIDE.md"
)

Write-Host "크롬 익스텐션 소스 및 문서 복사 중..." -ForegroundColor Yellow
foreach ($file in $filesToBackup) {
    $srcPath = Join-Path $currentDir $file
    if (Test-Path $srcPath) {
        Copy-Item -Path $srcPath -Destination $tempBackupDir -Force
    } else {
        Write-Host "⚠️ 경고: 필수 파일 [$file]이 존재하지 않아 건너뜁니다." -ForegroundColor Yellow
    }
}

# 5. dict (다국어 사전 CSV) 디렉토리 복사
$dictSrc = Join-Path $currentDir "dict"
$dictDest = Join-Path $tempBackupDir "dict"
if (Test-Path $dictSrc) {
    Write-Host "대용량 다국어 단어 사전 복사 중 (약 110MB)..." -ForegroundColor Yellow
    Copy-Item -Path $dictSrc -Destination $tempBackupDir -Recurse -Force
}

# 6. webapp (독립형 웹앱) 디렉토리 복사 (node_modules 제외)
$webappSrc = Join-Path $currentDir "webapp"
$webappDest = Join-Path $tempBackupDir "webapp"
if (Test-Path $webappSrc) {
    Write-Host "독립형 웹앱 디렉토리 복사 중 (node_modules 제외)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $webappDest | Out-Null
    
    # node_modules를 제외한 모든 자식 아이템 복사
    Get-ChildItem -Path $webappSrc | Where-Object { $_.Name -ne "node_modules" } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $webappDest -Recurse -Force
    }
}

# 7. Zip 압축 실행
Write-Host "----------------------------------------------" -ForegroundColor Gray
Write-Host "📦 zip 파일로 압축 패키징 중..." -ForegroundColor Green
Write-Host "사전 용량이 커 압축에 약 5~15초 정도 소요될 수 있습니다." -ForegroundColor Gray
Write-Host "----------------------------------------------" -ForegroundColor Gray

# Compress-Archive를 사용하여 __temp_backup__ 디렉토리 내부 콘텐츠 압축
Compress-Archive -Path "$tempBackupDir\*" -DestinationPath $zipPath -Force

# 8. 임시 백업 폴더 정리
Write-Host "임시 백업 폴더 청소 중..." -ForegroundColor Gray
Remove-Item -Path $tempBackupDir -Recurse -Force

# 9. 완료 통계
if (Test-Path $zipPath) {
    $zipSize = (Get-Item $zipPath).Length
    $zipSizeMB = [Math]::Round($zipSize / 1MB, 2)
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host "✨ 백업 패키징이 성공적으로 완료되었습니다!" -ForegroundColor Green
    Write-Host "📁 최종 압축 파일: $zipFileName" -ForegroundColor Green
    Write-Host "⚖️ 최종 파일 크기: $zipSizeMB MB" -ForegroundColor Green
    Write-Host "💾 위치: $zipPath" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
} else {
    Write-Error "❌ 백업 파일 생성에 실패했습니다."
}
