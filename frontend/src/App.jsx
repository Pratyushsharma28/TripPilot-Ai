import ResultsDashboard from "./ResultsDashboard";
import { useState, useEffect } from "react";
import {
  Plane,
  MapPin,
  CalendarDays,
  Users,
  ArrowRight,
  Sparkles,
  Compass,
  ShieldCheck,
  Wallet,
  Menu,
  Search
} from "lucide-react";

const destinations = [
  {
    name: "Kashmir",
    subtitle: "Paradise in the Himalayas",
    image: "https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=900"
  },
  {
    name: "Kerala",
    subtitle: "Backwaters & greenery",
    image: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=900"
  },
  {
    name: "Jaipur, Rajasthan",
    subtitle: "Royal heritage & culture",
    image: "https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?w=900"
  },
  {
    name: "Goa",
    subtitle: "Beaches & coastal escapes",
    image: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=900"
  },
  {
    name: "Manali",
    subtitle: "Mountains & adventure",
    image: "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?w=900"
  },
  {
    name: "Agra",
    subtitle: "History & architecture",
    image: "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=900"
  }
];

function Navbar() {
  return (
    <nav className="flex items-center justify-between border-b border-white/10 px-6 py-5 md:px-12">
      <div className="flex items-center gap-2 text-xl font-bold">
        <Plane className="text-emerald-400" />
        TripPilot<span className="text-emerald-400">AI</span>
      </div>

      <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
        <a href="#explore" className="hover:text-emerald-400">Explore</a>
        <a href="#features" className="hover:text-emerald-400">Features</a>
        <a href="#planner" className="hover:text-emerald-400">Plan a Trip</a>
      </div>

      <a
        href="#planner"
        className="hidden rounded-full bg-emerald-400 px-5 py-2.5 font-semibold text-slate-950 md:block"
      >
        Get Started
      </a>

      <Menu className="text-white md:hidden" />
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative mx-4 mt-6 flex min-h-[540px] items-center overflow-hidden rounded-3xl md:mx-10">
      <img
        src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1800"
        alt="Beautiful mountain lake surrounded by mountains"
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/65 to-transparent" />

      <div className="relative z-10 max-w-2xl px-8 py-20 md:px-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
          <Sparkles size={16} />
          Your AI-powered travel companion
        </div>

        <h1 className="text-5xl font-bold leading-tight md:text-7xl">
  Explore India.
  <span className="block text-emerald-400">
    We'll plan it.
  </span>
</h1>

<p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
  Discover incredible Indian destinations, compare trains,
  buses and flights, and build personalized travel plans
  with autonomous AI research.
</p>

        <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
          Discover destinations, compare real travel options
          and create personalized trips with autonomous AI research.
        </p>

        <a
          href="#planner"
          className="mt-9 inline-flex items-center gap-3 rounded-full bg-emerald-400 px-7 py-4 font-bold text-slate-950 transition hover:bg-emerald-300"
        >
          Plan My Trip <ArrowRight size={20} />
        </a>
      </div>
    </section>
  );
}

function CityAutocomplete({ label, value, onChange, cities, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);

  const suggestions = cities
    .filter((city) =>
      city.toLowerCase().includes(value.trim().toLowerCase())
    )
    .slice(0, 8);

  function selectCity(city) {
    onChange(city);
    setIsOpen(false);
  }

  return (
    <div className="relative w-full">
      <label className="mb-2 block text-sm text-gray-300">
        {label}
      </label>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false);
        }}
        className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-white outline-none focus:border-emerald-400"
      />

      {isOpen && value.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#111827] shadow-xl">

          {suggestions.length > 0 ? (
            suggestions.map((city, index) => (
              <button
                key={`${city}-${index}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCity(city)}
                className="block w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-emerald-500/20"
              >
                {city}
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-gray-400">
              No matching city found. You can still enter it manually.
            </p>
          )}

        </div>
      )}
    </div>
  );
}

function TripPlanner({ onSearch }) {
  const [mode, setMode] = useState("flexible");

  const [form, setForm] = useState({
    origin: "",
    destination: "",
    departureDate: "",
    returnDate: "",
    earliestDeparture: "",
    latestDeparture: "",
    minNights: 4,
    maxNights: 6,
    travelers: 1,
    budget: "",
    transport: ["train", "bus", "flight"],
  });

  const [cities, setCities] = useState([]);

useEffect(() => {
  async function fetchCities() {
    try {
      const response = await fetch(
        "https://countriesnow.space/api/v0.1/countries/cities",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ country: "India" }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch cities");
      }

      const result = await response.json();

      if (!result.error && Array.isArray(result.data)) {
        setCities(result.data);
      }
    } catch (error) {
      console.error("City database error:", error);
    }
  }

  fetchCities();
}, []);

  function update(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function toggleTransport(type) {
    setForm((prev) => {
      const exists = prev.transport.includes(type);

      return {
        ...prev,
        transport: exists
          ? prev.transport.filter((item) => item !== type)
          : [...prev.transport, type],
      };
    });
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (form.origin.trim().toLowerCase() ===
        form.destination.trim().toLowerCase()) {
      alert("Starting city and destination must be different.");
      return;
    }

    if (form.transport.length === 0) {
      alert("Please select at least one transport option.");
      return;
    }

    if (mode === "fixed" && form.returnDate < form.departureDate) {
      alert("Return date must be after departure date.");
      return;
    }

    if (
      mode === "flexible" &&
      (form.latestDeparture < form.earliestDeparture ||
        Number(form.maxNights) < Number(form.minNights))
    ) {
      alert("Please check your flexible date range and trip duration.");
      return;
    }

    const request = {
      ...form,
      mode,
      travelers: Number(form.travelers),
      budget: Number(form.budget),
      minNights: Number(form.minNights),
      maxNights: Number(form.maxNights),
      transport: form.transport,
    };

    console.log("TripPilot AI Search Request:", request);

    onSearch(request);
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-white/10 bg-slate-800 p-3 text-white outline-none focus:border-emerald-400";

  const labelClass = "text-sm font-medium text-slate-300";

  return (
    <section id="planner" className="mx-auto max-w-6xl px-6 py-24">

      <div className="mb-10 text-center">
        <p className="mb-3 font-semibold text-emerald-400">
          SMART TRAVEL PLANNING
        </p>

        <h2 className="text-3xl font-bold md:text-5xl">
          Your journey, optimized by AI.
        </h2>

        <p className="mt-4 text-slate-400">
          Choose your preferences. Let AI find the best journey.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-8 rounded-3xl border border-white/10 bg-slate-900 p-6 md:p-10"
      >

        {/* Cities */}

        <div className="grid gap-6 md:grid-cols-2">

          <div>
            {/* <label className={labelClass}>Starting city</label>

            <input
              required
              value={form.origin}
              onChange={(e) => update("origin", e.target.value)}
              placeholder="e.g. Bengaluru"
              className={inputClass}
            /> */}
            <CityAutocomplete
  label="Starting City"
  placeholder="Enter starting city"
  value={form.origin}
  onChange={(value) => update("origin", value)}
  cities={cities}
/>
          </div>

          <div>
            {/* <label className={labelClass}>Destination city</label>

            <input
              required
              value={form.destination}
              onChange={(e) => update("destination", e.target.value)}
              placeholder="e.g. Manali"
              className={inputClass}
            /> */}

            <CityAutocomplete
  label="Destination City"
  placeholder="Where do you want to go?"
  value={form.destination}
  onChange={(value) => update("destination", value)}
  cities={cities}
/>
          </div>

        </div>

        {/* Date mode */}

        <div>
          <h3 className="mb-4 text-lg font-semibold">
            When would you like to travel?
          </h3>

          <div className="mb-6 flex flex-wrap gap-3">

            <button
              type="button"
              onClick={() => setMode("fixed")}
              className={`rounded-xl px-5 py-3 font-medium ${
                mode === "fixed"
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              Fixed dates
            </button>

            <button
              type="button"
              onClick={() => setMode("flexible")}
              className={`rounded-xl px-5 py-3 font-medium ${
                mode === "flexible"
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-slate-800 text-slate-300"
              }`}
            >
              Flexible dates ✨
            </button>

          </div>

          {mode === "fixed" ? (

            <div className="grid gap-6 md:grid-cols-2">

              <div>
                <label className={labelClass}>Departure date</label>

                <input
                  type="date"
                  required
                  value={form.departureDate}
                  onChange={(e) => update("departureDate", e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Return date</label>

                <input
                  type="date"
                  required
                  min={form.departureDate}
                  value={form.returnDate}
                  onChange={(e) => update("returnDate", e.target.value)}
                  className={inputClass}
                />
              </div>

            </div>

          ) : (

            <div className="space-y-6">

              <div className="grid gap-6 md:grid-cols-2">

                <div>
                  <label className={labelClass}>
                    Earliest departure
                  </label>

                  <input
                    type="date"
                    required
                    value={form.earliestDeparture}
                    onChange={(e) =>
                      update("earliestDeparture", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Latest departure
                  </label>

                  <input
                    type="date"
                    required
                    min={form.earliestDeparture}
                    value={form.latestDeparture}
                    onChange={(e) =>
                      update("latestDeparture", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

              </div>

              <div className="grid gap-6 md:grid-cols-2">

                <div>
                  <label className={labelClass}>
                    Minimum trip duration (nights)
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="30"
                    required
                    value={form.minNights}
                    onChange={(e) => update("minNights", e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Maximum trip duration (nights)
                  </label>

                  <input
                    type="number"
                    min="1"
                    max="30"
                    required
                    value={form.maxNights}
                    onChange={(e) => update("maxNights", e.target.value)}
                    className={inputClass}
                  />
                </div>

              </div>

              <p className="text-sm text-emerald-300">
                AI will compare different departure and return date
                combinations within your selected range.
              </p>

            </div>

          )}
        </div>

        {/* Travelers and budget */}

        <div className="grid gap-6 md:grid-cols-2">

          <div>
            <label className={labelClass}>Number of travellers</label>

            <input
              type="number"
              min="1"
              max="20"
              required
              value={form.travelers}
              onChange={(e) => update("travelers", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Total trip budget (₹)</label>

            <input
              type="number"
              min="1"
              required
              value={form.budget}
              onChange={(e) => update("budget", e.target.value)}
              className={inputClass}
            />
          </div>

        </div>

        {/* Transport */}

        <div>
          <h3 className="mb-4 text-lg font-semibold">
            Preferred transport
          </h3>

          <div className="flex flex-wrap gap-3">

            {["train", "bus", "flight"].map((type) => (

              <button
                key={type}
                type="button"
                onClick={() => toggleTransport(type)}
                className={`rounded-xl border px-5 py-3 capitalize ${
                  form.transport.includes(type)
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-slate-800 text-slate-300"
                }`}
              >
                {form.transport.includes(type) ? "✓ " : ""}
                {type}
              </button>

            ))}

          </div>

          <p className="mt-3 text-sm text-slate-400">
            Select multiple options to let AI compare different
            transport modes.
          </p>
        </div>

        {/* Submit */}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-400 p-4 text-lg font-bold text-slate-950 transition hover:bg-emerald-300"
        >
          <span>Find My Best Trip</span>
          <Sparkles size={20} />
        </button>

      </form>
    </section>
  );
}


function Destinations() {
  return (
    <section id="explore" className="px-6 py-16 md:px-12">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="mb-3 font-semibold text-emerald-400">
            FIND YOUR INSPIRATION
          </p>
          <h2 className="text-3xl font-bold md:text-4xl">
            Explore India
          </h2>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {destinations.map((destination) => (
          <div
            key={destination.name}
            className="group relative h-80 overflow-hidden rounded-2xl"
          >
            <img
              src={destination.image}
              alt={destination.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

            <div className="absolute bottom-6 left-6">
              <h3 className="text-2xl font-bold">{destination.name}</h3>
              <p className="text-slate-300">{destination.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: <Search />,
      title: "Autonomous Research",
      description: "AI researches travel websites and compares real options."
    },
    {
      icon: <Wallet />,
      title: "Smart Budgeting",
      description: "Discover better travel options within your budget."
    },
    {
      icon: <ShieldCheck />,
      title: "Trip Rescue",
      description: "Find alternative options when your original plan changes."
    }
  ];

  return (
    <section id="features" className="px-6 py-24 md:px-12">
      <div className="mb-12 text-center">
        <p className="mb-3 font-semibold text-emerald-400">
          TRAVEL SMARTER
        </p>
        <h2 className="text-3xl font-bold md:text-5xl">
          More than a travel planner.
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-white/10 bg-slate-900 p-8"
          >
            <div className="mb-5 inline-flex rounded-xl bg-emerald-400/10 p-3 text-emerald-400">
              {feature.icon}
            </div>

            <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
            <p className="leading-7 text-slate-400">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 px-8 py-10 text-center text-slate-400">
      <p className="text-xl font-bold text-white">
        TripPilot<span className="text-emerald-400">AI</span>
      </p>
      <p className="mt-3 text-sm">
        Explore more. Worry less. Travel smarter.
      </p>
      <p className="mt-6 text-xs">
        © 2026 TripPilot AI. All rights reserved.
      </p>
    </footer>
  );
}

export default function App() {
  const [searchRequest, setSearchRequest] = useState(null);

  function handleSearch(request) {
    setSearchRequest(request);

    setTimeout(() => {
      document.getElementById("results")?.scrollIntoView({
        behavior: "smooth",
      });
    }, 100);
  }

  return (
    <div className="min-h-screen bg-[#080c18] text-white">
      <Navbar />
      <Hero />

      <TripPlanner onSearch={handleSearch} />

      {searchRequest && (
        <ResultsDashboard searchRequest={searchRequest} />
      )}

      <Destinations />
      <Features />
      <Footer />
    </div>
  );
}
