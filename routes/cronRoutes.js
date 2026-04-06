const express = require("express");
const router = express.Router();
const { processNotificationQueueOnce } = require("../utils/notifications");
const { processEventRemindersOnce } = require("../utils/reminderWorker");

function verifyCronSecret(req, res, next) {
  const expected = String(process.env.CRON_SECRET || "").trim();
  if (!expected) {
    return res.status(500).json({ error: "CRON_SECRET is not configured" });
  }
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

router.get("/notifications", verifyCronSecret, async (req, res) => {
  try {
    await processNotificationQueueOnce();
    res.json({ ok: true, job: "notifications" });
  } catch {
    res.status(500).json({ error: "Failed to process notification queue" });
  }
});

router.get("/reminders", verifyCronSecret, async (req, res) => {
  try {
    await processEventRemindersOnce();
    res.json({ ok: true, job: "reminders" });
  } catch {
    res.status(500).json({ error: "Failed to process reminders" });
  }
});

module.exports = router;
