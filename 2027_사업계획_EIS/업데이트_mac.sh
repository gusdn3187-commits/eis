#!/usr/bin/env bash
# 2027 사업계획 EIS — 평소 사용 (macOS / Linux)
#   최신 코드 내려받기 → Apps Script 업로드 → (배포 ID 있으면) 웹앱 갱신
#   실행:  bash 업데이트_mac.sh
set -euo pipefail
say(){ printf '\n\033[36m== %s\033[0m\n' "$1"; }
warn(){ printf '\033[33m!! %s\033[0m\n' "$1"; }

[ -f ./.clasp.json ] || { warn "먼저 최초설정_mac.sh 를 실행하세요."; exit 1; }

say "1/3  최신 코드 내려받기"; git pull
say "2/3  Apps Script 에 올리기"; clasp push -f

if [ -f ./.deployid ]; then
  DID="$(tr -d '[:space:]' < ./.deployid)"
  say "3/3  웹앱 갱신 (주소는 그대로)"
  clasp deploy -i "$DID" -d "자동 갱신 $(date '+%Y-%m-%d %H:%M')"
  printf '\n\033[32m  완료 — 대시보드를 새로고침하면 반영됩니다.\033[0m\n\n'
else
  say "3/3  건너뜀 (배포 ID 미등록)"
  printf '\033[33m  코드는 올라갔습니다. 웹앱에 반영하려면\n  Apps Script → 배포 → 배포 관리 → ✏️ → 버전 "새 버전" → 배포\033[0m\n\n'
fi
