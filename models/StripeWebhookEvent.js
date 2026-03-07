const mongoose = require("mongoose");

const stripeWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    processed: { type: Boolean, default: false },
    error: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("StripeWebhookEvent", stripeWebhookEventSchema);
