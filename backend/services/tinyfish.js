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

    clearTimeout(timer);

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

module.exports = {
  runTinyFishAgent,
  researchAttractions,
  researchBudgetAlternatives,
  parseNumericPrice
};
