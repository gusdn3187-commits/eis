/**
 * 규제 대응 모니터링 시스템 — 사전 점검
 *
 * 본 개발 전에 두 가지를 확인합니다.
 *  1) 구글 서버(UrlFetchApp)에서 각 소스에 도달 가능한가
 *  2) 발급받은 키가 실제로 작동하는가
 *
 * 특히 1번은 아키텍처를 결정합니다.
 * 상장협·금감원이 구글 IP를 막으면 스크래핑 계층을 다른 곳에 둬야 합니다.
 */

/**
 * ① 도달성 점검
 * 각 소스에 HTTP 요청을 보내 응답코드와 인코딩을 확인합니다.
 * 결과는 로그와 '점검결과' 시트에 함께 기록됩니다.
 */
function 도달성점검() {
  const 대상 = [
    { 이름: 'DART API',    url: API.DART_공시목록 + '?crtfc_key=TEST&bgn_de=20260801', 용도: '공시·재무', 필수: true },
    { 이름: '법제처 API',  url: API.법제처_목록 + '?OC=test&target=law&type=JSON&query=상법', 용도: '법령 감지', 필수: true },
    { 이름: '금융위',      url: 'https://www.fsc.go.kr/ut060101', 용도: '보도자료 RSS', 필수: true },
    { 이름: '금감원',      url: 'https://www.fss.or.kr/fss/bbs/B0000188/list.do?menuNo=200218', 용도: '보도자료(스크래핑)', 필수: false },
    { 이름: '상장협',      url: 'https://www.klca.or.kr/sub/comm/notice.asp?rWork=TblList', 용도: '공지(스크래핑)', 필수: false },
    { 이름: 'KIND',        url: 'https://kind.krx.co.kr/', 용도: '거래소 규정(스크래핑)', 필수: false },
  ];

  const 헤더 = ['점검시각', '소스', '용도', '필수', 'HTTP', '크기(byte)', '권장인코딩', '미리보기', '판정'];
  const sh = 시트가져오기(시트.점검결과, 헤더);
  const 시각 = new Date();
  const 행들 = [];

  대상.forEach(t => {
    let 행;
    try {
      const res = UrlFetchApp.fetch(t.url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': UA },
      });
      const 코드 = res.getResponseCode();
      const utf8  = res.getContentText();
      let euckr = '';
      try { euckr = res.getContentText('EUC-KR'); } catch (e) { euckr = ''; }

      // 한글이 안 깨진 쪽을 권장 인코딩으로 판단
      const 인코딩 = 인코딩판정_(utf8, euckr);
      const 미리보기 = (인코딩 === 'EUC-KR' ? euckr : utf8).slice(0, 120).replace(/\s+/g, ' ');
      const 판정 = 코드 === 200 ? '✅ 도달' : (코드 === 403 || 코드 === 401 ? '⛔ 차단 의심' : `⚠️ HTTP ${코드}`);

      행 = [시각, t.이름, t.용도, t.필수 ? '필수' : '선택', 코드, utf8.length, 인코딩, 미리보기, 판정];
    } catch (e) {
      행 = [시각, t.이름, t.용도, t.필수 ? '필수' : '선택', '-', 0, '-', String(e).slice(0, 120), '❌ 실패'];
    }
    행들.push(행);
    Logger.log('%s | %s | %s', 행[1], 행[8], 행[7]);
  });

  sh.getRange(sh.getLastRow() + 1, 1, 행들.length, 헤더.length).setValues(행들);
  sh.autoResizeColumns(1, 헤더.length);

  const 요약 = 행들.filter(r => String(r[8]).startsWith('✅')).length + '/' + 행들.length + ' 도달';
  Logger.log('=== 점검 완료: ' + 요약 + ' ===');
  try { SpreadsheetApp.getUi().alert('도달성 점검 완료\n\n' + 요약 + '\n\n자세한 내용은 [점검결과] 시트를 보세요.'); } catch (e) {}
  return 요약;
}

/**
 * UTF-8 / EUC-KR 중 한글이 덜 깨진 쪽을 고릅니다.
 * 구형 ASP 사이트(상장협 등)는 EUC-KR인 경우가 많습니다.
 */
function 인코딩판정_(utf8, euckr) {
  const 한글수 = s => (s.match(/[가-힣]/g) || []).length;
  const 깨짐수 = s => (s.match(/�/g) || []).length;
  const u = 한글수(utf8) - 깨짐수(utf8) * 2;
  const e = 한글수(euckr) - 깨짐수(euckr) * 2;
  if (u <= 0 && e <= 0) return 'UTF-8';   // 한글 없음(JSON/XML 등) → 기본값
  return e > u ? 'EUC-KR' : 'UTF-8';
}

/**
 * ② 키 검증
 * 저장된 키가 실제로 통하는지 각 API에 한 번씩 호출해 확인합니다.
 */
function 키검증() {
  const 결과 = [];

  // ── DART
  const dartKey = 키_선택('DART_KEY');
  if (!dartKey) {
    결과.push('DART       : ⏳ 키 미설정');
  } else {
    try {
      const j = JSON호출(`${API.DART_공시목록}?crtfc_key=${dartKey}` +
                        `&bgn_de=${날짜문자열_(-7)}&end_de=${날짜문자열_(0)}&page_count=1`);
      결과.push(`DART       : ${DART상태_(j.status)}`);
    } catch (e) {
      결과.push('DART       : ❌ ' + String(e).slice(0, 100));
    }
  }

  // ── 법제처
  const oc = 키_선택('LAW_OC');
  if (!oc) {
    결과.push('법제처      : ⏳ OC 미설정 (승인 대기 중이면 정상)');
  } else {
    // OC 형식이 API마다 다를 수 있어 두 가지를 모두 시도합니다.
    const 후보 = [oc, oc.split('@')[0]].filter((v, i, a) => a.indexOf(v) === i);
    let 성공 = null;
    후보.forEach(c => {
      if (성공) return;
      try {
        const j = JSON호출(`${API.법제처_목록}?OC=${encodeURIComponent(c)}&target=law&type=JSON&query=${encodeURIComponent('상법')}`);
        if (j && (j.LawSearch || j.lawSearch)) 성공 = c;
      } catch (e) { /* 다음 후보 시도 */ }
    });
    결과.push(성공
      ? `법제처      : ✅ 정상 (OC 형식: "${성공}")`
      : '법제처      : ❌ 두 형식 모두 실패 — 승인 여부와 OC 값을 확인하세요');
    if (성공 && 성공 !== oc) {
      PropertiesService.getScriptProperties().setProperty('LAW_OC', 성공);
      결과.push('             ↳ 통하는 형식으로 자동 교정 저장했습니다');
    }
  }

  // ── 네이버 (선택)
  const nid = 키_선택('NAVER_CLIENT_ID');
  const nsec = 키_선택('NAVER_CLIENT_SECRET');
  if (!nid || !nsec) {
    결과.push('네이버      : ⏳ 미설정 (선택 항목)');
  } else {
    try {
      JSON호출(`${API.네이버_뉴스}?query=${encodeURIComponent('자본시장법')}&display=1`, {
        headers: { 'X-Naver-Client-Id': nid, 'X-Naver-Client-Secret': nsec, 'User-Agent': UA },
      });
      결과.push('네이버      : ✅ 정상');
    } catch (e) {
      결과.push('네이버      : ❌ ' + String(e).slice(0, 100));
    }
  }

  const 출력 = 결과.join('\n');
  Logger.log(출력);
  try { SpreadsheetApp.getUi().alert('키 검증 결과\n\n' + 출력); } catch (e) {}
  return 출력;
}

/** DART status 코드를 사람이 읽는 문장으로. */
function DART상태_(status) {
  const 표 = {
    '000': '✅ 정상',
    '010': '❌ 등록되지 않은 키',
    '011': '❌ 사용할 수 없는 키 (발급 직후면 잠시 후 재시도)',
    '012': '❌ 접근할 수 없는 IP',
    '013': '✅ 키 정상 (해당 기간 조회 데이터 없음)',
    '020': '❌ 요청 제한 초과 (하루 20,000회)',
    '100': '❌ 필드 부적절',
    '800': '⚠️ 시스템 점검 중',
    '900': '❌ 정의되지 않은 오류',
    '901': '❌ 사용자 계정 위험 — DART에서 계정 상태 확인 필요',
  };
  return 표[status] || `⚠️ 알 수 없는 status: ${status}`;
}

/** 오늘로부터 n일 전/후 날짜를 YYYYMMDD로. */
function 날짜문자열_(n) {
  const d = new Date();
  d.setDate(d.getDate() + (n || 0));
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyyMMdd');
}
