import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongodb:27017/auth";

export async function connectMongo(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Gateway MongoDB connected");
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
  console.log("🔌 Gateway MongoDB disconnected");
}
