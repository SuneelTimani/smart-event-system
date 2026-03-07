/**
 * smartSearch.js
 * TF-IDF based semantic search for events.
 * Understands intent, synonyms, and partial matches — pure JS.
 */

"use strict";

// ─── Stop words & tokenization ────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","has","have","had","will","would",
  "this","that","these","those","it","its","we","our","you","your","i",
  "my","me","he","she","they","them","their","what","which","who","how",
  "show","find","get","want","looking","events","event","near","me","any",
]);

// Synonym expansion map — query terms get expanded to include synonyms
const SYNONYMS = {
  music:       ["concert", "band", "live", "gig", "performance", "festival"],
  concert:     ["music", "live", "band", "show", "performance"],
  talk:        ["conference", "seminar", "speaker", "keynote", "presentation"],
  conference:  ["summit", "seminar", "symposium", "convention", "expo"],
  class:       ["workshop", "training", "course", "lesson", "tutorial"],
  workshop:    ["class", "training", "course", "hands-on", "tutorial"],
  free:        ["complimentary", "no-cost", "open"],
  online:      ["virtual", "webinar", "remote", "digital", "livestream"],
  webinar:     ["online", "virtual", "remote", "digital"],
  networking:  ["meetup", "connect", "community", "social"],
  meetup:      ["networking", "community", "social", "gathering"],
  food:        ["culinary", "cooking", "tasting", "dining", "restaurant"],
  tech:        ["technology", "software", "coding", "programming", "developer"],
  startup:     ["entrepreneur", "business", "founder", "venture"],
  art:         ["gallery", "exhibition", "creative", "design", "visual"],
  sports:      ["athletics", "fitness", "competition", "tournament"],
};

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function expandQuery(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const syns = SYNONYMS[token] || [];
    for (const s of syns) expanded.add(s);
  }
  return [...expanded];
}

// ─── TF-IDF index ─────────────────────────────────────────────────────────────

function buildIndex(events) {
  // Field weights: title is most important
  const FIELD_WEIGHTS = {
    title:       3.0,
    category:    2.5,
    organizer:   1.5,
    location:    1.5,
    description: 1.0,
    tags:        2.0,
  };

  // Build doc frequency for IDF
  const df = {};   // term → number of docs containing it
  const docs = []; // { id, termFreqs }

  for (const event of events) {
    const termFreqs = {};

    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
      const value = Array.isArray(event[field])
        ? event[field].join(" ")
        : String(event[field] || "");
      const tokens = tokenize(value);

      for (const token of tokens) {
        termFreqs[token] = (termFreqs[token] || 0) + weight;
      }
    }

    // Mark in DF
    for (const term of Object.keys(termFreqs)) {
      df[term] = (df[term] || 0) + 1;
    }

    docs.push({ id: String(event._id), termFreqs, event });
  }

  const N = events.length || 1;

  // Compute TF-IDF for each doc
  const tfidfDocs = docs.map(({ id, termFreqs, event }) => {
    const tfidf = {};
    for (const [term, tf] of Object.entries(termFreqs)) {
      const idf = Math.log((N + 1) / ((df[term] || 0) + 1)) + 1;
      tfidf[term] = tf * idf;
    }
    return { id, tfidf, event };
  });

  return { tfidfDocs, df, N };
}

// ─── Date/time query parsing ──────────────────────────────────────────────────

const DATE_PATTERNS = [
  { pattern: /\btoday\b/,          offset: 0,   window: 1 },
  { pattern: /\btomorrow\b/,       offset: 1,   window: 1 },
  { pattern: /\bthis week\b/,      offset: 0,   window: 7 },
  { pattern: /\bthis weekend\b/,   offset: null, weekend: true },
  { pattern: /\bnext week\b/,      offset: 7,   window: 7 },
  { pattern: /\bthis month\b/,     offset: 0,   window: 30 },
  { pattern: /\bnext month\b/,     offset: 30,  window: 30 },
];

function parseDateFilter(query) {
  const lower = query.toLowerCase();
  for (const dp of DATE_PATTERNS) {
    if (dp.pattern.test(lower)) {
      const now = new Date();
      if (dp.weekend) {
        const day = now.getDay();
        const daysToSat = (6 - day + 7) % 7 || 7;
        const sat = new Date(now); sat.setDate(now.getDate() + daysToSat);
        const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
        return { from: sat, to: new Date(sun.setHours(23, 59, 59)) };
      }
      const from = new Date(now); from.setDate(now.getDate() + (dp.offset || 0));
      const to   = new Date(from); to.setDate(from.getDate() + (dp.window || 1));
      return { from, to: new Date(to.setHours(23, 59, 59)) };
    }
  }
  return null;
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * @param {string} query
 * @param {Array}  events  - published events from DB
 * @param {Object} options
 * @param {number} options.limit
 * @param {number} options.minScore - minimum relevance threshold
 * @returns {Array} ranked results
 */
function smartSearch(query, events, { limit = 10, minScore = 0.05 } = {}) {
  if (!query || !events.length) return events.slice(0, limit);

  const dateFilter = parseDateFilter(query);

  // Filter by date if temporal query detected
  let candidates = events;
  if (dateFilter) {
    candidates = events.filter((e) => {
      const d = new Date(e.date);
      return d >= dateFilter.from && d <= dateFilter.to;
    });
    // If no results in date window, fall back to all events
    if (!candidates.length) candidates = events;
  }

  // Only search future events
  candidates = candidates.filter((e) => new Date(e.date) > new Date());

  if (!candidates.length) return [];

  const { tfidfDocs } = buildIndex(candidates);

  const queryTokens  = tokenize(query);
  const expandedTerms = expandQuery(queryTokens);

  // Score each doc
  const results = tfidfDocs.map(({ id, tfidf, event }) => {
    let score = 0;

    for (const term of expandedTerms) {
      // Exact match
      if (tfidf[term]) score += tfidf[term];

      // Partial match (prefix)
      for (const [docTerm, val] of Object.entries(tfidf)) {
        if (docTerm !== term && docTerm.startsWith(term) && term.length >= 3) {
          score += val * 0.5;
        }
      }
    }

    // Normalise by doc vector magnitude
    const mag = Math.sqrt(Object.values(tfidf).reduce((s, v) => s + v * v, 0));
    const normScore = mag > 0 ? score / mag : 0;

    // Recency boost for upcoming events
    const daysUntil = Math.max(0, (new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24));
    const recencyBoost = daysUntil <= 30 ? 0.1 : daysUntil <= 90 ? 0.05 : 0;

    return { event, score: normScore + recencyBoost, id };
  });

  return results
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ event, score }) => ({
      ...event.toObject ? event.toObject() : event,
      relevanceScore: Math.round(score * 100) / 100,
    }));
}

module.exports = { smartSearch, parseDateFilter };