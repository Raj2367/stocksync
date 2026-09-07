import express from "express";
import { startConsumer, stopConsumer } from "./events/consumer";
import healthRouter from "./routes/health";
import sagaRouter from "./routes/sagas";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;

app.use("/health", healthRouter);
app.use("/sagas", sagaRouter);

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
    await startConsumer();
    console.log("✅ Saga orchestrator consumer started");

    app.listen(PORT, () => {
      console.log(`🧠 Saga orchestrator running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start saga orchestrator:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await stopConsumer();
  process.exit(0);
});

startServer();
