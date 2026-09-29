import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/sagas";

export async function connectMongo(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
  console.log("🔌 Disconnected from MongoDB");
}
