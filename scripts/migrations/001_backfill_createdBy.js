const Event = require("../../models/Event");
const User = require("../../models/User");

const id = "001_backfill_createdBy";
const description = "Backfill createdBy for legacy events with missing owner";

async function run({ log, options }) {
  const adminEmail = String(options.adminEmail || process.env.MIGRATION_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

  if (!adminEmail) {
    throw new Error("adminEmail is required. Pass --adminEmail=<email> or set MIGRATION_ADMIN_EMAIL.");
  }

  const admin = await User.findOne({ email: adminEmail }).select("_id role email").lean();
  if (!admin) {
    throw new Error(`Admin user not found: ${adminEmail}`);
  }
  if (admin.role !== "admin") {
    throw new Error(`User is not admin: ${adminEmail}`);
  }

  const query = { $or: [{ createdBy: null }, { createdBy: { $exists: false } }] };
  const beforeCount = await Event.countDocuments(query);
  log(`Found ${beforeCount} events without createdBy`);

  const result = await Event.updateMany(query, { $set: { createdBy: admin._id } });
  log(`Backfill complete. matched=${result.matchedCount} modified=${result.modifiedCount}`);

  return {
    adminEmail,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  };
}

module.exports = {
  id,
  description,
  run
};
