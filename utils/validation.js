const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

const EVENT_CATEGORIES = [
  "Conference",
  "Workshop",
  "Concert",
  "Meetup",
  "Festival",
  "Webinar",
  "Other"
];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

function isStrongPassword(password) {
  return PASSWORD_REGEX.test(String(password || ""));
}

function sanitizeText(value, { min = 1, max = 255 } = {}) {
  const text = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < min || text.length > max) {
    return null;
  }
  return text;
}

function sanitizeCategory(category) {
  const value = sanitizeText(category, { min: 3, max: 40 });
  if (!value) return null;
  return EVENT_CATEGORIES.includes(value) ? value : null;
}

module.exports = {
  EVENT_CATEGORIES,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
  sanitizeCategory,
  sanitizeText
};
