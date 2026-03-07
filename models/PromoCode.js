const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    discountType: { type: String, enum: ["percent", "fixed"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    maxUses: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date, default: null, index: true }
  },
  { timestamps: true }
);

promoCodeSchema.index({ eventId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("PromoCode", promoCodeSchema);
