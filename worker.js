const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    try {
      const url = new URL(request.url);
      const body = await request.json();

      if (url.pathname === "/event") {
        await forwardEvent(body);
        return jsonResponse({ ok: true });
      }

      const prompt = String(body?.prompt || body?.message || "").trim();

      if (!prompt) {
        return jsonResponse({ error: "Prompt is required." }, 400);
      }

      const reply = await callGemini(env, prompt);

      return jsonResponse({ reply });
    } catch (error) {
      console.error("AskSantorini Worker error:", error);
      return jsonResponse({ error: "Could not generate a reply." }, 500);
    }
  }
};

const eventWebhookUrl = "https://script.google.com/macros/s/AKfycbwEqy4SSGX1U_n4KAfa33zFlYAobweU2tYLR-_B3NcH6FYceplSwPDWvTrSoEhV5_RG/exec";
const eventForwardUrls = [
  `${eventWebhookUrl}?sink=analytics`,
  `${eventWebhookUrl}?sink=monetization`
];

function normalizeEventPayload(payload) {
  const event = {
    ...(payload && typeof payload === "object" ? payload : {})
  };

  event.timestamp = String(event.timestamp || new Date().toISOString());
  event.session_id = String(event.session_id || "");
  event.user_message = String(event.user_message || "");
  event.bot_response = String(event.bot_response || "");
  event.intent = String(event.intent || "");
  event.event_type = String(event.event_type || "message").toLowerCase();

  return event;
}

async function forwardEvent(payload) {
  const event = normalizeEventPayload(payload);

  await Promise.allSettled(eventForwardUrls.map(async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      console.warn("AskSantorini event proxy received non-OK response:", url, response.status);
    }
  })).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn("AskSantorini event proxy failed:", eventForwardUrls[index], result.reason);
      }
    });
  });
}

async function callGemini(env, prompt) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
