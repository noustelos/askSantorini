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
  const debug = {
    executed: true,
    timestamp: new Date().toISOString(),
    raw_payload: "",
    parsed_payload: null,
    normalized_event: null,
    sheet_lookup: null,
    append_row: null,
    error: null
  };

  try {
    const payloadParse = parseWorkerPayload(e);
    debug.raw_payload = payloadParse.rawBody;
    debug.parsed_payload = payloadParse.payload;

    console.log("AskSantorini webhook debug incoming payload:", debug.parsed_payload);

    const payload = payloadParse.payload;
    const event = normalizeCanonicalEvent(payload);
    debug.normalized_event = event;

    if (VALID_EVENT_TYPES.indexOf(event.event_type) === -1) {
      appendSystemLog("invalid_event_type", "Rejected event_type: " + event.event_type);
      debug.error = "Invalid event payload.";
      return jsonResponse({ ok: false, error: "Invalid event payload.", debug: debug });
    }

    debug.append_row = appendAnalyticsEvent(event, debug);

    return jsonResponse({ ok: true, debug: debug });
  } catch (error) {
    debug.error = String(error && error.stack ? error.stack : error);
    console.log("AskSantorini webhook debug error:", debug.error);
    appendSystemLog("event_write_failed", error);
    return jsonResponse({ ok: false, error: "Event write failed.", debug: debug });
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
  return {
    rawBody: rawBody,
    payload: JSON.parse(rawBody)
  };
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

function appendAnalyticsEvent(event, debug) {
  return withDocumentLock(function () {
    const sheet = getSheet(EVENTS_ANALYTICS_SHEET_NAME, EVENTS_ANALYTICS_HEADERS, debug);
    const row = [
      event.timestamp,
      event.session_id,
      event.message_id,
      event.user_input,
      event.bot_response,
      event.intent,
      event.event_type,
      event.affiliate_id,
      event.entity_id
    ];

    sheet.appendRow(row);

    const result = {
      success: true,
      sheet_name: sheet.getName(),
      row_number: sheet.getLastRow(),
      column_count: row.length
    };

    console.log("AskSantorini webhook debug appendRow result:", result);

    return result;
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

function getSheet(sheetName, headers, debug) {
  let spreadsheet = null;
  let sheet = null;

  try {
    spreadsheet = SpreadsheetApp.openById(PRODUCTION_SPREADSHEET_ID);
    sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  } catch (error) {
    if (debug) {
      debug.sheet_lookup = {
        success: false,
        spreadsheet_id: PRODUCTION_SPREADSHEET_ID,
        sheet_name: sheetName,
        error: String(error && error.message ? error.message : error)
      };
    }
    console.log("AskSantorini webhook debug sheet lookup failure:", debug ? debug.sheet_lookup : error);
    throw error;
  }

  if (debug) {
    debug.sheet_lookup = {
      success: true,
      spreadsheet_id: PRODUCTION_SPREADSHEET_ID,
      sheet_name: sheetName,
      actual_sheet_name: sheet.getName(),
      last_row_before_append: sheet.getLastRow()
    };
  }

  console.log("AskSantorini webhook debug sheet lookup success:", debug ? debug.sheet_lookup : sheetName);

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
