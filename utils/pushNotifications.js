let webPush = null;
try {
  webPush = require("web-push");
} catch {
  webPush = null;
}

let vapidConfigured = false;

function getPublicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || "").trim();
}

function getPrivateKey() {
  return String(process.env.VAPID_PRIVATE_KEY || "").trim();
}

function getSubject() {
  return String(process.env.VAPID_SUBJECT || "mailto:suneeltimani@gmail.com").trim();
}

function isPushConfigured() {
  return Boolean(webPush && getPublicKey() && getPrivateKey() && getSubject());
}

function configureWebPush() {
  if (!isPushConfigured()) return false;
  if (vapidConfigured) return true;
  webPush.setVapidDetails(getSubject(), getPublicKey(), getPrivateKey());
  vapidConfigured = true;
  return true;
}

function sanitizeSubscription(raw) {
  const endpoint = String(raw?.endpoint || "").trim();
  const p256dh = String(raw?.keys?.p256dh || "").trim();
  const auth = String(raw?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) return null;
  if (!/^https:\/\//i.test(endpoint)) return null;

  return {
    endpoint,
    keys: { p256dh, auth }
  };
}

async function sendWebPush(subscription, payload, options = {}) {
  if (!configureWebPush()) {
    throw new Error("Web push is not configured");
  }

  const cleanSub = sanitizeSubscription(subscription);
  if (!cleanSub) {
    throw new Error("Invalid push subscription");
  }

  return webPush.sendNotification(cleanSub, JSON.stringify(payload || {}), {
    TTL: Number(options.ttl || 60 * 60),
    urgency: options.urgency || "normal",
    topic: options.topic || undefined
  });
}

module.exports = {
  getPublicKey,
  isPushConfigured,
  sanitizeSubscription,
  sendWebPush
};
