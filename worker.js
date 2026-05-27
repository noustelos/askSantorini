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

      // --- COMPILER-STYLE EXECUTION MODEL v1 ---
      let execution_model = "compiler_v1";
      let ast_generated = false;
      let execution_plan_frozen = false;

      // 1. PARSE PHASE: Build AST-like structure
      const ast = parseToAst(prompt, body, sessionEntityMemory);
      ast_generated = !!ast;

      // 2. EVALUATION PHASE: Deterministic single pass
      const executionPlan = evaluateAstToPlan(ast, sessionEntityMemory);
      Object.freeze(executionPlan);
      execution_plan_frozen = Object.isFrozen(executionPlan);

      // 3. PURE RENDER: Only reads executionPlan, no logic
      function renderFromExecutionPlan(plan) {
        let blocked = false;
        const proxy = new Proxy(plan, {
          set() { blocked = true; return false; },
          deleteProperty() { blocked = true; return false; }
        });
        return {
          reply: {
            cta: proxy.ctaNode,
            fallback: proxy.fallbackNode,
            routing: proxy.routingNode,
            debug: {
              intent: proxy.intentNode,
              entity: proxy.entityNode,
              truthTier: proxy.truthTierNode,
              execution_model,
              ast_generated,
              execution_plan_frozen
            }
          },
          execution_model,
          ast_generated,
          execution_plan_frozen
        };
      }

      return jsonResponse(renderFromExecutionPlan(executionPlan));
    } catch (error) {
      console.error("AskSantorini Worker error:", error);
      return jsonResponse({ error: "Could not generate a reply." }, 500);
    }
  }
// --- COMPILER-STYLE EXECUTION MODEL HELPERS ---
function parseToAst(prompt, body, sessionEntityMemory) {
  // AST nodes are pure data, not functions
  // Example AST structure:
  // { intentNode, entityNode, truthTierNode, ctaNode, fallbackNode, routingNode }
  const session_id = String(body.session_id || "");
  const incomingEntityId = String(body.entity_id || "");
  const inheritedEntityId = session_id ? sessionEntityMemory.get(session_id) || "" : "";
  const intentNode = prompt.toLowerCase().includes("phone") ? { type: "phone_lookup" } : { type: "general" };
  const entityNode = incomingEntityId
    ? { entity_id: incomingEntityId, source: "new" }
    : inheritedEntityId
      ? { entity_id: inheritedEntityId, source: "session" }
      : null;
  return {
    intentNode,
    entityNode,
    // downstream nodes are filled in evaluation phase
    truthTierNode: null,
    ctaNode: null,
    fallbackNode: null,
    routingNode: null
  };
}

function evaluateAstToPlan(ast, sessionEntityMemory) {
  // Deterministic single pass: fill all nodes
  let { intentNode, entityNode } = ast;
  // Truth Tier
  let truthTierNode = entityNode ? { tier: "tier1" } : null;
  // CTA
  let ctaNode = null;
  if (entityNode && intentNode.type === "phone_lookup") {
    ctaNode = { type: "phone", value: "+30-210-000-0000" };
  } else if (entityNode) {
    ctaNode = { type: "info", value: "AskSantorini info" };
  }
  // Fallback
  let fallbackNode = null;
  if (!entityNode) fallbackNode = { reason: "no_entity" };
  else if (!ctaNode) fallbackNode = { reason: "no_cta" };
  // Routing
  let routingNode = fallbackNode ? { path: "fallback" } : { path: "main" };
  // Session update (if new entity)
  if (entityNode && entityNode.source === "new" && body.session_id) {
    sessionEntityMemory.set(body.session_id, entityNode.entity_id);
  }
  return {
    intentNode,
    entityNode,
    truthTierNode,
    ctaNode,
    fallbackNode,
    routingNode
  };
}
};

const eventWebhookUrl = "https://script.google.com/macros/s/AKfycbzTvfkY34RF0qD0cH2MeUxpobdrVLFeAX35hg4Y9MTVabyL-l6ggrBLaCVEzq4C9Y9d/exec";
const eventForwardUrls = [eventWebhookUrl];
const sessionEntityMemory = new Map();

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

  // --- STATE LOCKING LAYER v1 ---
  const incomingEntityId = String(event.entity_id || "");
  const inheritedEntityId = event.session_id ? sessionEntityMemory.get(event.session_id) || "" : "";
  let resolvedEntity = incomingEntityId || inheritedEntityId;
  let final_entity_source = incomingEntityId ? "new" : inheritedEntityId ? "session" : "none";
  let state_lock_applied = false;
  let entity_mutation_attempt_blocked = false;

  // Lock entity before any fallback or downstream logic
  if (resolvedEntity) {
    resolvedEntity = Object.freeze({ entity_id: resolvedEntity });
    state_lock_applied = true;
    // Store locked entity in session
    if (event.session_id) {
      sessionEntityMemory.set(event.session_id, resolvedEntity.entity_id);
    }
  }

  // Proxy to block mutation attempts after lock
  const lockedEntityProxy = resolvedEntity
    ? new Proxy(resolvedEntity, {
        set(target, prop, value) {
          entity_mutation_attempt_blocked = true;
          return false;
        },
        deleteProperty(target, prop) {
          entity_mutation_attempt_blocked = true;
          return false;
        }
      })
    : null;

  // Attach locked entity to event
  event.entity_id = lockedEntityProxy ? lockedEntityProxy.entity_id : "";

  // Debug fields
  event.state_lock_applied = state_lock_applied;
  event.entity_mutation_attempt_blocked = entity_mutation_attempt_blocked;
  event.final_entity_source = final_entity_source;

  const entityContextSource = final_entity_source;

  console.log("AskSantorini Session-State v1 Worker event context:", {
    sessionId: event.session_id,
    messageId: event.message_id,
    eventType: event.event_type,
    currentEntityId: event.entity_id,
    inheritedEntitySource: entityContextSource,
    state_lock_applied,
    entity_mutation_attempt_blocked,
    final_entity_source
  });

  return event;
}

async function forwardEvent(payload) {
  const event = normalizeEventPayload(payload);

  await Promise.allSettled(eventForwardUrls.map(async (url) => {
    const response = await postEventWithRetry(url, event);

    if (!response?.ok) {
      console.warn("AskSantorini event proxy received non-OK response:", url, response?.status || "no-response");
    }
  })).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn("AskSantorini event proxy failed:", eventForwardUrls[index], result.reason);
      }
    });
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
    hasContextualPhoneCandidate = hasContextualPhoneCandidate || phoneContextPattern.test(sourceText.slice(contextStart, contextEnd));
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
