const APP_VERSION = 'v7';
const SCHEMA_VERSION = 1;
const EVENTS_SHEET = 'events';
const APPLICATIONS_SHEET = 'applications';
const DASHBOARD_SHEET = 'dashboard';

const EVENT_HEADERS = [
  'server_timestamp',
  'occurred_at',
  'event_id',
  'event_name',
  'visitor_id',
  'session_id',
  'page',
  'app_version',
  'properties_json',
  'traffic_source',
  'traffic_medium',
  'traffic_campaign',
  'referrer_host',
];

const APPLICATION_HEADERS = [
  'submitted_at',
  'application_id',
  'visitor_id',
  'session_id',
  'email',
  'friend_intent',
  'consent',
  'app_version',
  'traffic_source',
  'traffic_medium',
  'traffic_campaign',
  'referrer_host',
  'feedback',
];

const ALLOWED_PROPERTIES = {
  page_viewed: ['trigger', 'referrerType', 'source', 'medium', 'campaign', 'referrerHost'],
  cta_clicked: ['placement'],
  learn_more_clicked: ['placement'],
  beta_form_started: ['entryPoint'],
  friend_intent_selected: ['friendIntent'],
  beta_form_submitted: ['friendIntent', 'hasFeedback'],
  friend_share_clicked: ['method'],
  photo_demo_uploaded: ['fileType'],
  emoji_reaction_clicked: ['emoji', 'surface', 'active'],
  share_mode_selected: ['mode'],
  chat_demo_sent: ['messageLength'],
  app_error_occurred: ['errorType', 'context'],
};

const ALLOWED_PAGE = new Set(['landing']);
const ALLOWED_TRIGGER = new Set(['initial_load', 'resume', 'activity', 'online']);
const ALLOWED_REFERRER = new Set(['direct', 'same_origin', 'external', 'unknown']);
const ALLOWED_PLACEMENT = new Set(['nav', 'hero', 'quick_route', 'mobile_sticky', 'unknown']);
const ALLOWED_ENTRY_POINT = new Set(['page', 'direct_hash']);
const ALLOWED_SHARE_METHOD = new Set(['web_share', 'clipboard']);
const ALLOWED_REACTION = new Set(['👍', '🔥', '💙', '😮', 'unknown']);
const ALLOWED_REACTION_SURFACE = new Set(['hero', 'demo']);
const ALLOWED_SHARE_MODE = new Set(['expense_photo', 'expense_only', 'photo_only', 'private']);
const ALLOWED_FRIEND_INTENT = new Set(['yes', 'maybe', 'solo']);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('지출 모임 실험')
    .addItem('로그 시트 설정', 'setup')
    .addItem('설정 상태 확인', 'verifySetup')
    .addToUi();
}

function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Bind this script to a Google Sheet first.');
  spreadsheet.setSpreadsheetTimeZone('Asia/Seoul');
  ensureSheet_(spreadsheet, EVENTS_SHEET, EVENT_HEADERS);
  ensureApplicationSheet_(spreadsheet);
  setupDashboard_(spreadsheet);
}

function verifySetup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Bind this script to a Google Sheet first.');

  verifySheetHeaders_(spreadsheet, EVENTS_SHEET, EVENT_HEADERS);
  verifySheetHeaders_(spreadsheet, APPLICATIONS_SHEET, APPLICATION_HEADERS);
  if (!spreadsheet.getSheetByName(DASHBOARD_SHEET)) throw new Error('missing_dashboard_sheet');

  const message = '연결 준비 완료: events, applications, dashboard 시트가 정상입니다.';
  SpreadsheetApp.getUi().alert(message);
  return message;
}

function doGet() {
  return jsonResponse_({ ok: true, appVersion: APP_VERSION });
}

function doPost(e) {
  let lock;
  let lockAcquired = false;
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 12000) throw new Error('payload_too_large');
    const data = JSON.parse(raw);
    validateEnvelope_(data);

    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    lockAcquired = true;

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('spreadsheet_not_found');

    if (data.type === 'event') {
      return handleEvent_(spreadsheet, data);
    }
    if (data.type === 'application') {
      return handleApplication_(spreadsheet, data);
    }
    throw new Error('unsupported_type');
  } catch (error) {
    return jsonResponse_({ ok: false, error: safeErrorCode_(error) });
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

function handleEvent_(spreadsheet, data) {
  validateEvent_(data);
  const events = ensureSheet_(spreadsheet, EVENTS_SHEET, EVENT_HEADERS);
  if (hasExactValue_(events, 3, data.eventId)) {
    return jsonResponse_({ ok: true, duplicate: true });
  }
  events.appendRow([
    kstIso_(new Date()),
    data.occurredAt,
    data.eventId,
    data.eventName,
    data.visitorId,
    data.sessionId,
    data.page,
    data.appVersion,
    JSON.stringify(data.properties),
    safeCellText_(data.properties.source || ''),
    safeCellText_(data.properties.medium || ''),
    safeCellText_(data.properties.campaign || ''),
    safeCellText_(data.properties.referrerHost || ''),
  ]);
  return jsonResponse_({ ok: true, duplicate: false });
}

function handleApplication_(spreadsheet, data) {
  validateApplication_(data);
  const applications = ensureApplicationSheet_(spreadsheet);
  if (hasExactValue_(applications, 2, data.applicationId)) {
    return jsonResponse_({ ok: true, duplicate: true });
  }
  applications.appendRow([
    data.submittedAt,
    data.applicationId,
    data.visitorId,
    data.sessionId,
    safeCellText_(data.email),
    data.friendIntent,
    data.consent === true,
    data.appVersion,
    safeCellText_(data.source || ''),
    safeCellText_(data.medium || ''),
    safeCellText_(data.campaign || ''),
    safeCellText_(data.referrerHost || ''),
    safeCellText_(data.feedback || ''),
  ]);
  return jsonResponse_({ ok: true, duplicate: false });
}

function validateEnvelope_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_payload');
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error('invalid_schema_version');
  if (data.appVersion !== APP_VERSION) throw new Error('invalid_app_version');
  if (!['event', 'application'].includes(data.type)) throw new Error('unsupported_type');
  validateId_(data.visitorId, 'invalid_visitor_id');
  validateId_(data.sessionId, 'invalid_session_id');
}

function validateEvent_(data) {
  validateId_(data.eventId, 'invalid_event_id');
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPERTIES, data.eventName)) throw new Error('unsupported_event');
  if (!ALLOWED_PAGE.has(data.page)) throw new Error('invalid_page');
  validateIso_(data.occurredAt, 'invalid_occurred_at');
  if (!data.properties || typeof data.properties !== 'object' || Array.isArray(data.properties)) throw new Error('invalid_properties');

  const allowedList = ALLOWED_PROPERTIES[data.eventName];
  const allowed = new Set(allowedList);
  Object.keys(data.properties).forEach(function (key) {
    if (!allowed.has(key)) throw new Error('unsupported_property');
  });
  allowedList.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(data.properties, key)) throw new Error('missing_property');
  });
  if (JSON.stringify(data.properties).length > 2000) throw new Error('properties_too_large');
  validateEventProperties_(data.properties);
}

function validateApplication_(data) {
  validateId_(data.applicationId, 'invalid_application_id');
  validateIso_(data.submittedAt, 'invalid_submitted_at');
  if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length > 160) {
    throw new Error('invalid_email');
  }
  validateShortText_(data.feedback || '', 500, 'invalid_feedback');
  if (!ALLOWED_FRIEND_INTENT.has(data.friendIntent)) throw new Error('invalid_friend_intent');
  if (data.consent !== true) throw new Error('consent_required');
  validateTrafficAttribution_(data);
}

function validateEventProperties_(properties) {
  if (properties.trigger !== undefined && !ALLOWED_TRIGGER.has(properties.trigger)) throw new Error('invalid_trigger');
  if (properties.referrerType !== undefined && !ALLOWED_REFERRER.has(properties.referrerType)) throw new Error('invalid_referrer_type');
  if (properties.placement !== undefined && !ALLOWED_PLACEMENT.has(properties.placement)) throw new Error('invalid_placement');
  if (properties.entryPoint !== undefined && !ALLOWED_ENTRY_POINT.has(properties.entryPoint)) throw new Error('invalid_entry_point');
  if (properties.method !== undefined && !ALLOWED_SHARE_METHOD.has(properties.method)) throw new Error('invalid_share_method');
  if (properties.friendIntent !== undefined && !ALLOWED_FRIEND_INTENT.has(properties.friendIntent)) throw new Error('invalid_friend_intent');
  if (properties.hasFeedback !== undefined && typeof properties.hasFeedback !== 'boolean') throw new Error('invalid_has_feedback');
  if (properties.emoji !== undefined && !ALLOWED_REACTION.has(properties.emoji)) throw new Error('invalid_emoji');
  if (properties.surface !== undefined && !ALLOWED_REACTION_SURFACE.has(properties.surface)) throw new Error('invalid_surface');
  if (properties.active !== undefined && typeof properties.active !== 'boolean') throw new Error('invalid_active');
  if (properties.fileType !== undefined) validateShortText_(properties.fileType, 40, 'invalid_file_type');
  if (properties.mode !== undefined && !ALLOWED_SHARE_MODE.has(properties.mode)) throw new Error('invalid_share_mode');
  if (properties.messageLength !== undefined && (!Number.isInteger(properties.messageLength) || properties.messageLength < 1 || properties.messageLength > 80)) {
    throw new Error('invalid_message_length');
  }
  [
    ['source', 80],
    ['medium', 80],
    ['campaign', 120],
    ['referrerHost', 120],
  ].forEach(function (rule) {
    if (properties[rule[0]] !== undefined) validateShortText_(properties[rule[0]], rule[1], 'invalid_' + rule[0]);
  });
  ['errorType', 'context'].forEach(function (key) {
    if (properties[key] !== undefined) validateShortText_(properties[key], 80, 'invalid_' + key);
  });
}

function validateTrafficAttribution_(data) {
  [
    ['source', 80],
    ['medium', 80],
    ['campaign', 120],
    ['referrerHost', 120],
  ].forEach(function (rule) {
    if (data[rule[0]] === undefined) throw new Error('missing_' + rule[0]);
    validateShortText_(data[rule[0]], rule[1], 'invalid_' + rule[0]);
  });
}

function validateId_(value, errorCode) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 100 || !/^[A-Za-z0-9-]+$/.test(value)) {
    throw new Error(errorCode);
  }
}

function validateIso_(value, errorCode) {
  if (typeof value !== 'string' || isNaN(Date.parse(value))) throw new Error(errorCode);
}

function validateShortText_(value, maxLength, errorCode) {
  if (typeof value !== 'string' || value.length > maxLength || /[\r\n\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(errorCode);
  }
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = existing.some(function (value, index) { return value !== headers[index]; });
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureApplicationSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(APPLICATIONS_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(APPLICATIONS_SHEET);

  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    resizeSheetColumns_(sheet, APPLICATION_HEADERS.length);
    sheet.getRange(1, 1, 1, APPLICATION_HEADERS.length).setValues([APPLICATION_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const isCurrent = APPLICATION_HEADERS.every(function (header, index) {
    return existingHeaders[index] === header;
  });
  if (isCurrent) {
    resizeSheetColumns_(sheet, APPLICATION_HEADERS.length);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const headerIndex = {};
  existingHeaders.forEach(function (header, index) {
    if (header) headerIndex[String(header)] = index;
  });
  if (lastRow > 1 && headerIndex.application_id === undefined) {
    throw new Error('unexpected_applications_headers');
  }

  let migratedRows = [];
  if (lastRow > 1) {
    const existingRows = sheet.getRange(2, 1, lastRow - 1, existingHeaders.length).getValues();
    migratedRows = existingRows.map(function (row) {
      return APPLICATION_HEADERS.map(function (header) {
        const index = headerIndex[header];
        return index === undefined ? '' : row[index];
      });
    });
  }

  sheet.clearContents();
  resizeSheetColumns_(sheet, APPLICATION_HEADERS.length);
  sheet.getRange(1, 1, 1, APPLICATION_HEADERS.length).setValues([APPLICATION_HEADERS]);
  if (migratedRows.length) {
    sheet.getRange(2, 1, migratedRows.length, APPLICATION_HEADERS.length).setValues(migratedRows);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function resizeSheetColumns_(sheet, requiredColumns) {
  const currentColumns = sheet.getMaxColumns();
  if (currentColumns < requiredColumns) {
    sheet.insertColumnsAfter(currentColumns, requiredColumns - currentColumns);
  } else if (currentColumns > requiredColumns) {
    sheet.deleteColumns(requiredColumns + 1, currentColumns - requiredColumns);
  }
}

function verifySheetHeaders_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('missing_' + name + '_sheet');
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const matches = existing.every(function (value, index) { return value === headers[index]; });
  if (!matches) throw new Error('invalid_' + name + '_headers');
}

function setupDashboard_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(DASHBOARD_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(DASHBOARD_SHEET);

  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(2);

  sheet.getRange('A1:C1').merge().setValue('지출 모임 v7 실험 대시보드');
  sheet.getRange('A2:C2').setValues([['핵심 지표', '현재', '통과 기준']]);
  sheet.getRange('A3:A10').setValues([
    ['고유 방문자'],
    ['CTA 클릭 방문자'],
    ['CTA 클릭률'],
    ['베타 신청자'],
    ['베타 신청률'],
    ['친구와 함께 의향'],
    ['친구와 함께 의향률'],
    ['실험 결과'],
  ]);
  sheet.getRange('B3').setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(events!E2:E,events!D2:D="page_viewed",events!E2:E<>""))),0)');
  sheet.getRange('B4').setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(events!E2:E,events!D2:D="cta_clicked",events!E2:E<>""))),0)');
  sheet.getRange('B5').setFormula('=IFERROR(B4/B3,0)');
  sheet.getRange('B6').setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(applications!C2:C,applications!C2:C<>""))),0)');
  sheet.getRange('B7').setFormula('=IFERROR(B6/B3,0)');
  sheet.getRange('B8').setFormula('=COUNTIF(applications!F2:F,"yes")');
  sheet.getRange('B9').setFormula('=IFERROR(B8/B6,0)');
  sheet.getRange('B10').setFormula('=IF(B3=0,"데이터 수집 전",IF(AND(B5>=C5,B7>=C7,B9>=C9),"가설 채택","관찰 중"))');
  sheet.getRange('C5').setValue(0.3);
  sheet.getRange('C7').setValue(0.2);
  sheet.getRange('C9').setValue(0.6);

  sheet.getRange('A12:E12').merge().setValue('유입 경로별 전환');
  sheet.getRange('A13:E13').setValues([['유입 경로', '고유 방문자', '신청자', '신청률', '유입 비중']]);
  var trafficBySourceFormula = `=IFERROR(QUERY(UNIQUE(FILTER({events!J2:J,events!E2:E},events!D2:D="page_viewed",events!E2:E<>"")),"select Col1,count(Col2) where Col1 is not null group by Col1 order by count(Col2) desc label Col1 '',count(Col2) ''",0),{"유입 없음",0})`;
  sheet.getRange('A14').setFormula(trafficBySourceFormula);
  var applicantsBySourceFormula = `=ARRAYFORMULA(IF(A14:A="",,IFNA(VLOOKUP(A14:A,QUERY(UNIQUE(FILTER({applications!I2:I,applications!C2:C},applications!I2:I<>"",applications!C2:C<>"")),"select Col1,count(Col2) group by Col1 label count(Col2) ''",0),2,FALSE),0)))`;
  sheet.getRange('C14').setFormula(applicantsBySourceFormula);
  sheet.getRange('D14').setFormula('=ARRAYFORMULA(IF(B14:B="",,IFERROR(C14:C/B14:B,0)))');
  sheet.getRange('E14').setFormula('=ARRAYFORMULA(IF(B14:B="",,IFERROR(B14:B/$B$3,0)))');

  sheet.getRange('G1:K1').merge().setValue('최근 베타 신청 20건');
  sheet.getRange('G2:K2').setValues([['신청 시각', '이메일', '친구 의향', '유입 경로', '추가 의견']]);
  var recentApplicationsFormula = `=IFERROR(ARRAY_CONSTRAIN(SORT(FILTER({applications!A2:A,applications!E2:E,applications!F2:F,applications!I2:I,applications!M2:M},applications!B2:B<>""),1,FALSE),20,5),{"신청 없음","","","",""})`;
  sheet.getRange('G3').setFormula(recentApplicationsFormula);

  const blue = '#155EEF';
  const paleBlue = '#EAF1FF';
  const borderBlue = '#B8CCFA';
  sheet.getRangeList(['A1:C1', 'G1:K1', 'A12:E12'])
    .setBackground(blue)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  sheet.getRangeList(['A2:C2', 'G2:K2', 'A13:E13'])
    .setBackground(paleBlue)
    .setFontColor('#16335B')
    .setFontWeight('bold');
  sheet.getRange('A1:K40').setVerticalAlignment('middle');
  sheet.getRange('A2:C10').setBorder(true, true, true, true, true, true, borderBlue, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('A13:E40').setBorder(true, true, true, true, true, true, borderBlue, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('G2:K22').setBorder(true, true, true, true, true, true, borderBlue, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRangeList(['B5', 'B7', 'B9', 'C5', 'C7', 'C9']).setNumberFormat('0.0%');
  sheet.getRange('D14:E100').setNumberFormat('0.0%');
  sheet.getRange('G3:G22').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 24);
  sheet.setColumnWidth(7, 170);
  sheet.setColumnWidth(8, 220);
  sheet.setColumnWidth(9, 100);
  sheet.setColumnWidth(10, 120);
  sheet.setColumnWidth(11, 280);
  sheet.setRowHeight(1, 36);
  sheet.setRowHeight(12, 32);
}

function hasExactValue_(sheet, column, value) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  return values.some(function (row) { return row[0] === value; });
}

function safeCellText_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function safeErrorCode_(error) {
  const message = error && error.message ? String(error.message) : 'unknown_error';
  return message.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80);
}

function kstIso_(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
