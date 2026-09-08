import express from "express";
import cors from "cors";
import { connectRedis, disconnectRedis } from "./db/redis";
import { rateLimiter } from "./middleware/rateLimiter";
import { authRouter } from "./routes/auth";
import healthRouter from "./routes/health";
import { orderProxy } from "./routes/orders";
import { inventoryProxy } from "./routes/inventory";
import { sagaProxy } from "./routes/sagas";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Apply rate limiting to all routes
app.use(rateLimiter);

// Routes
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/orders", orderProxy);
app.use("/inventory", inventoryProxy);
app.use("/sagas", sagaProxy);

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
    await connectRedis();
    console.log("✅ Redis connected");

    app.listen(PORT, () => {
      console.log(`🛡️ API Gateway running on port ${PORT}`);
      console.log(`   - POST /auth/login   → Get JWT token`);
      console.log(`   - POST /auth/register → Register user`);
      console.log(`   - POST /orders       → Create order (auth required)`);
      console.log(`   - GET  /orders/:id   → Get order (auth required)`);
      console.log(`   - GET  /inventory    → List inventory`);
      console.log(`   - GET  /inventory/:sku → Get product`);
      console.log(`   - GET  /sagas        → List sagas`);
    });
  } catch (error) {
    console.error("❌ Failed to start gateway:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await disconnectRedis();
  process.exit(0);
});

startServer();
