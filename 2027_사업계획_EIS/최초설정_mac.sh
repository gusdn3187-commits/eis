#!/usr/bin/env bash
# 2027 사업계획 EIS — 최초 1회 설정 (macOS / Linux)
#   실행:  bash 최초설정_mac.sh
set -euo pipefail
say(){ printf '\n\033[36m== %s\033[0m\n' "$1"; }
warn(){ printf '\033[33m!! %s\033[0m\n' "$1"; }
openurl(){ command -v open >/dev/null && open "$1" || { command -v xdg-open >/dev/null && xdg-open "$1"; } || echo "   브라우저에서 열어주세요: $1"; }

[ -f ./Code.gs ] || { warn "2027_사업계획_EIS 폴더 안에서 실행하세요. (현재: $PWD)"; exit 1; }

say "1/6  Node.js 확인"; command -v node >/dev/null || { warn "Node.js 가 없습니다 → https://nodejs.org"; exit 1; }; node -v
say "2/6  Git 확인";     command -v git  >/dev/null || { warn "Git 이 없습니다 → https://git-scm.com"; exit 1; }; git --version
say "3/6  clasp 설치 (이미 있으면 그대로 둡니다)"; npm install -g @google/clasp@2.4.2 >/dev/null; clasp --version

say "4/6  구글 설정 페이지를 엽니다 — 'Google Apps Script API' 를 '사용'으로 켜 주세요"
openurl "https://script.google.com/home/usersettings" || true
read -r -p "     켰으면 Enter " _

say "5/6  구글 로그인 — 브라우저에서 asdblackwall@gmail.com 을 선택해 승인하세요"
clasp login

say "6/6  올릴 대상(Apps Script 프로젝트) 연결"
if [ -f ./.clasp.json ]; then
  echo "     이미 연결돼 있습니다. 건너뜁니다."
else
  echo "     Apps Script 편집기 → 왼쪽 ⚙️ 프로젝트 설정 → '스크립트 ID' 를 복사해 붙여넣으세요."
  read -r -p "     스크립트 ID: " SID
  [ -n "$SID" ] || { warn "스크립트 ID가 비었습니다."; exit 1; }
  printf '{"scriptId":"%s","rootDir":"."}\n' "$SID" > ./.clasp.json
fi

echo
echo "     웹앱을 자동으로 다시 배포하려면 '배포 ID' 도 넣어 주세요. (건너뛰려면 그냥 Enter)"
echo "     Apps Script → 배포 → 배포 관리 → 해당 배포의 '배포 ID'"
if [ ! -f ./.deployid ]; then
  read -r -p "     배포 ID (선택): " DID
  [ -n "${DID:-}" ] && printf '%s\n' "$DID" > ./.deployid || true
fi

say "구글에 있는 현재 파일을 먼저 내려받습니다 (설정 파일을 가져오기 위함)"
clasp pull >/dev/null
git checkout -- Code.gs Index.html 2>/dev/null || true

say "첫 업로드 테스트"
clasp push -f

printf '\n\033[32m  설정 완료\033[0m\n'
echo "  앞으로는 '업데이트_mac.sh' 만 실행하면 최신 코드가 반영됩니다."
echo
