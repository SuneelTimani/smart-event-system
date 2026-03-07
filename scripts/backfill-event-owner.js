require("dotenv").config();
const mongoose = require("mongoose");
const Event = require("../models/Event");
const User = require("../models/User");

async function run() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: node scripts/backfill-event-owner.js <admin-email>");
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing in environment.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const admin = await User.findOne({ email });
  if (!admin) {
    console.error("Admin user not found for email:", email);
    process.exit(1);
  }
  if (admin.role !== "admin") {
    console.error("Provided user is not admin:", email);
    process.exit(1);
  }

  const result = await Event.updateMany(
    { $or: [{ createdBy: null }, { createdBy: { $exists: false } }] },
    { $set: { createdBy: admin._id } }
  );

  console.log(`Backfill complete. matched=${result.matchedCount} modified=${result.modifiedCount}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
