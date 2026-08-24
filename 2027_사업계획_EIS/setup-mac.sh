#!/usr/bin/env bash
# 2027 사업계획 EIS — 최초 설치 (macOS / Linux)
#
#   1) clasp 설치  2) 구글 로그인  3) 시트+스크립트 생성
#   4) 코드 업로드  5) 웹앱 배포   6) 깃허브 시크릿 3개 출력
#
# 실행:  cd <레포>/2027_사업계획_EIS && bash setup-mac.sh

set -euo pipefail
say()  { printf '\n\033[36m== %s\033[0m\n' "$1"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$1"; }
openurl() { command -v open >/dev/null && open "$1" || command -v xdg-open >/dev/null && xdg-open "$1" || echo "   브라우저에서 열어주세요: $1"; }

say "Node.js 확인"
command -v node >/dev/null || { warn "Node.js 가 없습니다. https://nodejs.org 에서 LTS 설치 후 다시 실행하세요."; exit 1; }
node -v
[ -f ./Code.gs ] || { warn "2027_사업계획_EIS 폴더 안에서 실행해야 합니다. (현재: $PWD)"; exit 1; }

say "clasp 설치 (이미 있으면 그대로 둡니다)"
npm install -g @google/clasp@2.4.2 >/dev/null
clasp --version

say "브라우저에서 'Google Apps Script API' 를 켜 주세요"
echo "   스위치를 '사용'으로 바꾸고 이 창으로 돌아오세요."
openurl "https://script.google.com/home/usersettings" || true
read -r -p "   켰으면 Enter " _

say "구글 로그인 — 브라우저에서 asdblackwall@gmail.com 을 선택해 승인하세요"
clasp login

if [ -f ./.clasp.json ]; then
  say "이미 연결된 프로젝트가 있어 생성을 건너뜁니다 (.clasp.json 존재)"
else
  say "구글시트와 Apps Script 프로젝트 생성"
  clasp create --type sheets --title "2027 사업계획 EIS"
fi

say "코드 업로드 (Code.gs / Index.html / appsscript.json)"
clasp push -f

say "웹앱 배포"
DEPLOY_OUT="$(clasp deploy -d "최초 배포" 2>&1 || true)"
echo "$DEPLOY_OUT"
DEPLOYMENT_ID="$(printf '%s' "$DEPLOY_OUT" | grep -o 'AKfycb[A-Za-z0-9_-]*' | head -1 || true)"
SCRIPT_ID="$(node -e "console.log(require('./.clasp.json').scriptId)")"
CLASPRC="$HOME/.clasprc.json"

say "여기까지 완료됐습니다"
printf '\n\033[33m  [!] Apps Script 편집기에서 setupSheets() 를 1회 실행해야\n      시트 12개와 데모 데이터가 만들어집니다.\033[0m\n\n'
[ -n "$DEPLOYMENT_ID" ] && echo "  대시보드 주소 : https://script.google.com/macros/s/$DEPLOYMENT_ID/exec"
printf '\n\033[32m──────── 깃허브에 등록할 시크릿 3개 ────────\033[0m\n'
echo "  SCRIPT_ID      = $SCRIPT_ID"
[ -n "$DEPLOYMENT_ID" ] && echo "  DEPLOYMENT_ID  = $DEPLOYMENT_ID"
echo "  CLASPRC_JSON   = 아래 파일의 내용 전체"
echo "                   $CLASPRC"
printf '\033[32m────────────────────────────────────────────\033[0m\n\n'
if command -v pbcopy >/dev/null; then
  pbcopy < "$CLASPRC"; echo "  CLASPRC_JSON 내용을 클립보드에 복사했습니다 — 붙여넣기(Cmd+V) 하세요."
else
  echo "  아래 명령으로 내용을 확인해 복사하세요:  cat $CLASPRC"
fi
echo
read -r -p "  깃허브 시크릿 등록 페이지를 열려면 Enter " _
openurl "https://github.com/gusdn3187-commits/eis/settings/secrets/actions/new" || true

say "마지막으로 Apps Script 편집기를 엽니다 — setupSheets() 를 실행하세요"
clasp open
