const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const intentRules = [
  {
    type: "transport",
    pattern: /\b(airport|transfer|transfers|taxi|taxis|pickup|pickups|hotel arrival)\b/i
  },
  {
    type: "hotel",
    pattern: /\b(hotel|hotels|villa|villas|stay|stays|accommodation|room|rooms|booking)\b/i
  },
  {
    type: "tour",
    pattern: /\b(tour|tours|experience|experiences|sunset|guide|guided|activity|activities)\b/i
  }
];

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    try {
      const body = await request.json();
      const message = String(body?.message || "").trim();

      if (!message) {
        return jsonResponse({ error: "Message is required." }, 400);
      }

      const affiliates = await fetchAffiliateData(env);
      const intent = detectIntent(message);
      const selectedAffiliate = rankAffiliate(affiliates, intent, message);
      const reply = await callGemini(env, message, selectedAffiliate);

      return jsonResponse({ reply });
    } catch (error) {
      console.error("AskSantorini Worker error:", error);
      return jsonResponse({ error: "Could not generate a reply." }, 500);
    }
  }
};

async function fetchAffiliateData(env) {
  try {
    if (env.AFFILIATES_KV) {
      const value = await env.AFFILIATES_KV.get("affiliates", "json");
      return normalizeAffiliates(value);
    }

    if (env.AFFILIATES_JSON_URL) {
      const response = await fetch(env.AFFILIATES_JSON_URL, {
        headers: { Accept: "application/json" },
        cf: { cacheTtl: 60, cacheEverything: true }
      });

      if (!response.ok) {
        throw new Error(`Affiliate JSON fetch failed: ${response.status}`);
      }

      const data = await response.json();
      return normalizeAffiliates(data);
    }
  } catch (error) {
    console.warn("Affiliate data unavailable:", error);
  }

  return [];
}

function normalizeAffiliates(data) {
  const affiliates = Array.isArray(data) ? data : data?.affiliates;

  if (!Array.isArray(affiliates)) {
    return [];
  }

  return affiliates
    .map((affiliate) => ({
      name: String(affiliate?.name || "").trim(),
      type: String(affiliate?.type || affiliate?.category || "").toLowerCase().trim(),
      priority: Number.isFinite(Number(affiliate?.priority)) ? Number(affiliate.priority) : 0,
      description: String(affiliate?.description || affiliate?.summary || "").trim(),
      website: String(affiliate?.website || "").trim(),
      phone: String(affiliate?.phone || "").trim(),
      email: String(affiliate?.email || "").trim(),
      keywords: Array.isArray(affiliate?.keywords) ? affiliate.keywords.map((keyword) => String(keyword).toLowerCase()) : []
    }))
    .filter((affiliate) => affiliate.name && affiliate.type);
}

function detectIntent(message) {
  const matchedRule = intentRules.find((rule) => rule.pattern.test(message));
  return matchedRule?.type || null;
}

function rankAffiliate(affiliates, intent, message) {
  if (!intent) {
    return null;
  }

  const normalizedMessage = message.toLowerCase();

  const matches = affiliates
    .filter((affiliate) => affiliate.type === intent)
    .map((affiliate) => {
      const keywordScore = affiliate.keywords.reduce((score, keyword) => {
        return normalizedMessage.includes(keyword) ? score + 1 : score;
      }, 0);

      return {
        affiliate,
        score: affiliate.priority * 10 + keywordScore
      };
    })
    .sort((a, b) => b.score - a.score);

  return matches[0]?.affiliate || null;
}

async function callGemini(env, message, affiliate) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const systemPrompt = buildSystemPrompt(affiliate);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 768
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini request failed.");
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("").trim();

  if (!text) {
    throw new Error("Gemini returned an empty reply.");
  }

  return text;
}

function buildSystemPrompt(affiliate) {
  const basePrompt = [
    "You are AskSantorini.ai, a helpful Santorini travel concierge.",
    "Answer the user's question first with practical local guidance.",
    "Keep the tone natural, neutral, helpful and non-promotional.",
    "Do not sound like an advertisement. Do not say best deal, book now, official, guaranteed, cheapest or top-rated.",
    "Do not invent schedules, prices, discounts or availability."
  ];

  if (!affiliate) {
    return basePrompt.join("\n");
  }

  const affiliateContext = [
    "",
    "Relevant concierge partner context:",
    `Name: ${affiliate.name}`,
    `Type: ${affiliate.type}`,
    affiliate.description ? `Description: ${affiliate.description}` : "",
    affiliate.website ? `Website: ${affiliate.website}` : "",
    affiliate.phone ? `Phone: ${affiliate.phone}` : "",
    affiliate.email ? `Email: ${affiliate.email}` : "",
    "",
    "If and only if it naturally helps the user's request, include one subtle concierge suggestion after the practical answer.",
    "Mention only this one partner. Never list multiple partners.",
    "Frame it as optional local knowledge, not as an ad.",
    `Example style: For airport transfers, many travelers use private services such as ${affiliate.name} for convenience.`,
    "Always advise users to confirm availability, timing and prices directly with the provider when relevant."
  ].filter(Boolean);

  return basePrompt.concat(affiliateContext).join("\n");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
