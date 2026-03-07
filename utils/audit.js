const AuditLog = require("../models/AuditLog");

async function logAdminAction(req, { action, targetType, targetId, details = {} }) {
  try {
    if (!req?.user?.id || req?.user?.role !== "admin") return;

    await AuditLog.create({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action,
      targetType,
      targetId: String(targetId || ""),
      route: req.originalUrl || "",
      method: req.method || "",
      ip: (req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "").toString(),
      details
    });
  } catch (err) {
    console.error("[AUDIT] Failed to write audit log:", err.message);
  }
}

module.exports = { logAdminAction };
