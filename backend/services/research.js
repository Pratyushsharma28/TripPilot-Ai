/**
 * Autonomous Research and Mission Orchestrator
 * Manages mission lifecycles, background execution, and real-time status updates
 * for research, trip planning, and rescue missions.
 */

const crypto = require("crypto");
const tinyfishService = require("./tinyfish");
const geminiService = require("./gemini");
const budgetService = require("./budget");

// In-memory store for missions
const missions = new Map();

/**
 * Creates and registers a new mission
 * @param {string} type - 'research' | 'plan-trip' | 'rescue-trip'
 * @param {Object} input - Mission parameters
 * @returns {Object} Newly created mission
 */
function createMission(type, input) {
  const missionId = `mission_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const mission = {
    id: missionId,
    type,
    status: "QUEUED", // 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
    currentStage: "INITIALIZING",
    input,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    logs: [
      {
        timestamp: now,
        stage: "INITIALIZING",
        message: `Mission ${missionId} created for type: ${type}`
      }
    ],
    result: null,
    error: null
  };

  missions.set(missionId, mission);
  return mission;
}

/**
 * Retrieves a mission by ID
 * @param {string} missionId
 * @returns {Object|null}
 */
function getMission(missionId) {
  return missions.get(missionId) || null;
}

/**
 * Appends a log event to a mission
 * @param {string} missionId
 * @param {string} stage
 * @param {string} message
 * @param {Object} [metadata]
 */
function logMissionEvent(missionId, stage, message, metadata = null) {
  const mission = missions.get(missionId);
  if (!mission) return;

  const entry = {
    timestamp: new Date().toISOString(),
    stage,
    message,
    ...(metadata ? { metadata } : {})
  };

  mission.currentStage = stage;
  mission.updatedAt = entry.timestamp;
  mission.logs.push(entry);
}

/**
 * Updates mission status
 * @param {string} missionId
 * @param {string} status - 'RUNNING' | 'COMPLETED' | 'FAILED'
 * @param {Object} [patch]
 */
function updateMission(missionId, status, patch = {}) {
  const mission = missions.get(missionId);
  if (!mission) return;

  mission.status = status;
  mission.updatedAt = new Date().toISOString();

  if (status === "COMPLETED" || status === "FAILED") {
    mission.completedAt = mission.updatedAt;
  }

  Object.assign(mission, patch);
}

/**
 * Executes a standalone research mission
 * @param {string} destination - e.g. "Goa"
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function executeResearchMission(destination, options = {}) {
  const mission = options.existingMissionId
    ? (missions.get(options.existingMissionId) || createMission("research", { destination, ...options }))
    : createMission("research", { destination, ...options });
  const missionId = mission.id;

  updateMission(missionId, "RUNNING", { currentStage: "CONNECTING_TINYFISH" });
  logMissionEvent(
    missionId,
    "CONNECTING_TINYFISH",
    `Connecting to TinyFish Agent API for destination: ${destination}`
  );

  try {
    logMissionEvent(
      missionId,
      "BROWSER_AUTOMATION",
      `Launching TinyFish browser agent to explore public travel guide for ${destination}`
    );

    const researchData = await tinyfishService.researchAttractions(destination, options);

    logMissionEvent(
      missionId,
      "EXTRACTION_COMPLETE",
      `TinyFish successfully extracted ${researchData.attractions.length} attraction records from ${researchData.sourceUrl}`,
      {
        totalFound: researchData.metadata.totalFound,
        pricesConfirmed: researchData.metadata.pricesConfirmedCount,
        pricesUnknown: researchData.metadata.pricesUnknownCount
      }
    );

    const finalResult = {
      missionId,
      destination,
      researchTimestamp: researchData.researchTimestamp,
      sourceUrl: researchData.sourceUrl,
      attractions: researchData.attractions,
      metadata: researchData.metadata
    };

    updateMission(missionId, "COMPLETED", {
      currentStage: "DONE",
      result: finalResult
    });

    logMissionEvent(missionId, "DONE", "Research mission completed successfully.");
    return finalResult;
  } catch (err) {
    const errorDetails = {
      message: err.message,
      code: err.code || "RESEARCH_FAILED",
      status: err.status || 500,
      details: err.details || null
    };

    updateMission(missionId, "FAILED", {
      currentStage: "ERROR",
      error: errorDetails
    });

    logMissionEvent(missionId, "ERROR", `Mission failed: ${err.message}`, errorDetails);
    throw err;
  }
}

/**
 * Executes an end-to-end trip planning mission
 * 1. TinyFish browser research
 * 2. Gemini 3-day itinerary generation
 * 3. Budget & traveler analysis
 * 4. Automatic rescue check
 * @param {Object} planParams
 * @returns {Promise<Object>}
 */
async function executeTripPlanMission(planParams, options = {}) {
  const mission = options.existingMissionId
    ? (missions.get(options.existingMissionId) || createMission("plan-trip", planParams))
    : createMission("plan-trip", planParams);
  const missionId = mission.id;

  updateMission(missionId, "RUNNING", { currentStage: "RESEARCHING" });
  logMissionEvent(
    missionId,
    "RESEARCHING",
    `Step 1/3: Launching TinyFish browser mission to research attractions for ${planParams.destination}`
  );

  try {
    // Step 1: Real TinyFish Research
    const researchData = await tinyfishService.researchAttractions(planParams.destination);
    logMissionEvent(
      missionId,
      "RESEARCH_COMPLETED",
      `TinyFish research completed with ${researchData.attractions.length} verified attraction sources.`,
      { sourceUrl: researchData.sourceUrl }
    );

    // Transport research is optional for planning: if public fare data cannot
    // be retrieved, the plan still completes with intercity cost marked unknown.
    let transportResearch = null;
    try {
      transportResearch = await tinyfishService.researchTransport({
        origin: planParams.origin,
        destination: planParams.destination,
        startDate: planParams.startDate,
        endDate: planParams.endDate,
        travelers: planParams.travelers
      });
    } catch (transportError) {
      logMissionEvent(missionId, "TRANSPORT_RESEARCH_UNAVAILABLE", "Transport research could not verify public listings; no intercity fare will be added to the budget.", {
        code: transportError.code || "TRANSPORT_RESEARCH_ERROR"
      });
    }

    // Step 2: Gemini Itinerary Generation
    logMissionEvent(
      missionId,
      "PLANNING_ITINERARY",
      `Step 2/3: Prompting Gemini to construct a structured 3-day itinerary grounded in research evidence.`
    );

    const itinerary = await geminiService.generateItinerary({
      ...planParams,
      researchData
    });

    logMissionEvent(
      missionId,
      "ITINERARY_GENERATED",
      `Gemini successfully generated 3-day itinerary titled: "${itinerary.tripTitle}".`
    );

    // Step 3: Budget Analysis
    logMissionEvent(
      missionId,
      "BUDGET_CALCULATION",
      `Step 3/3: Evaluating costs for ${planParams.travelers} traveler(s) and accommodation nights.`
    );

    const budgetAnalysis = budgetService.analyzeBudget({
      itinerary,
      budget: planParams.budget,
      travelers: planParams.travelers,
      startDate: planParams.startDate,
      endDate: planParams.endDate,
      transportResearch
    });

    logMissionEvent(
      missionId,
      "BUDGET_EVALUATED",
      `Budget evaluation complete. Total Estimated: ₹${budgetAnalysis.estimatedTotal} / Budget Limit: ₹${budgetAnalysis.budgetLimit} (${budgetAnalysis.isOverBudget ? "OVER BUDGET" : "WITHIN BUDGET"})`
    );

    const planResult = {
      missionId,
      status: "COMPLETED",
      destination: planParams.destination,
      origin: planParams.origin,
      travelers: planParams.travelers,
      dates: {
        startDate: planParams.startDate,
        endDate: planParams.endDate
      },
      budgetAnalysis,
      transportResearch,
      itinerary,
      researchSources: [
        {
          sourceUrl: researchData.sourceUrl,
          timestamp: researchData.researchTimestamp,
          attractionsSourced: researchData.attractions.length
        }
      ],
      rescueRecommended: budgetAnalysis.isOverBudget
    };

    updateMission(missionId, "COMPLETED", {
      currentStage: "DONE",
      result: planResult
    });

    logMissionEvent(missionId, "DONE", "Trip planning mission completed.");
    return planResult;
  } catch (err) {
    const errorDetails = {
      message: err.message,
      code: err.code || "PLANNING_FAILED",
      status: err.status || 500,
      details: err.details || null
    };

    updateMission(missionId, "FAILED", {
      currentStage: "ERROR",
      error: errorDetails
    });

    logMissionEvent(missionId, "ERROR", `Trip plan failed: ${err.message}`, errorDetails);
    throw err;
  }
}

/**
 * Executes an autonomous rescue mission for an over-budget trip
 * 1. TinyFish browser mission for free/budget alternatives
 * 2. Gemini itinerary revision with replacements
 * 3. Before-and-after comparison with source URLs
 * @param {Object} rescueParams
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
async function executeRescueMission(rescueParams, options = {}) {
  const mission = options.existingMissionId
    ? (missions.get(options.existingMissionId) || createMission("rescue-trip", rescueParams))
    : createMission("rescue-trip", rescueParams);
  const missionId = mission.id;

  updateMission(missionId, "RUNNING", { currentStage: "RESCUE_RESEARCH" });
  logMissionEvent(
    missionId,
    "RESCUE_RESEARCH",
    `Autonomous Rescue: Launching NEW TinyFish browser mission to research free/low-cost alternatives in ${rescueParams.destination || "Goa"}`
  );

  try {
    const destination = rescueParams.destination || rescueParams.originalPlan?.destination || "Goa";
    const budgetLimit = rescueParams.budget || rescueParams.budgetLimit || 15000;
    const travelers = rescueParams.travelers || 2;

    // 1. Trigger NEW TinyFish browser mission for budget alternatives
    const alternativesData = await tinyfishService.researchBudgetAlternatives(destination, {
      overBudgetAmount: rescueParams.overBudgetAmount
    });

    logMissionEvent(
      missionId,
      "ALTERNATIVES_FOUND",
      `TinyFish found ${alternativesData.alternatives.length} verified budget-friendly alternatives from ${alternativesData.sourceUrl}`,
      { count: alternativesData.alternatives.length }
    );

    // 2. Use Gemini to revise itinerary based on new evidence
    logMissionEvent(
      missionId,
      "REVISING_ITINERARY",
      `Prompting Gemini to restructure itinerary, swap high-cost items, and document before-and-after comparison.`
    );

    const rescueResult = await geminiService.reviseItineraryWithAlternatives({
      originalPlan: rescueParams.originalPlan || rescueParams.itinerary,
      budgetAnalysis: rescueParams.budgetAnalysis || { overBudgetAmount: rescueParams.overBudgetAmount || 3000 },
      alternativesData,
      travelers,
      budgetLimit
    });

    const finalRescue = {
      missionId,
      destination,
      status: "RESCUED",
      rescueSummary: rescueResult.rescueSummary,
      beforeAndAfterComparison: rescueResult.beforeAndAfterComparison || [],
      rescuedItinerary: rescueResult.rescuedItinerary || {},
      financials: {
        originalBudgetLimit: budgetLimit,
        totalSavingsINR: rescueResult.totalSavingsINR,
        revisedEstimatedTotalINR: rescueResult.revisedEstimatedTotalINR,
        isNowWithinBudget: rescueResult.isNowWithinBudget
      },
      sources: [
        {
          type: "tinyfish_budget_alternatives",
          url: alternativesData.sourceUrl,
          timestamp: alternativesData.researchTimestamp,
          itemsExtracted: alternativesData.alternatives.length
        }
      ]
    };

    updateMission(missionId, "COMPLETED", {
      currentStage: "DONE",
      result: finalRescue
    });

    logMissionEvent(missionId, "DONE", "Trip rescued successfully with verified alternatives.");
    return finalRescue;
  } catch (err) {
    const errorDetails = {
      message: err.message,
      code: err.code || "RESCUE_FAILED",
      status: err.status || 500,
      details: err.details || null
    };

    updateMission(missionId, "FAILED", {
      currentStage: "ERROR",
      error: errorDetails
    });

    logMissionEvent(missionId, "ERROR", `Rescue mission failed: ${err.message}`, errorDetails);
    throw err;
  }
}

module.exports = {
  createMission,
  getMission,
  logMissionEvent,
  updateMission,
  executeResearchMission,
  executeTripPlanMission,
  executeRescueMission,
  missions
};
