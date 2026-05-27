const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const eventWebhookUrl = "https://script.google.com/macros/s/AKfycbzTvfkY34RF0qD0cH2MeUxpobdrVLFeAX35hg4Y9MTVabyL-l6ggrBLaCVEzq4C9Y9d/exec";
const eventForwardUrls = [eventWebhookUrl];
const sessionEntityMemory = new Map();

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const url = new URL(request.url);

    // Event forwarding path — analytics writes go to Apps Script.
    if (url.pathname === "/event") {
      try {
        await forwardEvent(body);
        return jsonResponse({ ok: true });
      } catch (error) {
        console.error("AskSantorini event forward error:", error);
        return jsonResponse({ ok: false, error: "Event forward failed." }, 500);
      }
    }

    // Main chat path — ALWAYS call Gemini and return a populated reply.
    const prompt = String(body?.prompt || body?.message || "").trim();
    if (!prompt) {
      return jsonResponse({ error: "Prompt is required." }, 400);
    }

    const sessionId = String(body?.session_id || "");
    const incomingEntityId = String(body?.entity_id || "");
    const inheritedEntityId = sessionId ? sessionEntityMemory.get(sessionId) || "" : "";
    const entityId = incomingEntityId || inheritedEntityId;
    const entitySource = incomingEntityId ? "new" : inheritedEntityId ? "session" : "none";

    if (sessionId && incomingEntityId) {
      sessionEntityMemory.set(sessionId, incomingEntityId);
    }

    const intent = String(body?.intent || "").trim();

    try {
      const rawReply = await callGemini(env, prompt);
      const reply = sanitizeGeneratedFacts(rawReply);
      const llmPhoneAttempt = detectGeneratedPhoneAttempt(rawReply);

      return jsonResponse({
        reply,
        intent,
        entity_id: entityId,
        cta: null,
        debug: {
          entity_source: entitySource,
          llm_phone_attempt: llmPhoneAttempt,
          model: env.GEMINI_MODEL || "gemini-2.5-flash"
        }
      });
    } catch (error) {
      console.error("AskSantorini Worker error:", error);
      return jsonResponse({
        error: "Could not generate a reply.",
        message: String(error?.message || error || "")
      }, 500);
    }
  }
};

function normalizeEventPayload(payload) {
  const event = {
    ...(payload && typeof payload === "object" ? payload : {})
  };

  event.timestamp = String(event.timestamp || new Date().toISOString());
  event.session_id = String(event.session_id || "");
  event.message_id = String(event.message_id || "");
  event.user_input = String(event.user_input || event.user_message || "");
  event.user_message = String(event.user_message || event.user_input || "");
  event.bot_response = String(event.bot_response || "");
  event.intent = String(event.intent || "");
  event.event_type = String(event.event_type || "message").toLowerCase();
  event.affiliate_id = String(event.affiliate_id || "");

  const incomingEntityId = String(event.entity_id || "");
  const inheritedEntityId = event.session_id ? sessionEntityMemory.get(event.session_id) || "" : "";
  const resolvedEntityId = incomingEntityId || inheritedEntityId;
  const finalEntitySource = incomingEntityId ? "new" : inheritedEntityId ? "session" : "none";

  if (resolvedEntityId && event.session_id) {
    sessionEntityMemory.set(event.session_id, resolvedEntityId);
  }

  event.entity_id = resolvedEntityId;
  event.final_entity_source = finalEntitySource;

  console.log("AskSantorini Worker event context:", {
    sessionId: event.session_id,
    messageId: event.message_id,
    eventType: event.event_type,
    currentEntityId: event.entity_id,
    inheritedEntitySource: finalEntitySource
  });

  return event;
}

async function forwardEvent(payload) {
  const event = normalizeEventPayload(payload);

  const results = await Promise.allSettled(eventForwardUrls.map(async (url) => {
    const response = await postEventWithRetry(url, event);

    if (!response?.ok) {
      console.warn("AskSantorini event proxy received non-OK response:", url, response?.status || "no-response");
    }

    return response;
  }));

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn("AskSantorini event proxy failed:", eventForwardUrls[index], result.reason);
    }
  });
}

async function postEventWithRetry(url, event) {
  const request = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, request);

      if (response.ok || attempt === 1) {
        return response;
      }
    } catch (error) {
      if (attempt === 1) {
        console.warn("AskSantorini event proxy failed after retry:", error);
        return null;
      }
    }
  }

  return null;
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

function sanitizeGeneratedFacts(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\b(?:(?:https?:\/\/|www\.)[^\s<>()]+|tel:\+?[0-9().\-\s]+[0-9])/gi, "")
    .replace(/\btel:\+?[0-9().\-\s]+[0-9]\b/gi, "")
    .replace(/\+30[\s().-]*(?:\d[\s().-]*){8,14}\d/g, "")
    .replace(/\b(?:phone|telephone|tel|call|website|url|link|address|maps?|google maps)\s*:\s*[^.\n]+[.\n]?/gi, "")
    .replace(/\b(?:τηλέφωνο|ιστοσελίδα|διεύθυνση|χάρτης|χάρτες)\s*:\s*[^.\n]+[.\n]?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectGeneratedPhoneAttempt(text) {
  const sourceText = String(text || "");
  const phoneCandidatePattern = /(?:\+30[\s().-]*)?(?:\d[\s().-]*){7,14}\d/g;
  const emergencyPhonePattern = /\b(?:100|112|166|199)\b/;
  const phoneContextPattern = /\b(call|phone|telephone|tel|contact|dial|number|emergency|τηλέφωνο|κάλεσε|επικοινωνία|έκτακτη)\b/i;
  let hasContextualPhoneCandidate = false;

  sourceText.replace(phoneCandidatePattern, (match, offset) => {
    const contextStart = Math.max(0, offset - 48);
    const contextEnd = Math.min(sourceText.length, offset + String(match || "").length + 48);
    hasContextualPhoneCandidate = hasContextualPhoneCandidate
      || phoneContextPattern.test(sourceText.slice(contextStart, contextEnd));
    return match;
  });

  return /\btel:\+?[0-9().\-\s]+[0-9]\b/i.test(sourceText)
    || /\+30[\s().-]*(?:\d[\s().-]*){8,14}\d/.test(sourceText)
    || emergencyPhonePattern.test(sourceText)
    || hasContextualPhoneCandidate;
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
