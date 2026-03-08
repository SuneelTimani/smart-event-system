const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const Booking = require("../models/Booking");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_CHAT_MODEL = String(process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini").trim();

const FAQ_ITEMS = [
  "How do I book an event? Go to Book Event page, select event/ticket, then pay or confirm.",
  "Can I cancel a booking? Yes, but only before the event's cancellation window closes.",
  "Can I transfer a ticket? Yes, before transfer window closes from your dashboard.",
  "How do promo codes work? Enter code on booking page; valid code applies discount.",
  "How do I get my pass? Open ticket confirmation page after booking and download pass/QR."
];

function extractHeaderToken(rawHeader) {
  const value = String(rawHeader || "").trim();
  if (!value) return "";
  if (/^Bearer\s+/i.test(value)) return value.replace(/^Bearer\s+/i, "").trim();
  return value;
}

async function resolveOptionalUserId(req) {
  try {
    const token = extractHeaderToken(req.header("Authorization"));
    if (!token) return "";
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.id) return "";
    const user = await User.findById(decoded.id).select("_id tokenVersion isAccountLocked").lean();
    if (!user || user.isAccountLocked) return "";
    if (Number(decoded.tv || 0) !== Number(user.tokenVersion || 0)) return "";
    return String(user._id);
  } catch {
    return "";
  }
}

function buildRecommendedEvents(events, ids) {
  const byId = new Map(events.map((e) => [String(e._id), e]));
  return ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .slice(0, 5)
    .map((e) => ({
      id: String(e._id),
      title: e.title || "Event",
      date: e.date || null,
      location: e.location || ""
    }));
}

function pickByQuery(events, q, limit = 3) {
  const query = String(q || "").toLowerCase().trim();
  if (!query) return [];
  const words = query.split(/\s+/).filter((w) => w.length > 2);
  const scored = events
    .map((e) => {
      const hay = `${e.title || ""} ${e.location || ""} ${e.category || ""}`.toLowerCase();
      let score = 0;
      words.forEach((w) => {
        if (hay.includes(w)) score += 2;
      });
      if (hay.includes(query)) score += 3;
      return { id: String(e._id), score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.id);
  return scored;
}

function fallbackReply(message, events, bookings) {
  const q = String(message || "").toLowerCase();
  const now = Date.now();

  const upcoming = events
    .filter((e) => e.date && new Date(e.date).getTime() >= now)
    .slice(0, 5);

  let recommendedIds = pickByQuery(events, q, 3);
  if (!recommendedIds.length) {
    recommendedIds = upcoming.slice(0, 3).map((e) => String(e._id));
  }

  const lines = [];

  if (/\b(hi|hello|hey|salam|aoa)\b/.test(q)) {
    lines.push("Hi, I can help you find events, book tickets, cancel/transfer bookings, and apply promo codes.");
  }

  if (/\b(book|booking|register|ticket|pay|payment)\b/.test(q)) {
    lines.push("To book: open Book Event page, choose event and ticket type, then complete payment/confirmation.");
  }

  if (/\b(cancel|cancellation|refund|refunded)\b/.test(q)) {
    lines.push("Cancellation/refund depends on event cutoff windows. Open Dashboard > your booking > Cancel if allowed.");
  }

  if (/\b(transfer|send ticket|change name)\b/.test(q)) {
    lines.push("Ticket transfer is available before transfer cutoff. Use Dashboard > Transfer Ticket.");
  }

  if (/\b(promo|discount|coupon|code)\b/.test(q)) {
    lines.push("If you have a promo code, apply it on booking checkout before payment.");
  }

  if (/\b(my booking|my bookings|history|status)\b/.test(q)) {
    if (Array.isArray(bookings) && bookings.length) {
      const latest = bookings[0];
      lines.push(`Your latest booking is ${latest.eventId?.title || "an event"} with status ${latest.status || "pending"}.`);
    } else {
      lines.push("I cannot find previous bookings for your account yet.");
    }
  }

  if (/\b(near|city|location|in\s+[a-z]{2,})\b/.test(q) && recommendedIds.length) {
    const matched = buildRecommendedEvents(events, recommendedIds).slice(0, 2);
    const names = matched.map((m) => m.title).filter(Boolean);
    const places = [...new Set(matched.map((m) => m.location).filter(Boolean))];
    if (names.length) {
      lines.push(`I found matching events: ${names.join(", ")}${places.length ? ` in ${places.join(", ")}` : ""}.`);
    } else {
      lines.push("I matched events by location/category from your query.");
    }
  }

  if (!lines.length) {
    lines.push("I can answer booking, cancellation, transfer, promo code, and event discovery questions.");
    lines.push("Try: 'events in karachi', 'how to cancel booking', or 'show upcoming events'.");
  }

  return {
    reply: lines.join(" "),
    recommendedEventIds: recommendedIds,
    recommendedEvents: buildRecommendedEvents(events, recommendedIds)
  };
}

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

exports.chatbot = async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const userId = await resolveOptionalUserId(req);
    const [events, bookings] = await Promise.all([
      Event.find({ isDeleted: { $ne: true }, status: "published" })
        .sort({ date: 1 })
        .limit(20)
        .select("_id title date location category")
        .lean(),
      userId
        ? Booking.find({ userId })
            .sort({ date: -1 })
            .limit(10)
            .populate("eventId", "title date location category")
            .select("eventId status paymentStatus ticketType quantity")
            .lean()
        : Promise.resolve([])
    ]);

    if (!OPENAI_API_KEY) {
      return res.json(fallbackReply(message, events, bookings));
    }

    const lightweightContext = {
      faq: FAQ_ITEMS,
      events: events.map((e) => ({
        id: String(e._id),
        title: e.title || "",
        date: e.date,
        location: e.location || "",
        category: e.category || ""
      })),
      userBookings: bookings.map((b) => ({
        eventId: String(b.eventId?._id || ""),
        eventTitle: b.eventId?.title || "",
        status: b.status || "",
        paymentStatus: b.paymentStatus || "",
        ticketType: b.ticketType || "",
        quantity: Number(b.quantity || 1)
      }))
    };

    const systemPrompt = [
      "You are the Evenix assistant.",
      "Be concise, practical, and user-friendly.",
      "Use only provided context; do not invent events.",
      "Return strict JSON with shape:",
      "{\"reply\":\"string\",\"recommendedEventIds\":[\"id1\",\"id2\"]}",
      "recommendedEventIds should be optional and contain only IDs from context events."
    ].join(" ");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_CHAT_MODEL,
        temperature: 0.35,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User message: ${message}` },
          { role: "user", content: `Context JSON: ${JSON.stringify(lightweightContext)}` }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!completion.ok) {
      return res.json(fallbackReply(message, events, bookings));
    }

    const payload = await completion.json();
    const raw = String(payload?.choices?.[0]?.message?.content || "").trim();
    const parsed = extractJsonObject(raw);

    if (!parsed || typeof parsed.reply !== "string") {
      return res.json(fallbackReply(message, events, bookings));
    }

    const allowedIds = new Set(events.map((e) => String(e._id)));
    const recommendedEventIds = Array.isArray(parsed.recommendedEventIds)
      ? parsed.recommendedEventIds.map((id) => String(id)).filter((id) => allowedIds.has(id)).slice(0, 5)
      : [];

    res.json({
      reply: parsed.reply,
      recommendedEventIds,
      recommendedEvents: buildRecommendedEvents(events, recommendedEventIds)
    });
  } catch {
    return res.status(500).json({ error: "Chatbot request failed" });
  }
};
