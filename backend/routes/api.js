/**
 * TripPilot AI API Routes
 * Endpoints for health, research, planning, mission monitoring, and trip rescue.
 */

const express = require("express");
const router = express.Router();
const researchService = require("../services/research");
const tinyfishService = require("../services/tinyfish");

/**
 * POST /api/transport-research
 * Public research only; does not authenticate with travel sites or book.
 */
router.post("/transport-research", async (req, res) => {
  const { origin, destination, startDate, endDate = null, travelers = 1 } = req.body || {};
  if (![origin, destination, startDate].every(value => typeof value === "string" && value.trim())) {
    return res.status(400).json({ status: "FAILED", error: "INVALID_INPUT", message: "origin, destination, and startDate are required strings." });
  }
  const count = Number(travelers);
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    return res.status(400).json({ status: "FAILED", error: "INVALID_TRAVELERS", message: "travelers must be a whole number from 1 to 20." });
  }
  try {
    const result = await tinyfishService.researchTransport({ origin: origin.trim(), destination: destination.trim(), startDate, endDate, travelers: count });
    return res.json({ status: result.metadata?.status || "SUCCESS", ...result });
  } catch (err) {
    console.error("[POST /api/transport-research] Error:", err.message);
    return res.status(err.status || 500).json({ status: "FAILED", error: err.code || "TRANSPORT_RESEARCH_ERROR", message: err.message, details: err.details || null });
  }
});

/**
 * GET /api/health
 * Verifies backend health and status of external integration configurations
 */
router.get("/health", (req, res) => {
  const tinyfishConfigured = Boolean((process.env.TINYFISH_API_KEY || "").trim());
  const geminiConfigured = Boolean((process.env.GEMINI_API_KEY || "").trim());

  res.json({
    status: "ok",
    project: "TripPilot AI",
    message: "Backend is working",
    timestamp: new Date().toISOString(),
    services: {
      tinyfish: {
        configured: tinyfishConfigured,
        provider: "TinyFish Agent API",
        endpoint: process.env.TINYFISH_API_BASE || "https://agent.tinyfish.ai/v1/automation"
      },
      gemini: {
        configured: geminiConfigured,
        provider: "Google GenAI SDK",
        model: "gemini-3.5-flash"
      }
    }
  });
});

/**
 * POST /api/research
 * Accepts: { "destination": "Goa" }
 * Triggers a real browser research mission via TinyFish Agent
 */
router.post("/research", async (req, res) => {
  const destination = req.body?.destination?.trim() || "Goa";
  const isAsync = req.query.async === "true" || req.body?.async === true;

  if (isAsync) {
    const mission = researchService.createMission("research", { destination });
    researchService.executeResearchMission(destination, { existingMissionId: mission.id }).catch((err) => {
      console.error(`[Mission ${mission.id}] Background research failed:`, err.message);
    });

    return res.status(202).json({
      status: "QUEUED",
      missionId: mission.id,
      message: `Research mission queued for ${destination}`,
      checkStatusUrl: `/api/mission/${mission.id}`
    });
  }

  try {
    const result = await researchService.executeResearchMission(destination);
    return res.json({
      status: "SUCCESS",
      ...result
    });
  } catch (err) {
    console.error("[POST /api/research] Error:", err.message);
    return res.status(err.status || 500).json({
      status: "FAILED",
      error: err.code || "RESEARCH_ERROR",
      message: err.message,
      details: err.details || null
    });
  }
});

/**
 * POST /api/plan-trip
 * Accepts:
 * {
 *   "origin": "Bengaluru",
 *   "destination": "Goa",
 *   "startDate": "2026-11-15",
 *   "endDate": "2026-11-17",
 *   "travelers": 2,
 *   "budget": 15000,
 *   "interests": ["beaches", "food", "sightseeing"]
 * }
 */
router.post("/plan-trip", async (req, res) => {
  const {
    origin = "Bengaluru",
    destination = "Goa",
    startDate = "2026-11-15",
    endDate = "2026-11-17",
    travelers = 2,
    budget = 15000,
    interests = ["beaches", "food", "sightseeing"]
  } = req.body || {};

  const planParams = {
    origin: origin.trim(),
    destination: destination.trim(),
    startDate,
    endDate,
    travelers: Number(travelers) || 2,
    budget: Number(budget) || 15000,
    interests: Array.isArray(interests) ? interests : [interests].filter(Boolean)
  };

  const isAsync = req.query.async === "true" || req.body?.async === true;

  if (isAsync) {
    const mission = researchService.createMission("plan-trip", planParams);
    researchService.executeTripPlanMission(planParams, { existingMissionId: mission.id }).catch((err) => {
      console.error(`[Mission ${mission.id}] Background plan-trip failed:`, err.message);
    });

    return res.status(202).json({
      status: "QUEUED",
      missionId: mission.id,
      message: `Autonomous trip planning mission started for ${planParams.destination}`,
      checkStatusUrl: `/api/mission/${mission.id}`
    });
  }

  try {
    const result = await researchService.executeTripPlanMission(planParams);
    return res.json({
      status: "SUCCESS",
      ...result
    });
  } catch (err) {
    console.error("[POST /api/plan-trip] Error:", err.message);
    return res.status(err.status || 500).json({
      status: "FAILED",
      error: err.code || "PLANNING_ERROR",
      message: err.message,
      details: err.details || null
    });
  }
});

/**
 * GET /api/mission/:id
 * Fetches real-time status and logs of an asynchronous or finished mission
 */
router.get("/mission/:id", (req, res) => {
  const { id } = req.params;
  const mission = researchService.getMission(id);

  if (!mission) {
    return res.status(404).json({
      status: "NOT_FOUND",
      error: "MISSION_NOT_FOUND",
      message: `No mission found with ID: ${id}`
    });
  }

  return res.json({
    status: mission.status,
    missionId: mission.id,
    type: mission.type,
    currentStage: mission.currentStage,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    completedAt: mission.completedAt,
    logs: mission.logs,
    result: mission.result,
    error: mission.error
  });
});

/**
 * POST /api/rescue-trip
 * Autonomous rescue:
 * 1. Researches free/budget alternatives with TinyFish
 * 2. Prompts Gemini to restructure and optimize itinerary
 * 3. Provides before-and-after comparison with source URLs
 */
router.post("/rescue-trip", async (req, res) => {
  const {
    missionId,
    destination = "Goa",
    budget = 15000,
    travelers = 2,
    originalPlan,
    budgetAnalysis,
    overBudgetAmount
  } = req.body || {};

  let rescueInput = {
    destination,
    budget,
    travelers,
    originalPlan,
    budgetAnalysis,
    overBudgetAmount
  };

  // If missionId provided, pull original plan from mission store
  if (missionId) {
    const priorMission = researchService.getMission(missionId);
    if (priorMission && priorMission.result) {
      rescueInput.destination = priorMission.result.destination || destination;
      rescueInput.originalPlan = priorMission.result.itinerary || priorMission.result;
      rescueInput.budget = priorMission.result.budgetAnalysis?.budgetLimit || budget;
      rescueInput.travelers = priorMission.result.travelers || travelers;
      rescueInput.budgetAnalysis = priorMission.result.budgetAnalysis;
      rescueInput.overBudgetAmount = priorMission.result.budgetAnalysis?.overBudgetAmount;
    }
  }

  const isAsync = req.query.async === "true" || req.body?.async === true;

  if (isAsync) {
    const mission = researchService.createMission("rescue-trip", rescueInput);
    researchService.executeRescueMission(rescueInput, { existingMissionId: mission.id }).catch((err) => {
      console.error(`[Mission ${mission.id}] Background rescue failed:`, err.message);
    });

    return res.status(202).json({
      status: "QUEUED",
      missionId: mission.id,
      message: `Autonomous rescue mission started for ${rescueInput.destination}`,
      checkStatusUrl: `/api/mission/${mission.id}`
    });
  }

  try {
    const result = await researchService.executeRescueMission(rescueInput);
    return res.json({
      status: "SUCCESS",
      ...result
    });
  } catch (err) {
    console.error("[POST /api/rescue-trip] Error:", err.message);
    return res.status(err.status || 500).json({
      status: "FAILED",
      error: err.code || "RESCUE_ERROR",
      message: err.message,
      details: err.details || null
    });
  }
});

module.exports = router;
