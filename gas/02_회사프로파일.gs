/**
 * 규제 대응 모니터링 시스템 — 회사 규제 프로파일
 *
 * 규제 적용 판정은 대부분 "임계값 대조"입니다.
 *   예) 자산총액 2조원 이상 → 감사위원회 의무 설치
 * 따라서 우리 회사의 임계값 관련 수치를 정확히 아는 것이 판정의 전제입니다.
 *
 * 이 파일은 DART OpenAPI로 그 수치를 자동 수집합니다.
 * 자동으로 못 채우는 항목(지주회사 여부 등)은 시트에서 직접 입력하세요.
 */

/**
 * ③ 회사 규제 프로파일 수집
 * 종목코드 → 고유번호 → 기업개황 + 재무 → 프로파일 시트
 */
function 회사프로파일_수집() {
  const 종목코드 = 키('종목코드').replace(/\D/g, '').padStart(6, '0');
  const dartKey = 키('DART_KEY');

  Logger.log('종목코드 %s 프로파일 수집 시작', 종목코드);

  const corpCode = 고유번호_찾기(종목코드);
  const 개황 = 기업개황_조회(corpCode);
  const 재무 = 자산총액_조회(corpCode);

  const 시장명 = { Y: '유가증권(코스피)', K: '코스닥', N: '코넥스', E: '기타' };

  // [자동] = DART에서 채움, [수동] = 직접 입력 필요
  const 항목 = [
    ['회사명',            개황.corp_name,                              '자동', 'DART 기업개황'],
    ['종목코드',          종목코드,                                     '자동', ''],
    ['DART 고유번호',     corpCode,                                     '자동', '이후 모든 DART 호출에 사용'],
    ['시장구분',          시장명[개황.corp_cls] || 개황.corp_cls || '', '자동', '상장회사 특례 적용 여부'],
    ['업종코드',          개황.induty_code || '',                       '자동', '업종별 개별 규제 판정용'],
    ['결산월',            (개황.acc_mt || '') + '월',                   '자동', '사업연도 종료일 — 기한 역산의 기준'],
    ['대표자',            개황.ceo_nm || '',                            '자동', ''],
    ['법인등록번호',      개황.jurir_no || '',                          '자동', ''],
    ['자산총액(별도)',    재무.별도,                                    '자동', `${재무.기준연도}년 사업보고서 · 상법 임계값의 기준`],
    ['자산총액(연결)',    재무.연결,                                    '자동', `${재무.기준연도}년 사업보고서 · 외감법 연결 임계값의 기준`],
    ['자본총계(별도)',    재무.자본,                                    '자동', ''],
    ['재무 기준연도',     재무.기준연도,                                '자동', '최근 확정 사업연도'],
    ['—— 아래는 직접 입력 ——', '', '', ''],
    ['지주회사 여부',      '',  '수동', 'Y / N — 공정거래법 지주회사 규제'],
    ['공시대상기업집단',   '',  '수동', 'Y / N — 자산 5조원 이상 기업집단 소속'],
    ['상호출자제한기업집단', '', '수동', 'Y / N — 자산 10조원 이상'],
    ['감사위원회 설치',    '',  '수동', 'Y / N — 현재 상태'],
    ['상근감사 선임',      '',  '수동', 'Y / N — 현재 상태'],
    ['사외이사 수',        '',  '수동', '현재 인원'],
    ['전체 이사 수',       '',  '수동', '현재 인원'],
    ['여성 이사 유무',     '',  '수동', 'Y / N'],
    ['연결대상 종속회사 수', '', '수동', '연결 내부회계 범위 산정'],
    ['정기주총 개최월',    '',  '수동', '통상 3월 — 기한 역산에 사용'],
  ];

  const 헤더 = ['항목', '값', '출처', '비고'];
  const sh = 시트가져오기(시트.회사프로파일, 헤더);

  // 기존 수동 입력값은 보존하고 자동 항목만 갱신합니다.
  const 기존 = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
      .forEach(([k, v]) => { if (k) 기존[k] = v; });
  }
  항목.forEach(r => {
    if (r[2] === '수동' && 기존[r[0]] !== undefined && 기존[r[0]] !== '') r[1] = 기존[r[0]];
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 헤더.length).clearContent();
  sh.getRange(2, 1, 항목.length, 헤더.length).setValues(항목);
  sh.autoResizeColumns(1, 헤더.length);

  const 요약 = [
    개황.corp_name + ' (' + 종목코드 + ')',
    '시장: ' + (시장명[개황.corp_cls] || '-'),
    '자산총액(별도): ' + 억원(재무.별도),
    '자산총액(연결): ' + 억원(재무.연결),
    '기준: ' + 재무.기준연도 + '년 사업보고서',
    '',
    '[수동] 표시 항목을 직접 채운 뒤 ④ 규제 적용 판정을 실행하세요.',
  ].join('\n');

  Logger.log(요약);
  try { SpreadsheetApp.getUi().alert('회사 규제 프로파일 수집 완료\n\n' + 요약); } catch (e) {}
  return 요약;
}

/**
 * 종목코드로 DART 고유번호(corp_code)를 찾습니다.
 *
 * DART는 종목코드로 직접 조회하는 API가 없어, 전체 회사 목록(ZIP)을 받아 찾아야 합니다.
 * 파일이 크므로 한 번 찾으면 스크립트 속성에 캐시하고 다시 받지 않습니다.
 */
function 고유번호_찾기(종목코드) {
  const 속성 = PropertiesService.getScriptProperties();
  const 캐시키 = 'CORP_CODE_' + 종목코드;
  const 캐시 = 속성.getProperty(캐시키);
  if (캐시) {
    Logger.log('고유번호 캐시 사용: %s', 캐시);
    return 캐시;
  }

  Logger.log('DART 전체 회사목록 다운로드 중… (최초 1회, 시간이 걸립니다)');
  const res = UrlFetchApp.fetch(`${API.DART_고유번호}?crtfc_key=${키('DART_KEY')}`, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': UA },
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('회사목록 다운로드 실패: HTTP ' + res.getResponseCode());
  }

  let xml;
  try {
    const blob = res.getBlob().setContentType('application/zip');
    const 파일들 = Utilities.unzip(blob);
    xml = 파일들[0].getDataAsString('UTF-8');
  } catch (e) {
    throw new Error(
      '회사목록 압축 해제 실패입니다. 파일이 커서 Apps Script 한도를 넘었을 수 있습니다.\n' +
      '수동 대안: DART 사이트에서 회사 고유번호(8자리)를 확인한 뒤\n' +
      `스크립트 속성에 [${캐시키}] = (8자리 고유번호) 로 직접 저장하세요.\n원인: ${e}`
    );
  }

  // 전체 XML을 파싱하면 무겁습니다. 해당 종목코드 블록만 잘라냅니다.
  const 표식 = `<stock_code>${종목코드}</stock_code>`;
  const 위치 = xml.indexOf(표식);
  if (위치 < 0) {
    throw new Error(`종목코드 ${종목코드} 를 DART 회사목록에서 찾지 못했습니다. 코드를 확인하세요.`);
  }
  const 시작 = xml.lastIndexOf('<list>', 위치);
  const 끝   = xml.indexOf('</list>', 위치);
  const 블록 = xml.slice(시작, 끝);
  const m = 블록.match(/<corp_code>\s*(\d+)\s*<\/corp_code>/);
  if (!m) throw new Error('고유번호 추출 실패: ' + 블록.slice(0, 200));

  const corpCode = m[1].trim();
  속성.setProperty(캐시키, corpCode);
  Logger.log('고유번호 확보: %s', corpCode);
  return corpCode;
}

/** DART 기업개황 조회 */
function 기업개황_조회(corpCode) {
  const j = JSON호출(`${API.DART_기업개황}?crtfc_key=${키('DART_KEY')}&corp_code=${corpCode}`);
  if (j.status !== '000') throw new Error('기업개황 조회 실패: ' + DART상태_(j.status) + ' / ' + j.message);
  return j;
}

/**
 * 최근 사업연도 자산총액을 별도·연결 각각 조회합니다.
 * 사업보고서(reprt_code=11011) 기준. 당해 연도 데이터가 없으면 한 해씩 거슬러 올라갑니다.
 */
function 자산총액_조회(corpCode) {
  const 올해 = Number(Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy'));

  for (let 연도 = 올해 - 1; 연도 >= 올해 - 3; 연도--) {
    const j = JSON호출(
      `${API.DART_주요계정}?crtfc_key=${키('DART_KEY')}&corp_code=${corpCode}` +
      `&bsns_year=${연도}&reprt_code=11011`
    );
    if (j.status === '013' || !j.list || !j.list.length) continue;   // 해당 연도 데이터 없음
    if (j.status !== '000') throw new Error('재무 조회 실패: ' + DART상태_(j.status));

    const 찾기 = (계정, 구분) => {
      const row = j.list.find(r =>
        String(r.sj_div) === 'BS' &&
        String(r.account_nm).replace(/\s/g, '').indexOf(계정) >= 0 &&
        String(r.fs_div) === 구분
      );
      return row ? 숫자로(row.thstrm_amount) : null;
    };

    return {
      기준연도: 연도,
      별도: 찾기('자산총계', 'OFS'),
      연결: 찾기('자산총계', 'CFS'),
      자본: 찾기('자본총계', 'OFS'),
    };
  }

  throw new Error('최근 3개 사업연도에서 재무 데이터를 찾지 못했습니다. DART에서 사업보고서 제출 여부를 확인하세요.');
}

/** 프로파일 시트를 객체로 읽어옵니다. 규제 판정에서 사용합니다. */
function 프로파일_읽기() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(시트.회사프로파일);
  if (!sh || sh.getLastRow() < 2) {
    throw new Error('회사프로파일 시트가 비어 있습니다. ③ 회사 규제 프로파일 수집을 먼저 실행하세요.');
  }
  const p = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(([k, v]) => {
    if (k && String(k).indexOf('——') < 0) p[String(k).trim()] = v;
  });
  return p;
}
