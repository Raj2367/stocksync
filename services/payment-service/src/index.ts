import express from "express";
import { startConsumer, stopConsumer } from "./events/consumer";
import healthRouter from "./routes/health";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;

// Routes
app.use("/health", healthRouter);

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
    // Start Kafka consumer
    await startConsumer();
    console.log("✅ Kafka consumer started");

    app.listen(PORT, () => {
      console.log(`🚀 Payment service running on port ${PORT}`);
      console.log(`💳 Payment approval rate: ~70% (randomized for testing)`);
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
  process.exit(0);
});

startServer();
