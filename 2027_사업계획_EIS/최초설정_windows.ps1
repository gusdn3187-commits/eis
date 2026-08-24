<#
  2027 사업계획 EIS — 최초 1회 설정 (Windows)

  이 파일이 하는 일
    1) clasp(구글 공식 업로드 도구) 설치
    2) 내 구글 계정 로그인            ← 브라우저가 한 번 열립니다
    3) 어느 Apps Script 프로젝트에 올릴지 연결
    4) 첫 업로드 테스트

  실행 방법
    이 파일이 있는 폴더에서 PowerShell 을 열고
    powershell -ExecutionPolicy Bypass -File .\최초설정_windows.ps1
#>
$ErrorActionPreference = 'Stop'
function Say($m){ Write-Host "`n== $m" -ForegroundColor Cyan }
function Warn($m){ Write-Host "!! $m" -ForegroundColor Yellow }

if (-not (Test-Path ".\Code.gs")) { Warn "2027_사업계획_EIS 폴더 안에서 실행하세요. (현재: $PWD)"; exit 1 }

Say "1/6  Node.js 확인"
try { node -v } catch { Warn "Node.js 가 없습니다. https://nodejs.org 에서 LTS 를 설치하고 다시 실행하세요."; exit 1 }

Say "2/6  Git 확인"
try { git --version } catch { Warn "Git 이 없습니다. https://git-scm.com/download/win 에서 설치하고 다시 실행하세요."; exit 1 }

Say "3/6  clasp 설치 (이미 있으면 그대로 둡니다)"
npm install -g @google/clasp@2.4.2 | Out-Null
clasp --version

Say "4/6  구글 설정 페이지를 엽니다 — 'Google Apps Script API' 를 '사용'으로 켜 주세요"
Start-Process "https://script.google.com/home/usersettings"
Read-Host "     켰으면 Enter"

Say "5/6  구글 로그인 — 브라우저에서 asdblackwall@gmail.com 을 선택해 승인하세요"
clasp login

Say "6/6  올릴 대상(Apps Script 프로젝트) 연결"
if (Test-Path ".\.clasp.json") {
  Write-Host "     이미 연결돼 있습니다. 건너뜁니다."
} else {
  Write-Host "     Apps Script 편집기 → 왼쪽 ⚙️ 프로젝트 설정 → '스크립트 ID' 를 복사해 붙여넣으세요."
  $sid = Read-Host "     스크립트 ID"
  if (-not $sid) { Warn "스크립트 ID가 비었습니다."; exit 1 }
  '{"scriptId":"' + $sid.Trim() + '","rootDir":"."}' | Set-Content ".\.clasp.json" -Encoding UTF8
}

Write-Host ""
Write-Host "     웹앱을 자동으로 다시 배포하려면 '배포 ID' 도 넣어 주세요. (건너뛰려면 그냥 Enter)" -ForegroundColor Gray
Write-Host "     Apps Script → 배포 → 배포 관리 → 해당 배포의 '배포 ID'" -ForegroundColor Gray
if (-not (Test-Path ".\.deployid")) {
  $did = Read-Host "     배포 ID (선택)"
  if ($did) { $did.Trim() | Set-Content ".\.deployid" -Encoding UTF8 }
}

Say "구글에 있는 현재 파일을 먼저 내려받습니다 (설정 파일을 가져오기 위함)"
clasp pull | Out-Null
# 내려받으면서 덮어써진 코드 2개는 이 폴더(깃허브) 버전으로 되돌린다
git checkout -- Code.gs Index.html 2>$null

Say "첫 업로드 테스트"
clasp push -f

Write-Host ""
Write-Host "  설정 완료" -ForegroundColor Green
Write-Host "  앞으로는 '업데이트_windows.ps1' 만 실행하면 최신 코드가 반영됩니다."
Write-Host ""
