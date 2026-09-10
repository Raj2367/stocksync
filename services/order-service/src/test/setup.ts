import mongoose from "mongoose";

beforeAll(async () => {
  // Ensure we're connected (server should be running via docker)
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/orders",
    );
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});
