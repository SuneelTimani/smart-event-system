const mongoose = require("mongoose");
const { EVENT_CATEGORIES } = require("../utils/validation");

const ticketTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    sold: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  date: { type: Date, required: true },
  location: { type: String, required: true, trim: true, maxlength: 180 },
  mapLink: { type: String, default: "", trim: true, maxlength: 600 },
  coverImage: { type: String, default: "", maxlength: 2500000 },
  organizer: { type: String, required: true, trim: true, maxlength: 120 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  category: { type: String, enum: EVENT_CATEGORIES, default: "Other" },
  capacity: { type: Number, required: true, min: 1, default: 100 },
  seatsBooked: { type: Number, default: 0, min: 0 },
  ticketTypes: {
    type: [ticketTypeSchema],
    default: [
      { name: "Standard", price: 25, quantity: 100, sold: 0 },
      { name: "VIP", price: 60, quantity: 50, sold: 0 }
    ]
  },
  waitlistEnabled: { type: Boolean, default: true },
  cancelWindowHoursBefore: { type: Number, min: 0, max: 720, default: 24 },
  transferWindowHoursBefore: { type: Number, min: 0, max: 720, default: 2 },
  status: { type: String, enum: ["draft", "published", "cancelled"], default: "published" },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
});

eventSchema.index({ date: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ isDeleted: 1, status: 1, date: 1 });

module.exports = mongoose.model("Event", eventSchema);
