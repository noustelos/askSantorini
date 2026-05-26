const PRODUCTION_SPREADSHEET_ID = "1OlhF14hzMGc0jweKgq-3O_PtSKn0E9-wBbZXZBano9E";
const EVENTS_ANALYTICS_SHEET_NAME = "events_analytics";
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
const VALID_EVENT_TYPES = ["message", "impression", "click"];

function doPost(event) {
  try {
    const payload = JSON.parse(event?.postData?.contents || "{}");
    const canonicalEvent = normalizeCanonicalEvent(payload);

    if (!VALID_EVENT_TYPES.includes(canonicalEvent.event_type)) {
      return jsonResponse({ ok: false, error: "Invalid event payload." });
    }

    appendAnalyticsEvent(canonicalEvent);

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

function normalizeCanonicalEvent(payload) {
  return {
    timestamp: String(payload.timestamp || new Date().toISOString()),
    session_id: String(payload.session_id || ""),
    message_id: String(payload.message_id || ""),
    user_input: String(payload.user_input || payload.user_message || ""),
    bot_response: String(payload.bot_response || ""),
    intent: String(payload.intent || ""),
    event_type: String(payload.event_type || "").trim().toLowerCase(),
    affiliate_id: String(payload.affiliate_id || ""),
    entity_id: String(payload.entity_id || "")
  };
}

function appendAnalyticsEvent(event) {
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
}

function appendSystemLog(eventType, error) {
  try {
    getSheet("system_logs", ["timestamp", "event_type", "message"]).appendRow([
      new Date().toISOString(),
      String(eventType || ""),
      String(error?.message || error || "")
    ]);
  } catch {
    return;
  }
}

function getSheet(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.openById(PRODUCTION_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
