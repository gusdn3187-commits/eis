/**
 * 규제 대응 모니터링 시스템 — 설정
 *
 * 이 파일은 상수와 API 키 관리만 담당합니다.
 * 키는 절대 이 파일에 직접 쓰지 마세요. 스크립트 속성에 저장합니다.
 */

// ─────────────────────────────────────────────
// 시트 이름
// ─────────────────────────────────────────────
const 시트 = {
  회사프로파일: '회사프로파일',
  규제대장:   '규제대장',
  감지로그:   '감지로그',
  점검결과:   '점검결과',
};

// ─────────────────────────────────────────────
// API 엔드포인트
// ─────────────────────────────────────────────
const API = {
  DART_고유번호:  'https://opendart.fss.or.kr/api/corpCode.xml',
  DART_기업개황:  'https://opendart.fss.or.kr/api/company.json',
  DART_주요계정:  'https://opendart.fss.or.kr/api/fnlttSinglAcnt.json',
  DART_공시목록:  'https://opendart.fss.or.kr/api/list.json',
  법제처_목록:    'https://www.law.go.kr/DRF/lawSearch.do',
  법제처_본문:    'https://www.law.go.kr/DRF/lawService.do',
  네이버_뉴스:    'https://openapi.naver.com/v1/search/news.json',
};

// 브라우저처럼 보이는 UA. 일부 국내 사이트가 기본 UA를 차단합니다.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────
// 키 관리
// ─────────────────────────────────────────────

/**
 * ⚠️ 최초 1회만 실행하세요.
 * 아래 값을 채운 뒤 이 함수를 실행하면 스크립트 속성에 저장됩니다.
 * 저장 후에는 이 함수의 값을 다시 지우고 저장하세요 (코드에 키가 남지 않도록).
 */
function 키_최초설정() {
  const 키목록 = {
    DART_KEY:           '',   // OpenDART 40자리 인증키
    LAW_OC:             '',   // 법제처 OPEN API 인증키(OC) — 승인 후 입력
    NAVER_CLIENT_ID:    '',   // (선택) 네이버 검색 API
    NAVER_CLIENT_SECRET:'',   // (선택)
    종목코드:            '',   // 우리 회사 6자리 종목코드 (예: '005930')
  };

  const 속성 = PropertiesService.getScriptProperties();
  let 저장수 = 0;
  for (const [k, v] of Object.entries(키목록)) {
    if (v && String(v).trim()) {
      속성.setProperty(k, String(v).trim());
      저장수++;
    }
  }
  const 메시지 = 저장수 + '개 저장 완료. 코드에서 값을 지우고 다시 저장하세요.';
  Logger.log(메시지);
  return 메시지;
}

/** 저장된 키를 읽습니다. 없으면 예외를 던집니다. */
function 키(이름) {
  const v = PropertiesService.getScriptProperties().getProperty(이름);
  if (!v) throw new Error(`[${이름}] 이(가) 스크립트 속성에 없습니다. 키_최초설정()을 먼저 실행하세요.`);
  return v;
}

/** 저장된 키를 읽되, 없으면 null을 반환합니다 (선택 항목용). */
function 키_선택(이름) {
  return PropertiesService.getScriptProperties().getProperty(이름) || null;
}

/** 어떤 키가 저장돼 있는지 확인 (값은 마스킹). */
function 키_확인() {
  const 속성 = PropertiesService.getScriptProperties().getProperties();
  const 결과 = Object.keys(속성).sort().map(k => {
    const v = 속성[k];
    const 마스킹 = v.length > 8 ? v.slice(0, 4) + '…' + v.slice(-2) : '****';
    return `${k} = ${마스킹} (${v.length}자)`;
  });
  const 출력 = 결과.length ? 결과.join('\n') : '저장된 키가 없습니다.';
  Logger.log(출력);
  return 출력;
}

// ─────────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────────

/** 시트를 가져오되 없으면 만듭니다. */
function 시트가져오기(이름, 헤더) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(이름);
  if (!sh) {
    sh = ss.insertSheet(이름);
    if (헤더 && 헤더.length) {
      sh.getRange(1, 1, 1, 헤더.length).setValues([헤더])
        .setFontWeight('bold').setBackground('#e8eaed');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/** JSON API를 호출하고 파싱합니다. */
function JSON호출(url, 옵션) {
  const res = UrlFetchApp.fetch(url, Object.assign({
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'User-Agent': UA },
  }, 옵션 || {}));

  const 코드 = res.getResponseCode();
  const 본문 = res.getContentText();
  if (코드 !== 200) throw new Error(`HTTP ${코드}: ${본문.slice(0, 300)}`);

  try {
    return JSON.parse(본문);
  } catch (e) {
    throw new Error(`JSON 파싱 실패 (HTTP ${코드}): ${본문.slice(0, 300)}`);
  }
}

/** 숫자 문자열(콤마 포함)을 숫자로. 실패 시 null. */
function 숫자로(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
}

/** 억원 단위로 읽기 쉽게 포맷. */
function 억원(원) {
  if (원 === null || 원 === undefined) return '-';
  return (원 / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '억원';
}

/** 스프레드시트 상단에 커스텀 메뉴를 답니다. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('규제 모니터링')
    .addItem('① 도달성 점검', '도달성점검')
    .addItem('② 키 검증', '키검증')
    .addSeparator()
    .addItem('③ 회사 규제 프로파일 수집', '회사프로파일_수집')
    .addItem('④ 규제 적용 판정', '규제판정_실행')
    .addSeparator()
    .addItem('저장된 키 확인', '키_확인')
    .addToUi();
}
