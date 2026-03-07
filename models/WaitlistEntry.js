const mongoose = require("mongoose");

const waitlistEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    attendeeName: { type: String, trim: true, maxlength: 120, default: "" },
    attendeeEmail: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    attendeeWhatsApp: { type: String, trim: true, maxlength: 20, default: "" },
    ticketType: { type: String, trim: true, maxlength: 40, default: "Standard" },
    quantity: { type: Number, min: 1, max: 10, default: 1 },
    status: {
      type: String,
      enum: ["waiting", "promoted", "removed"],
      default: "waiting",
      index: true
    },
    promotedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 300, default: "" }
  },
  { timestamps: true }
);

waitlistEntrySchema.index({ eventId: 1, status: 1, createdAt: 1 });
waitlistEntrySchema.index({ userId: 1, status: 1, createdAt: -1 });
waitlistEntrySchema.index(
  { userId: 1, eventId: 1, ticketType: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "waiting" } }
);

module.exports = mongoose.model("WaitlistEntry", waitlistEntrySchema);
