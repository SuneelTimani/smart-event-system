require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const migrations = [
  require("./migrations/001_backfill_createdBy")
];

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const [k, v] = raw.slice(2).split("=");
    args[k] = typeof v === "undefined" ? true : v;
  }
  return args;
}

async function ensureMigrationCollection() {
  const coll = mongoose.connection.collection("migrations");
  await coll.createIndex({ id: 1 }, { unique: true });
  return coll;
}

function createLogger(runId) {
  const logDir = path.resolve(__dirname, "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `migration-${runId}.log`);

  function log(message, extra = {}) {
    const lineObj = {
      ts: new Date().toISOString(),
      runId,
      message,
      ...extra
    };
    const line = JSON.stringify(lineObj);
    console.log(line);
    fs.appendFileSync(logPath, `${line}\n`);
  }

  return { log, logPath };
}

async function run() {
  const options = parseArgs(process.argv);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const { log, logPath } = createLogger(runId);

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in environment");
  }

  log("Starting one-time migration runner", { options });
  await mongoose.connect(process.env.MONGO_URI);
  log("Connected to MongoDB");

  const coll = await ensureMigrationCollection();
  const force = Boolean(options.force);
  let executed = 0;
  let skipped = 0;

  for (const migration of migrations) {
    const existing = await coll.findOne({ id: migration.id });
    if (existing && !force) {
      skipped += 1;
      log("Skipping already executed migration", { migrationId: migration.id });
      continue;
    }

    log("Running migration", { migrationId: migration.id, description: migration.description });
    const startedAt = new Date();
    const details = await migration.run({ log: (m) => log(m, { migrationId: migration.id }), options });
    const finishedAt = new Date();

    await coll.updateOne(
      { id: migration.id },
      {
        $set: {
          id: migration.id,
          description: migration.description,
          startedAt,
          finishedAt,
          details,
          runId
        }
      },
      { upsert: true }
    );
    executed += 1;
    log("Migration completed", { migrationId: migration.id, durationMs: finishedAt - startedAt });
  }

  log("Migration runner finished", { executed, skipped, logPath });
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: "error",
    message: err.message
  }));
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
