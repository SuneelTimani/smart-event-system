const Event = require("../models/Event");
const EventComment = require("../models/EventComment");
const User = require("../models/User");
const Booking = require("../models/Booking");
const twilio = require("twilio");
const { EVENT_CATEGORIES, sanitizeCategory, sanitizeText } = require("../utils/validation");
const { notifyAdminEventCreated } = require("../utils/notifications");
const { logAdminAction } = require("../utils/audit");
const { subscribe, publish } = require("../utils/commentStream");
const { decorateEventDynamicPricing } = require("../utils/dynamicPricing");

// ─── ML engine (graceful fallback if files not yet in place) ─────────────────
let getRecommendations = null;
try {
  ({ getRecommendations } = require("../utils/ml/recommendations"));
} catch {
  // ML module not yet installed — will use rule-based fallback below
}

const hasTwilioCreds =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_WHATSAPP_FROM;

const twilioClient = hasTwilioCreds
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

function serverError(res, code, fallbackMessage = "Request failed") {
  return res.status(500).json({ error: fallbackMessage, code });
}

function normalizeLocationToken(location) {
  const raw = String(location || "").trim().toLowerCase();
  if (!raw) return "";
  const firstPart = raw.split(",")[0].trim();
  return firstPart.replace(/\s+/g, " ");
}

function sanitizeCoverImage(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value)) {
    if (value.length > 2500000) return null;
    return value;
  }
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

exports.getEvents = async (req, res) => {
  try {
    const { category, status, limit, creatorId } = req.query;
    const filters = { isDeleted: { $ne: true } };
    if (category && EVENT_CATEGORIES.includes(category)) filters.category = category;
    if (creatorId && /^[a-f\d]{24}$/i.test(String(creatorId).trim())) {
      filters.createdBy = String(creatorId).trim();
    }
    const effectiveStatus = status && ["draft", "published", "cancelled"].includes(status)
      ? status
      : "published";
    if (effectiveStatus === "published") {
      filters.$or = [{ status: "published" }, { status: { $exists: false } }];
    } else {
      filters.status = effectiveStatus;
    }
    const parsedLimit = Number(limit);
    const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 0;

    let query = Event.find(filters).sort({ date: 1 });
    if (safeLimit) query = query.limit(safeLimit);

    const events = await query.lean();
    res.json(events.map(decorateEventDynamicPricing));
  } catch (err) {
    serverError(res, "EVENT_LIST_FAILED", "Failed to load events");
  }
};

// ─── Personalized Recommendations (ML-powered with rule-based fallback) ───────

exports.getPersonalizedRecommendations = async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const limitRaw = Number(req.query.limit || 6);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 20) : 6;

    // ── ML engine path ──────────────────────────────────────────────────────
    if (getRecommendations) {
      const [userBookings, allBookings, allEvents] = await Promise.all([
        Booking.find({ userId })
          .populate("eventId", "title description category location organizer date status seatsBooked capacity")
          .lean(),
        Booking.find({}).select("userId eventId status").lean(),
        Event.find({ status: "published", isDeleted: { $ne: true } })
          .select("_id title description category location organizer date capacity seatsBooked status")
          .lean(),
      ]);

      const recommendations = getRecommendations({ userId, userBookings, allBookings, allEvents, limit });

      if (recommendations.length) return res.json(recommendations.map(decorateEventDynamicPricing));

      // Fallback: popular upcoming events for new users with no history
      const fallback = allEvents
        .filter((e) => new Date(e.date) > new Date())
        .sort((a, b) => (b.seatsBooked || 0) - (a.seatsBooked || 0))
        .slice(0, limit)
        .map((e) => ({ ...e, recommendationReasons: ["popular"], recommendationScore: 0 }));
      return res.json(fallback.map(decorateEventDynamicPricing));
    }

    // ── Rule-based fallback (original logic) ────────────────────────────────
    const nearRaw = String(req.query.near || "").trim().toLowerCase();
    const now = new Date();
    const me = await User.findById(userId).select("following").lean();
    const followingSet = new Set(
      (Array.isArray(me?.following) ? me.following : []).map((id) => String(id)).filter(Boolean)
    );

    const history = await Booking.find({ userId })
      .sort({ date: -1 })
      .limit(60)
      .populate("eventId", "category location createdBy date")
      .lean();

    const bookedEventIds = new Set(
      history.map((h) => String(h.eventId?._id || h.eventId || "")).filter(Boolean)
    );

    const categoryScore = new Map();
    const locationScore = new Map();
    const creatorScore = new Map();
    for (const row of history) {
      const event = row.eventId || {};
      const category = String(event.category || "").trim();
      if (category) categoryScore.set(category, Number(categoryScore.get(category) || 0) + 1);
      const locToken = normalizeLocationToken(event.location);
      if (locToken) locationScore.set(locToken, Number(locationScore.get(locToken) || 0) + 1);
      const creatorId = String(event.createdBy || "").trim();
      if (creatorId) creatorScore.set(creatorId, Number(creatorScore.get(creatorId) || 0) + 1);
    }

    const bestCategory = [...categoryScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const bestLocation = nearRaw || [...locationScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";

    const candidates = await Event.find({
      isDeleted: { $ne: true },
      status: "published",
      date: { $gte: now }
    }).sort({ date: 1 }).limit(120).lean();

    const scored = candidates
      .filter((e) => !bookedEventIds.has(String(e._id)))
      .map((e) => {
        let score = 0;
        const reasons = [];
        const creatorId = String(e.createdBy || "").trim();

        if (creatorId && followingSet.has(creatorId)) { score += 7; reasons.push("creator_you_follow"); }
        const creatorAffinity = Number(creatorScore.get(creatorId) || 0);
        if (creatorAffinity > 0) { score += Math.min(4, creatorAffinity); reasons.push("similar_creators"); }
        if (bestCategory && String(e.category || "") === bestCategory) {
          score += Math.min(5, 2 + Number(categoryScore.get(bestCategory) || 1));
          reasons.push("category_match");
        }
        const locToken = normalizeLocationToken(e.location);
        if (bestLocation && locToken && locToken.includes(bestLocation)) { score += 5; reasons.push("near_you"); }
        else if (bestLocation && String(e.location || "").toLowerCase().includes(bestLocation)) { score += 4; reasons.push("near_you"); }
        const daysAway = Math.max(0, Math.floor((new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        if (daysAway <= 3) { score += 3; reasons.push("happening_soon"); }
        else if (daysAway <= 14) { score += 2; reasons.push("upcoming"); }
        else if (daysAway <= 30) { score += 1; }
        const popularityBoost = Math.min(2, Math.floor(Number(e.seatsBooked || 0) / 20));
        if (popularityBoost > 0) { score += popularityBoost; reasons.push("trending"); }

        return { ...e, _score: score, recommendationReasons: Array.from(new Set(reasons)) };
      })
      .sort((a, b) => b._score !== a._score ? b._score - a._score : new Date(a.date) - new Date(b.date))
      .slice(0, limit)
      .map(({ _score, ...rest }) => rest);

    if (scored.length) return res.json(scored.map(decorateEventDynamicPricing));

    const fallback = candidates
      .sort((a, b) => Number(b.seatsBooked || 0) - Number(a.seatsBooked || 0))
      .slice(0, limit)
      .map((e) => ({ ...e, recommendationReasons: ["trending"] }));
    res.json(fallback.map(decorateEventDynamicPricing));
  } catch {
    serverError(res, "EVENT_RECOMMENDATIONS_FAILED", "Failed to load personalized recommendations");
  }
};

exports.getFollowingFeed = async (req, res) => {
  try {
    const userId = String(req.user?.id || "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const limitRaw = Number(req.query.limit || 6);
    const pageRaw = Number(req.query.page || 1);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 30) : 6;
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const skip = (page - 1) * limit;

    const me = await User.findById(userId).select("following").lean();
    const followingIds = Array.isArray(me?.following)
      ? me.following.map((id) => String(id)).filter(Boolean)
      : [];

    if (!followingIds.length) return res.json([]);

    const now = new Date();
    const events = await Event.find({
      isDeleted: { $ne: true },
      createdBy: { $in: followingIds },
      $or: [{ status: "published" }, { status: { $exists: false } }],
      date: { $gte: now }
    })
      .populate("createdBy", "name profileImage")
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json(events.map(decorateEventDynamicPricing));
  } catch {
    serverError(res, "EVENT_FOLLOWING_FEED_FAILED", "Failed to load followed creators feed");
  }
};

exports.getSavedEvents = async (req, res) => {
  try {
    const me = await User.findById(req.user?.id)
      .select("savedEvents")
      .populate({
        path: "savedEvents.eventId",
        select: "title description date location category status createdBy organizer isDeleted capacity seatsBooked ticketTypes",
        populate: { path: "createdBy", select: "name profileImage" }
      })
      .lean();

    const saved = Array.isArray(me?.savedEvents) ? me.savedEvents : [];
    const items = saved
      .filter((row) => row?.eventId && row.eventId.isDeleted !== true)
      .map((row) => ({
        event: decorateEventDynamicPricing(row.eventId),
        reminderHoursBefore: Number(row.reminderHoursBefore || 24),
        savedAt: row.createdAt || null
      }))
      .sort((a, b) => new Date(a.event?.date || 0).getTime() - new Date(b.event?.date || 0).getTime());

    res.json(items);
  } catch {
    serverError(res, "EVENT_SAVED_LIST_FAILED", "Failed to load saved events");
  }
};

exports.saveEventForUser = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    const reminderRaw = Number(req.body?.reminderHoursBefore);
    const reminderHoursBefore = Number.isInteger(reminderRaw)
      ? Math.max(0, Math.min(168, reminderRaw))
      : 24;

    if (!eventId) return res.status(400).json({ error: "Event id is required" });

    const event = await Event.findOne({
      _id: eventId,
      isDeleted: { $ne: true },
      $or: [{ status: "published" }, { status: { $exists: false } }]
    }).select("_id");
    if (!event) return res.status(404).json({ error: "Event not found" });

    const me = await User.findById(req.user?.id);
    if (!me) return res.status(401).json({ error: "Unauthorized" });

    if (!Array.isArray(me.savedEvents)) me.savedEvents = [];
    const existingIdx = me.savedEvents.findIndex((row) => String(row.eventId) === eventId);

    if (existingIdx >= 0) {
      me.savedEvents[existingIdx].reminderHoursBefore = reminderHoursBefore;
    } else {
      me.savedEvents.push({ eventId, reminderHoursBefore, createdAt: new Date() });
    }

    await me.save();
    res.json({ message: "Event saved.", reminderHoursBefore });
  } catch {
    serverError(res, "EVENT_SAVE_FAILED", "Failed to save event");
  }
};

exports.unsaveEventForUser = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    if (!eventId) return res.status(400).json({ error: "Event id is required" });

    const me = await User.findById(req.user?.id);
    if (!me) return res.status(401).json({ error: "Unauthorized" });

    me.savedEvents = (Array.isArray(me.savedEvents) ? me.savedEvents : []).filter(
      (row) => String(row.eventId) !== eventId
    );
    await me.save();

    res.json({ message: "Event removed from saved list." });
  } catch {
    serverError(res, "EVENT_UNSAVE_FAILED", "Failed to remove saved event");
  }
};

exports.createEvent = async (req, res) => {
  try {
    const {
      title, description, date, location, mapLink, coverImage, organizer,
      category, capacity, ticketTypes, status, waitlistEnabled,
      cancelWindowHoursBefore, transferWindowHoursBefore, whatsappTo
    } = req.body;

    const cleanTitle = sanitizeText(title, { min: 3, max: 120 });
    const cleanDescription = sanitizeText(description, { min: 10, max: 3000 });
    const cleanLocation = sanitizeText(location, { min: 2, max: 180 });
    const cleanMapLink = String(mapLink || "").trim();
    const cleanCoverImage = sanitizeCoverImage(coverImage);
    const cleanOrganizer = sanitizeText(organizer, { min: 2, max: 120 });

    if (!cleanTitle || !cleanDescription || !date || !cleanLocation || !cleanOrganizer) {
      return res.status(400).json({ error: "title, description, date, location and organizer are required" });
    }
    if (typeof coverImage !== "undefined" && cleanCoverImage === null) {
      return res.status(400).json({ error: "coverImage must be a valid http/https image URL or uploaded image" });
    }
    if (cleanMapLink) {
      try {
        const u = new URL(cleanMapLink);
        if (!["http:", "https:"].includes(u.protocol)) return res.status(400).json({ error: "mapLink must be a valid http/https URL" });
      } catch {
        return res.status(400).json({ error: "mapLink must be a valid URL" });
      }
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ error: "date must be a valid ISO date string" });

    const cleanCategory = category ? sanitizeCategory(category) : "Other";
    if (category && !cleanCategory) return res.status(400).json({ error: "Invalid category" });

    const cleanCapacity = Number(typeof capacity === "undefined" ? 100 : capacity);
    if (!Number.isInteger(cleanCapacity) || cleanCapacity < 1 || cleanCapacity > 100000) {
      return res.status(400).json({ error: "capacity must be an integer between 1 and 100000" });
    }

    const cleanStatus = status || "published";
    if (!["draft", "published", "cancelled"].includes(cleanStatus)) return res.status(400).json({ error: "Invalid event status" });

    const cleanWaitlistEnabled = typeof waitlistEnabled === "boolean" ? waitlistEnabled : true;
    const cleanCancelWindow = Number(typeof cancelWindowHoursBefore === "undefined" ? 24 : cancelWindowHoursBefore);
    const cleanTransferWindow = Number(typeof transferWindowHoursBefore === "undefined" ? 2 : transferWindowHoursBefore);
    if (!Number.isInteger(cleanCancelWindow) || cleanCancelWindow < 0 || cleanCancelWindow > 720) {
      return res.status(400).json({ error: "cancelWindowHoursBefore must be an integer between 0 and 720" });
    }
    if (!Number.isInteger(cleanTransferWindow) || cleanTransferWindow < 0 || cleanTransferWindow > 720) {
      return res.status(400).json({ error: "transferWindowHoursBefore must be an integer between 0 and 720" });
    }

    let cleanTicketTypes = [{ name: "Standard", price: 25, quantity: cleanCapacity, sold: 0 }];

    if (Array.isArray(ticketTypes) && ticketTypes.length > 0) {
      cleanTicketTypes = [];
      for (const item of ticketTypes) {
        const ticketName = sanitizeText(item?.name, { min: 2, max: 40 });
        const ticketPrice = Number(item?.price);
        const ticketQty = Number(item?.quantity);
        if (!ticketName || Number.isNaN(ticketPrice) || ticketPrice < 0 || !Number.isInteger(ticketQty) || ticketQty < 1) {
          return res.status(400).json({ error: "Each ticket type must include valid name, price >= 0 and quantity >= 1" });
        }
        cleanTicketTypes.push({ name: ticketName, price: ticketPrice, quantity: ticketQty, sold: 0 });
      }
    }

    const totalTicketCapacity = cleanTicketTypes.reduce((sum, t) => sum + t.quantity, 0);
    if (totalTicketCapacity > cleanCapacity) {
      return res.status(400).json({ error: "Total ticket quantity cannot exceed event capacity" });
    }

    const event = await Event.create({
      title: cleanTitle, description: cleanDescription, date: parsedDate,
      location: cleanLocation, mapLink: cleanMapLink, coverImage: cleanCoverImage || "", organizer: cleanOrganizer,
      createdBy: req.user?.id || null, category: cleanCategory, capacity: cleanCapacity,
      ticketTypes: cleanTicketTypes, waitlistEnabled: cleanWaitlistEnabled,
      cancelWindowHoursBefore: cleanCancelWindow, transferWindowHoursBefore: cleanTransferWindow,
      status: cleanStatus
    });

    await logAdminAction(req, {
      action: "event_create", targetType: "event", targetId: event._id,
      details: { title: event.title, date: event.date, status: event.status }
    });

    Promise.allSettled([
      notifyAdminEventCreated({
        eventTitle: event.title,
        eventDate: event.date ? new Date(event.date).toISOString() : "TBD",
        location: event.location || "TBD",
        organizer: event.organizer || "TBD"
      })
    ]);

    if (twilioClient && whatsappTo) {
      if (!/^\+\d{7,15}$/.test(whatsappTo)) {
        return res.status(400).json({ error: "whatsappTo must be in E.164 format, e.g. +15551234567" });
      }
      await twilioClient.messages.create({
        body: `New Event Created: ${event.title}`,
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${whatsappTo}`
      });
    }

    res.status(201).json(event);
  } catch (err) {
    serverError(res, "EVENT_CREATE_FAILED", "Failed to create event");
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
      createdBy: req.user?.id
    });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const {
      title, description, date, location, mapLink, coverImage, organizer,
      category, capacity, status, ticketPrices,
      waitlistEnabled, cancelWindowHoursBefore, transferWindowHoursBefore
    } = req.body;

    const cleanTitle = sanitizeText(title, { min: 3, max: 120 });
    const cleanDescription = sanitizeText(description, { min: 10, max: 3000 });
    const cleanLocation = sanitizeText(location, { min: 2, max: 180 });
    const cleanMapLink = String(mapLink || "").trim();
    const cleanCoverImage = sanitizeCoverImage(coverImage);
    const cleanOrganizer = sanitizeText(organizer, { min: 2, max: 120 });

    if (!cleanTitle || !cleanDescription || !date || !cleanLocation || !cleanOrganizer) {
      return res.status(400).json({ error: "title, description, date, location and organizer are required" });
    }
    if (typeof coverImage !== "undefined" && cleanCoverImage === null) {
      return res.status(400).json({ error: "coverImage must be a valid http/https image URL or uploaded image" });
    }
    if (cleanMapLink) {
      try {
        const u = new URL(cleanMapLink);
        if (!["http:", "https:"].includes(u.protocol)) return res.status(400).json({ error: "mapLink must be a valid http/https URL" });
      } catch {
        return res.status(400).json({ error: "mapLink must be a valid URL" });
      }
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ error: "date must be a valid ISO date string" });

    const cleanCategory = category ? sanitizeCategory(category) : "Other";
    if (category && !cleanCategory) return res.status(400).json({ error: "Invalid category" });

    const cleanCapacity = Number(typeof capacity === "undefined" ? event.capacity : capacity);
    if (!Number.isInteger(cleanCapacity) || cleanCapacity < 1 || cleanCapacity > 100000) {
      return res.status(400).json({ error: "capacity must be an integer between 1 and 100000" });
    }
    if (cleanCapacity < Number(event.seatsBooked || 0)) {
      return res.status(400).json({ error: "capacity cannot be less than already booked seats" });
    }

    const cleanStatus = status || "published";
    if (!["draft", "published", "cancelled"].includes(cleanStatus)) return res.status(400).json({ error: "Invalid event status" });

    const cleanWaitlistEnabled = typeof waitlistEnabled === "boolean" ? waitlistEnabled : event.waitlistEnabled !== false;
    const cleanCancelWindow = Number(typeof cancelWindowHoursBefore === "undefined" ? (event.cancelWindowHoursBefore ?? 24) : cancelWindowHoursBefore);
    const cleanTransferWindow = Number(typeof transferWindowHoursBefore === "undefined" ? (event.transferWindowHoursBefore ?? 2) : transferWindowHoursBefore);
    if (!Number.isInteger(cleanCancelWindow) || cleanCancelWindow < 0 || cleanCancelWindow > 720) {
      return res.status(400).json({ error: "cancelWindowHoursBefore must be an integer between 0 and 720" });
    }
    if (!Number.isInteger(cleanTransferWindow) || cleanTransferWindow < 0 || cleanTransferWindow > 720) {
      return res.status(400).json({ error: "transferWindowHoursBefore must be an integer between 0 and 720" });
    }

    event.title = cleanTitle;
    event.description = cleanDescription;
    event.date = parsedDate;
    event.location = cleanLocation;
    event.mapLink = cleanMapLink;
    event.coverImage = cleanCoverImage || "";
    event.organizer = cleanOrganizer;
    event.category = cleanCategory;
    event.capacity = cleanCapacity;
    event.status = cleanStatus;
    event.waitlistEnabled = cleanWaitlistEnabled;
    event.cancelWindowHoursBefore = cleanCancelWindow;
    event.transferWindowHoursBefore = cleanTransferWindow;

    if (ticketPrices && typeof ticketPrices === "object" && Array.isArray(event.ticketTypes)) {
      const normalizeKey = (name) => String(name || "").trim().toLowerCase();
      const ticketByKey = new Map(event.ticketTypes.map((t) => [normalizeKey(t.name), t]));

      if (Object.prototype.hasOwnProperty.call(ticketPrices, "standard")) {
        const standard = ticketByKey.get("standard");
        const nextStandardPrice = Number(ticketPrices.standard);
        if (!standard) return res.status(400).json({ error: "Standard ticket type is missing on this event" });
        if (Number.isNaN(nextStandardPrice) || nextStandardPrice < 0) return res.status(400).json({ error: "Standard ticket price must be a number >= 0" });
        standard.price = nextStandardPrice;
      }

      if (Object.prototype.hasOwnProperty.call(ticketPrices, "vip")) {
        const vip = ticketByKey.get("vip");
        const nextVipPrice = Number(ticketPrices.vip);
        if (!vip) return res.status(400).json({ error: "VIP ticket type is missing on this event" });
        if (Number.isNaN(nextVipPrice) || nextVipPrice < 0) return res.status(400).json({ error: "VIP ticket price must be a number >= 0" });
        vip.price = nextVipPrice;
      }
    }

    await event.save();
    await logAdminAction(req, {
      action: "event_edit", targetType: "event", targetId: event._id,
      details: { title: event.title, date: event.date, status: event.status, capacity: event.capacity }
    });
    res.json(event);
  } catch (err) {
    serverError(res, "EVENT_UPDATE_FAILED", "Failed to update event");
  }
};

exports.getEventComments = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    if (!eventId) return res.status(400).json({ error: "Event id is required" });

    const event = await Event.findOne({ _id: eventId, isDeleted: { $ne: true } }).select("_id");
    if (!event) return res.status(404).json({ error: "Event not found" });

    const parsedLimit = Number(req.query.limit);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 120) : 50;
    const comments = await EventComment.find({ eventId, isHidden: { $ne: true } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    const normalized = comments.map((c) => ({
      _id: c._id, eventId: c.eventId, parentId: c.parentId || null,
      userId: c.userId, userName: c.userName, userProfileImage: c.userProfileImage || "",
      text: c.text, createdAt: c.createdAt,
      reportCount: Array.isArray(c.reports) ? c.reports.length : 0,
      helpfulCount: Array.isArray(c.helpfulVotes) ? c.helpfulVotes.length : 0
    }));

    const topLevel = normalized.filter((c) => !c.parentId);
    const repliesByParent = new Map();
    normalized.filter((c) => c.parentId).forEach((c) => {
      const key = String(c.parentId);
      if (!repliesByParent.has(key)) repliesByParent.set(key, []);
      repliesByParent.get(key).push(c);
    });

    const out = topLevel
      .map((row) => ({
        ...row,
        replies: (repliesByParent.get(String(row._id)) || []).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(out);
  } catch {
    serverError(res, "EVENT_COMMENTS_LIST_FAILED", "Failed to load comments");
  }
};

exports.streamEventComments = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    if (!eventId) return res.status(400).json({ error: "Event id is required" });

    const event = await Event.findOne({ _id: eventId, isDeleted: { $ne: true } }).select("_id");
    if (!event) return res.status(404).json({ error: "Event not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const viewerId = String(req.query.viewerId || "").trim().slice(0, 64);
    const unsubscribe = subscribe(eventId, res, { viewerId });
    req.on("close", () => { unsubscribe(); });
  } catch {
    serverError(res, "EVENT_COMMENTS_STREAM_FAILED", "Failed to start comments stream");
  }
};

exports.publishTypingIndicator = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    if (!eventId) return res.status(400).json({ error: "Event id is required" });

    const event = await Event.findOne({ _id: eventId, isDeleted: { $ne: true } }).select("_id status");
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.status === "cancelled") return res.status(400).json({ error: "Comments are disabled for cancelled events" });

    const user = await User.findById(req.user?.id).select("name");
    if (!user) return res.status(401).json({ error: "User not found" });

    publish(eventId, "typing", { userId: String(user._id), userName: user.name || "User", at: new Date().toISOString() });
    res.json({ ok: true });
  } catch {
    serverError(res, "EVENT_TYPING_PUBLISH_FAILED", "Failed to publish typing indicator");
  }
};

exports.addEventComment = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    const text = sanitizeText(req.body?.text, { min: 1, max: 500 });
    if (!eventId || !text) return res.status(400).json({ error: "Valid comment text is required (1-500 chars)" });

    const event = await Event.findOne({ _id: eventId, isDeleted: { $ne: true } }).select("_id status");
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.status === "cancelled") return res.status(400).json({ error: "Comments are disabled for cancelled events" });

    const user = await User.findById(req.user?.id).select("name profileImage");
    if (!user) return res.status(401).json({ error: "User not found" });

    const comment = await EventComment.create({
      eventId, userId: user._id, parentId: null,
      userName: user.name || "User", userProfileImage: user.profileImage || "", text
    });

    const out = {
      _id: comment._id, eventId: comment.eventId, parentId: comment.parentId || null,
      userId: comment.userId, userName: comment.userName, userProfileImage: comment.userProfileImage,
      text: comment.text, createdAt: comment.createdAt, reportCount: 0, helpfulCount: 0
    };

    publish(eventId, "comment_created", out);
    res.status(201).json(out);
  } catch {
    serverError(res, "EVENT_COMMENT_CREATE_FAILED", "Failed to add comment");
  }
};

exports.addEventReply = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    const parentId = String(req.params.commentId || "").trim();
    const text = sanitizeText(req.body?.text, { min: 1, max: 500 });
    if (!eventId || !parentId || !text) return res.status(400).json({ error: "Valid reply text is required (1-500 chars)" });

    const [event, parent, user] = await Promise.all([
      Event.findOne({ _id: eventId, isDeleted: { $ne: true } }).select("_id status"),
      EventComment.findOne({ _id: parentId, eventId, isHidden: { $ne: true } }).select("_id parentId"),
      User.findById(req.user?.id).select("name profileImage")
    ]);

    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.status === "cancelled") return res.status(400).json({ error: "Comments are disabled for cancelled events" });
    if (!parent) return res.status(404).json({ error: "Parent comment not found" });
    if (parent.parentId) return res.status(400).json({ error: "Only one-level replies are allowed" });
    if (!user) return res.status(401).json({ error: "User not found" });

    const reply = await EventComment.create({
      eventId, userId: user._id, parentId: parent._id,
      userName: user.name || "User", userProfileImage: user.profileImage || "", text
    });

    const out = {
      _id: reply._id, eventId: reply.eventId, parentId: reply.parentId || null,
      userId: reply.userId, userName: reply.userName, userProfileImage: reply.userProfileImage,
      text: reply.text, createdAt: reply.createdAt, reportCount: 0, helpfulCount: 0
    };
    publish(eventId, "comment_created", out);
    res.status(201).json(out);
  } catch {
    serverError(res, "EVENT_REPLY_CREATE_FAILED", "Failed to add reply");
  }
};

exports.toggleCommentHelpful = async (req, res) => {
  try {
    const eventId = String(req.params.id || "").trim();
    const commentId = String(req.params.commentId || "").trim();
    const userId = String(req.user?.id || "").trim();
    if (!eventId || !commentId || !userId) return res.status(400).json({ error: "Event id and comment id are required" });

    const comment = await EventComment.findOne({ _id: commentId, eventId, isHidden: { $ne: true } });
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    const already = Array.isArray(comment.helpfulVotes) && comment.helpfulVotes.some((id) => String(id) === userId);
    if (already) {
      comment.helpfulVotes = comment.helpfulVotes.filter((id) => String(id) !== userId);
    } else {
      comment.helpfulVotes.push(userId);
    }
    await comment.save();

    const payload = {
      _id: comment._id, eventId: comment.eventId, parentId: comment.parentId || null,
      helpfulCount: Array.isArray(comment.helpfulVotes) ? comment.helpfulVotes.length : 0,
      voted: !already
    };
    publish(eventId, "comment_updated", payload);
    res.json(payload);
  } catch {
    serverError(res, "EVENT_COMMENT_HELPFUL_FAILED", "Failed to update helpful vote");
  }
};

exports.reportEventComment = async (req, res) => {
  try {
    const commentId = String(req.params.commentId || "").trim();
    const reason = sanitizeText(req.body?.reason, { min: 0, max: 200 }) || "";
    if (!commentId) return res.status(400).json({ error: "Comment id is required" });

    const comment = await EventComment.findById(commentId);
    if (!comment || comment.isHidden) return res.status(404).json({ error: "Comment not found" });

    const reporterId = String(req.user?.id || "");
    if (!reporterId) return res.status(401).json({ error: "Unauthorized" });

    const alreadyReported = (comment.reports || []).some((r) => String(r.userId) === reporterId);
    if (alreadyReported) return res.status(409).json({ error: "You already reported this comment" });

    comment.reports.push({ userId: reporterId, reason, createdAt: new Date() });
    await comment.save();

    res.json({ message: "Comment reported successfully." });
  } catch {
    serverError(res, "EVENT_COMMENT_REPORT_FAILED", "Failed to report comment");
  }
};
