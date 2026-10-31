/**
 * Gemini AI Integration Service
 * Uses official @google/genai SDK to generate structured travel itineraries
 * strictly grounded in TinyFish browser research evidence.
 */

const { GoogleGenAI } = require("@google/genai");

/**
 * Helper to get an initialized GoogleGenAI client
 */
function getGeminiClient() {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is not configured in backend environment (.env)");
    error.code = "MISSING_API_KEY";
    error.status = 500;
    throw error;
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Generate content with automatic fallback across supported model tiers
 */
async function callGeminiJson({ prompt, systemInstruction }) {
  const ai = getGeminiClient();
  const candidateModels = ["gemini-3.5-flash", "gemini-3.8-flash"];

  let lastError = null;
  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || "You are an autonomous travel planner that outputs strictly valid JSON.",
          responseMimeType: "application/json"
        }
      });

      const text = response?.text;
      if (!text) throw new Error("Empty response from Gemini");

      return JSON.parse(text);
    } catch (err) {
      lastError = err;
      // If 404/503 or transient, try next model
      if (err.status === 404 || err.status === 503 || err.status === 429) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini model attempts failed");
}

/**
 * Generate a 3-day travel itinerary strictly grounded in TinyFish research results
 * @param {Object} params
 * @param {string} params.origin - e.g. "Bengaluru"
 * @param {string} params.destination - e.g. "Goa"
 * @param {string} params.startDate - e.g. "2026-11-15"
 * @param {string} params.endDate - e.g. "2026-11-17"
 * @param {number} params.travelers - Number of travelers
 * @param {number} params.budget - Total budget in INR
 * @param {string[]} params.interests - e.g. ["beaches", "food", "sightseeing"]
 * @param {Object} params.researchData - TinyFish research output containing attractions, prices, hours, sources
 * @returns {Promise<Object>} Structured 3-day itinerary JSON
 */
async function generateItinerary({
  origin,
  destination,
  startDate,
  endDate,
  travelers = 2,
  budget = 15000,
  interests = [],
  researchData
}) {
  const attractions = researchData?.attractions || [];
  const sourceUrl = researchData?.sourceUrl || "https://en.wikivoyage.org/wiki/Goa";
  const researchTimestamp = researchData?.researchTimestamp || new Date().toISOString();

  const systemInstruction = `You are TripPilot AI's Senior Travel Planner.
Your job is to generate a realistic, logical 3-day travel itinerary based on actual evidence collected from live browser research.

CRITICAL RULES:
1. ONLY use attractions, prices, and opening hours that appear in the provided research data or are standard public knowledge.
2. NEVER invent confirmed prices, ticket costs, availability, or opening hours. If an attraction has "Not published / Unknown", mark entryPrice as "Not published", costPerPerson as null, and costStatus as "UNKNOWN".
3. If entry is Free (e.g. public beaches, churches with no fees), mark entryPrice as "Free", costPerPerson as 0, and costStatus as "CONFIRMED_FREE".
4. If a published entry fee is present (e.g. ₹50), use that exact number for costPerPerson, compute totalCostForTravelers = costPerPerson * travelers, and costStatus as "CONFIRMED".
5. Structure the days geographically to minimize transit time (e.g. North Goa on one day, South Goa on another, Central Panaji heritage on another).
6. Always cite the sourceUrl from the research data.
7. Return strictly valid JSON matching the specified schema.`;

  const prompt = `Plan a 3-day trip for:
Origin: ${origin}
Destination: ${destination}
Dates: ${startDate} to ${endDate}
Number of Travelers: ${travelers}
Total Budget (INR): ₹${budget}
Interests: ${interests.join(", ")}

Here is the REAL browser research data collected by TinyFish:
${JSON.stringify({ destination, researchTimestamp, sourceUrl, attractions }, null, 2)}

Produce a JSON object with this exact structure:
{
  "tripTitle": "string",
  "destination": "${destination}",
  "origin": "${origin}",
  "travelers": ${travelers},
  "dates": { "startDate": "${startDate}", "endDate": "${endDate}", "totalDays": 3 },
  "budgetLimitINR": ${budget},
  "itineraryDays": [
    {
      "dayNumber": 1,
      "date": "${startDate}",
      "theme": "string",
      "region": "string (e.g. North Goa / South Goa / Panaji)",
      "morning": {
        "attractionName": "string",
        "location": "string",
        "activity": "string",
        "openingHours": "string",
        "entryPrice": "string",
        "costPerPersonINR": number_or_null,
        "totalCostINR": number_or_null,
        "costStatus": "CONFIRMED" | "CONFIRMED_FREE" | "UNKNOWN",
        "sourceUrl": "string"
      },
      "afternoon": {
        "attractionName": "string",
        "location": "string",
        "activity": "string",
        "openingHours": "string",
        "entryPrice": "string",
        "costPerPersonINR": number_or_null,
        "totalCostINR": number_or_null,
        "costStatus": "CONFIRMED" | "CONFIRMED_FREE" | "UNKNOWN",
        "sourceUrl": "string"
      },
      "evening": {
        "attractionName": "string",
        "location": "string",
        "activity": "string",
        "openingHours": "string",
        "entryPrice": "string",
        "costPerPersonINR": number_or_null,
        "totalCostINR": number_or_null,
        "costStatus": "CONFIRMED" | "CONFIRMED_FREE" | "UNKNOWN",
        "sourceUrl": "string"
      },
      "localTransportSuggestion": "string",
      "estimatedDayTotalINR": number
    }
  ],
  "accommodationAdvice": {
    "recommendedArea": "string",
    "rationale": "string"
  },
  "warnings": [
    "string (e.g. Unconfirmed prices for attractions, local advisory or timing reminders)"
  ],
  "sourceReferences": [
    {
      "sourceName": "string",
      "url": "string",
      "timestamp": "${researchTimestamp}"
    }
  ]
}`;

  return await callGeminiJson({ prompt, systemInstruction });
}

/**
 * Revise an itinerary using newly researched TinyFish alternatives
 * @param {Object} params
 * @param {Object} params.originalPlan - Previous itinerary
 * @param {Object} params.budgetAnalysis - Over-budget breakdown
 * @param {Object} params.alternativesData - Newly researched budget alternatives
 * @param {number} params.travelers
 * @param {number} params.budgetLimit
 * @returns {Promise<Object>} Revised itinerary with before-and-after comparison
 */
async function reviseItineraryWithAlternatives({
  originalPlan,
  budgetAnalysis,
  alternativesData,
  travelers = 2,
  budgetLimit = 15000
}) {
  const alternatives = alternativesData?.alternatives || [];
  const sourceUrl = alternativesData?.sourceUrl || "https://en.wikivoyage.org/wiki/Goa";
  const researchTimestamp = alternativesData?.researchTimestamp || new Date().toISOString();

  const systemInstruction = `You are TripPilot AI's Autonomous Travel Rescue Agent.
The user's trip is over-budget or requires optimization.
You have been provided with NEW browser research evidence containing free or low-cost alternatives.
Your goal is to swap higher-cost activities with these newly researched alternatives while preserving the trip's enjoyment.

CRITICAL RULES:
1. ONLY substitute with items found in the newly researched alternatives.
2. Clearly explain what was replaced, why it was replaced, and the exact savings achieved.
3. NEVER fabricate prices or opening hours.
4. Output a comprehensive before-and-after comparison.
5. Return strictly valid JSON.`;

  const prompt = `Rescue this over-budget trip:
Travelers: ${travelers}
Budget Limit: ₹${budgetLimit}
Current Estimated Total: ₹${budgetAnalysis?.estimatedTotal || "Over budget"}
Over-Budget Amount: ₹${budgetAnalysis?.overBudgetAmount || 0}

ORIGINAL ITINERARY:
${JSON.stringify(originalPlan, null, 2)}

NEW TINYFISH RESEARCH ALTERNATIVES (Free / Low Cost):
${JSON.stringify(alternatives, null, 2)}

Return a JSON object with:
{
  "rescueSummary": "string explaining how the trip was rescued within budget",
  "rescuedItinerary": {
    /* Full updated itinerary object with revised days and activities */
  },
  "beforeAndAfterComparison": [
    {
      "day": number,
      "timeSlot": "Morning" | "Afternoon" | "Evening",
      "originalItem": {
        "name": "string",
        "estimatedCostINR": number_or_null
      },
      "replacementItem": {
        "name": "string",
        "entryPrice": "string",
        "costINR": number,
        "sourceUrl": "string"
      },
      "savingsINR": number,
      "reason": "string"
    }
  ],
  "totalSavingsINR": number,
  "revisedEstimatedTotalINR": number,
  "isNowWithinBudget": boolean,
  "rescueSourceReferences": [
    {
      "sourceName": "string",
      "url": "${sourceUrl}",
      "timestamp": "${researchTimestamp}"
    }
  ]
}`;

  return await callGeminiJson({ prompt, systemInstruction });
}

module.exports = {
  generateItinerary,
  reviseItineraryWithAlternatives,
  callGeminiJson
};
