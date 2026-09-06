import express from "express";
import mongoose from "mongoose";
import { connectKafka, disconnectKafka } from "./events/producer";
import healthRouter from "./routes/health";
import orderRouter from "./routes/orders";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/orders";

// Routes
app.use("/health", healthRouter);
app.use("/orders", orderRouter);

// Global error handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Connect to Kafka
    await connectKafka();
    console.log("✅ Connected to Kafka");

    app.listen(PORT, () => {
      console.log(`🚀 Order service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await mongoose.disconnect();
  await disconnectKafka();
  process.exit(0);
});

startServer();
