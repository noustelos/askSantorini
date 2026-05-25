const EVENTS_SHEET_NAME = "events";
const EVENTS_HEADERS = ["timestamp", "affiliate_name", "event_type", "intent_type", "session_id"];
const VALID_EVENT_TYPES = ["click", "impression"];

function doPost(event) {
  try {
    const payload = JSON.parse(event?.postData?.contents || "{}");
    const eventType = String(payload.event_type || "").trim().toLowerCase();
    const affiliateName = String(payload.affiliate || "").trim();
    const intentType = String(payload.intent_type || "").trim().toLowerCase();

    if (!affiliateName || !VALID_EVENT_TYPES.includes(eventType)) {
      return jsonResponse({ ok: false, error: "Invalid event payload." });
    }

    const sheet = getEventsSheet();
    sheet.appendRow([
      String(payload.timestamp || new Date().toISOString()),
      affiliateName,
      eventType,
      intentType,
      String(payload.session_id || "")
    ]);

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

function getEventsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(EVENTS_SHEET_NAME) || spreadsheet.insertSheet(EVENTS_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(EVENTS_HEADERS);
  }

  return sheet;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
