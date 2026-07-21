# 재건축·재개발 전국 시장 EIS

대림바스 경영지원부문 — 전국 재건축·재개발 정비사업 기반 **욕실 품목 시장규모 추정 대시보드**.
Google Apps Script 웹앱 + Google Sheets 를 데이터 소스로 사용합니다.

## 구성 파일

| 파일 | 역할 |
|------|------|
| `Code.js` | 서버(Apps Script). `doGet`이 대시보드 HTML을 서빙하고, `readAllForClient()` / `?action=readAll` 로 시트 4개 탭 데이터를 JSON 반환. `setupSheets()`·`appendGyeonggiProjects()` 유틸 포함 |
| `daelim_eis_redevelopment_market.html` | 프론트엔드 대시보드. `google.script.run.readAllForClient()` 로 시트 데이터를 받아 렌더링 (차트는 CDN 없이 canvas 직접 렌더) |
| `gyeonggi_data.js` | 경기도 정비사업 109건 실측 데이터(`GYEONGGI_PROJECTS_DATA`). `appendGyeonggiProjects()` 가 Projects 탭에 추가 |
| `appsscript.json` | 웹앱 매니페스트 (시간대 Asia/Seoul, 익명 접근 허용, V8 런타임) |
| `.clasp.json` | clasp 배포 설정 (`scriptId` 연결 대상) |

## 데이터 연결 구조

```
[Google Sheet]  ──readAll_()──▶  [Code.js / Apps Script]  ──google.script.run──▶  [대시보드 HTML]
 Projects / Prices                     doGet · readAllForClient                     KPI · 차트 · 표 · 시나리오
 StageYears / Settings
```

- **연동 대상 스프레드시트 ID**: `Code.js` 상단 `SPREADSHEET_ID` (현재 `1wi1DlXbJ2C4fJlsWaFFcVXCHr7L6zPaY1XjwbEYO4iE`)
- 시트가 비어 있으면 화면은 `DEMO FALLBACK` 데모 데이터로 동작합니다.

### 시트 탭

| 탭 | 내용 |
|----|------|
| `Projects` | 사업ID·사업명·시도·시군구·사업유형·사업단계·세대수 등 정비사업 목록 |
| `Prices` | 세대구분 × 7개 욕실 품목 단가/구성(BOM) |
| `StageYears` | 사업단계별 착공까지 잔여연수 |
| `Settings` | 유상옵션 선택률(지역별)·조합 A급 비율·기준/시작/종료연도 |

## 배포(연결) 방법 — clasp

로컬 PC에서 Google 계정으로 인증한 뒤 이 폴더에서 실행합니다.

```bash
npm install -g @google/clasp   # 최초 1회
clasp login                    # Google 계정 인증
cd redevelopment-market
clasp push                     # 소스를 Apps Script 프로젝트로 업로드
```

업로드 후 Apps Script 편집기에서:

1. `setupSheets()` 1회 실행 — Projects/Prices/StageYears/Settings 탭 생성
2. (선택) `appendGyeonggiProjects()` 실행 — 경기도 109건 추가
3. **배포 → 새 배포 → 웹 앱**으로 게시하면 발급되는 URL이 최종 대시보드 접속 주소

> 다른 스프레드시트에 연결하려면 `Code.js`의 `SPREADSHEET_ID` 값을 해당 시트 ID로 교체하세요.
