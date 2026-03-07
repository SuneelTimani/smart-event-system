const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorRole: { type: String, default: "unknown" },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    targetType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    targetId: { type: String, required: true, trim: true, maxlength: 120, index: true },
    route: { type: String, default: "" },
    method: { type: String, default: "" },
    ip: { type: String, default: "" },
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1, action: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
