require("dotenv").config({ override: true });

const express = require("express");
const cors = require("cors");
const apiRoutes = require("./routes/api");

const app = express();

app.use(cors());
app.use(express.json());

// Root welcome route
app.get("/", (req, res) => {
  res.send("Welcome to TripPilot AI Backend!");
});

// Mount modular API routes under /api
app.use("/api", apiRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.stack || err.message);
  res.status(err.status || 500).json({
    status: "ERROR",
    message: err.message || "Internal Server Error"
  });
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`TripPilot AI running at http://localhost:${PORT}`);
  });
}

module.exports = app;