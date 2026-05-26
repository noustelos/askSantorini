import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const reportPath = process.argv[4];

if (!inputPath || !outputPath || !reportPath) {
  throw new Error("Usage: node tools/migrate-sheet-governance.mjs <input.csv> <output.csv> <report.json>");
}

const allowedTypes = new Set(["hotel", "villa", "restaurant", "beach", "club", "transport", "service", "place"]);
const activeMap = new Map([
  ["yes", "true"],
  ["1", "true"],
  ["true", "true"],
  ["no", "false"],
  ["0", "false"],
  ["false", "false"]
]);

const columnAliases = {
  name: ["name", "title", "hotel name", "business name"],
  phone: ["phone", "phone number", "tel", "telephone"],
  website: ["website", "url", "site", "website link"],
  maps_url: ["maps_url", "map", "location link"],
  active: ["active", "status", "enabled", "live"]
};

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      field += char;
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows.filter((item) => item.some((value) => String(value || "").trim()));
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n") + "\n";
}

function normalizeHeader(header) {
  return String(header || "").trim().toLowerCase();
}

function getAliasedValue(row, headers, aliases) {
  const match = aliases.find((alias) => headers.includes(alias));
  return match ? String(row[headers.indexOf(match)] || "").trim() : "";
}

function normalizeEntityId(name, type, existingId) {
  const source = existingId || `${name}_${type}`;
  return String(source || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("30") && digits.length >= 10 && digits.length <= 12) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 11) return `+30${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
}

function normalizeUrl(url) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) return "";
  return /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl.replace(/^\/+/, "")}`;
}

function normalizeActive(active) {
  return activeMap.get(String(active || "").trim().toLowerCase()) || "";
}

function normalizeName(name) {
  return String(name || "").replace(/\s+/g, " ").trim();
}

function normalizeType(type) {
  return String(type || "").trim().toLowerCase();
}

function normalizePriority(priority) {
  const number = Number(String(priority || "").trim());
  return Number.isFinite(number) ? String(number) : "";
}

const source = fs.readFileSync(inputPath, "utf8");
const [headerRow, ...sourceRows] = parseCsv(source);
const sourceHeaders = headerRow.map(normalizeHeader);
const outputHeaders = [
  "entity_id",
  "name",
  "type",
  "phone",
  "website",
  "maps_url",
  "active",
  "address",
  "tags",
  "priority",
  ...headerRow.map((header) => `legacy_${header}`)
];
const rows = [];
const duplicateWinners = new Map();
const ambiguousMappings = [];
const rejectedRows = [];
const normalizedRows = [];

sourceRows.forEach((sourceRow, index) => {
  const rowNumber = index + 2;
  const name = normalizeName(getAliasedValue(sourceRow, sourceHeaders, columnAliases.name));
  const type = normalizeType(getAliasedValue(sourceRow, sourceHeaders, ["type"]));
  const phone = normalizePhone(getAliasedValue(sourceRow, sourceHeaders, columnAliases.phone));
  const website = normalizeUrl(getAliasedValue(sourceRow, sourceHeaders, columnAliases.website));
  const mapsUrl = normalizeUrl(getAliasedValue(sourceRow, sourceHeaders, columnAliases.maps_url));
  const active = normalizeActive(getAliasedValue(sourceRow, sourceHeaders, columnAliases.active));
  const address = getAliasedValue(sourceRow, sourceHeaders, ["address"]);
  const tags = getAliasedValue(sourceRow, sourceHeaders, ["tags"]);
  const priority = normalizePriority(getAliasedValue(sourceRow, sourceHeaders, ["priority"]));
  const entityId = normalizeEntityId(name, type, getAliasedValue(sourceRow, sourceHeaders, ["entity_id"]));
  const reasons = [];

  if (!name) reasons.push("missing name");
  if (!type) reasons.push("missing type");
  if (type && !allowedTypes.has(type)) reasons.push(`invalid type: ${type}`);
  if (!active) reasons.push("missing or invalid active");
  if (!phone) reasons.push("missing or invalid phone");
  if (!website) reasons.push("missing or invalid website");
  if (!mapsUrl) reasons.push("missing or invalid maps_url");

  if (type && !allowedTypes.has(type)) {
    ambiguousMappings.push({
      rowNumber,
      field: "type",
      value: type,
      note: "No automatic mapping applied because Governance v1 enum does not include this value."
    });
  }

  const migratedRow = [
    entityId,
    name,
    type,
    phone,
    website,
    mapsUrl,
    active,
    address,
    tags,
    priority,
    ...sourceRow
  ];

  rows.push(migratedRow);

  if (reasons.length) {
    rejectedRows.push({ rowNumber, entityId, name, type, reasons });
  } else {
    const duplicateKey = `${entityId}|${name.toLowerCase()}:${type}`;
    const currentWinner = duplicateWinners.get(duplicateKey);
    const currentPriority = Number(priority) || 0;

    if (!currentWinner || currentPriority > currentWinner.priority) {
      duplicateWinners.set(duplicateKey, { rowNumber, priority: currentPriority, entityId, name, type });
    }
  }

  normalizedRows.push({
    rowNumber,
    entityId,
    fields: {
      name: name !== getAliasedValue(sourceRow, sourceHeaders, columnAliases.name),
      phone: Boolean(phone),
      website: Boolean(website),
      maps_url: Boolean(mapsUrl),
      active: Boolean(active),
      priority: Boolean(priority)
    }
  });
});

const report = {
  source: path.basename(inputPath),
  output: path.basename(outputPath),
  rowsMigrated: rows.length,
  rowsRejectedOrFlagged: rejectedRows.length,
  entitiesNormalized: normalizedRows.filter((row) => Object.values(row.fields).some(Boolean)).length,
  duplicateWinners: Array.from(duplicateWinners.values()),
  ambiguousMappings,
  rejectedRows,
  safety: {
    dataLoss: false,
    oldColumnsPreservedAsLegacyColumns: true,
    liveSheetModified: false
  }
};

fs.writeFileSync(outputPath, toCsv([outputHeaders, ...rows]));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
