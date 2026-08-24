/***** 2027 사업계획 EIS — 구글시트 연동 Apps Script *****
 * 기존 '경영지원부문 KPI(EIS)'와 완전히 별개인 독립 프로젝트다.
 * 그쪽 시트/스크립트는 건드리지 않는다 — 코드 작성 방식만 참고했다.
 *
 * ── 단위 규칙 (헷갈리면 여기부터 볼 것) ──
 *   시트 입력 = 백만원 (정수).  서버는 변환하지 않고 백만원 그대로 넘긴다.
 *   화면에서 표는 백만원, 그래프·KPI 카드는 억원(÷100)으로 표시한다.
 *   비율(%)·인원(명)·건수는 단위 변환 없이 그대로 쓴다.
 *
 * ── 최초 설치 순서 ──
 *   1) 새 구글시트 생성 → 확장 프로그램 > Apps Script
 *   2) Code.gs / Index.html 붙여넣기 (appsscript.json 매니페스트도 표시해서 교체)
 *   3) 편집기에서 setupSheets() 1회 실행 (시트 12개 생성 + 데모 데이터)
 *   4) 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 조직 또는 링크가 있는 모든 사용자)
 *   5) 시트 값을 실제 사업계획 숫자로 교체 → 웹앱 새로고침
 ****************************************************************/

var APP_VERSION = '1.0.0';        // 코드 버전 — 화면 오른쪽 아래에 표시된다
var APP_BUILT   = '2026-08-24';   // 이 코드를 만든 날

var PLAN_YEAR = 2027;     // 계획연도
var BASE_YEAR = 2026;     // 비교 기준연도(전년 추정)
var MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

/* 시트 이름 — 이름을 바꾸려면 여기만 고치면 된다 */
var SH = {
  cfg:    '설정',
  bu:     '사업부_월별',
  corp:   '전사_월별',
  trend:  '연도추이',
  pl:     '손익구조',
  assum:  '전제조건',
  task:   '추진과제',
  capex:  '투자계획',
  hc:     '인원계획',
  scen:   '시나리오',
  memo:   '검토의견',
  emp:    '직원'
};

/* ══════════════════════════════════════════
   웹앱 진입
══════════════════════════════════════════ */
function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.DATA_JSON = JSON.stringify(buildData());
  return t.evaluate()
    .setTitle(PLAN_YEAR + ' 사업계획 EIS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

/* 시트에서 바로 대시보드를 연다 — 웹앱 주소를 따로 적어두지 않아도 되게 */
function openDashboard() {
  var ui = SpreadsheetApp.getUi();
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  if (!url) {
    ui.alert('대시보드 열기',
      '아직 웹앱으로 배포되지 않았습니다.\n\nApps Script 편집기 → 배포 → 새 배포 → 웹 앱 으로 한 번 배포한 뒤 다시 눌러 주세요.',
      ui.ButtonSet.OK);
    return;
  }
  var html = HtmlService.createHtmlOutput(
      '<script>window.open(' + JSON.stringify(url) + ', "_blank"); google.script.host.close();</' + 'script>')
    .setWidth(120).setHeight(60);
  ui.showModalDialog(html, '대시보드 여는 중…');
}

/* 붙여넣은 코드가 최신인지 확인용 */
function showVersion() {
  SpreadsheetApp.getUi().alert('코드 버전',
    'v' + APP_VERSION + '  (' + APP_BUILT + ')\n\n대시보드 화면 오른쪽 아래에도 같은 버전이 표시됩니다.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/* 사내망에서 CDN이 막히면 Chart.js 를 프로젝트 안에 넣고 이 함수로 끼워 넣는다.
   (Index.html 의 <script src="...chart.umd.js"> 를 <?!= include('chartjs') ?> 로 교체) */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* 스프레드시트 상단 커스텀 메뉴 — 운영자가 편집기에 들어가지 않아도 되게 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('2027 사업계획')
    .addItem('대시보드 열기', 'openDashboard')
    .addSeparator()
    .addItem('시트 초기화 (틀 + 데모데이터)', 'setupSheets')
    .addItem('데모데이터만 다시 채우기', 'seedDemoData')
    .addSeparator()
    .addItem('입력값 점검 (합계·부호 검증)', 'validatePlan')
    .addItem('코드 버전 확인', 'showVersion')
    .addToUi();
}

/* ══════════════════════════════════════════
   공용 헬퍼 (기존 EIS와 같은 방식)
══════════════════════════════════════════ */
function readRows(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return [];
  if (sh.getLastRow() < 1) return [];
  return sh.getDataRange().getValues();
}
/* 문자열/삼각(△)/콤마 섞인 셀을 숫자로. 빈칸은 null */
function pv(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  var s = String(v).trim().replace(/,/g, '').replace(/%/g, '');
  if (s === '') return null;
  var neg = false;
  if (s.charAt(0) === '△' || s.charAt(0) === '▲' || s.charAt(0) === '-') { neg = true; s = s.substring(1).trim(); }
  var n = Number(s);
  return isNaN(n) ? null : (neg ? -n : n);
}
function s_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function asText(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy.MM.dd');
  return s_(v);
}
function sum_(arr) {
  var t = 0, has = false;
  for (var i = 0; i < (arr || []).length; i++) { if (arr[i] != null) { t += arr[i]; has = true; } }
  return has ? t : null;
}
function sheetOf_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1a4a8a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ══════════════════════════════════════════
   buildData — 시트 → 화면 데이터 한 덩어리
══════════════════════════════════════════ */
function buildData() {
  var out = {};

  /* 1) 설정 */
  var cfg = {};
  var cr = readRows(SH.cfg);
  for (var r = 1; r < cr.length; r++) {
    var k = s_(cr[r][0]); if (!k) continue;
    cfg[k] = (cr[r][1] instanceof Date) ? asText(cr[r][1]) : cr[r][1];
  }
  out.META = {
    planYear: Number(cfg.PLAN_YEAR || PLAN_YEAR),
    baseYear: Number(cfg.BASE_YEAR || BASE_YEAR),
    title:    s_(cfg.TITLE)   || (PLAN_YEAR + ' 사업계획'),
    company:  s_(cfg.COMPANY) || '대림바스',
    dept:     s_(cfg.DEPT)    || '경영지원부문 · 기획팀',
    updated:  asText(cfg.UPDATED) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy.MM.dd'),
    authOn:   String(cfg.AUTH_ON || 'N').toUpperCase() === 'Y',
    note:     s_(cfg.NOTE) || '표=백만원 · 그래프=억원',
    version:  APP_VERSION,
    built:    APP_BUILT
  };

  /* 2) 사업부_월별 : 사업부 | 구분(계획/전년) | 지표 | 1~12월 */
  var BU = {}, buOrder = [];
  var br = readRows(SH.bu);
  for (var r2 = 1; r2 < br.length; r2++) {
    var bu = s_(br[r2][0]), gubun = s_(br[r2][1]), metric = s_(br[r2][2]);
    if (!bu || !metric) continue;
    if (!BU[bu]) { BU[bu] = {}; buOrder.push(bu); }
    var arr = [];
    for (var m = 0; m < 12; m++) arr.push(pv(br[r2][3 + m]));
    var key = (gubun === '전년') ? (metric + '_prev') : metric;
    BU[bu][key] = arr;
  }
  out.BU = BU;
  out.BU_ORDER = buOrder;

  /* 3) 전사_월별 : 구분 | 지표 | 1~12월  (수주·판관비 등 전사 직접 입력분) */
  var CORP = {};
  var qr = readRows(SH.corp);
  for (var r3 = 1; r3 < qr.length; r3++) {
    var g3 = s_(qr[r3][0]), m3 = s_(qr[r3][1]);
    if (!m3) continue;
    var a3 = [];
    for (var mm = 0; mm < 12; mm++) a3.push(pv(qr[r3][2 + mm]));
    CORP[(g3 === '전년') ? (m3 + '_prev') : m3] = a3;
  }
  /* 손익 4종은 사업부 합계를 정본으로 쓴다 — 전사 시트와 어긋나 두 숫자가 도는 일을 막는다 */
  ['sales','cogs','gp','sgna','op'].forEach(function (k) {
    CORP[k]           = _sumBU_(BU, buOrder, k);
    CORP[k + '_prev'] = _sumBU_(BU, buOrder, k + '_prev');
  });
  out.CORP = CORP;

  /* 4) 연도추이 : 지표 | 연도별 값 (1행 = 연도 헤더) */
  var tyears = [], TREND = {};
  var tr = readRows(SH.trend);
  if (tr.length) {
    for (var c4 = 1; c4 < tr[0].length; c4++) { var y4 = pv(tr[0][c4]); if (y4 != null) tyears.push(y4); }
    for (var r4 = 1; r4 < tr.length; r4++) {
      var k4 = s_(tr[r4][0]); if (!k4) continue;
      var a4 = [];
      for (var i4 = 0; i4 < tyears.length; i4++) a4.push(pv(tr[r4][1 + i4]));
      TREND[k4] = a4;
    }
  }
  out.TREND_YEARS = tyears;
  out.TREND = TREND;

  /* 5) 손익구조 : 레벨 | 항목 | 전년 | 계획 | 비고 */
  out.PL = _rowsToObjs_(SH.pl, ['level', 'item', 'prev', 'plan', 'note'], { num: ['level', 'prev', 'plan'] });

  /* 6) 전제조건 : 구분 | 항목 | 단위 | 전년 | 계획 | 비고 */
  out.ASSUM = _rowsToObjs_(SH.assum, ['cat', 'item', 'unit', 'prev', 'plan', 'note'], { num: ['prev', 'plan'] });

  /* 7) 추진과제 : 부문 | 과제 | KPI | 목표 | 담당 | 일정 | 기대효과 | 비고 */
  out.TASKS = _rowsToObjs_(SH.task, ['div', 'name', 'kpi', 'goal', 'owner', 'when', 'effect', 'note'], { num: ['effect'] });

  /* 8) 투자계획 : 구분 | 투자명 | 금액 | 시기 | 목적 | 비고 */
  out.CAPEX = _rowsToObjs_(SH.capex, ['cat', 'name', 'amt', 'when', 'purpose', 'note'], { num: ['amt'] });

  /* 9) 인원계획 : 부문 | 전년말 | 계획 | 비고 */
  out.HC = _rowsToObjs_(SH.hc, ['div', 'prev', 'plan', 'note'], { num: ['prev', 'plan'] });

  /* 10) 시나리오 : 시나리오 | 매출 | 매출총이익 | 영업이익 | 확률 | 전제 */
  out.SCEN = _rowsToObjs_(SH.scen, ['name', 'sales', 'gp', 'op', 'prob', 'note'], { num: ['sales', 'gp', 'op', 'prob'] });

  /* 11) 검토의견 */
  out.MEMO = getComments();

  return out;
}

/* 사업부 전체를 월별로 합산 — 값이 하나도 없는 월은 null 유지 */
function _sumBU_(BU, order, key) {
  var out = [];
  for (var m = 0; m < 12; m++) {
    var t = 0, has = false;
    for (var i = 0; i < order.length; i++) {
      var a = BU[order[i]][key];
      if (a && a[m] != null) { t += a[m]; has = true; }
    }
    out.push(has ? Math.round(t * 10) / 10 : null);
  }
  return out;
}

/* 표 형태 시트 → 객체 배열. opt.num 에 적은 열만 숫자로 바꾼다 */
function _rowsToObjs_(name, keys, opt) {
  opt = opt || {};
  var numSet = {};
  (opt.num || []).forEach(function (k) { numSet[k] = true; });
  var rows = readRows(name), out = [];
  for (var r = 1; r < rows.length; r++) {
    var blank = true;
    for (var c = 0; c < keys.length; c++) { if (s_(rows[r][c]) !== '') { blank = false; break; } }
    if (blank) continue;
    var o = {};
    for (var k = 0; k < keys.length; k++) {
      o[keys[k]] = numSet[keys[k]] ? pv(rows[r][k]) : asText(rows[r][k]);
    }
    o._row = r + 1;
    out.push(o);
  }
  return out;
}

/* 화면에서 데이터만 다시 받아갈 때 */
function getPlanData() { return buildData(); }

/* ══════════════════════════════════════════
   검토의견 (카드/과제 단위 코멘트)
══════════════════════════════════════════ */
function getComments() {
  var rows = readRows(SH.memo), map = {};
  for (var r = 1; r < rows.length; r++) {
    var key = s_(rows[r][0]), text = s_(rows[r][3]);
    if (!key || !text) continue;
    if (!map[key]) map[key] = [];
    map[key].push({ id: r + 1, label: s_(rows[r][1]), author: s_(rows[r][2]), text: text, ts: asText(rows[r][4]) });
  }
  return map;
}
function addComment(key, label, text) {
  key = s_(key); text = s_(text);
  if (!key || !text) throw new Error('빈 입력');
  var sh = sheetOf_(SH.memo, ['키', '항목', '작성자', '내용', '작성일시']);
  var email = ''; try { email = Session.getActiveUser().getEmail(); } catch (e) {}
  var author = email ? email.split('@')[0] : '익명';
  var now = new Date();
  sh.appendRow([key, s_(label), author, text, now]);
  return { id: sh.getLastRow(), label: s_(label), author: author, text: text,
           ts: Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy.MM.dd') };
}
function updateComment(id, text) {
  text = s_(text);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.memo);
  var row = parseInt(id, 10);
  if (!sh || isNaN(row) || row < 2 || row > sh.getLastRow() || !text) return false;
  sh.getRange(row, 4).setValue(text);
  return true;
}
function deleteComment(id) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.memo);
  var row = parseInt(id, 10);
  if (!sh || isNaN(row) || row < 2 || row > sh.getLastRow()) return false;
  sh.deleteRow(row);
  return true;
}

/* ══════════════════════════════════════════
   접근 게이트 (설정!AUTH_ON = Y 일 때만 화면에 뜬다)
══════════════════════════════════════════ */
function verifyEmp(dept, emp, name) {
  dept = s_(dept); emp = s_(emp); name = s_(name);
  if (!emp || !name) return false;
  var rows = readRows(SH.emp), ok = false;
  for (var r = 1; r < rows.length; r++) {
    var d = s_(rows[r][0]), e = s_(rows[r][1]), n = s_(rows[r][2]);
    var use = s_(rows[r][3]) === '' ? 'Y' : s_(rows[r][3]);
    if (e === emp && n === name && (dept === '' || d === dept) && use.toUpperCase() !== 'N') { ok = true; break; }
  }
  return ok;
}

/* ══════════════════════════════════════════
   입력값 점검 — 사람 눈으로 놓치기 쉬운 것만 짚어준다
══════════════════════════════════════════ */
function validatePlan() {
  var d = buildData(), msg = [];
  var round = function (v) { return Math.round(v || 0); };

  /* ① 사업부 손익 항등식: 매출 − 매출원가 = 매출총이익, 매출총이익 − 판관비 = 영업이익 */
  d.BU_ORDER.forEach(function (bu) {
    var b = d.BU[bu];
    for (var m = 0; m < 12; m++) {
      var s = (b.sales || [])[m], c = (b.cogs || [])[m], g = (b.gp || [])[m],
          a = (b.sgna || [])[m], o = (b.op || [])[m];
      if (s != null && c != null && g != null && Math.abs((s - c) - g) > 1)
        msg.push('[' + bu + ' ' + (m + 1) + '월] 매출−매출원가(' + round(s - c) + ') ≠ 매출총이익(' + round(g) + ')');
      if (g != null && a != null && o != null && Math.abs((g - a) - o) > 1)
        msg.push('[' + bu + ' ' + (m + 1) + '월] 매출총이익−판관비(' + round(g - a) + ') ≠ 영업이익(' + round(o) + ')');
    }
  });

  /* ② 연도추이 마지막 해(계획연도)와 월별 합계가 맞는지 */
  var yi = d.TREND_YEARS.indexOf(d.META.planYear);
  if (yi >= 0) {
    [['sales', '매출액'], ['gp', '매출총이익'], ['op', '영업이익']].forEach(function (p) {
      var t = d.TREND[p[0]] ? d.TREND[p[0]][yi] : null;
      var s = sum_(d.CORP[p[0]]);
      if (t != null && s != null && Math.abs(t - s) > 5)
        msg.push('[연도추이] ' + p[1] + ' ' + d.META.planYear + '년 ' + round(t) + ' ≠ 월별 합계 ' + round(s));
    });
  }

  /* ③ 시나리오 확률 합 */
  var pTot = 0, pCnt = 0;
  d.SCEN.forEach(function (x) { if (x.prob != null) { pTot += x.prob; pCnt++; } });
  if (pCnt && Math.abs(pTot - 100) > 0.5) msg.push('[시나리오] 확률 합계가 ' + pTot + '% (100%가 아님)');

  var body = msg.length
    ? '점검 결과 ' + msg.length + '건\n\n' + msg.slice(0, 40).join('\n') + (msg.length > 40 ? '\n\n… 외 ' + (msg.length - 40) + '건' : '')
    : '이상 없음 — 손익 항등식·연간 합계·시나리오 확률 모두 일치합니다.';
  try { SpreadsheetApp.getUi().alert('입력값 점검', body, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  Logger.log(body);
  return body;
}

/* ══════════════════════════════════════════
   시트 초기화 — 최초 1회 실행
══════════════════════════════════════════ */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  sheetOf_(SH.cfg,  ['키', '값', '설명']);
  sheetOf_(SH.bu,   ['사업부', '구분', '지표'].concat(MONTHS_KO));
  sheetOf_(SH.corp, ['구분', '지표'].concat(MONTHS_KO));
  sheetOf_(SH.trend,['지표']);
  sheetOf_(SH.pl,   ['레벨', '항목', BASE_YEAR + ' 추정', PLAN_YEAR + ' 계획', '비고']);
  sheetOf_(SH.assum,['구분', '항목', '단위', BASE_YEAR + ' 추정', PLAN_YEAR + ' 계획', '비고']);
  sheetOf_(SH.task, ['부문', '과제명', 'KPI', '목표', '담당', '일정', '기대효과(백만)', '비고']);
  sheetOf_(SH.capex,['구분', '투자명', '금액(백만)', '시기', '목적', '비고']);
  sheetOf_(SH.hc,   ['부문', BASE_YEAR + '말', PLAN_YEAR + ' 계획', '비고']);
  sheetOf_(SH.scen, ['시나리오', '매출액', '매출총이익', '영업이익', '확률(%)', '전제']);
  sheetOf_(SH.memo, ['키', '항목', '작성자', '내용', '작성일시']);
  sheetOf_(SH.emp,  ['부서', '사번', '이름', '사용여부']);

  seedDemoData();

  /* 기본 시트('시트1') 정리 */
  var first = ss.getSheets()[0];
  if (first.getName() === '시트1' || first.getName() === 'Sheet1') {
    if (first.getLastRow() === 0) ss.deleteSheet(first);
  }
  ss.setActiveSheet(ss.getSheetByName(SH.cfg));
  Logger.log('시트 12종 준비 완료 — 데모 데이터가 채워졌습니다. 실제 숫자로 덮어쓰세요.');
}

/* ── 데모 데이터 ──
   실제 계획 수립 전 화면이 비어 보이지 않도록 채워두는 값이다.
   숫자는 전부 시트에서 덮어쓰면 되고, 이 함수를 다시 돌리면 원래 값으로 되돌아간다. */
function seedDemoData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var clear = function (name, keepHeader) {
    var sh = ss.getSheetByName(name); if (!sh) return null;
    var last = sh.getLastRow();
    if (last > (keepHeader ? 1 : 0)) sh.getRange(keepHeader ? 2 : 1, 1, last - (keepHeader ? 1 : 0), sh.getLastColumn()).clearContent();
    return sh;
  };

  /* ① 설정 */
  var shCfg = clear(SH.cfg, true);
  shCfg.getRange(2, 1, 8, 3).setValues([
    ['PLAN_YEAR', PLAN_YEAR, '계획연도'],
    ['BASE_YEAR', BASE_YEAR, '비교 기준연도(전년 추정)'],
    ['TITLE',     PLAN_YEAR + ' 사업계획', '대시보드 제목'],
    ['COMPANY',   '대림바스', '회사명'],
    ['DEPT',      '경영지원부문 · 기획팀', '작성 부서'],
    ['UPDATED',   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy.MM.dd'), '최종 갱신일'],
    ['AUTH_ON',   'N', '접근 게이트 사용(Y/N). Y면 사번·이름 입력 화면이 뜬다'],
    ['NOTE',      '표=백만원 · 그래프=억원', '단위 안내 문구']
  ]);

  /* ② 사업부 월별 — 아래 기준값에서 계절가중치로 12개월을 만든다 */
  var SEASON = [0.85, 0.88, 1.05, 1.08, 1.10, 0.95, 0.92, 0.88, 1.06, 1.08, 1.10, 1.05];  // 합 = 12
  var BU_SEED = [
    /* 사업부,      전년매출(백만), 전년GP율, 전년OP율, 매출성장률, GP율개선(%p), OP율개선(%p) */
    ['창원SW',      12000, 0.020, -0.120, 0.04,  0.030, 0.045],
    ['제천SW',      21000, 0.115, -0.030, 0.05,  0.015, 0.025],
    ['상품SW',      22500, 0.300,  0.180, 0.07,  0.005, 0.008],
    ['SW OEM',      45000, 0.450,  0.250, 0.06,  0.005, 0.010],
    ['수전',        52000, 0.160,  0.048, 0.05,  0.012, 0.015],
    ['비데',        17000, 0.270,  0.078, 0.08,  0.008, 0.014],
    ['타일',         6500, 0.150,  0.018, 0.06,  0.010, 0.012],
    ['BK',          38000, 0.330,  0.048, 0.07,  0.006, 0.012],
    ['Care',        31000, 0.220,  0.030, 0.06,  0.010, 0.016],
    ['임대',         1300, 0.880,  0.880, 0.02,  0.000, 0.000]
  ];
  var shBU = clear(SH.bu, true), buRows = [];
  BU_SEED.forEach(function (b) {
    var name = b[0], base = b[1], gpr = b[2], opr = b[3], grw = b[4], dG = b[5], dO = b[6];
    [['계획', base * (1 + grw), gpr + dG, opr + dO], ['전년', base, gpr, opr]].forEach(function (g) {
      var gubun = g[0], annual = g[1], gRate = g[2], oRate = g[3];
      var sales = [], cogs = [], gp = [], sgna = [], op = [];
      for (var m = 0; m < 12; m++) {
        var s = Math.round(annual * SEASON[m] / 12);
        var gv = Math.round(s * gRate);
        var ov = Math.round(s * oRate);
        sales.push(s); gp.push(gv); cogs.push(s - gv); op.push(ov); sgna.push(gv - ov);
      }
      buRows.push([name, gubun, 'sales'].concat(sales));
      buRows.push([name, gubun, 'cogs'].concat(cogs));
      buRows.push([name, gubun, 'gp'].concat(gp));
      buRows.push([name, gubun, 'sgna'].concat(sgna));
      buRows.push([name, gubun, 'op'].concat(op));
    });
  });
  shBU.getRange(2, 1, buRows.length, 15).setValues(buRows);

  /* ③ 전사 월별 — 수주액·CAPEX 등 사업부로 안 쪼개는 항목 */
  var totalSales = 0;
  BU_SEED.forEach(function (b) { totalSales += b[1] * (1 + b[4]); });
  var prevSales = 0;
  BU_SEED.forEach(function (b) { prevSales += b[1]; });
  var shCorp = clear(SH.corp, true), corpRows = [];
  [['계획', totalSales * 1.06, totalSales * 0.045], ['전년', prevSales * 1.03, prevSales * 0.040]].forEach(function (g) {
    var ord = [], cap = [];
    for (var m = 0; m < 12; m++) {
      ord.push(Math.round(g[1] * SEASON[m] / 12));
      cap.push(Math.round(g[2] / 12));
    }
    corpRows.push([g[0], 'orders'].concat(ord));
    corpRows.push([g[0], 'capex'].concat(cap));
  });
  shCorp.getRange(2, 1, corpRows.length, 14).setValues(corpRows);

  /* ④ 연도추이 (2021~계획연도) */
  var shTrend = clear(SH.trend, true);
  var tYears = [];
  for (var y = PLAN_YEAR - 6; y <= PLAN_YEAR; y++) tYears.push(y);
  shTrend.getRange(1, 1, 1, tYears.length + 1)
    .setValues([['지표'].concat(tYears)])
    .setFontWeight('bold').setBackground('#1a4a8a').setFontColor('#ffffff');
  var planTot = { sales: 0, gp: 0, op: 0 }, prevTot = { sales: 0, gp: 0, op: 0 };
  BU_SEED.forEach(function (b) {
    var ps = b[1] * (1 + b[4]);
    planTot.sales += ps; planTot.gp += ps * (b[2] + b[5]); planTot.op += ps * (b[3] + b[6]);
    prevTot.sales += b[1]; prevTot.gp += b[1] * b[2]; prevTot.op += b[1] * b[3];
  });
  var back = [0.82, 0.86, 0.90, 0.94, 0.97];   // 2021~2025 를 전년 대비 비율로 역산
  var mk = function (planV, prevV, wobble) {
    var a = [];
    for (var i = 0; i < back.length; i++) a.push(Math.round(prevV * back[i] * wobble[i]));
    a.push(Math.round(prevV)); a.push(Math.round(planV));
    return a;
  };
  shTrend.getRange(2, 1, 5, tYears.length + 1).setValues([
    ['sales'].concat(mk(planTot.sales, prevTot.sales, [1, 1, 1, 1, 1])),
    ['gp'].concat(mk(planTot.gp, prevTot.gp, [0.88, 0.92, 0.96, 1.02, 0.99])),
    ['op'].concat(mk(planTot.op, prevTot.op, [0.55, 0.70, 0.86, 1.08, 0.95])),
    ['orders'].concat(mk(totalSales * 1.06, prevSales * 1.03, [1, 1, 1, 1, 1])),
    ['capex'].concat(mk(totalSales * 0.045, prevSales * 0.040, [0.7, 0.8, 0.9, 1.1, 0.95]))
  ]);

  /* ⑤ 손익구조 */
  var P = function (v) { return Math.round(v); };
  var pS = P(planTot.sales), pG = P(planTot.gp), pO = P(planTot.op);
  var bS = P(prevTot.sales), bG = P(prevTot.gp), bO = P(prevTot.op);
  var shPL = clear(SH.pl, true);
  shPL.getRange(2, 1, 17, 5).setValues([
    [1, '매출액',        bS,               pS,               '사업부 합계'],
    [2, '　제품매출',    P(bS * 0.62),     P(pS * 0.61),     '자사 생산'],
    [2, '　상품매출',    P(bS * 0.33),     P(pS * 0.34),     '수입·외주 매입'],
    [2, '　기타매출',    P(bS * 0.05),     P(pS * 0.05),     '임대·용역'],
    [1, '매출원가',      bS - bG,          pS - pG,          ''],
    [2, '　재료비',      P((bS - bG) * 0.52), P((pS - pG) * 0.51), '원자재·부자재'],
    [2, '　노무비',      P((bS - bG) * 0.17), P((pS - pG) * 0.18), ''],
    [2, '　제조경비',    P((bS - bG) * 0.14), P((pS - pG) * 0.14), '동력·감가상각'],
    [2, '　상품원가',    P((bS - bG) * 0.17), P((pS - pG) * 0.17), ''],
    [1, '매출총이익',    bG,               pG,               ''],
    [1, '판매관리비',    bG - bO,          pG - pO,          ''],
    [2, '　인건비',      P((bG - bO) * 0.42), P((pG - pO) * 0.42), ''],
    [2, '　판매촉진비',  P((bG - bO) * 0.19), P((pG - pO) * 0.20), '광고·판촉'],
    [2, '　물류비',      P((bG - bO) * 0.14), P((pG - pO) * 0.13), '운반·보관'],
    [2, '　기타판관비',  P((bG - bO) * 0.25), P((pG - pO) * 0.25), ''],
    [1, '영업이익',      bO,               pO,               ''],
    [1, '영업외손익',    P(-bS * 0.010),   P(-pS * 0.009),   '금융비용 등']
  ]);

  /* ⑥ 전제조건 */
  var shAs = clear(SH.assum, true);
  shAs.getRange(2, 1, 12, 6).setValues([
    ['거시', '원/달러 환율',     '원',   1440,  1400, '연평균 가정'],
    ['거시', '기준금리',         '%',    2.75,  2.50, '연말 기준'],
    ['거시', '소비자물가 상승률','%',    2.10,  1.90, ''],
    ['원자재', '구리',           '$/톤', 9800,  9500, 'LME 연평균'],
    ['원자재', '아연',           '$/톤', 2850,  2800, 'LME 연평균'],
    ['원자재', '원자재 투입가',  '%',    3.20, -1.50, '전년 대비 변동'],
    ['시장', '주택 착공',        '천호',  272,   295, '국토부 기준'],
    ['시장', '분양 물량',        '천호',  198,   215, ''],
    ['시장', '미분양',           '천호',   66,    58, '연말 잔량'],
    ['영업', '판가 인상률',      '%',    1.50,  2.50, '평균'],
    ['영업', 'B2B 비중',         '%',      58,    60, '매출 기준'],
    ['인사', '임금 인상률',      '%',    3.50,  3.20, '']
  ]);

  /* ⑦ 추진과제 */
  var shTk = clear(SH.task, true);
  shTk.getRange(2, 1, 10, 8).setValues([
    ['영업', 'B2B 대형 건설사 신규 채널 확보', '신규 수주액', '18,000백만', '영업본부', '1Q~4Q', 1800, '상위 5개사 우선'],
    ['영업', '리모델링 B2C 온라인 판매 확대',  '온라인 매출', '전년比 +25%', '마케팅팀', '1Q~4Q', 900, '자사몰·오픈마켓'],
    ['생산', '창원공장 수율 개선',             '불량률',      '3.2% → 2.4%', '생산본부', '1Q~3Q', 620, '설비 자동화 연계'],
    ['생산', '제천공장 라인 자동화 투자',      '인당 생산성', '+12%',        '생산본부', '2Q~4Q', 780, 'CAPEX 4,200 연계'],
    ['구매', '원자재 통합구매·이원화',         '재료비율',    '-1.2%p',      '구매팀',   '1Q~2Q', 1100, '중국·베트남 이원화'],
    ['개발', '스마트 비데 신제품 출시',        '신제품 매출', '4,500백만',   '개발본부', '2Q 출시', 450, 'IoT 연동'],
    ['개발', '절수 1등급 양변기 라인업 확대',  '인증 품목수', '6종 → 10종',  '개발본부', '1Q~4Q', 380, '환경표지 연계'],
    ['물류', '수도권 물류센터 재편',           '물류비율',    '-0.5%p',      '물류팀',   '2Q~3Q', 340, '3PL 재계약'],
    ['재무', '운전자본 회전 개선',             '재고회전일',  '62일 → 54일', '재무팀',   '1Q~4Q', 0, '현금흐름 개선'],
    ['ESG',  '탄소배출 저감 설비 도입',        'Scope1 배출', '-8%',         '경영지원', '3Q~4Q', 0, '규제 대응']
  ]);

  /* ⑧ 투자계획 */
  var shCx = clear(SH.capex, true);
  shCx.getRange(2, 1, 8, 6).setValues([
    ['생산설비', '제천공장 성형라인 자동화',   4200, '2Q~4Q', '생산성 +12%', '핵심 투자'],
    ['생산설비', '창원공장 소성로 교체',       2600, '1Q~2Q', '에너지 절감', ''],
    ['생산설비', '수전 가공라인 증설',         1800, '3Q',    'CAPA +15%',  ''],
    ['금형',     '신제품 금형 제작',           1500, '1Q~4Q', '신제품 8종', ''],
    ['IT',       'ERP 고도화 / MES 연계',       900, '2Q~3Q', '실시간 원가', ''],
    ['물류',     '수도권 물류센터 설비',        700, '2Q',    '물류비 절감', ''],
    ['안전환경', '집진·폐수 설비 보강',         600, '3Q',    '규제 대응',  '법정 의무'],
    ['기타',     '사무환경·전산 교체',          400, '연중',  '-',          '']
  ]);

  /* ⑨ 인원계획 */
  var shHc = clear(SH.hc, true);
  shHc.getRange(2, 1, 7, 4).setValues([
    ['생산',     412, 424, '자동화 반영, 증원 최소화'],
    ['영업',      96, 106, 'B2B 채널 확대'],
    ['마케팅',    24,  28, '온라인 강화'],
    ['개발',      38,  44, '신제품 라인업'],
    ['구매·물류', 31,  32, ''],
    ['경영지원',  46,  46, '동결'],
    ['기타',      16,  16, '']
  ]);

  /* ⑩ 시나리오 */
  var shSc = clear(SH.scen, true);
  shSc.getRange(2, 1, 3, 6).setValues([
    ['Base', pS,               pG,               pO,               60, '주택 착공 295천호, 환율 1,400원, 판가 +2.5%'],
    ['Best', P(pS * 1.07),     P(pG * 1.12),     P(pO * 1.35),     20, '착공 회복 320천호, 원자재 -4%, B2B 조기 수주'],
    ['Worst', P(pS * 0.92),    P(pG * 0.86),     P(pO * 0.52),     20, '착공 260천호, 환율 1,480원, 판가 인상 불발']
  ]);

  /* ⑪ 직원 (접근 게이트용 샘플) */
  var shEm = clear(SH.emp, true);
  shEm.getRange(2, 1, 3, 4).setValues([
    ['기획팀', '1001', '홍길동', 'Y'],
    ['기획팀', '1002', '김철수', 'Y'],
    ['기획팀', '1003', '이영희', 'Y']
  ]);

  Logger.log('데모 데이터 채움 완료');
}
