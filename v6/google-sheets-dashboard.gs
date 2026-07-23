const DASH_APP_VERSION = 'v6';
const DASH_PARTICIPANTS_SHEET = 'participants';
const DASH_EVENTS_SHEET = 'events';
const DASH_OVERVIEW_SHEET = 'v6 대시보드';
const DASH_USERS_SHEET = 'v6 사용자별 행동';
const DASH_REFRESH_HANDLER = 'refreshDashboard';
const DASH_TIME_ZONE = 'Asia/Seoul';
const DASH_SPREADSHEET_ID_KEY = 'budget_book_v6_dashboard_spreadsheet_id';
const DASH_EXCLUDED_PARTICIPANT_IDS = new Set([
  '37006750-32f7-4585-aaaa-36b92ef4403f',
  'c22c730c-8e41-4838-a1d0-478c957d313a',
  'dddf5c7c-72d3-4a98-be55-da31f4c9ee80',
]);

const DASH_COLORS = {
  ink: '#20242C',
  sub: '#666B73',
  faint: '#92969D',
  line: '#E9E5DD',
  orange: '#F28A43',
  orangeSoft: '#FFF2E8',
  green: '#397B63',
  greenSoft: '#EAF5EF',
  blue: '#54728F',
  blueSoft: '#EDF4F8',
  amber: '#A87821',
  amberSoft: '#FFF7E5',
  purple: '#75648F',
  purpleSoft: '#F3EFF8',
  red: '#A45353',
  redSoft: '#FBEFEF',
  white: '#FFFFFF',
};

const DASH_EVENT_LABELS = {
  page_viewed: '앱 방문',
  participant_registered: '참여 등록',
  tutorial_started: '튜토리얼 시작',
  tutorial_completed: '튜토리얼 완료',
  tutorial_skipped: '튜토리얼 건너뜀',
  challenge_started: '챌린지 시작',
  challenge_restarted: '챌린지 재시작',
  budget_created: '최초 예산 설정',
  budget_updated: '예산 변경',
  challenge_day_completed: '하루 마감',
  challenge_day_reopened: '마감 취소',
  challenge_completed: '5일 완주',
  challenge_period_ended: '5일 기간 종료',
  transaction_form_opened: '거래 입력 열기',
  transaction_form_cancelled: '거래 입력 취소',
  transaction_created: '거래 생성',
  transaction_updated: '거래 수정',
  transaction_deleted: '거래 삭제',
  record_tab_viewed: '기록 탭 조회',
  pending_days_viewed: '미마감일 조회',
  app_data_reset: '챌린지 초기화',
  data_imported: '데이터 복원',
  app_error_occurred: '앱 오류',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('v6 대시보드')
    .addItem('지금 새로고침', 'refreshDashboard')
    .addSeparator()
    .addItem('1시간 자동 새로고침 켜기', 'installDashboardHourlyRefresh')
    .addItem('자동 새로고침 끄기', 'removeDashboardRefresh')
    .addToUi();
}

function setupDashboard() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Google Sheet에 연결된 Apps Script에서 실행해 주세요.');
  PropertiesService.getScriptProperties().setProperty(DASH_SPREADSHEET_ID_KEY, spreadsheet.getId());
  refreshDashboard();
  spreadsheet.toast(
    '대시보드와 사용자별 행동 시트를 만들었어요.',
    'Budget Book v6',
    5
  );
}

function refreshDashboard() {
  const spreadsheet = dashGetSpreadsheet_();
  spreadsheet.setSpreadsheetTimeZone(DASH_TIME_ZONE);

  const participantsSheet = spreadsheet.getSheetByName(DASH_PARTICIPANTS_SHEET);
  const eventsSheet = spreadsheet.getSheetByName(DASH_EVENTS_SHEET);
  if (!participantsSheet || !eventsSheet) {
    throw new Error('participants와 events 시트가 필요합니다. 먼저 로그 수집 setup()을 실행해 주세요.');
  }

  const participantRows = dashReadObjects_(participantsSheet);
  const eventRows = dashReadObjects_(eventsSheet);
  const model = dashBuildModel_(participantRows, eventRows);

  const overviewSheet = dashResetGeneratedSheet_(spreadsheet, DASH_OVERVIEW_SHEET, 80, 12);
  const usersSheet = dashResetGeneratedSheet_(spreadsheet, DASH_USERS_SHEET, Math.max(100, model.userRows.length + 10), 16);
  dashRenderOverview_(overviewSheet, model);
  dashRenderUsers_(usersSheet, model);
  SpreadsheetApp.flush();
}

function installDashboardHourlyRefresh() {
  const spreadsheet = dashGetSpreadsheet_();
  PropertiesService.getScriptProperties().setProperty(DASH_SPREADSHEET_ID_KEY, spreadsheet.getId());
  dashRemoveRefreshTriggers_();
  ScriptApp.newTrigger(DASH_REFRESH_HANDLER)
    .timeBased()
    .everyHours(1)
    .create();
  spreadsheet.toast(
    '1시간마다 대시보드를 자동으로 새로고침합니다.',
    'Budget Book v6',
    5
  );
}

function removeDashboardRefresh() {
  const removed = dashRemoveRefreshTriggers_();
  dashGetSpreadsheet_().toast(
    removed ? '자동 새로고침을 껐어요.' : '설치된 자동 새로고침이 없어요.',
    'Budget Book v6',
    5
  );
}

function dashGetSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(DASH_SPREADSHEET_ID_KEY);
  if (!spreadsheetId) throw new Error('setupDashboard를 먼저 실행해 주세요.');
  return SpreadsheetApp.openById(spreadsheetId);
}

function dashRemoveRefreshTriggers_() {
  let removed = false;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === DASH_REFRESH_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed = true;
    }
  });
  return removed;
}

function dashReadObjects_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length || values[0].every(function (value) { return !value; })) return [];
  const headers = values[0].map(function (value) { return String(value).trim(); });
  return values.slice(1)
    .filter(function (row) { return row.some(function (value) { return value !== ''; }); })
    .map(function (row, rowIndex) {
      const object = { _row: rowIndex + 2 };
      headers.forEach(function (header, columnIndex) {
        object[header] = row[columnIndex] === undefined ? '' : row[columnIndex];
      });
      return object;
    });
}

function dashBuildModel_(participantRows, rawEventRows) {
  const excludedAnonymousIds = new Set();
  const excludedSessionIds = new Set();
  const excludedChallengeIds = new Set();
  rawEventRows.forEach(function (row) {
    const participantId = String(row.participant_id || '').trim();
    if (!DASH_EXCLUDED_PARTICIPANT_IDS.has(participantId)) return;
    const anonymousId = String(row.anonymous_id || '').trim();
    const sessionId = String(row.session_id || '').trim();
    const challengeId = String(row.challenge_id || '').trim();
    if (anonymousId) excludedAnonymousIds.add(anonymousId);
    if (sessionId) excludedSessionIds.add(sessionId);
    if (challengeId) excludedChallengeIds.add(challengeId);
  });

  const users = {};
  const challenges = {};
  const registeredIds = new Set();
  const pageViewAnonymousIds = new Set();
  const startedParticipantIds = new Set();
  const transactionParticipantIds = new Set();
  const closedParticipantIds = new Set();
  const completedParticipantIds = new Set();
  const startedChallengeIds = new Set();
  const completedChallengeIds = new Set();
  const eventCounts = {};
  const eventUsers = {};
  const daily = {};
  const transactionChallengesByDay = {};
  for (let day = 1; day <= 5; day++) transactionChallengesByDay[day] = new Set();

  function ensureUser(participantId) {
    if (!participantId) return null;
    if (!users[participantId]) {
      users[participantId] = {
        participantId: participantId,
        nickname: '',
        registeredAt: '',
        firstSeen: '',
        lastSeen: '',
        sessions: new Set(),
        challenges: new Set(),
        tutorial: '미시작',
        transactions: 0,
        transactionDays: new Set(),
        recordViews: 0,
        pendingViews: 0,
        lastEvent: '',
      };
    }
    return users[participantId];
  }

  function ensureChallenge(challengeId, participantId) {
    if (!challengeId) return null;
    if (!challenges[challengeId]) {
      challenges[challengeId] = {
        challengeId: challengeId,
        participantId: participantId || '',
        startedAt: '',
        startDate: '',
        lastAt: '',
        completed: false,
        periodEnded: false,
        transactions: 0,
        transactionDays: new Set(),
        dayStates: {},
      };
    }
    if (!challenges[challengeId].participantId && participantId) {
      challenges[challengeId].participantId = participantId;
    }
    return challenges[challengeId];
  }

  participantRows.forEach(function (row) {
    const participantId = String(row.participant_id || '').trim();
    if (!participantId || DASH_EXCLUDED_PARTICIPANT_IDS.has(participantId)) return;
    registeredIds.add(participantId);
    const user = ensureUser(participantId);
    user.nickname = String(row.nickname || '').trim();
    user.registeredAt = String(row.registered_at || '').trim();
    user.firstSeen = user.registeredAt;
  });

  const events = rawEventRows.map(function (row) {
    let properties = {};
    try {
      properties = row.properties_json ? JSON.parse(row.properties_json) : {};
    } catch (error) {
      properties = {};
    }
    return {
      row: row._row || 0,
      serverTimestamp: String(row.server_timestamp || ''),
      occurredAt: String(row.occurred_at || ''),
      eventName: String(row.event_name || ''),
      participantId: String(row.participant_id || '').trim(),
      anonymousId: String(row.anonymous_id || '').trim(),
      sessionId: String(row.session_id || '').trim(),
      challengeId: String(row.challenge_id || '').trim(),
      page: String(row.page || ''),
      appVersion: String(row.app_version || ''),
      properties: properties,
    };
  }).filter(function (event) {
    if (event.appVersion !== DASH_APP_VERSION || !event.eventName) return false;
    return !DASH_EXCLUDED_PARTICIPANT_IDS.has(event.participantId) &&
      !excludedAnonymousIds.has(event.anonymousId) &&
      !excludedSessionIds.has(event.sessionId) &&
      !excludedChallengeIds.has(event.challengeId);
  }).sort(function (a, b) {
    const timeCompare = a.occurredAt.localeCompare(b.occurredAt);
    return timeCompare || a.row - b.row;
  });

  events.forEach(function (event) {
    const eventName = event.eventName;
    const participantId = event.participantId;
    const personKey = participantId || (event.anonymousId ? 'anon:' + event.anonymousId : '');
    const eventDate = dashEventDate_(event);

    eventCounts[eventName] = (eventCounts[eventName] || 0) + 1;
    if (!eventUsers[eventName]) eventUsers[eventName] = new Set();
    if (personKey) eventUsers[eventName].add(personKey);
    if (eventName === 'page_viewed' && event.anonymousId) pageViewAnonymousIds.add(event.anonymousId);

    if (eventDate) {
      if (!daily[eventDate]) {
        daily[eventDate] = {
          people: new Set(),
          sessions: new Set(),
          transactions: 0,
          closes: 0,
          completions: 0,
        };
      }
      if (personKey) daily[eventDate].people.add(personKey);
      if (event.sessionId) daily[eventDate].sessions.add(event.sessionId);
      if (eventName === 'transaction_created') daily[eventDate].transactions++;
      if (eventName === 'challenge_day_completed') daily[eventDate].closes++;
      if (eventName === 'challenge_completed') daily[eventDate].completions++;
    }

    const user = ensureUser(participantId);
    if (user) {
      if (!user.firstSeen || event.occurredAt < user.firstSeen) user.firstSeen = event.occurredAt;
      if (!user.lastSeen || event.occurredAt >= user.lastSeen) {
        user.lastSeen = event.occurredAt;
        user.lastEvent = eventName;
      }
      if (event.sessionId) user.sessions.add(event.sessionId);
      if (event.challengeId) user.challenges.add(event.challengeId);

      if (eventName === 'participant_registered') {
        registeredIds.add(participantId);
        if (!user.nickname) user.nickname = String(event.properties.nickname || '');
        if (!user.registeredAt) user.registeredAt = event.occurredAt;
      } else if (eventName === 'tutorial_started') {
        user.tutorial = '진행 중';
      } else if (eventName === 'tutorial_completed') {
        user.tutorial = '완료';
      } else if (eventName === 'tutorial_skipped') {
        user.tutorial = '건너뜀';
      } else if (eventName === 'transaction_created') {
        user.transactions++;
        if (event.properties.transactionDate) user.transactionDays.add(event.properties.transactionDate);
      } else if (eventName === 'record_tab_viewed') {
        user.recordViews++;
      } else if (eventName === 'pending_days_viewed') {
        user.pendingViews++;
      }
    }

    const challenge = ensureChallenge(event.challengeId, participantId);
    if (challenge) {
      if (!challenge.lastAt || event.occurredAt >= challenge.lastAt) challenge.lastAt = event.occurredAt;

      if (eventName === 'challenge_started') {
        challenge.startedAt = event.occurredAt;
        challenge.startDate = String(event.properties.startDate || '');
        startedChallengeIds.add(event.challengeId);
        if (participantId) startedParticipantIds.add(participantId);
      } else if (eventName === 'transaction_created') {
        if (event.properties.isInChallenge !== false) {
          challenge.transactions++;
          if (event.properties.transactionDate) challenge.transactionDays.add(event.properties.transactionDate);
          const challengeDay = Number(event.properties.challengeDay);
          if (challengeDay >= 1 && challengeDay <= 5) {
            transactionChallengesByDay[challengeDay].add(event.challengeId);
          }
        }
      } else if (eventName === 'challenge_day_completed') {
        const challengeDay = Number(event.properties.challengeDay);
        if (challengeDay >= 1 && challengeDay <= 5) {
          challenge.dayStates[challengeDay] = {
            settled: true,
            result: String(event.properties.result || ''),
            occurredAt: event.occurredAt,
          };
        }
      } else if (eventName === 'challenge_day_reopened') {
        const challengeDay = Number(event.properties.challengeDay);
        if (challengeDay >= 1 && challengeDay <= 5) {
          challenge.dayStates[challengeDay] = {
            settled: false,
            result: '',
            occurredAt: event.occurredAt,
          };
        }
      } else if (eventName === 'challenge_completed') {
        challenge.completed = true;
        completedChallengeIds.add(event.challengeId);
        if (participantId) completedParticipantIds.add(participantId);
      } else if (eventName === 'challenge_period_ended') {
        challenge.periodEnded = true;
      }
    }

    if (eventName === 'transaction_created' && participantId) transactionParticipantIds.add(participantId);
    if (eventName === 'challenge_day_completed' && participantId) closedParticipantIds.add(participantId);
  });

  const challengeList = Object.keys(challenges).map(function (challengeId) {
    const challenge = challenges[challengeId];
    challenge.settledDays = 0;
    challenge.successfulDays = 0;
    for (let day = 1; day <= 5; day++) {
      const state = challenge.dayStates[day];
      if (state && state.settled) {
        challenge.settledDays++;
        if (state.result === 'success') challenge.successfulDays++;
      }
    }
    return challenge;
  });

  const returnParticipantIds = new Set();
  startedParticipantIds.forEach(function (participantId) {
    const user = users[participantId];
    if (user && user.sessions.size >= 2) returnParticipantIds.add(participantId);
  });

  const funnelStages = [
    ['앱 방문', pageViewAnonymousIds.size],
    ['참여 등록', registeredIds.size],
    ['챌린지 시작', startedParticipantIds.size],
    ['첫 거래 기록', transactionParticipantIds.size],
    ['하루 이상 마감', closedParticipantIds.size],
    ['재방문', returnParticipantIds.size],
    ['5일 완주', completedParticipantIds.size],
  ];
  const funnelRows = funnelStages.map(function (stage, index) {
    const previous = index === 0 ? stage[1] : funnelStages[index - 1][1];
    return [stage[0], stage[1], dashRate_(stage[1], previous)];
  });

  const dayRows = [];
  for (let day = 1; day <= 5; day++) {
    let settled = 0;
    let successful = 0;
    challengeList.forEach(function (challenge) {
      const state = challenge.dayStates[day];
      if (state && state.settled) {
        settled++;
        if (state.result === 'success') successful++;
      }
    });
    dayRows.push([
      'Day ' + day,
      transactionChallengesByDay[day].size,
      settled,
      successful,
      dashRate_(settled, startedChallengeIds.size),
    ]);
  }

  let dailyRows = Object.keys(daily).sort().map(function (date) {
    return [
      date,
      daily[date].people.size,
      daily[date].sessions.size,
      daily[date].transactions,
      daily[date].closes,
      daily[date].completions,
    ];
  });
  if (dailyRows.length > 14) dailyRows = dailyRows.slice(dailyRows.length - 14);
  if (!dailyRows.length) dailyRows = [['데이터 없음', 0, 0, 0, 0, 0]];

  const eventRows = Object.keys(eventCounts)
    .sort(function (a, b) { return eventCounts[b] - eventCounts[a] || a.localeCompare(b); })
    .slice(0, 12)
    .map(function (eventName) {
      return [
        DASH_EVENT_LABELS[eventName] || eventName,
        eventCounts[eventName],
        eventUsers[eventName] ? eventUsers[eventName].size : 0,
      ];
    });
  if (!eventRows.length) eventRows.push(['데이터 없음', 0, 0]);

  const userRows = Object.keys(users).map(function (participantId) {
    const user = users[participantId];
    const userChallenges = challengeList
      .filter(function (challenge) { return challenge.participantId === participantId; })
      .sort(function (a, b) {
        return (b.lastAt || b.startedAt).localeCompare(a.lastAt || a.startedAt);
      });
    const latest = userChallenges[0] || null;
    let status = '참여 등록';
    if (latest) {
      if (latest.completed) status = '5일 완주';
      else if (latest.periodEnded) status = '기간 종료 (' + latest.settledDays + '/5 마감)';
      else status = '진행 중 (' + latest.settledDays + '/5 마감)';
    } else if (user.tutorial === '완료' || user.tutorial === '건너뜀') {
      status = '챌린지 시작 전';
    } else if (user.tutorial === '진행 중') {
      status = '튜토리얼 진행 중';
    }
    const completedChallenges = userChallenges.filter(function (challenge) { return challenge.completed; }).length;
    return [
      user.nickname || '(닉네임 없음)',
      participantId,
      dashReadableTimestamp_(user.registeredAt || user.firstSeen),
      dashReadableTimestamp_(user.lastSeen || user.registeredAt),
      user.sessions.size,
      userChallenges.length,
      user.tutorial,
      user.transactions,
      user.transactionDays.size,
      latest ? latest.settledDays : 0,
      latest ? latest.successfulDays : 0,
      completedChallenges,
      user.recordViews,
      user.pendingViews,
      DASH_EVENT_LABELS[user.lastEvent] || user.lastEvent || '-',
      status,
    ];
  }).sort(function (a, b) {
    return String(b[3]).localeCompare(String(a[3])) || String(a[0]).localeCompare(String(b[0]));
  });

  return {
    generatedAt: new Date(),
    lastEventAt: events.length ? events[events.length - 1].occurredAt : '',
    totalEvents: events.length,
    metrics: {
      registeredParticipants: registeredIds.size,
      startedParticipants: startedParticipantIds.size,
      transactionParticipants: transactionParticipantIds.size,
      returnParticipants: returnParticipantIds.size,
      closedParticipants: closedParticipantIds.size,
      startedChallenges: startedChallengeIds.size,
      completedChallenges: completedChallengeIds.size,
    },
    funnelRows: funnelRows,
    dayRows: dayRows,
    dailyRows: dailyRows,
    eventRows: eventRows,
    userRows: userRows,
  };
}

function dashRenderOverview_(sheet, model) {
  const metrics = model.metrics;
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(3);
  sheet.setTabColor(DASH_COLORS.orange);
  sheet.getRange('A1:L80')
    .setBackground('#FCFBF8')
    .setFontFamily('Arial')
    .setFontColor(DASH_COLORS.ink);

  for (let column = 1; column <= 12; column++) sheet.setColumnWidth(column, 92);
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(5, 110);
  sheet.setColumnWidth(6, 110);

  sheet.getRange('A1:L2').merge()
    .setValue('Budget Book v6 사용자 테스트 대시보드')
    .setFontSize(22)
    .setFontWeight('bold')
    .setFontColor(DASH_COLORS.ink)
    .setVerticalAlignment('middle');
  sheet.getRange('A3:L3').merge()
    .setValue(
      '마지막 로그 ' + (dashReadableTimestamp_(model.lastEventAt) || '없음') +
      '  ·  새로고침 ' + Utilities.formatDate(model.generatedAt, DASH_TIME_ZONE, 'yyyy-MM-dd HH:mm:ss')
    )
    .setFontSize(10)
    .setFontColor(DASH_COLORS.faint);

  const cards = [
    ['등록 참여자', metrics.registeredParticipants, '테스트 참여 ID', DASH_COLORS.orangeSoft],
    ['챌린지 시작', metrics.startedParticipants, dashPercentText_(metrics.startedParticipants, metrics.registeredParticipants) + ' / 등록', DASH_COLORS.greenSoft],
    ['거래 기록', metrics.transactionParticipants, dashPercentText_(metrics.transactionParticipants, metrics.startedParticipants) + ' / 시작', DASH_COLORS.blueSoft],
    ['재방문', metrics.returnParticipants, dashPercentText_(metrics.returnParticipants, metrics.startedParticipants) + ' / 시작', DASH_COLORS.amberSoft],
    ['하루 이상 마감', metrics.closedParticipants, dashPercentText_(metrics.closedParticipants, metrics.startedParticipants) + ' / 시작', DASH_COLORS.purpleSoft],
    ['5일 완주', metrics.completedChallenges, dashPercentText_(metrics.completedChallenges, metrics.startedChallenges) + ' / 챌린지', DASH_COLORS.redSoft],
  ];
  cards.forEach(function (card, index) {
    dashWriteCard_(sheet, 5, index * 2 + 1, card[0], card[1], card[2], card[3]);
  });

  dashWriteSectionTitle_(sheet, 9, 1, 4, '참여 퍼널', '각 단계에 도달한 고유 참여자');
  const funnelRange = dashWriteTable_(
    sheet,
    11,
    1,
    [['단계', '사용자', '이전 단계 대비']].concat(model.funnelRows)
  );
  sheet.getRange(12, 3, model.funnelRows.length, 1).setNumberFormat('0.0%');
  if (model.funnelRows.some(function (row) { return Number(row[1]) > 0; })) {
    dashInsertChart_(
      sheet,
      Charts.ChartType.BAR,
      sheet.getRange(11, 1, model.funnelRows.length + 1, 2),
      9,
      5,
      {
        title: '퍼널 도달 사용자',
        width: 680,
        height: 280,
        colors: [DASH_COLORS.orange],
        legend: { position: 'none' },
        chartArea: { left: 120, top: 50, width: '72%', height: '68%' },
        hAxis: { minValue: 0, format: '0' },
      }
    );
  }

  dashWriteSectionTitle_(sheet, 24, 1, 5, 'Day 1~5 행동 유지', '재오픈 이벤트까지 반영한 최종 마감 상태');
  dashWriteTable_(
    sheet,
    26,
    1,
    [['날짜', '거래 챌린지', '마감 챌린지', '페이스 성공', '시작 대비 마감률']].concat(model.dayRows)
  );
  sheet.getRange(27, 5, model.dayRows.length, 1).setNumberFormat('0.0%');
  if (model.dayRows.some(function (row) {
    return Number(row[1]) > 0 || Number(row[2]) > 0 || Number(row[3]) > 0;
  })) {
    dashInsertChart_(
      sheet,
      Charts.ChartType.COLUMN,
      sheet.getRange(26, 1, model.dayRows.length + 1, 4),
      24,
      7,
      {
        title: 'Day별 거래·마감·성공',
        width: 500,
        height: 260,
        colors: [DASH_COLORS.blue, DASH_COLORS.orange, DASH_COLORS.green],
        legend: { position: 'top' },
        chartArea: { left: 55, top: 55, width: '82%', height: '62%' },
        vAxis: { minValue: 0, format: '0' },
      }
    );
  }

  dashWriteSectionTitle_(sheet, 38, 1, 6, '최근 14일 활동', '한국 시간 기준 일별 고유 사용자·세션·핵심 행동');
  dashWriteTable_(
    sheet,
    40,
    1,
    [['날짜', '활동 사용자', '세션', '거래 생성', '하루 마감', '5일 완주']].concat(model.dailyRows)
  );
  if (model.dailyRows.some(function (row) {
    return Number(row[1]) > 0 || Number(row[2]) > 0 ||
      Number(row[3]) > 0 || Number(row[4]) > 0;
  })) {
    dashInsertChart_(
      sheet,
      Charts.ChartType.LINE,
      sheet.getRange(40, 1, model.dailyRows.length + 1, 5),
      38,
      7,
      {
        title: '일별 핵심 활동',
        width: 500,
        height: 320,
        colors: [DASH_COLORS.blue, DASH_COLORS.purple, DASH_COLORS.orange, DASH_COLORS.green],
        legend: { position: 'top' },
        chartArea: { left: 55, top: 60, width: '82%', height: '62%' },
        vAxis: { minValue: 0, format: '0' },
      }
    );
  }

  const eventStartRow = Math.max(58, 42 + model.dailyRows.length);
  dashWriteSectionTitle_(sheet, eventStartRow, 1, 3, '많이 발생한 행동', '이벤트 수와 고유 사용자 수');
  dashWriteTable_(
    sheet,
    eventStartRow + 2,
    1,
    [['행동', '이벤트', '사용자']].concat(model.eventRows)
  );

  dashWriteSectionTitle_(sheet, eventStartRow, 5, 8, '해석 기준', '숫자를 볼 때 함께 확인할 원칙');
  const notes = [
    '• 참여자 지표는 participant_id 기준이며 닉네임 중복을 허용합니다.',
    '• 재방문은 챌린지 시작자 중 서로 다른 session_id가 2개 이상인 참여자입니다.',
    '• Day별 마감은 같은 챌린지·Day의 마지막 완료/재오픈 이벤트를 기준으로 합니다.',
    '• 챌린지 완주는 challenge_completed 이벤트가 발생한 고유 challenge_id입니다.',
    '• 튜토리얼 연습 거래는 원본 로그에서 제외되므로 거래 지표에 포함되지 않습니다.',
    '• 지정된 테스트 참여자 3명과 연결된 이벤트는 모든 통계에서 제외합니다.',
    '• 표본이 적을 때는 비율보다 사용자별 행동 시트를 먼저 확인하세요.',
  ];
  notes.forEach(function (note, index) {
    sheet.getRange(eventStartRow + 2 + index, 5, 1, 8).merge()
      .setValue(note)
      .setFontSize(11)
      .setFontColor(DASH_COLORS.sub)
      .setWrap(true)
      .setVerticalAlignment('middle');
  });
  sheet.setRowHeights(eventStartRow + 2, notes.length, 30);

  sheet.getRange(1, 1, Math.min(sheet.getMaxRows(), eventStartRow + model.eventRows.length + 4), 12)
    .setVerticalAlignment('middle');
  funnelRange.setVerticalAlignment('middle');
}

function dashRenderUsers_(sheet, model) {
  const headers = [
    '닉네임',
    '참여자 ID',
    '등록 시각',
    '마지막 활동',
    '세션',
    '챌린지',
    '튜토리얼',
    '거래',
    '거래일',
    '최신 마감일',
    '페이스 성공일',
    '완주 횟수',
    '기록 탭',
    '미마감 복구',
    '마지막 행동',
    '현재 상태',
  ];
  const values = [headers].concat(model.userRows.length ? model.userRows : [
    ['데이터 없음', '', '', '', 0, 0, '-', 0, 0, 0, 0, 0, 0, 0, '-', '-'],
  ]);

  sheet.setTabColor(DASH_COLORS.blue);
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground(DASH_COLORS.ink)
    .setFontColor(DASH_COLORS.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  if (values.length > 1) {
    sheet.getRange(2, 1, values.length - 1, headers.length)
      .setFontFamily('Arial')
      .setFontSize(10)
      .setVerticalAlignment('middle');
    for (let row = 2; row <= values.length; row++) {
      if (row % 2 === 0) sheet.getRange(row, 1, 1, headers.length).setBackground('#F8F7F3');
    }
  }

  const widths = [120, 250, 135, 135, 60, 70, 80, 60, 65, 85, 95, 75, 70, 85, 120, 170];
  widths.forEach(function (width, index) { sheet.setColumnWidth(index + 1, width); });
  sheet.setRowHeight(1, 34);
  if (values.length > 1) sheet.setRowHeights(2, values.length - 1, 30);
  sheet.getRange(1, 1, values.length, headers.length).setWrap(false);
  sheet.getRange(2, 5, Math.max(1, values.length - 1), 10).setHorizontalAlignment('center');

  if (values.length > 1) {
    sheet.getRange(1, 1, values.length, headers.length).createFilter();
    const statusRange = sheet.getRange(2, 16, values.length - 1, 1);
    const rules = [
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('완주')
        .setBackground(DASH_COLORS.greenSoft)
        .setFontColor(DASH_COLORS.green)
        .setRanges([statusRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('기간 종료')
        .setBackground(DASH_COLORS.redSoft)
        .setFontColor(DASH_COLORS.red)
        .setRanges([statusRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextContains('진행 중')
        .setBackground(DASH_COLORS.amberSoft)
        .setFontColor(DASH_COLORS.amber)
        .setRanges([statusRange])
        .build(),
    ];
    sheet.setConditionalFormatRules(rules);
  }
}

function dashResetGeneratedSheet_(spreadsheet, name, minimumRows, minimumColumns) {
  const existingSheet = spreadsheet.getSheetByName(name);
  if (existingSheet) spreadsheet.deleteSheet(existingSheet);
  const generatedSheet = spreadsheet.insertSheet(name);

  if (generatedSheet.getMaxRows() < minimumRows) {
    generatedSheet.insertRowsAfter(
      generatedSheet.getMaxRows(),
      minimumRows - generatedSheet.getMaxRows()
    );
  }
  if (generatedSheet.getMaxColumns() < minimumColumns) {
    generatedSheet.insertColumnsAfter(
      generatedSheet.getMaxColumns(),
      minimumColumns - generatedSheet.getMaxColumns()
    );
  }
  return generatedSheet;
}

function dashWriteCard_(sheet, row, column, label, value, subtext, background) {
  sheet.getRange(row, column, 3, 2)
    .setBackground(background)
    .setBorder(true, true, true, true, false, false, DASH_COLORS.line, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(row, column, 1, 2).merge()
    .setValue(label)
    .setFontSize(10)
    .setFontWeight('bold')
    .setFontColor(DASH_COLORS.sub)
    .setHorizontalAlignment('center');
  sheet.getRange(row + 1, column, 1, 2).merge()
    .setValue(value)
    .setFontSize(22)
    .setFontWeight('bold')
    .setFontColor(DASH_COLORS.ink)
    .setHorizontalAlignment('center');
  sheet.getRange(row + 2, column, 1, 2).merge()
    .setValue(subtext)
    .setFontSize(9)
    .setFontColor(DASH_COLORS.faint)
    .setHorizontalAlignment('center');
}

function dashWriteSectionTitle_(sheet, row, column, columns, title, subtitle) {
  sheet.getRange(row, column, 1, columns).merge()
    .setValue(title)
    .setFontSize(14)
    .setFontWeight('bold')
    .setFontColor(DASH_COLORS.ink);
  sheet.getRange(row + 1, column, 1, columns).merge()
    .setValue(subtitle)
    .setFontSize(9)
    .setFontColor(DASH_COLORS.faint);
}

function dashWriteTable_(sheet, row, column, values) {
  const range = sheet.getRange(row, column, values.length, values[0].length);
  range.setValues(values)
    .setBorder(true, true, true, true, true, true, DASH_COLORS.line, SpreadsheetApp.BorderStyle.SOLID)
    .setFontSize(10);
  sheet.getRange(row, column, 1, values[0].length)
    .setBackground(DASH_COLORS.ink)
    .setFontColor(DASH_COLORS.white)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  if (values.length > 1) {
    sheet.getRange(row + 1, column, values.length - 1, values[0].length)
      .setBackground(DASH_COLORS.white);
  }
  return range;
}

function dashInsertChart_(sheet, chartType, range, row, column, options) {
  let builder = sheet.newChart()
    .setChartType(chartType)
    .addRange(range)
    .setNumHeaders(1)
    .setPosition(row, column, 0, 0);
  Object.keys(options).forEach(function (key) {
    builder = builder.setOption(key, options[key]);
  });
  sheet.insertChart(builder.build());
}

function dashEventDate_(event) {
  const source = event.occurredAt || event.serverTimestamp;
  const match = String(source || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function dashReadableTimestamp_(value) {
  const text = String(value || '');
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? match[1] + ' ' + match[2] : text;
}

function dashRate_(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function dashPercentText_(numerator, denominator) {
  return denominator > 0 ? Math.round(numerator / denominator * 100) + '%' : '-';
}
