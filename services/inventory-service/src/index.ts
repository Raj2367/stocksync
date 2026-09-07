import express from "express";
import { connectDB, disconnectDB } from "./db/connection";
import { connectRedis, disconnectRedis } from "./db/redis";
import { startConsumer, stopConsumer } from "./events/consumer";
import healthRouter from "./routes/health";
import inventoryRouter from "./routes/inventory";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

// Routes
app.use("/health", healthRouter);
app.use("/inventory", inventoryRouter);

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
    // Connect to PostgreSQL
    await connectDB();
    console.log("✅ Connected to PostgreSQL");

    // Connect to Redis
    await connectRedis();
    console.log("✅ Connected to Redis");

    // Start Kafka consumer
    await startConsumer();
    console.log("✅ Kafka consumer started");

    app.listen(PORT, () => {
      console.log(`🚀 Inventory service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await stopConsumer();
  await disconnectRedis();
  await disconnectDB();
  process.exit(0);
});

startServer();
