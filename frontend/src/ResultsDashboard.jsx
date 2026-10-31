
import { useState } from "react";
import {
  Plane,
  TrainFront,
  Bus,
  ArrowRight,
  Sparkles,
  MapPin,
  CalendarDays,
  Users,
  SlidersHorizontal,
  CheckCircle2,
  Wallet,
} from "lucide-react";

// These are illustrative frontend records, not live travel listings.
const demoResults = [
  {
    id: 1,
    mode: "train",
    operator: "Express Train A",
    departure: "06:15 AM",
    arrival: "11:30 AM",
    duration: "5h 15m",
    durationMinutes: 315,
    price: 850,
    tag: "Lowest train fare",
  },
  {
    id: 2,
    mode: "train",
    operator: "Intercity Express B",
    departure: "08:30 AM",
    arrival: "02:15 PM",
    duration: "5h 45m",
    durationMinutes: 345,
    price: 1050,
    tag: "Alternative option",
  },
  {
    id: 3,
    mode: "train",
    operator: "Superfast Express C",
    departure: "10:00 PM",
    arrival: "04:00 AM",
    duration: "6h",
    durationMinutes: 360,
    price: 1250,
    tag: "Night journey",
  },
  {
    id: 4,
    mode: "bus",
    operator: "AC Sleeper Bus A",
    departure: "09:00 PM",
    arrival: "05:30 AM",
    duration: "8h 30m",
    durationMinutes: 510,
    price: 1200,
    tag: "Sleeper option",
  },
  {
    id: 5,
    mode: "bus",
    operator: "Volvo AC Bus B",
    departure: "07:00 AM",
    arrival: "03:00 PM",
    duration: "8h",
    durationMinutes: 480,
    price: 1450,
    tag: "Day journey",
  },
  {
    id: 6,
    mode: "bus",
    operator: "Premium Bus C",
    departure: "10:30 PM",
    arrival: "06:00 AM",
    duration: "7h 30m",
    durationMinutes: 450,
    price: 1700,
    tag: "Comfort option",
  },
  {
    id: 7,
    mode: "flight",
    operator: "Domestic Flight A",
    departure: "10:20 AM",
    arrival: "11:35 AM",
    duration: "1h 15m",
    durationMinutes: 75,
    price: 4200,
    tag: "Fastest option",
  },
  {
    id: 8,
    mode: "flight",
    operator: "Domestic Flight B",
    departure: "02:00 PM",
    arrival: "03:20 PM",
    duration: "1h 20m",
    durationMinutes: 80,
    price: 4600,
    tag: "Alternative option",
  },
  {
    id: 9,
    mode: "flight",
    operator: "Domestic Flight C",
    departure: "07:30 PM",
    arrival: "08:50 PM",
    duration: "1h 20m",
    durationMinutes: 80,
    price: 3900,
    tag: "Sample lower fare",
  },
];

const modeDetails = {
  train: {
    label: "Train",
    icon: TrainFront,
    color: "text-emerald-400",
  },
  bus: {
    label: "Bus",
    icon: Bus,
    color: "text-blue-400",
  },
  flight: {
    label: "Flight",
    icon: Plane,
    color: "text-violet-400",
  },
};

function formatDate(date) {
  if (!date) return "";

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ResultsDashboard({ searchRequest }) {
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("Recommended");

  if (!searchRequest) return null;

  const {
    origin,
    destination,
    mode,
    departureDate,
    returnDate,
    earliestDeparture,
    latestDeparture,
    minNights,
    maxNights,
    travelers,
    budget,
    transport,
  } = searchRequest;

  const selectedModes = transport || [];

  const results = demoResults.filter((item) =>
    selectedModes.includes(item.mode)
  );

  const filteredResults = results
    .filter((item) => filter === "All" || item.mode === filter.toLowerCase())
    .sort((a, b) => {
      if (sort === "Lowest price") return a.price - b.price;
      if (sort === "Fastest") {
        return a.durationMinutes - b.durationMinutes;
      }
      return a.id - b.id;
    });

  const lowestFare = results.length
    ? Math.min(...results.map((item) => item.price))
    : 0;

  const lowestTotalFare = lowestFare * travelers;

  const cheapestOption = results.reduce(
    (best, item) => (!best || item.price < best.price ? item : best),
    null
  );

  const fastestOption = results.reduce(
    (best, item) =>
      (!best || item.durationMinutes < best.durationMinutes ? item : best),
    null
  );

  const dateSummary =
    mode === "fixed"
      ? `${formatDate(departureDate)} – ${formatDate(returnDate)}`
      : `${formatDate(earliestDeparture)} – ${formatDate(latestDeparture)} · ${minNights}–${maxNights} nights`;

  const filters = ["All", ...selectedModes.map(
    (item) => modeDetails[item]?.label
  )];

  return (
    <section
      id="results"
      className="min-h-screen scroll-mt-8 bg-[#080c18] px-5 py-16 text-white md:px-12"
    >
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
            Your travel results
          </p>

          <h1 className="text-3xl font-bold md:text-5xl">
            Your journey, <span className="text-cyan-400">optimized.</span>
          </h1>

          <p className="mt-3 text-gray-400">
            Your submitted preferences and illustrative journey comparisons.
          </p>
        </div>

        {/* Search summary */}
        <div className="mb-8 grid gap-5 rounded-2xl border border-white/10 bg-[#111827] p-5 md:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">FROM</p>
            <p className="mt-2 flex items-center gap-2 font-semibold">
              <MapPin size={16} className="text-cyan-400" />
              {origin}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">TO</p>
            <p className="mt-2 flex items-center gap-2 font-semibold">
              <MapPin size={16} className="text-cyan-400" />
              {destination}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">TRAVEL DATES</p>
            <p className="mt-2 flex items-center gap-2 font-semibold">
              <CalendarDays size={16} className="text-cyan-400" />
              <span>{dateSummary}</span>
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">TRAVELLERS</p>
            <p className="mt-2 flex items-center gap-2 font-semibold">
              <Users size={16} className="text-cyan-400" />
              {travelers} {travelers === 1 ? "Traveller" : "Travellers"}
            </p>
          </div>
        </div>

        {/* Budget overview */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-5">
            <p className="text-sm text-gray-400">Your total budget</p>
            <h2 className="mt-2 text-3xl font-bold">
              ₹{Number(budget).toLocaleString("en-IN")}
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              Your submitted budget
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111827] p-5">
            <p className="text-sm text-gray-400">
              Lowest demo transport total
            </p>
            <h2 className="mt-2 text-3xl font-bold text-emerald-400">
              ₹{lowestTotalFare.toLocaleString("en-IN")}
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              Lowest sample fare × {travelers} travellers
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#111827] p-5">
            <p className="text-sm text-gray-400">Journey options</p>
            <h2 className="mt-2 text-3xl font-bold">{results.length}</h2>
            <p className="mt-2 text-xs text-gray-500">
              Illustrative options for selected modes
            </p>
          </div>
        </div>

        {/* AI insight */}
        <div className="mb-8 rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 to-cyan-500/10 p-5 md:p-6">
          <div className="flex items-center gap-2 text-violet-300">
            <Sparkles size={20} />
            <span className="font-semibold">TripPilot sample insight</span>
          </div>

          {cheapestOption && fastestOption ? (
            <>
              <h3 className="mt-3 text-xl font-semibold">
                {modeDetails[cheapestOption.mode].label} has the lowest
                illustrative fare.
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-400">
                {fastestOption.operator} has the shortest illustrative
                journey duration. Compare cost and travel time before
                choosing.
              </p>
            </>
          ) : (
            <p className="mt-3 text-gray-400">
              No sample options are available for your selected transport modes.
            </p>
          )}
        </div>

        {/* Filters and sorting */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold">Available journeys</h2>
            <p className="mt-1 text-sm text-gray-500">
              Compare the sample transport options
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={18} className="text-gray-400" />

            {filters.map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  filter === item
                    ? "bg-cyan-400 text-black"
                    : "border border-white/10 bg-[#111827] text-gray-400 hover:border-cyan-400"
                }`}
              >
                {item}
              </button>
            ))}

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-full border border-white/10 bg-[#111827] px-3 py-2 text-sm text-white"
            >
              <option>Recommended</option>
              <option>Lowest price</option>
              <option>Fastest</option>
            </select>
          </div>
        </div>

        {/* Journey cards */}
        <div className="space-y-4">
          {filteredResults.map((item) => {
            const details = modeDetails[item.mode];
            const Icon = details.icon;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-[#111827] p-5 transition hover:border-cyan-400/40 md:p-6"
              >
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">

                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-white/5 p-3">
                      <Icon size={26} className={details.color} />
                    </div>

                    <div>
                      <h3 className="font-semibold">{item.operator}</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {details.label} · Sample option
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <div>
                      <p className="text-lg font-semibold">{item.departure}</p>
                      <p className="text-xs text-gray-500">Departure</p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-gray-400">{item.duration}</p>
                      <div className="my-2 h-px w-16 bg-gray-600" />
                      <p className="text-xs text-gray-500">Journey</p>
                    </div>

                    <div>
                      <p className="text-lg font-semibold">{item.arrival}</p>
                      <p className="text-xs text-gray-500">Arrival</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 md:justify-end">
                    <div>
                      <p className="text-2xl font-bold">
                        ₹{item.price.toLocaleString("en-IN")}
                      </p>
                      <p className="text-xs text-gray-500">Per traveller · sample</p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        alert("Detailed journey information will be available after backend integration.")
                      }
                      className="rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-black transition hover:bg-cyan-300"
                    >
                      Details <ArrowRight className="ml-1 inline" size={16} />
                    </button>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <span className={`flex items-center gap-2 text-sm ${details.color}`}>
                    <CheckCircle2 size={16} />
                    {item.tag}
                  </span>

                  <span className="text-xs text-amber-300">
                    Illustrative data · Not a live fare
                  </span>
                </div>
              </div>
            );
          })}

          {filteredResults.length === 0 && (
            <p className="rounded-xl border border-white/10 p-6 text-center text-gray-400">
              No sample journeys found for this filter.
            </p>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-center">
          <p className="text-xs leading-6 text-amber-200">
            Demo mode: These sample journeys, prices and schedules are
            illustrative only. They are not actual provider listings,
            verified fares or live availability.
          </p>
        </div>

      </div>
    </section>
  );
}
