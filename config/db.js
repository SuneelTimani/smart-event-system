const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  try {
    if (!mongoUri) {
      throw new Error("MONGO_URI is missing in environment");
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10
    });

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB runtime error:", err.message);
    });

    console.log("MongoDB Connected");
  } catch (err) {
    console.error("DB Error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
