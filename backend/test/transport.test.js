const test = require("node:test");
const assert = require("node:assert/strict");

process.env.TINYFISH_API_KEY = "test-key";
const { researchTransport } = require("../services/tinyfish");

const input = { origin: "Bengaluru", destination: "Goa", startDate: "2026-11-15", endDate: "2026-11-17", travelers: 2 };
const originalFetch = global.fetch;
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });

test.afterEach(() => { global.fetch = originalFetch; });

test("keeps successful mode results when another async mode times out", async () => {
  const starts = [];
  const runModes = new Map();
  global.fetch = async (url, request) => {
    if (url.endsWith("/run-async")) {
      const body = JSON.parse(request.body);
      const mode = body.goal.match(/publicly visible (train|flight|bus)/)[1];
      starts.push(body.goal);
      runModes.set(`run-${mode}`, mode);
      return json({ run_id: `run-${mode}` });
    }
    if (url.endsWith("/cancel")) return json({ status: "CANCELLED" });
    const mode = runModes.get(url.split("/").pop());
    if (mode === "train") return json({ run_id: "run-train", status: "RUNNING" });
    return json({ run_id: `run-${mode}`, status: "COMPLETED", result: {
      options: [{ mode, operator: "Example", fare: "₹1,250", currency: "INR", fareBasis: "per traveler",
        sourceUrl: `https://example.com/${mode}`, evidence: "Fare displayed on source", availability: null }],
      sourceUrls: [`https://example.com/${mode}`]
    } });
  };

  const result = await researchTransport({ ...input, modeTimeoutMs: 30, modePollIntervalMs: 2 });
  assert.equal(starts.length, 3);
  assert.equal(result.metadata.status, "PARTIAL");
  assert.deepEqual(result.modeResults.map(x => x.status), ["FAILED", "SUCCESS", "SUCCESS"]);
  assert.equal(result.options.length, 2);
  assert.ok(result.options.every(x => x.fareStatus === "verified"));
  assert.equal(result.metadata.faresVerified, 2);
  assert.ok(result.metadata.agentRunIds[0].id === "run-train");
});

test("returns explicit failed statuses and cancels timed-out async runs", async () => {
  let starts = 0;
  let cancels = 0;
  global.fetch = async (url, request) => {
    if (url.endsWith("/run-async")) return json({ run_id: `run-${++starts}` });
    if (url.endsWith("/cancel")) { cancels++; return json({ status: "CANCELLED" }); }
    return json({ status: "RUNNING" });
  };

  const result = await researchTransport({ ...input, modeTimeoutMs: 15, modePollIntervalMs: 2 });
  assert.equal(result.metadata.status, "FAILED");
  assert.equal(result.options.length, 0);
  assert.equal(result.metadata.failedModes, 3);
  assert.ok(result.modeResults.every(x => x.code === "TIMEOUT"));
  assert.equal(cancels, 3);
  assert.ok(result.metadata.agentRunIds.every(x => x.id));
});

test("does not treat unknown fare evidence or basis as a verified budget fare", async () => {
  const rows = [
    { mode: "train", fare: "₹900", currency: "INR", fareBasis: "unknown", sourceUrl: "https://example.com/train", evidence: "Fare displayed" },
    { mode: "flight", fare: "₹1,400", currency: "INR", fareBasis: "per traveler", sourceUrl: "https://example.com/flight", evidence: "Estimated fare" }
  ];
  global.fetch = async (url, request) => {
    if (url.endsWith("/run-async")) {
      const mode = JSON.parse(request.body).goal.match(/publicly visible (train|flight|bus)/)[1];
      return json({ run_id: `run-${mode}` });
    }
    const mode = url.split("/").pop().replace("run-", "");
    return json({ run_id: `run-${mode}`, status: "COMPLETED", result: { options: rows.filter(row => row.mode === mode) } });
  };
  const result = await researchTransport({ ...input, modeTimeoutMs: 100, modePollIntervalMs: 2 });
  assert.equal(result.options.length, 2);
  assert.deepEqual(result.options.map(x => x.fareStatus), ["verified", "unknown"]);
  const budgetService = require("../services/budget");
  const analysis = budgetService.analyzeBudget({
    itinerary: { days: [], accommodation: { estimatedPerNight: 0 } }, budget: 100000,
    travelers: 2, startDate: input.startDate, endDate: input.endDate, transportResearch: result
  });
  assert.equal(analysis.breakdown.intercityTransport.confirmedFarePerTravelerINR, null);
});

test("supports a narrowly scoped single-mode mission", async () => {
  let started = 0;
  global.fetch = async (url, request) => {
    if (url.endsWith("/run-async")) {
      started++;
      assert.match(JSON.parse(request.body).goal, /publicly visible train/);
      return json({ run_id: "single-train" });
    }
    return json({ run_id: "single-train", status: "COMPLETED", result: { options: [] } });
  };
  const result = await researchTransport({ ...input, modes: ["train"], modeTimeoutMs: 100, modePollIntervalMs: 1 });
  assert.equal(started, 1);
  assert.equal(result.modeResults.length, 1);
  assert.equal(result.metadata.status, "SUCCESS");
});

test("completes a trip plan when optional transport research fails", async () => {
  const researchService = require("../services/research");
  const tinyfishService = require("../services/tinyfish");
  const geminiService = require("../services/gemini");
  const originalAttractions = tinyfishService.researchAttractions;
  const originalTransport = tinyfishService.researchTransport;
  const originalItinerary = geminiService.generateItinerary;
  tinyfishService.researchAttractions = async () => ({
    destination: "Goa", researchTimestamp: new Date().toISOString(), sourceUrl: "https://example.com/goa", attractions: []
  });
  tinyfishService.researchTransport = async () => { throw Object.assign(new Error("mock transport unavailable"), { code: "TIMEOUT" }); };
  geminiService.generateItinerary = async () => ({ tripTitle: "Goa trip", itineraryDays: [], accommodation: { estimatedPerNight: 0 } });
  try {
    const result = await researchService.executeTripPlanMission({
      origin: "Bengaluru", destination: "Goa", startDate: input.startDate, endDate: input.endDate,
      travelers: 2, budget: 20000, interests: []
    });
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.transportResearch, null);
    assert.equal(result.budgetAnalysis.breakdown.intercityTransport.confirmedFarePerTravelerINR, null);
  } finally {
    tinyfishService.researchAttractions = originalAttractions;
    tinyfishService.researchTransport = originalTransport;
    geminiService.generateItinerary = originalItinerary;
  }
});
