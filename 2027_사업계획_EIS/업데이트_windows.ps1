<#
  2027 사업계획 EIS — 평소 사용 (Windows)

    최신 코드 내려받기(git pull) → Apps Script 에 올리기(clasp push)
    → 배포 ID를 등록해 뒀으면 웹앱까지 자동 갱신

  실행 방법
    powershell -ExecutionPolicy Bypass -File .\업데이트_windows.ps1
#>
$ErrorActionPreference = 'Stop'
function Say($m){ Write-Host "`n== $m" -ForegroundColor Cyan }
function Warn($m){ Write-Host "!! $m" -ForegroundColor Yellow }

if (-not (Test-Path ".\.clasp.json")) { Warn "먼저 최초설정_windows.ps1 을 실행하세요."; exit 1 }

Say "1/3  최신 코드 내려받기"
git pull

Say "2/3  Apps Script 에 올리기"
clasp push -f

if (Test-Path ".\.deployid") {
  $did = (Get-Content ".\.deployid" -Raw).Trim()
  Say "3/3  웹앱 갱신 (주소는 그대로)"
  clasp deploy -i $did -d ("자동 갱신 " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
  Write-Host "`n  완료 — 대시보드를 새로고침하면 반영됩니다." -ForegroundColor Green
} else {
  Say "3/3  건너뜀 (배포 ID 미등록)"
  Write-Host "`n  코드는 올라갔습니다. 웹앱에 반영하려면" -ForegroundColor Yellow
  Write-Host "  Apps Script → 배포 → 배포 관리 → ✏️ → 버전 '새 버전' → 배포" -ForegroundColor Yellow
}
Write-Host ""
