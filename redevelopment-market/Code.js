var SPREADSHEET_ID = "1wi1DlXbJ2C4fJlsWaFFcVXCHr7L6zPaY1XjwbEYO4iE";

var TABS = {
  projects: "Projects",
  prices: "Prices",
  stages: "StageYears",
  settings: "Settings"
};

/** 웹 앱 진입점: action=readAll 이면 JSON, 아니면 대시보드 HTML 반환 */
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "readAll") {
    return jsonResponse_(readAll_());
  }
  return HtmlService.createHtmlOutputFromFile("daelim_eis_redevelopment_market")
    .setTitle("대림바스 | 재건축·재개발 전국 시장")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 클라이언트(google.script.run)에서 직접 호출하는 공개 진입점 */
function readAllForClient() {
  return readAll_();
}

/** 4개 탭 데이터를 한 번에 읽어 프런트가 기대하는 형식으로 반환 */
function readAll_() {
  try {
    var ss = getSpreadsheet_();
    var data = {};
    Object.keys(TABS).forEach(function (key) {
      var name = TABS[key];
      var sheet = ss.getSheetByName(name);
      // 프런트의 rowsToObjects 가 첫 행을 헤더로 사용하므로 헤더 포함 2차원 배열 그대로 전달
      // 날짜/숫자 서식 문제를 피하려고 화면 표시값(문자열) 기준으로 읽음
      data[name] = sheet ? sheet.getDataRange().getDisplayValues() : [];
    });
    return { ok: true, data: data, syncedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("SPREADSHEET_ID 를 code.gs 상단에 입력해 주세요.");
  return ss;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * [최초 1회 실행] 시트에 4개 탭(Projects / Prices / StageYears / Settings)을
 * 헤더 + 기본값과 함께 생성합니다. 이미 있는 탭은 건드리지 않습니다.
 */
function setupSheets() {
  var ss = getSpreadsheet_();

  // data.gs(실측 데이터)가 프로젝트에 있으면 함께 기록, 없으면 헤더만 생성
  var projectRows = (typeof PROJECTS_DATA !== "undefined" && typeof PROJECTS_HEADERS !== "undefined")
    ? [PROJECTS_HEADERS].concat(PROJECTS_DATA)
    : [["사업ID","사업명","시도","시군구","사업유형","사업단계","단계기준일","착공예정연도",
        "총세대","조합세대","조합A급세대","조합B급세대","일반분양세대","임대세대","시공사","상태","출처URL","비고"]];
  createIfMissing_(ss, TABS.projects, projectRows);

  createIfMissing_(ss, TABS.prices, PRICES_TEMPLATE_());

  createIfMissing_(ss, TABS.stages, [
    ["사업단계","착공까지_잔여연수"],
    ["정비구역지정", 8],
    ["추진위원회승인", 7],
    ["조합설립인가", 5],
    ["사업시행인가", 3],
    ["관리처분인가", 2],
    ["이주·철거", 1],
    ["착공", 0]
  ]);

  createIfMissing_(ss, TABS.settings, SETTINGS_TEMPLATE_());

  SpreadsheetApp.flush();
  Logger.log("탭 생성 완료: " + ss.getUrl());
}

/**
 * Prices 탭 기본 템플릿(새 기준).
 * 1행: 헤더(세대구분 + 7품목), 2행: '단가(원)' = 품목 단가,
 * 3행 이하: 세대유형별 품목 구성(세대당 수량). 세대당 단가는 화면에서 수량×단가로 자동 계산됨.
 * 품목 순서는 프런트 PRODUCT_KEYS 와 동일해야 함.
 */
function PRICES_TEMPLATE_() {
  return [
    ["세대구분","원피스양변기","투피스양변기","세면기","수전류","수납형","일체형비데","분리형비데"],
    ["단가(원)",        206000, 167000, 170000, 383400, 190000, 667000, 112000],
    ["A급 조합세대",         0,      0,      2,      2,      2,      4,      0],
    ["B급 조합세대",         0,      0,      1,      1,      1,      2,      0],
    ["유상옵션 선택 분양세대", 0,      0,      1,      1,      1,      2,      0],
    ["일반 분양세대",        1,      1,      1,      1,      1,      0,      1],
    ["임대세대",            0,      2,      1,      1,      0,      0,      0]
  ];
}

/**
 * Settings 탭 기본 템플릿. 유상옵션 선택률은 지역별(수도권/광역시/지방)로 관리.
 * 항목명은 프런트 applyExternalSettings 가 읽는 키와 정확히 일치해야 함.
 */
function SETTINGS_TEMPLATE_() {
  return [
    ["항목","값"],
    ["유상옵션선택률_수도권", 0.15],
    ["유상옵션선택률_광역시", 0.10],
    ["유상옵션선택률_지방", 0.05],
    ["조합A급비율", 0.40],
    ["기준연도", 2026],
    ["시작연도", 2026],
    ["종료연도", 2038]
  ];
}

/**
 * Projects 탭 끝에 경기도 사업(GYEONGGI_PROJECTS_DATA, gyeonggi_data.js)을 추가합니다.
 * 이미 존재하는 사업ID(G-###)는 건너뛰어 중복 추가를 막습니다.
 */
function appendGyeonggiProjects() {
  if (typeof GYEONGGI_PROJECTS_DATA === "undefined") {
    throw new Error("gyeonggi_data.js 파일이 프로젝트에 없습니다.");
  }
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(TABS.projects);
  if (!sheet) throw new Error("Projects 탭이 없습니다. setupSheets()를 먼저 실행하세요.");

  var lastRow = sheet.getLastRow();
  var existingIds = {};
  if (lastRow > 1) {
    var idCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    idCol.forEach(function (r) { existingIds[r[0]] = true; });
  }

  var rowsToAdd = GYEONGGI_PROJECTS_DATA.filter(function (r) { return !existingIds[r[0]]; });
  if (rowsToAdd.length === 0) {
    return { ok: true, added: 0, message: "추가할 새 사업이 없습니다 (이미 모두 존재)." };
  }

  sheet.getRange(lastRow + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
  SpreadsheetApp.flush();
  return { ok: true, added: rowsToAdd.length, skipped: GYEONGGI_PROJECTS_DATA.length - rowsToAdd.length };
}

function createIfMissing_(ss, name, rows) {
  if (ss.getSheetByName(name)) return;
  var sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight("bold").setBackground("#eef3f7");
  sheet.setFrozenRows(1);
}
