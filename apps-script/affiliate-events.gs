const ANALYTICS_SHEET_NAME = "analytics_events";
const MONETIZATION_SHEET_NAME = "monetization_events";
const ANALYTICS_HEADERS = ["timestamp", "session_id", "user_message", "bot_response", "intent", "affiliate", "event_type"];
const MONETIZATION_HEADERS = ["timestamp", "affiliate", "event_type", "intent"];
const VALID_EVENT_TYPES = ["message", "impression", "click"];
const VALID_SINKS = ["analytics", "monetization"];

function doPost(event) {
  try {
    const payload = JSON.parse(event?.postData?.contents || "{}");
    const sink = String(event?.parameter?.sink || "").trim().toLowerCase();
    const canonicalEvent = normalizeCanonicalEvent(payload);

    if (!VALID_SINKS.includes(sink) || !VALID_EVENT_TYPES.includes(canonicalEvent.event_type)) {
      return jsonResponse({ ok: false, error: "Invalid event payload." });
    }

    if (sink === "analytics") {
      appendAnalyticsEvent(canonicalEvent);
    } else {
      appendMonetizationEvent(canonicalEvent);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
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
    user_message: String(payload.user_message || ""),
    bot_response: String(payload.bot_response || ""),
    intent: String(payload.intent || ""),
    affiliate: String(payload.affiliate || ""),
    event_type: String(payload.event_type || "").trim().toLowerCase()
  };
}

function appendAnalyticsEvent(event) {
  getEventSheet(ANALYTICS_SHEET_NAME, ANALYTICS_HEADERS).appendRow([
    event.timestamp,
    event.session_id,
    event.user_message,
    event.bot_response,
    event.intent,
    event.affiliate,
    event.event_type
  ]);
}

function appendMonetizationEvent(event) {
  getEventSheet(MONETIZATION_SHEET_NAME, MONETIZATION_HEADERS).appendRow([
    event.timestamp,
    event.affiliate,
    event.event_type,
    event.intent
  ]);
}

function getEventSheet(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
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
