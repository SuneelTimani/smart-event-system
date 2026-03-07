const mongoose = require("mongoose");
const User = require("../models/User");
const { notifySavedEventReminder } = require("./notifications");

const REMINDER_ENABLED = String(process.env.EVENT_REMINDERS_ENABLED || "true") === "true";
const REMINDER_POLL_MS = Math.max(30_000, Number(process.env.EVENT_REMINDERS_POLL_MS || 60_000));
const REMINDER_GRACE_MS = Math.max(60_000, Number(process.env.EVENT_REMINDERS_GRACE_MS || 10 * 60 * 1000));
const REMINDER_MAX_USERS = Math.max(10, Math.min(2000, Number(process.env.EVENT_REMINDERS_MAX_USERS || 500)));

let reminderTimer = null;
let reminderLoopRunning = false;

function clampReminderHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 24;
  return Math.max(0, Math.min(168, Math.floor(n)));
}

async function processEventRemindersOnce() {
  if (!REMINDER_ENABLED) return;
  if (mongoose.connection.readyState !== 1) return;
  if (reminderLoopRunning) return;

  reminderLoopRunning = true;
  try {
    const now = Date.now();
    const users = await User.find({
      isAccountLocked: { $ne: true },
      "savedEvents.0": { $exists: true }
    })
      .select("name email savedEvents pushSubscriptions")
      .populate({
        path: "savedEvents.eventId",
        select: "title date location status isDeleted"
      })
      .limit(REMINDER_MAX_USERS);

    let sentCount = 0;
    for (const user of users) {
      let changed = false;
      for (const row of Array.isArray(user.savedEvents) ? user.savedEvents : []) {
        const event = row?.eventId;
        if (!event) continue;
        if (event.isDeleted) continue;
        const status = String(event.status || "published");
        if (status !== "published") continue;

        const eventDateMs = new Date(event.date).getTime();
        if (!Number.isFinite(eventDateMs) || eventDateMs <= now) continue;

        const reminderHours = clampReminderHours(row.reminderHoursBefore);
        const reminderAtMs = eventDateMs - (reminderHours * 60 * 60 * 1000);
        if (now < reminderAtMs || now > reminderAtMs + REMINDER_GRACE_MS) continue;

        const lastEventDateMs = row.lastReminderEventDate ? new Date(row.lastReminderEventDate).getTime() : 0;
        if (lastEventDateMs === eventDateMs) continue;

        await notifySavedEventReminder({
          toUserEmail: user.email,
          pushSubscriptions: Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [],
          userId: user._id,
          eventId: event._id,
          userName: user.name || "User",
          eventTitle: event.title || "Event",
          eventDate: event.date,
          location: event.location || "TBD",
          reminderHoursBefore: reminderHours
        });

        row.lastReminderEventDate = new Date(eventDateMs);
        row.lastReminderSentAt = new Date();
        changed = true;
        sentCount += 1;
      }

      if (changed) {
        await user.save();
      }
    }

    if (sentCount > 0) {
      console.log(`[Reminder] processed and sent ${sentCount} reminder(s)`);
    }
  } catch (err) {
    console.error("[Reminder] worker error:", err.message);
  } finally {
    reminderLoopRunning = false;
  }
}

function startReminderWorker() {
  if (!REMINDER_ENABLED || reminderTimer) return;
  reminderTimer = setInterval(() => {
    processEventRemindersOnce().catch(() => {});
  }, REMINDER_POLL_MS);
  if (typeof reminderTimer.unref === "function") reminderTimer.unref();
  console.log(`[Reminder] worker started poll=${REMINDER_POLL_MS}ms grace=${REMINDER_GRACE_MS}ms`);
}

function stopReminderWorker() {
  if (!reminderTimer) return;
  clearInterval(reminderTimer);
  reminderTimer = null;
}

module.exports = {
  processEventRemindersOnce,
  startReminderWorker,
  stopReminderWorker
};
