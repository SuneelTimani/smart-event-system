const mongoose = require("mongoose");

const notificationJobSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ["email", "whatsapp", "push"],
      required: true,
      index: true
    },
    to: { type: String, required: true, trim: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    templateId: { type: String, default: "", trim: true, maxlength: 120 },
    templateVersion: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed", "dead_letter"],
      default: "pending",
      index: true
    },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 5, min: 1, max: 20 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lastError: { type: String, default: "" },
    providerMessageId: { type: String, default: "" },
    lockedAt: { type: Date, default: null, index: true },
    sentAt: { type: Date, default: null, index: true },
    deadLetterAt: { type: Date, default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

notificationJobSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

module.exports = mongoose.model("NotificationJob", notificationJobSchema);
