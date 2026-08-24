<#
  2027 사업계획 EIS — 최초 설치 (Windows PowerShell)

  이 스크립트가 하는 일
    1) clasp 설치
    2) 내 구글 계정(asdblackwall@gmail.com) 로그인  ← 브라우저가 열린다
    3) 구글시트 + Apps Script 프로젝트를 새로 생성
    4) Code.gs / Index.html / appsscript.json 업로드
    5) 웹앱 배포까지 하고 URL 출력
    6) 깃허브에 등록할 시크릿 3개를 화면에 출력

  실행 방법 (PowerShell 을 열고)
    cd <레포를 clone 한 경로>\2027_사업계획_EIS
    powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
#>

$ErrorActionPreference = 'Stop'
function Say($m){ Write-Host "`n== $m" -ForegroundColor Cyan }
function Warn($m){ Write-Host "!! $m" -ForegroundColor Yellow }

# ── 0. 사전 확인 ─────────────────────────────────────────
Say "Node.js 확인"
try { node -v | Out-Null } catch {
  Warn "Node.js 가 없습니다. https://nodejs.org 에서 LTS 를 설치한 뒤 다시 실행하세요."
  exit 1
}
node -v

if (-not (Test-Path ".\Code.gs")) {
  Warn "이 스크립트는 2027_사업계획_EIS 폴더 안에서 실행해야 합니다. (현재: $PWD)"
  exit 1
}

# ── 1. clasp 설치 ────────────────────────────────────────
Say "clasp 설치 (이미 있으면 그대로 둡니다)"
npm install -g @google/clasp@2.4.2 | Out-Null
clasp --version

# ── 2. Apps Script API 켜기 ──────────────────────────────
Say "브라우저에서 'Google Apps Script API' 를 켜 주세요"
Write-Host "   페이지가 열리면 스위치를 '사용'으로 바꾸고 이 창으로 돌아오세요."
Start-Process "https://script.google.com/home/usersettings"
Read-Host "   켰으면 Enter"

# ── 3. 구글 로그인 ───────────────────────────────────────
Say "구글 로그인 — 브라우저에서 asdblackwall@gmail.com 을 선택해 승인하세요"
clasp login

# ── 4. 시트 + 스크립트 생성 ──────────────────────────────
if (Test-Path ".\.clasp.json") {
  Say "이미 연결된 프로젝트가 있어 생성을 건너뜁니다 (.clasp.json 존재)"
} else {
  Say "구글시트와 Apps Script 프로젝트 생성"
  clasp create --type sheets --title "2027 사업계획 EIS"
}

# ── 5. 코드 업로드 ───────────────────────────────────────
Say "코드 업로드 (Code.gs / Index.html / appsscript.json)"
clasp push -f

# ── 6. 웹앱 배포 ─────────────────────────────────────────
Say "웹앱 배포"
$deployOut = clasp deploy -d "최초 배포" 2>&1 | Out-String
Write-Host $deployOut
$deploymentId = ([regex]'AKfycb[A-Za-z0-9_\-]+').Match($deployOut).Value

# ── 7. 결과 정리 ─────────────────────────────────────────
$scriptId = (Get-Content ".\.clasp.json" -Raw | ConvertFrom-Json).scriptId
$clasprc  = Join-Path $env:USERPROFILE ".clasprc.json"

Say "여기까지 완료됐습니다"
Write-Host ""
Write-Host "  [!] Apps Script 편집기에서 setupSheets() 를 1회 실행해야" -ForegroundColor Yellow
Write-Host "      시트 12개와 데모 데이터가 만들어집니다."                -ForegroundColor Yellow
Write-Host ""
if ($deploymentId) {
  Write-Host "  대시보드 주소 : https://script.google.com/macros/s/$deploymentId/exec"
}
Write-Host ""
Write-Host "──────── 깃허브에 등록할 시크릿 3개 ────────" -ForegroundColor Green
Write-Host "  SCRIPT_ID      = $scriptId"
if ($deploymentId) { Write-Host "  DEPLOYMENT_ID  = $deploymentId" }
Write-Host "  CLASPRC_JSON   = 아래 파일의 내용 전체"
Write-Host "                   $clasprc"
Write-Host "────────────────────────────────────────────" -ForegroundColor Green
Write-Host ""
Write-Host "  CLASPRC_JSON 내용을 클립보드에 복사해 둡니다..."
Get-Content $clasprc -Raw | Set-Clipboard
Write-Host "  복사 완료 — 깃허브 시크릿 등록 화면에 붙여넣으세요 (Ctrl+V)."
Write-Host ""
Read-Host "  깃허브 시크릿 등록 페이지를 열려면 Enter"
Start-Process "https://github.com/gusdn3187-commits/eis/settings/secrets/actions/new"

Say "마지막으로 Apps Script 편집기를 엽니다 — setupSheets() 를 실행하세요"
clasp open
