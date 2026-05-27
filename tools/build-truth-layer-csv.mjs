#!/usr/bin/env node
/**
 * tools/build-truth-layer-csv.mjs
 *
 * Reads a JSON list of business entries and emits a CSV ready to paste into the
 * `entities_truth_layer` tab of the AskSantorini Truth Layer Google Sheet.
 *
 * Usage:
 *   node tools/build-truth-layer-csv.mjs <input.json> <output.csv> [report.json]
 *
 * Input schema (input.json):
 * [
 *   {
 *     "name": "Aqua Blue Hotel",
 *     "type": "hotel",
 *     "phone": "+30 22860 12345",
 *     "website": "https://aquabluehotel.gr",
 *     "maps_url": "https://maps.app.goo.gl/example",
 *     "active": true,
 *     "entity_id": "hotel_aqua_blue_oia"  // optional, auto-generated if omitted
 *   },
 *   ...
 * ]
 *
 * Output CSV columns (in order):
 *   entity_id, name, type, phone, website, maps_url, active
 *
 * Validation rules (rows failing any are dropped and logged in the report):
 *   - name: required, non-empty string
 *   - type: required, one of: hotel, villa, restaurant, beach, club, transport, service, place
 *   - phone: optional; if provided, must be normalised to E.164-ish (digits + optional leading +)
 *   - website: optional; if provided, must be a parseable URL
 *   - maps_url: optional; if provided, must be a parseable URL
 *   - At least one of phone / website / maps_url must be present (otherwise no CTA possible)
 *   - active: optional, defaults to true
 *   - entity_id: auto-generated from `${type}_${slug(name)}` if omitted; deduped across rows
 */

import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const reportPath = process.argv[4] || null;

if (!inputPath || !outputPath) {
  console.error("Usage: node tools/build-truth-layer-csv.mjs <input.json> <output.csv> [report.json]");
  process.exit(1);
}

const allowedTypes = new Set(["hotel", "villa", "restaurant", "beach", "club", "transport", "service", "place"]);
const csvHeaders = ["entity_id", "name", "type", "phone", "website", "maps_url", "active"];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function normalisePhone(value) {
  if (!value) return "";
  const cleaned = String(value).replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  // Must contain at least 8 digits to be plausible
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length < 8) return null;
  return cleaned;
}

function isValidUrl(value) {
  if (!value) return true; // optional
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normaliseActive(value) {
  if (value === undefined || value === null || value === "") return "TRUE";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const str = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on", "active"].includes(str)) return "TRUE";
  if (["false", "0", "no", "n", "off", "inactive"].includes(str)) return "FALSE";
  return "TRUE";
}

function csvEscape(value) {
  const str = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.entities)) return parsed.entities;
  throw new Error("Input must be a JSON array or an object with an `entities` array.");
}

function processEntries(entries) {
  const accepted = [];
  const rejected = [];
  const seenIds = new Set();

  entries.forEach((rawEntry, index) => {
    const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
    const errors = [];

    const name = String(entry.name || "").trim();
    if (!name) errors.push("missing name");

    const type = String(entry.type || "").trim().toLowerCase();
    if (!type) errors.push("missing type");
    else if (!allowedTypes.has(type)) errors.push(`type "${type}" not in allowed set`);

    const phone = normalisePhone(entry.phone);
    if (phone === null) errors.push("phone failed normalisation (needs >= 8 digits)");

    const website = entry.website ? String(entry.website).trim() : "";
    if (website && !isValidUrl(website)) errors.push("website is not a valid http(s) URL");

    const mapsUrl = entry.maps_url ? String(entry.maps_url).trim() : "";
    if (mapsUrl && !isValidUrl(mapsUrl)) errors.push("maps_url is not a valid http(s) URL");

    const hasContact = Boolean(phone) || Boolean(website) || Boolean(mapsUrl);
    if (!hasContact) errors.push("no contact channel provided (need at least one of phone / website / maps_url)");

    let entityId = String(entry.entity_id || "").trim();
    if (!entityId && name && type) {
      entityId = `${type}_${slugify(name)}`;
    }
    if (!entityId) {
      errors.push("could not derive entity_id");
    } else if (seenIds.has(entityId)) {
      errors.push(`duplicate entity_id "${entityId}" in this batch`);
    }

    if (errors.length) {
      rejected.push({ index, name, type, errors });
      return;
    }

    seenIds.add(entityId);
    accepted.push({
      entity_id: entityId,
      name,
      type,
      phone: phone || "",
      website,
      maps_url: mapsUrl,
      active: normaliseActive(entry.active)
    });
  });

  return { accepted, rejected };
}

function toCsv(rows) {
  const lines = [csvHeaders.join(",")];
  rows.forEach((row) => {
    lines.push(csvHeaders.map((header) => csvEscape(row[header])).join(","));
  });
  return lines.join("\n") + "\n";
}

const absoluteInput = path.resolve(inputPath);
const absoluteOutput = path.resolve(outputPath);
const absoluteReport = reportPath ? path.resolve(reportPath) : null;

const entries = readJson(absoluteInput);
const { accepted, rejected } = processEntries(entries);

fs.writeFileSync(absoluteOutput, toCsv(accepted), "utf8");

const report = {
  generated_at: new Date().toISOString(),
  input: absoluteInput,
  output: absoluteOutput,
  totals: {
    input: entries.length,
    accepted: accepted.length,
    rejected: rejected.length
  },
  rejected
};

if (absoluteReport) {
  fs.writeFileSync(absoluteReport, JSON.stringify(report, null, 2), "utf8");
}

console.log(`✅ Wrote ${accepted.length} valid rows to ${absoluteOutput}`);
if (rejected.length) {
  console.warn(`⚠️  Skipped ${rejected.length} invalid rows${absoluteReport ? ` (see ${absoluteReport})` : ""}:`);
  rejected.slice(0, 5).forEach((entry) => {
    console.warn(`   [${entry.index}] ${entry.name || "(no name)"} — ${entry.errors.join("; ")}`);
  });
  if (rejected.length > 5) console.warn(`   ... and ${rejected.length - 5} more`);
}
