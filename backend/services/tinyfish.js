/**
 * TinyFish Browser Automation Service
 * Connects to the official TinyFish Agent API (https://agent.tinyfish.ai/v1/automation)
 * Performs real browser automation missions to research travel destinations and alternatives.
 */

function getAutomationEndpoint(action = "/run") {
  const base = (process.env.TINYFISH_API_BASE || "https://agent.tinyfish.ai/v1/automation").replace(/\/+$/, "");
  if (base.endsWith("/v1/automation")) {
    return `${base}${action}`;
  }
  return `${base}/v1/automation${action}`;
}

/**
 * Executes an autonomous browser mission via TinyFish Agent API
 * @param {Object} params
 * @param {string} params.url - The target public website to browse
 * @param {string} params.goal - Plain-English goal for the browser agent
 * @param {Object} [params.output_schema] - JSON schema to enforce structured output
 * @param {number} [params.timeoutMs=90000] - Request timeout in milliseconds
 * @returns {Promise<Object>} The structured result from the TinyFish agent
 */
async function runTinyFishAgent({ url, goal, output_schema, timeoutMs = 300000 }) {
  const apiKey = (process.env.TINYFISH_API_KEY || "").trim();

  if (!apiKey) {
    const error = new Error("TINYFISH_API_KEY is not configured in backend environment (.env)");
    error.code = "MISSING_API_KEY";
    error.status = 500;
    throw error;
  }

  const endpoint = getAutomationEndpoint("/run");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestBody = {
      url,
      goal,
      browser_profile: "lite"
    };

    if (output_schema) {
      requestBody.output_schema = output_schema;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    clearTimeout(timer);

    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.message || response.statusText || "TinyFish request failed";
      const error = new Error(`TinyFish API Error (${response.status}): ${errorMessage}`);
      error.status = response.status;
      error.code = data?.error?.code || (response.status === 401 ? "INVALID_API_KEY" : "TINYFISH_API_ERROR");
      error.details = data;
      throw error;
    }

    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const timeoutErr = new Error(`TinyFish mission timed out after ${timeoutMs / 1000}s`);
      timeoutErr.code = "TIMEOUT";
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  }
}

/** Run a long browser task through TinyFish's cancellable async API. */
async function runTinyFishAgentAsync({ url, goal, output_schema, timeoutMs = 75000, pollIntervalMs = 1500 }) {
  const apiKey = (process.env.TINYFISH_API_KEY || "").trim();
  if (!apiKey) {
    const error = new Error("TINYFISH_API_KEY is not configured in backend environment (.env)");
    error.code = "MISSING_API_KEY";
    error.status = 500;
    throw error;
  }

  const base = (process.env.TINYFISH_API_BASE || "https://agent.tinyfish.ai/v1/automation").replace(/\/+$/, "");
  const endpoint = base.endsWith("/v1/automation") ? base : `${base}/v1/automation`;
  const apiRoot = endpoint.replace(/\/v1\/automation$/, "");
  const headers = { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" };
  const deadline = Date.now() + timeoutMs;

  async function request(url, init = {}) {
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!response.ok) {
        const error = new Error(data?.error?.message || data?.message || `TinyFish API Error (${response.status})`);
        error.status = response.status;
        error.code = data?.error?.code || (response.status === 401 ? "INVALID_API_KEY" : "TINYFISH_API_ERROR");
        error.details = data;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error(`TinyFish mission timed out after ${timeoutMs / 1000}s`);
        timeoutError.code = "TIMEOUT";
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  let runId = null;
  try {
    const started = await request(`${endpoint}/run-async`, {
      method: "POST",
      body: JSON.stringify({ url, goal, browser_profile: "lite", ...(output_schema ? { output_schema } : {}) })
    });
    runId = started?.run_id || started?.id;
    if (!runId) {
      const error = new Error("TinyFish async start response did not include a run_id");
      error.code = "INVALID_TINYFISH_RESPONSE";
      throw error;
    }

    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(1, deadline - Date.now()))));
      const run = await request(`${apiRoot}/v1/runs/${encodeURIComponent(runId)}`, { method: "GET" });
      const status = String(run?.status || "").toUpperCase();
      if (["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
        if (status !== "COMPLETED") {
          const error = new Error(run?.error?.message || `TinyFish mission ${status.toLowerCase()}`);
          error.code = status === "TIMED_OUT" ? "TIMEOUT" : (run?.error?.code || `TINYFISH_${status}`);
          error.status = status === "TIMED_OUT" ? 504 : 502;
          error.details = { runId, status };
          throw error;
        }
        return { ...run, run_id: run.run_id || runId, result: run.result ?? run.data?.result ?? run.data ?? null };
      }
    }
    const timeoutError = new Error(`TinyFish mission timed out after ${timeoutMs / 1000}s`);
    timeoutError.code = "TIMEOUT";
    timeoutError.status = 504;
    throw timeoutError;
  } catch (error) {
    if (runId) {
      const cancel = new AbortController();
      const cancelTimer = setTimeout(() => cancel.abort(), 2000);
      try {
        await fetch(`${apiRoot}/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", headers, signal: cancel.signal });
      } catch { /* preserve the original failure */ }
      finally { clearTimeout(cancelTimer); }
    }
    if (error.code === "TIMEOUT" && runId) error.details = { ...(error.details || {}), runId };
    throw error;
  }
}

/**
 * Extracts numeric INR price from price string if available
 * @param {string|number|null} priceVal
 * @returns {number|null}
 */
function parseNumericPrice(priceVal) {
  if (typeof priceVal === "number") return priceVal;
  if (!priceVal || typeof priceVal !== "string") return null;

  const lower = priceVal.toLowerCase();
  if (lower.includes("free") || lower.includes("no fee") || lower.includes("nil")) {
    return 0;
  }

  // Look for currency patterns like ₹250, Rs. 100, 50 INR, or just numbers
  const match = priceVal.match(/(?:₹|rs\.?|inr)?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)/i);
  if (match && match[1]) {
    const num = parseFloat(match[1].replace(/,/g, ""));
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Determine best public travel URL for a destination
 * @param {string} destination
 * @returns {string}
 */
function getTargetUrlForDestination(destination) {
  const norm = (destination || "").trim().toLowerCase();
  if (norm.includes("goa")) {
    return "https://en.wikipedia.org/wiki/Tourism_in_Goa";
  }
  return `https://en.wikipedia.org/wiki/Tourism_in_${encodeURIComponent(destination)}`;
}

/**
 * Research attractions for a destination using TinyFish browser agent
 * @param {string} destination - e.g. "Goa"
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function researchAttractions(destination, options = {}) {
  const targetUrl = options.url || getTargetUrlForDestination(destination);
  const researchTimestamp = new Date().toISOString();

  const goal = `Navigate the travel guide for ${destination} at ${targetUrl}.
Extract 5 to 8 top attractions, beaches, forts, temples, churches, or activities.
For each attraction, extract:
1. name: Exact official name of the attraction (e.g., Baga Beach, Aguada Fort, Basilica of Bom Jesus, Calangute Beach, Chapora Fort)
2. location: Neighborhood/Town/Region in ${destination}
3. entryPrice: Published entry ticket fee or price (e.g., 'Free', '₹50 per person', or 'Not published'). Do not invent prices.
4. openingHours: Visiting timings/opening hours (e.g., '9:00 AM - 5:30 PM' or 'Open 24 hours' or 'Not specified')
5. description: Brief 1-2 sentence description of highlights
6. category: One of 'beach', 'fort', 'heritage', 'nature', 'food', 'nightlife', or 'activity'
7. sourceUrl: The source web page URL (${targetUrl}).`;

  const outputSchema = {
    type: "object",
    properties: {
      destination: { type: "string" },
      attractions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            location: { type: "string" },
            entryPrice: { type: "string" },
            openingHours: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            sourceUrl: { type: "string" }
          },
          required: ["name", "location"]
        }
      }
    },
    required: ["destination", "attractions"]
  };

  const rawResult = await runTinyFishAgent({
    url: targetUrl,
    goal,
    output_schema: outputSchema,
    timeoutMs: options.timeoutMs || 300000
  });

  // Parse result from TinyFish response structure
  let extracted = rawResult?.result || rawResult?.data || rawResult;
  if (typeof extracted === "string") {
    try {
      extracted = JSON.parse(extracted);
    } catch {
      // keep as string or wrap
    }
  }

  const rawAttractions = Array.isArray(extracted?.attractions)
    ? extracted.attractions
    : Array.isArray(extracted)
    ? extracted
    : [];

  // Normalize each attraction
  let pricesConfirmedCount = 0;
  let pricesUnknownCount = 0;

  const normalizedAttractions = rawAttractions.map((item, idx) => {
    const rawPrice = item.entryPrice || item.price || null;
    const numericPrice = parseNumericPrice(rawPrice);
    const isPricePublished = rawPrice && !rawPrice.toLowerCase().includes("not published") && !rawPrice.toLowerCase().includes("unknown");

    if (numericPrice !== null || (rawPrice && rawPrice.toLowerCase().includes("free"))) {
      pricesConfirmedCount++;
    } else {
      pricesUnknownCount++;
    }

    return {
      id: `attr-${idx + 1}`,
      name: item.name || "Unknown Attraction",
      location: item.location || destination,
      entryPrice: rawPrice || "Not published / Unknown",
      numericPrice: numericPrice,
      isPricePublished: Boolean(isPricePublished),
      openingHours: item.openingHours || item.hours || "Not specified / Check locally",
      description: item.description || "",
      category: item.category || "sightseeing",
      sourceUrl: item.sourceUrl || targetUrl,
      researchTimestamp
    };
  });

  return {
    destination,
    researchTimestamp,
    sourceUrl: targetUrl,
    attractions: normalizedAttractions,
    metadata: {
      totalFound: normalizedAttractions.length,
      pricesConfirmedCount,
      pricesUnknownCount,
      agentRunId: rawResult?.run_id || rawResult?.id || null
    }
  };
}

/**
 * Researches budget-friendly alternatives when a trip exceeds budget or needs rescue
 * @param {string} destination - e.g. "Goa"
 * @param {Object} rescueParams - details on over-budget amount, categories to replace
 * @returns {Promise<Object>}
 */
async function researchBudgetAlternatives(destination, rescueParams = {}) {
  const targetUrl = rescueParams.url || getTargetUrlForDestination(destination);
  const researchTimestamp = new Date().toISOString();

  const goal = `Navigate the travel guide at ${targetUrl}.
Find free or highly affordable budget-friendly alternatives in ${destination} for travel rescue.
Focus on:
1. Free public beaches with no entry fee
2. Historic forts or scenic viewpoints with free or minimal entry fee (under ₹50)
3. Budget-friendly local food markets or street food zones
4. Public parks, churches, or walking areas
Extract: name, location, entryPrice (explicitly state 'Free' or exact low fee), openingHours, description, and sourceUrl.`;

  const outputSchema = {
    type: "object",
    properties: {
      destination: { type: "string" },
      budgetAlternatives: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            location: { type: "string" },
            entryPrice: { type: "string" },
            openingHours: { type: "string" },
            description: { type: "string" },
            savingsReason: { type: "string" },
            sourceUrl: { type: "string" }
          },
          required: ["name", "location"]
        }
      }
    },
    required: ["destination", "budgetAlternatives"]
  };

  const rawResult = await runTinyFishAgent({
    url: targetUrl,
    goal,
    output_schema: outputSchema,
    timeoutMs: rescueParams.timeoutMs || 180000
  });

  let extracted = rawResult?.result || rawResult?.data || rawResult;
  if (typeof extracted === "string") {
    try {
      extracted = JSON.parse(extracted);
    } catch {
      // keep
    }
  }

  const alternativesList = Array.isArray(extracted?.budgetAlternatives)
    ? extracted.budgetAlternatives
    : Array.isArray(extracted)
    ? extracted
    : [];

  const normalized = alternativesList.map((item, idx) => {
    const rawPrice = item.entryPrice || item.price || "Free";
    const numericPrice = parseNumericPrice(rawPrice);

    return {
      id: `alt-${idx + 1}`,
      name: item.name || "Budget Alternative",
      location: item.location || destination,
      entryPrice: rawPrice,
      numericPrice: numericPrice !== null ? numericPrice : 0,
      openingHours: item.openingHours || "Open access",
      description: item.description || "",
      savingsReason: item.savingsReason || "Zero or low entry fee alternative",
      sourceUrl: item.sourceUrl || targetUrl,
      researchTimestamp
    };
  });

  return {
    destination,
    researchTimestamp,
    sourceUrl: targetUrl,
    alternatives: normalized,
    metadata: {
      totalFound: normalized.length,
      agentRunId: rawResult?.run_id || rawResult?.id || null
    }
  };
}

/** Research public intercity transport listings in three bounded, independent missions. */
async function researchTransport({ origin, destination, startDate, endDate, travelers = 1, timeoutMs, modeTimeoutMs, modePollIntervalMs, modes: requestedModes }) {
  const researchTimestamp = new Date().toISOString();
  const modes = requestedModes || ["train", "flight", "bus"];
  if (!Array.isArray(modes) || !modes.length || modes.some(mode => !["train", "flight", "bus"].includes(mode))) {
    const error = new Error("modes must be a non-empty array containing train, flight, or bus");
    error.code = "INVALID_TRANSPORT_MODES";
    error.status = 400;
    throw error;
  }
  const schema = {
    type: "object",
    properties: {
      options: { type: "array", items: { type: "object", properties: {
        mode: { type: "string", enum: ["train", "flight", "bus"] }, operator: { type: "string" },
        serviceName: { type: "string" }, departure: { type: "string" }, arrival: { type: "string" },
        // TinyFish accepts one JSON Schema type per field; nullable fields use
        // nullable:true. Keep fares as published text and normalize below.
        fare: { type: "string", nullable: true }, fareBasis: { type: "string", nullable: true }, currency: { type: "string", nullable: true },
        availability: { type: "string", nullable: true }, sourceUrl: { type: "string" }, evidence: { type: "string" }
      }, required: ["mode", "sourceUrl"] } },
      sourceUrls: { type: "array", items: { type: "string" } }
    }, required: ["options"]
  };
  const safeUrl = (value) => { try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.toString() : null; } catch { return null; } };
  const perModeTimeoutMs = modeTimeoutMs || timeoutMs || 75000;
  const results = await Promise.all(modes.map(async (mode) => {
    const targetUrl = "https://www.google.com/search?q=" + encodeURIComponent(`${origin} to ${destination} ${mode} ${startDate}`);
    const goal = `Research only publicly visible ${mode} options from ${origin} to ${destination}. Outbound date: ${startDate}; return date: ${endDate || "one way"}; travelers: ${travelers}. Never sign in, enter personal data, interact with booking/payment steps, or book. Return only options actually found; never infer schedules, fares, or availability. For each option include mode, operator/name, service or flight number when shown, departure and arrival details when shown, displayed fare (otherwise null), currency, fare basis (per traveler, group total, or unknown), availability exactly as shown (otherwise null), direct source URL actually visited, and short evidence supporting any fare. A fare is verified only when the source explicitly displays it; do not use estimates. Keep this mission focused on ${mode}.`;
    try {
      const raw = await runTinyFishAgentAsync({ url: targetUrl, goal, output_schema: schema, timeoutMs: perModeTimeoutMs, pollIntervalMs: modePollIntervalMs || 1500 });
      let result = raw?.result ?? raw?.data ?? raw;
      if (result && !Array.isArray(result) && result.result !== undefined) result = result.result;
      if (typeof result === "string") { try { result = JSON.parse(result); } catch { result = {}; } }
      return { mode, raw, result, error: null };
    } catch (error) { return { mode, raw: null, result: {}, error: { code: error.code || "TRANSPORT_MODE_FAILED", message: error.message, details: error.details || null } }; }
  }));
  const options = results.flatMap(({ mode: requestedMode, result }) => {
    const inputOptions = Array.isArray(result?.options) ? result.options : Array.isArray(result) ? result : [];
    return inputOptions.map((item, index) => {
    const mode = ["train", "flight", "bus"].includes(String(item.mode).toLowerCase()) ? String(item.mode).toLowerCase() : "unknown";
    const fare = item.fare === null || item.fare === undefined || item.fare === "" ? null : item.fare;
    const explicitINR = item.currency === "INR" || (typeof fare === "string" && /(?:₹|rs\.?|inr)/i.test(fare));
    const numericFare = explicitINR ? (typeof fare === "number" ? fare : parseNumericPrice(fare)) : null;
    const sourceUrl = safeUrl(item.sourceUrl);
    const evidence = typeof item.evidence === "string" && item.evidence.trim() ? item.evidence.trim() : null;
    const evidenceIsEstimate = /\b(estimate|estimated|starting from|from as low as|approx(?:imate)?|average fare)\b/i.test(`${fare || ""} ${evidence || ""}`);
    const shownAvailability = typeof item.availability === "string" && item.availability.trim() && !/^(unknown|not known|not shown|not available|n\/a)$/i.test(item.availability.trim())
      ? item.availability.trim() : null;
    return { mode, operator: item.operator || null, serviceName: item.serviceName || null,
      departure: item.departure || null, arrival: item.arrival || null,
      fare: numericFare !== null && numericFare >= 0 ? numericFare : null,
      fareText: numericFare !== null ? String(fare) : null, fareBasis: item.fareBasis || null, currency: numericFare !== null ? (item.currency || "INR") : null,
      fareStatus: numericFare !== null && numericFare >= 0 && sourceUrl && evidence && !evidenceIsEstimate ? "verified" : "unknown",
      availability: shownAvailability,
      availabilityStatus: shownAvailability && sourceUrl && evidence ? "verified" : "unknown",
      sourceUrl, evidence, researchTimestamp,
      id: `transport-${requestedMode}-${index + 1}` };
    }).filter((item) => item.sourceUrl);
  });
  const sourceUrls = [...new Set(results.flatMap(({ result }) => [ ...(Array.isArray(result?.sourceUrls) ? result.sourceUrls : []), ...(Array.isArray(result?.options) ? result.options.map(x => x.sourceUrl) : []) ]).map(safeUrl).filter(Boolean))];
  const modeResults = results.map(({ mode, raw, error }) => ({ mode, status: error ? "FAILED" : "SUCCESS", runId: raw?.run_id || raw?.id || error?.details?.runId || null, ...(error || {}) }));
  const successfulModes = modeResults.filter(x => x.status === "SUCCESS").length;
  return { origin, destination, dates: { startDate, endDate: endDate || null }, travelers, researchTimestamp,
    options, sourceUrls, modeResults, metadata: { status: successfulModes === modes.length ? "SUCCESS" : successfulModes ? "PARTIAL" : "FAILED", successfulModes, failedModes: modes.length - successfulModes, totalFound: options.length, faresVerified: options.filter(x => x.fareStatus === "verified").length,
      faresUnknown: options.filter(x => x.fareStatus === "unknown").length, availabilityVerified: options.filter(x => x.availabilityStatus === "verified").length,
      agentRunIds: results.map(({ mode, raw, error }) => ({ mode, id: raw?.run_id || raw?.id || error?.details?.runId || null })) } };
}

module.exports = {
  runTinyFishAgent,
  runTinyFishAgentAsync,
  researchAttractions,
  researchBudgetAlternatives,
  parseNumericPrice,
  researchTransport
};
