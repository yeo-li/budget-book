const APP_VERSION = 'v6';
const SCHEMA_VERSION = 1;
const PARTICIPANTS_SHEET = 'participants';
const EVENTS_SHEET = 'events';

const PARTICIPANT_HEADERS = [
  'registered_at',
  'participant_id',
  'anonymous_id',
  'nickname',
  'app_version',
];

const EVENT_HEADERS = [
  'server_timestamp',
  'occurred_at',
  'event_id',
  'event_name',
  'participant_id',
  'anonymous_id',
  'session_id',
  'challenge_id',
  'page',
  'app_version',
  'properties_json',
];

const TRANSACTION_PROPERTIES = [
  'transactionId',
  'transactionType',
  'amountRange',
  'inputMethod',
  'budgetExcluded',
  'transactionDate',
  'challengeDay',
  'isInChallenge',
  'entryPoint',
];

const ALLOWED_PROPERTIES = {
  page_viewed: ['trigger', 'referrerType'],
  participant_registered: ['nickname'],
  tutorial_started: ['stepCount'],
  tutorial_completed: ['stepCount'],
  tutorial_skipped: ['skippedAtStep'],
  challenge_started: ['startDate', 'startType', 'budgetRange'],
  challenge_restarted: ['elapsedDays', 'completedDays', 'transactionDays'],
  budget_created: ['amountRange'],
  budget_updated: ['previousAmountRange', 'amountRange', 'entryPoint'],
  challenge_day_completed: ['challengeDay', 'transactionDate', 'result', 'transactionCount', 'entryPoint'],
  challenge_day_reopened: ['challengeDay', 'transactionDate', 'entryPoint'],
  challenge_completed: ['completedDays', 'successfulDays', 'transactionDays', 'totalTransactions'],
  challenge_period_ended: ['completedDays', 'successfulDays', 'transactionDays', 'totalTransactions'],
  transaction_form_opened: ['mode', 'entryPoint'],
  transaction_form_cancelled: ['mode', 'entryPoint', 'filledFields'],
  transaction_created: TRANSACTION_PROPERTIES,
  transaction_updated: TRANSACTION_PROPERTIES.concat(['changedFields']),
  transaction_deleted: TRANSACTION_PROPERTIES,
  record_tab_viewed: ['transactionCount', 'completedDays'],
  pending_days_viewed: ['pendingDayCount', 'entryPoint'],
  app_data_reset: ['hadActiveChallenge', 'completedDays', 'transactionCount'],
  data_imported: ['hadChallenge', 'transactionCount'],
  app_error_occurred: ['errorType', 'context'],
};

const ALLOWED_PAGES = new Set([
  'onboarding',
  'home',
  'record',
  'input',
  'day_detail',
  'pending_days',
  'budget',
  'settings',
  'streak',
]);

const AMOUNT_RANGES = new Set([
  'under_10000',
  '10000_30000',
  '30000_50000',
  '50000_100000',
  '100000_300000',
  'over_300000',
]);
const ENTRY_POINTS = new Set(['home', 'nav_plus', 'record', 'day_detail', 'pending_days', 'settings']);
const FORM_FIELDS = new Set(['amount', 'description', 'transactionDate', 'time', 'budgetExcluded', 'transactionType']);
const PARTICIPANT_OPTIONAL_EVENTS = new Set(['page_viewed', 'app_error_occurred']);
const CHALLENGE_REQUIRED_EVENTS = new Set([
  'challenge_started',
  'challenge_restarted',
  'budget_updated',
  'challenge_day_completed',
  'challenge_day_reopened',
  'challenge_completed',
  'challenge_period_ended',
  'transaction_form_opened',
  'transaction_form_cancelled',
  'transaction_created',
  'transaction_updated',
  'transaction_deleted',
  'record_tab_viewed',
  'pending_days_viewed',
]);

function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Bind this script to a Google Sheet first.');
  spreadsheet.setSpreadsheetTimeZone('Asia/Seoul');
  ensureSheet_(spreadsheet, PARTICIPANTS_SHEET, PARTICIPANT_HEADERS);
  ensureSheet_(spreadsheet, EVENTS_SHEET, EVENT_HEADERS);
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
    validateEvent_(data);

    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    lockAcquired = true;

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('spreadsheet_not_found');
    const participants = ensureSheet_(spreadsheet, PARTICIPANTS_SHEET, PARTICIPANT_HEADERS);
    const events = ensureSheet_(spreadsheet, EVENTS_SHEET, EVENT_HEADERS);

    if (hasExactValue_(events, 3, data.eventId)) {
      return jsonResponse_({ ok: true, duplicate: true });
    }

    if (data.eventName === 'participant_registered' && !hasExactValue_(participants, 2, data.participantId)) {
      participants.appendRow([
        data.occurredAt,
        data.participantId,
        data.anonymousId,
        safeCellText_(data.properties.nickname),
        data.appVersion,
      ]);
    }

    events.appendRow([
      new Date().toISOString(),
      data.occurredAt,
      data.eventId,
      data.eventName,
      data.participantId || '',
      data.anonymousId,
      data.sessionId,
      data.challengeId || '',
      data.page,
      data.appVersion,
      JSON.stringify(data.properties),
    ]);

    return jsonResponse_({ ok: true, duplicate: false });
  } catch (error) {
    return jsonResponse_({ ok: false, error: safeErrorCode_(error) });
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

function validateEvent_(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid_payload');
  if (data.schemaVersion !== SCHEMA_VERSION) throw new Error('invalid_schema_version');
  if (data.appVersion !== APP_VERSION) throw new Error('invalid_app_version');
  validateId_(data.eventId, 'invalid_event_id');
  validateId_(data.anonymousId, 'invalid_anonymous_id');
  validateId_(data.sessionId, 'invalid_session_id');
  if (data.participantId !== null) validateId_(data.participantId, 'invalid_participant_id');
  if (data.challengeId !== null) validateId_(data.challengeId, 'invalid_challenge_id');
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_PROPERTIES, data.eventName)) throw new Error('unsupported_event');
  if (!PARTICIPANT_OPTIONAL_EVENTS.has(data.eventName) && data.participantId === null) throw new Error('participant_required');
  if (CHALLENGE_REQUIRED_EVENTS.has(data.eventName) && data.challengeId === null) throw new Error('challenge_required');
  if (!ALLOWED_PAGES.has(data.page)) throw new Error('invalid_page');
  if (!data.occurredAt || isNaN(Date.parse(data.occurredAt))) throw new Error('invalid_occurred_at');
  if (!data.properties || typeof data.properties !== 'object' || Array.isArray(data.properties)) throw new Error('invalid_properties');

  const allowedList = ALLOWED_PROPERTIES[data.eventName];
  const allowed = new Set(allowedList);
  Object.keys(data.properties).forEach(function (key) {
    if (!allowed.has(key)) throw new Error('unsupported_property');
  });
  allowedList.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(data.properties, key)) throw new Error('missing_property');
  });
  if (JSON.stringify(data.properties).length > 4000) throw new Error('properties_too_large');

  if (data.eventName === 'participant_registered') {
    validateId_(data.participantId, 'invalid_participant_id');
    validateNickname_(data.properties.nickname);
  }
  validateProperties_(data.properties);
}

function validateId_(value, errorCode) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 100 || !/^[A-Za-z0-9-]+$/.test(value)) {
    throw new Error(errorCode);
  }
}

function validateNickname_(value) {
  if (typeof value !== 'string') throw new Error('invalid_nickname');
  const nickname = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (Array.from(nickname).length < 2 || Array.from(nickname).length > 20) throw new Error('invalid_nickname');
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(nickname)) throw new Error('invalid_nickname');
  const digits = nickname.replace(/\D/g, '');
  if (/^[\d\s()+-]+$/.test(nickname) && digits.length >= 9) throw new Error('invalid_nickname');
}

function validateProperties_(properties) {
  ['amountRange', 'previousAmountRange', 'budgetRange'].forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(properties, key) && !AMOUNT_RANGES.has(properties[key])) {
      throw new Error('invalid_amount_range');
    }
  });
  if (properties.transactionId !== undefined) validateId_(properties.transactionId, 'invalid_transaction_id');
  if (properties.transactionType !== undefined && !['expense', 'income'].includes(properties.transactionType)) throw new Error('invalid_transaction_type');
  if (properties.inputMethod !== undefined && !['manual', 'text_paste', 'screenshot_ocr'].includes(properties.inputMethod)) throw new Error('invalid_input_method');
  if (properties.mode !== undefined && !['create', 'edit'].includes(properties.mode)) throw new Error('invalid_mode');
  if (properties.result !== undefined && !['success', 'over'].includes(properties.result)) throw new Error('invalid_result');
  if (properties.startType !== undefined && !['tutorial_completed', 'tutorial_skipped', 'restart', 'migration'].includes(properties.startType)) throw new Error('invalid_start_type');
  if (properties.entryPoint !== undefined && !ENTRY_POINTS.has(properties.entryPoint)) throw new Error('invalid_entry_point');
  if (properties.referrerType !== undefined && !['direct', 'same_origin', 'external', 'unknown'].includes(properties.referrerType)) throw new Error('invalid_referrer_type');
  if (properties.trigger !== undefined && !['initial_load', 'resume', 'activity', 'online'].includes(properties.trigger)) throw new Error('invalid_trigger');

  ['startDate', 'transactionDate'].forEach(function (key) {
    if (properties[key] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(properties[key])) throw new Error('invalid_date');
  });
  if (properties.challengeDay !== undefined && properties.challengeDay !== null && (!Number.isInteger(properties.challengeDay) || properties.challengeDay < 1 || properties.challengeDay > 5)) {
    throw new Error('invalid_challenge_day');
  }

  ['stepCount', 'elapsedDays', 'completedDays', 'successfulDays', 'transactionDays', 'totalTransactions', 'transactionCount', 'pendingDayCount'].forEach(function (key) {
    if (properties[key] !== undefined && (!Number.isInteger(properties[key]) || properties[key] < 0 || properties[key] > 100000)) {
      throw new Error('invalid_count');
    }
  });
  ['budgetExcluded', 'isInChallenge', 'hadActiveChallenge', 'hadChallenge'].forEach(function (key) {
    if (properties[key] !== undefined && typeof properties[key] !== 'boolean') throw new Error('invalid_boolean');
  });
  ['filledFields', 'changedFields'].forEach(function (key) {
    if (properties[key] === undefined) return;
    if (!Array.isArray(properties[key]) || properties[key].some(function (field) { return !FORM_FIELDS.has(field); })) {
      throw new Error('invalid_field_list');
    }
  });
  ['skippedAtStep', 'errorType', 'context'].forEach(function (key) {
    if (properties[key] !== undefined && (typeof properties[key] !== 'string' || properties[key].length > 80 || /[\r\n]/.test(properties[key]))) {
      throw new Error('invalid_text_property');
    }
  });
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (currentHeaders.some(function (value, index) { return value !== headers[index]; })) {
      throw new Error('header_mismatch');
    }
  }
  return sheet;
}

function hasExactValue_(sheet, column, value) {
  const lastRow = sheet.getLastRow();
  if (!value || lastRow < 2) return false;
  return !!sheet.getRange(2, column, lastRow - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .findNext();
}

function safeCellText_(value) {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function safeErrorCode_(error) {
  const code = error && error.message ? String(error.message) : 'unknown_error';
  return /^[a-z0-9_]+$/.test(code) ? code : 'internal_error';
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
