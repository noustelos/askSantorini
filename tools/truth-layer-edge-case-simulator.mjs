const truthLayerFactualFields = ["phone", "website", "maps_url"];

const greeklishLookupMap = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o"
};

const greeklishPlaceAliases = [
  ["fira", ["thira", "thera", "fyra", "φηρα", "θυρα"]],
  ["oia", ["ia", "oinia", "οια"]],
  ["imerovigli", ["imerovili", "ημεροβιγλι"]],
  ["firostefani", ["φυροστεφανι", "φηροστεφανι"]]
];

const mockEntities = [
  {
    entityId: "astra-suites-hotel",
    name: "Astra Suites",
    type: "hotel",
    phone: "",
    websiteUrl: "https://example.com/astra",
    mapsUrl: ""
  },
  {
    entityId: "astra-villas-hotel",
    name: "Astra Villas",
    type: "hotel",
    phone: "tel:+302286000000",
    websiteUrl: "",
    mapsUrl: ""
  },
  {
    entityId: "fira-view-hotel",
    name: "Fira View Hotel",
    type: "hotel",
    phone: "",
    websiteUrl: "",
    mapsUrl: "https://maps.google.com/?q=Fira%20View%20Hotel"
  },
  {
    entityId: "oia-sunset-cruises-tour",
    name: "Oia Sunset Cruises",
    type: "tour",
    phone: "",
    websiteUrl: "https://example.com/oia-sunset",
    mapsUrl: ""
  }
];

const cases = [
  {
    name: "partial hotel name",
    query: "Call Astra Suites",
    expectedEntityId: "astra-suites-hotel",
    expectedMissing: ["phone", "maps_url"]
  },
  {
    name: "wrong spelling",
    query: "website for Asta Sutes",
    expectedEntityId: "astra-suites-hotel"
  },
  {
    name: "mixed Greek/English diacritics",
    query: "πού είναι το Fíra view hotel στη Φηρά",
    expectedEntityId: "fira-view-hotel"
  },
  {
    name: "multiple similar entities",
    query: "Astra hotel phone",
    expectedAmbiguous: true
  },
  {
    name: "missing requested field fallback",
    query: "phone for Oia Sunset Cruises",
    expectedEntityId: "oia-sunset-cruises-tour",
    expectedRequestedMissing: "phone"
  }
];

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transliterateGreekToLatin(value) {
  return String(value || "")
    .split("")
    .map((char) => greeklishLookupMap[char] || char)
    .join("");
}

function applyGreeklishAliases(value) {
  let normalizedValue = ` ${value} `;

  greeklishPlaceAliases.forEach(([canonical, aliases]) => {
    [canonical, ...aliases].forEach((alias) => {
      normalizedValue = normalizedValue.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g"), canonical);
    });
  });

  return normalizedValue.trim();
}

function normalizeEntityLookupText(value) {
  return applyGreeklishAliases(
    transliterateGreekToLatin(
      String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9α-ω]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
  )
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLookupTokens(value) {
  return normalizeEntityLookupText(value).split(" ").filter((token) => token.length > 1);
}

function levenshteinDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const matrix = Array.from({ length: right.length + 1 }, (_, row) => [row]);

  for (let column = 0; column <= left.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= right.length; row += 1) {
    for (let column = 1; column <= left.length; column += 1) {
      const substitutionCost = right[row - 1] === left[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[right.length][left.length];
}

function getSimilarityScore(a, b) {
  const left = normalizeEntityLookupText(a);
  const right = normalizeEntityLookupText(b);

  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.2, 0.96);
  }

  return Math.max(0, 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length));
}

function scoreTruthLayerEntityMatch(message, entity) {
  const normalizedMessage = normalizeEntityLookupText(message);
  const normalizedName = normalizeEntityLookupText(entity.name);
  const entityTokens = getLookupTokens(entity.name);
  const messageTokens = new Set(getLookupTokens(message));

  if (!normalizedMessage || !normalizedName) return 0;
  if (normalizedMessage.includes(normalizedName)) return 1;

  const tokenMatches = entityTokens.filter((token) => messageTokens.has(token)).length;
  const tokenCoverage = entityTokens.length ? tokenMatches / entityTokens.length : 0;
  const tokenSimilarityScores = entityTokens.map((token) => {
    return Math.max(...Array.from(messageTokens).map((messageToken) => getSimilarityScore(messageToken, token)), 0);
  });
  const averageTokenSimilarity = tokenSimilarityScores.length
    ? tokenSimilarityScores.reduce((total, score) => total + score, 0) / tokenSimilarityScores.length
    : 0;
  const fuzzyScore = Math.max(getSimilarityScore(normalizedMessage, normalizedName), averageTokenSimilarity);

  return Math.max(Math.min(tokenCoverage * 1.24, 0.86), fuzzyScore * 0.92);
}

function findTruthLayerEntityInMessage(message, entities) {
  const matches = entities
    .map((entity) => ({ entity, confidence: scoreTruthLayerEntityMatch(message, entity) }))
    .filter((match) => match.confidence >= 0.62)
    .sort((a, b) => b.confidence - a.confidence || String(a.entity.entityId).localeCompare(String(b.entity.entityId)));
  const [top, second] = matches;
  const ambiguous = Boolean(top && second && top.confidence < 0.98 && (top.confidence - second.confidence) < 0.08);

  return {
    entity: ambiguous ? null : top?.entity || null,
    confidence: top ? Number(top.confidence.toFixed(3)) : 0,
    ambiguous,
    candidates: matches.slice(0, 3).map((match) => ({
      entityId: match.entity.entityId,
      confidence: Number(match.confidence.toFixed(3))
    }))
  };
}

function getMissingFields(entity) {
  return truthLayerFactualFields.filter((field) => {
    if (field === "phone") return !entity.phone;
    if (field === "website") return !entity.websiteUrl;
    if (field === "maps_url") return !entity.mapsUrl;
    return true;
  });
}

function getIntent(query) {
  if (/\b(phone|call|τηλέφωνο)\b/i.test(query)) return "phone";
  if (/\b(website|site|ιστοσελίδα)\b/i.test(query)) return "website";
  if (/\b(map|maps|where|πού|που)\b/i.test(query)) return "maps_url";
  return "general_info";
}

function getRequestedMissingField(intent, missingFields) {
  if (intent === "phone" && missingFields.includes("phone")) return "phone";
  if (intent === "website" && missingFields.includes("website")) return "website";
  if (intent === "maps_url" && missingFields.includes("maps_url")) return "maps_url";
  return "";
}

let failures = 0;

cases.forEach((testCase) => {
  const match = findTruthLayerEntityInMessage(testCase.query, mockEntities);
  const entity = match.entity;
  const missingFields = entity ? getMissingFields(entity) : truthLayerFactualFields;
  const requestedMissing = entity ? getRequestedMissingField(getIntent(testCase.query), missingFields) : "";
  const result = {
    case: testCase.name,
    query: testCase.query,
    entity_id: entity?.entityId || "",
    entity_match_confidence: match.confidence,
    fallback_triggered: Boolean(match.ambiguous || !entity || requestedMissing),
    missing_fields_list: missingFields,
    requested_missing_field: requestedMissing,
    ambiguous: match.ambiguous,
    candidates: match.candidates
  };
  const passed = (testCase.expectedAmbiguous ? result.ambiguous : result.entity_id === testCase.expectedEntityId)
    && (!testCase.expectedRequestedMissing || result.requested_missing_field === testCase.expectedRequestedMissing)
    && (!testCase.expectedMissing || testCase.expectedMissing.every((field) => result.missing_fields_list.includes(field)));

  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"} ${testCase.name}`);
  console.log(JSON.stringify(result, null, 2));
});

if (failures) {
  process.exitCode = 1;
}
