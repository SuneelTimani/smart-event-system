const User = require("../models/User");
const { authError } = require("../utils/authResponse");
const { getPublicKey, isPushConfigured, sanitizeSubscription } = require("../utils/pushNotifications");

exports.getPushPublicKey = async (req, res) => {
  const publicKey = getPublicKey();
  if (!isPushConfigured() || !publicKey) {
    return res.status(404).json({ error: "Web push is not configured", code: "PUSH_NOT_CONFIGURED" });
  }
  res.json({ publicKey });
};

exports.subscribePush = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) return authError(res, 404, "User not found", "USER_NOT_FOUND");

    const subscription = sanitizeSubscription(req.body?.subscription);
    if (!subscription) {
      return res.status(400).json({ error: "Invalid push subscription", code: "INVALID_PUSH_SUBSCRIPTION" });
    }

    const userAgent = String(req.body?.userAgent || req.headers["user-agent"] || "").trim().slice(0, 300);
    if (!Array.isArray(user.pushSubscriptions)) user.pushSubscriptions = [];

    const existing = user.pushSubscriptions.find((row) => String(row.endpoint || "") === subscription.endpoint);
    if (existing) {
      existing.keys = subscription.keys;
      existing.userAgent = userAgent;
      existing.updatedAt = new Date();
    } else {
      user.pushSubscriptions.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    await user.save();
    res.json({ message: "Push subscription saved.", count: user.pushSubscriptions.length });
  } catch {
    res.status(500).json({ error: "Failed to save push subscription", code: "PUSH_SUBSCRIBE_FAILED" });
  }
};

exports.unsubscribePush = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) return authError(res, 404, "User not found", "USER_NOT_FOUND");

    const endpoint = String(req.body?.endpoint || "").trim();
    if (!endpoint) {
      return res.status(400).json({ error: "Push endpoint is required", code: "PUSH_ENDPOINT_REQUIRED" });
    }

    user.pushSubscriptions = (Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : []).filter(
      (row) => String(row.endpoint || "") !== endpoint
    );

    await user.save();
    res.json({ message: "Push subscription removed.", count: user.pushSubscriptions.length });
  } catch {
    res.status(500).json({ error: "Failed to remove push subscription", code: "PUSH_UNSUBSCRIBE_FAILED" });
  }
};

exports.whatsAppStatusCallback = async (req, res) => {
  try {
    const body = req.body || {};
    const sid = body.MessageSid || body.SmsSid || "unknown";
    const status = body.MessageStatus || body.SmsStatus || "unknown";
    const to = body.To || "unknown";
    const from = body.From || "unknown";
    const errorCode = body.ErrorCode || "";
    const errorMessage = body.ErrorMessage || "";

    console.log(
      `[Twilio:status] sid=${sid} status=${status} to=${to} from=${from}` +
      (errorCode ? ` errorCode=${errorCode} errorMessage="${errorMessage}"` : "")
    );

    res.status(200).send("ok");
  } catch (err) {
    res.status(500).send("error");
  }
};
