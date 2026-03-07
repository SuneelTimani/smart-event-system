/**
 * mlRoutes.js
 * ML-powered endpoints for search, attendance prediction, and churn detection.
 *
 * Routes:
 *   GET  /api/ml/search?q=...           → smart semantic search
 *   GET  /api/ml/attendance/:eventId    → attendance prediction (admin)
 *   GET  /api/ml/attendance             → bulk attendance predictions (admin)
 *   GET  /api/ml/churn/:eventId         → churn analysis (admin)
 *
 * Mount in server.js:
 *   const mlRoutes = require("./routes/mlRoutes");
 *   app.use("/api", mlRoutes);
 */

"use strict";

const express = require("express");
const router  = express.Router();

const { protect }   = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
const Event         = require("../models/Event");
const Booking       = require("../models/Booking");

const { predictAttendance, predictAttendanceBulk } = require("../utils/ml/attendancePrediction");
const { detectChurn, churnSummary }                = require("../utils/ml/churnDetection");
const { smartSearch }                              = require("../utils/ml/smartSearch");

// ─── 1. Smart Semantic Search ─────────────────────────────────────────────────
// GET /api/ml/search?q=outdoor+music+this+weekend&limit=10
// Public — no auth required

router.get("/ml/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    if (!query) {
      return res.status(400).json({ error: "Query parameter q is required", code: "MISSING_QUERY" });
    }

    const events = await Event.find({ status: "published", isDeleted: { $ne: true } })
      .select("_id title description category location organizer date capacity seatsBooked status tags")
      .lean();

    const results = smartSearch(query, events, { limit });

    res.json({ query, count: results.length, results });
  } catch (err) {
    console.error("[ML:search]", err.message);
    res.status(500).json({ error: "Smart search failed", code: "ML_ERROR" });
  }
});

// ─── 2. Attendance Prediction — Single Event ──────────────────────────────────
// GET /api/ml/attendance/:eventId

router.get("/ml/attendance/:eventId", protect, adminOnly, async (req, res) => {
  try {
    const [event, allBookings] = await Promise.all([
      Event.findById(req.params.eventId).lean(),
      Booking.find({}).populate("eventId", "organizer").lean(),
    ]);

    if (!event) {
      return res.status(404).json({ error: "Event not found", code: "NOT_FOUND" });
    }

    res.json(predictAttendance(event, allBookings));
  } catch (err) {
    console.error("[ML:attendance]", err.message);
    res.status(500).json({ error: "Attendance prediction failed", code: "ML_ERROR" });
  }
});

// ─── 3. Attendance Prediction — Bulk ─────────────────────────────────────────
// GET /api/ml/attendance?status=published

router.get("/ml/attendance", protect, adminOnly, async (req, res) => {
  try {
    const statusFilter = req.query.status || "published";

    const [events, allBookings] = await Promise.all([
      Event.find({ status: statusFilter, isDeleted: { $ne: true } }).lean(),
      Booking.find({}).populate("eventId", "organizer").lean(),
    ]);

    const predictions = predictAttendanceBulk(events, allBookings);
    predictions.sort((a, b) => a.showUpRate - b.showUpRate); // lowest show-up first

    res.json({ count: predictions.length, predictions });
  } catch (err) {
    console.error("[ML:attendance:bulk]", err.message);
    res.status(500).json({ error: "Bulk attendance prediction failed", code: "ML_ERROR" });
  }
});

// ─── 4. Churn Detection ───────────────────────────────────────────────────────
// GET /api/ml/churn/:eventId?risk=high

router.get("/ml/churn/:eventId", protect, adminOnly, async (req, res) => {
  try {
    const { eventId } = req.params;
    const riskFilter  = req.query.risk; // optional: "high" | "medium" | "low"

    const [event, eventBookings, allBookings] = await Promise.all([
      Event.findById(eventId).lean(),
      Booking.find({ eventId }).populate("userId", "email name").lean(),
      Booking.find({}).populate("userId", "email name").lean(),
    ]);

    if (!event) {
      return res.status(404).json({ error: "Event not found", code: "NOT_FOUND" });
    }

    let results = detectChurn(event, eventBookings, allBookings);
    if (riskFilter) results = results.filter((r) => r.churnRisk === riskFilter);

    res.json({
      eventId,
      eventTitle: event.title,
      summary: churnSummary(results),
      results,
    });
  } catch (err) {
    console.error("[ML:churn]", err.message);
    res.status(500).json({ error: "Churn detection failed", code: "ML_ERROR" });
  }
});

module.exports = router;