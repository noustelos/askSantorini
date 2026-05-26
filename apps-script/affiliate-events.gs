const PRODUCTION_SPREADSHEET_ID = "1OlhF14hzMGc0jweKgq-3O_PtSKn0E9-wBbZXZBano9E";
const EVENTS_ANALYTICS_SHEET_NAME = "events_analytics";
const SYSTEM_LOGS_SHEET_NAME = "system_logs";
const EVENTS_ANALYTICS_HEADERS = [
  "timestamp",
  "session_id",
  "message_id",
  "user_input",
  "bot_response",
  "intent",
  "event_type",
  "affiliate_id",
  "entity_id"
];
const SYSTEM_LOGS_HEADERS = ["timestamp", "event_type", "message"];
const VALID_EVENT_TYPES = ["message", "impression", "click"];

function doPost(e) {
  try {
    const payload = parseWorkerPayload(e);
    const event = normalizeCanonicalEvent(payload);

    if (VALID_EVENT_TYPES.indexOf(event.event_type) === -1) {
      appendSystemLog("invalid_event_type", "Rejected event_type: " + event.event_type);
      return jsonResponse({ ok: false, error: "Invalid event payload." });
    }

    appendAnalyticsEvent(event);

    return jsonResponse({ ok: true });
  } catch (error) {
    appendSystemLog("event_write_failed", error);
    return jsonResponse({ ok: false, error: "Event write failed." });
  }
}

function doGet() {
  return jsonResponse({ ok: true });
}

function doOptions() {
  return jsonResponse({ ok: true });
}

function parseWorkerPayload(e) {
  const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  return JSON.parse(rawBody);
}

function normalizeCanonicalEvent(payload) {
  const eventType = String(payload.event_type || "message").trim().toLowerCase();

  return {
    timestamp: String(payload.timestamp || new Date().toISOString()),
    session_id: String(payload.session_id || ""),
    message_id: String(payload.message_id || ""),
    user_input: String(payload.user_input || payload.user_message || ""),
    bot_response: String(payload.bot_response || ""),
    intent: String(payload.intent || ""),
    event_type: eventType,
    affiliate_id: String(payload.affiliate_id || payload.affiliate || ""),
    entity_id: String(payload.entity_id || "")
  };
}

function appendAnalyticsEvent(event) {
  withDocumentLock(function () {
    getSheet(EVENTS_ANALYTICS_SHEET_NAME, EVENTS_ANALYTICS_HEADERS).appendRow([
      event.timestamp,
      event.session_id,
      event.message_id,
      event.user_input,
      event.bot_response,
      event.intent,
      event.event_type,
      event.affiliate_id,
      event.entity_id
    ]);
  });
}

function appendSystemLog(eventType, error) {
  try {
    withDocumentLock(function () {
      getSheet(SYSTEM_LOGS_SHEET_NAME, SYSTEM_LOGS_HEADERS).appendRow([
        new Date().toISOString(),
        String(eventType || ""),
        String(error && error.message ? error.message : error || "")
      ]);
    });
  } catch (_) {
    return;
  }
}

function withDocumentLock(callback) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getSheet(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.openById(PRODUCTION_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  ensureHeaders(sheet, headers);
  return sheet;
}

function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0]
    .map(function (value) {
      return String(value || "").trim();
    });
  const headersMatch = headers.every(function (header, index) {
    return currentHeaders[index] === header;
  });

  if (!headersMatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
