/**
 * Budget Calculation and Analysis Service
 * Calculates trip expenditures using sourced prices where available,
 * accounts for travelers and accommodation nights, and marks unknown costs.
 */

/**
 * Calculates number of nights between two dates
 * @param {string} startDate - e.g. "2026-11-15"
 * @param {string} endDate - e.g. "2026-11-17"
 * @returns {number}
 */
function calculateNights(startDate, endDate) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 2; // default to 2 nights for 3-day trip
  } catch {
    return 2;
  }
}

/**
 * Analyzes the itinerary budget against user constraints
 * @param {Object} params
 * @param {Object} params.itinerary - Structured itinerary with days and activities
 * @param {number} params.budget - User budget limit in INR
 * @param {number} params.travelers - Number of travelers
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @returns {Object} Comprehensive budget analysis
 */
function analyzeBudget({
  itinerary,
  budget,
  travelers = 2,
  startDate,
  endDate
}) {
  const budgetLimit = Number(budget) || 15000;
  const numTravelers = Number(travelers) || 2;
  const nights = calculateNights(startDate, endDate);
  const daysCount = itinerary?.itineraryDays?.length || 3;

  let confirmedAttractionCost = 0;
  let unknownCostItems = [];
  let confirmedCostItems = [];
  let freeCostItems = [];

  const days = itinerary?.itineraryDays || [];

  for (const day of days) {
    const slots = [day.morning, day.afternoon, day.evening].filter(Boolean);
    for (const slot of slots) {
      if (slot.costStatus === "CONFIRMED") {
        const itemCost = Number(slot.totalCostINR) || (Number(slot.costPerPersonINR) * numTravelers) || 0;
        confirmedAttractionCost += itemCost;
        confirmedCostItems.push({
          day: day.dayNumber,
          attraction: slot.attractionName,
          costINR: itemCost,
          sourceUrl: slot.sourceUrl
        });
      } else if (slot.costStatus === "CONFIRMED_FREE" || slot.entryPrice?.toLowerCase()?.includes("free")) {
        freeCostItems.push({
          day: day.dayNumber,
          attraction: slot.attractionName,
          sourceUrl: slot.sourceUrl
        });
      } else {
        unknownCostItems.push({
          day: day.dayNumber,
          attraction: slot.attractionName,
          entryPriceRaw: slot.entryPrice || "Not published",
          sourceUrl: slot.sourceUrl
        });
      }
    }
  }

  // Realistic baseline estimates for standard Goa stay:
  // 1 room per 2 travelers at ~₹2,200/night
  const roomsNeeded = Math.ceil(numTravelers / 2);
  const nightlyRoomRate = 2200;
  const accommodationTotal = roomsNeeded * nightlyRoomRate * nights;

  // Local transit: scooter rental ~₹450/day per 2 persons, or auto/cab
  const scootersNeeded = Math.ceil(numTravelers / 2);
  const transportDailyRate = scootersNeeded * 450;
  const transportTotal = transportDailyRate * daysCount;

  // Food & dining buffer: ~₹700 per person per day
  const foodDailyPerPerson = 700;
  const foodTotal = foodDailyPerPerson * numTravelers * daysCount;

  const estimatedTotal = Math.round(
    confirmedAttractionCost + accommodationTotal + transportTotal + foodTotal
  );

  const isOverBudget = estimatedTotal > budgetLimit;
  const overBudgetAmount = Math.max(0, estimatedTotal - budgetLimit);

  return {
    budgetLimit,
    estimatedTotal,
    isOverBudget,
    overBudgetAmount,
    breakdown: {
      attractions: {
        confirmedTotalINR: confirmedAttractionCost,
        confirmedItemsCount: confirmedCostItems.length,
        freeItemsCount: freeCostItems.length,
        unknownItemsCount: unknownCostItems.length
      },
      accommodation: {
        nights,
        roomsNeeded,
        estimatedRatePerNightINR: nightlyRoomRate,
        estimatedTotalINR: accommodationTotal,
        note: `Estimated at ₹${nightlyRoomRate}/night for ${roomsNeeded} room(s) across ${nights} night(s)`
      },
      transportation: {
        estimatedDailyINR: transportDailyRate,
        days: daysCount,
        estimatedTotalINR: transportTotal,
        note: `Estimated local transit / scooter rental for ${numTravelers} traveler(s)`
      },
      foodBuffer: {
        estimatedDailyPerPersonINR: foodDailyPerPerson,
        travelers: numTravelers,
        days: daysCount,
        estimatedTotalINR: foodTotal,
        note: `Estimated dining buffer of ₹${foodDailyPerPerson}/person/day`
      }
    },
    unknownCostNotice: unknownCostItems.length > 0
      ? `${unknownCostItems.length} attraction(s) have unconfirmed/unpublished ticket prices and are excluded from the attraction total.`
      : "All attraction costs verified.",
    unknownCostItems,
    confirmedCostItems,
    freeCostItems
  };
}

module.exports = {
  calculateNights,
  analyzeBudget
};
