import express from "express";
import cors from "cors";
import path from "node:path";
import { connectRedis, disconnectRedis } from "./db/redis";
import { connectMongo, disconnectMongo } from "./db/mongo";
import { seedUsers } from "./db/seed";
import {
  syncKnowledgeCorpus,
  CorpusRootMissingError,
  CorpusEmptyError,
  CorpusStructureError,
} from "./rag/knowledgeSync";
import { rateLimiter } from "./middleware/rateLimiter";
import { authRouter } from "./routes/auth";
import healthRouter from "./routes/health";
import { orderProxy } from "./routes/orders";
import { inventoryProxy } from "./routes/inventory";
import { sagaProxy } from "./routes/sagas";
import { copilotRouter } from "./routes/copilot";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// CORPUS_ROOT resolves relative to __dirname. From src/index.ts at dev time,
// __dirname = services/api-gateway/src; three ".." segments land at the repo
// root. In production (dist/index.js), __dirname = services/api-gateway/dist;
// the same three ".." segments also land at the repo root. This keeps the
// path identical whether running via ts-node or compiled JS.
const CORPUS_ROOT = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "data",
  "knowledge",
);

// Apply rate limiting to all routes
app.use(rateLimiter);

// Routes
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/orders", orderProxy);
app.use("/inventory", inventoryProxy);
app.use("/sagas", sagaProxy);
app.use("/copilot", copilotRouter);

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

export async function startServer() {
  try {
    await connectMongo();
    console.log("✅ MongoDB connected");

    await seedUsers();

    try {
      await syncKnowledgeCorpus(CORPUS_ROOT);
      console.log("✅ Knowledge corpus synchronized");
    } catch (syncError) {
      if (
        syncError instanceof CorpusRootMissingError ||
        syncError instanceof CorpusEmptyError ||
        syncError instanceof CorpusStructureError
      ) {
        throw syncError;
      }
      console.warn(
        "Knowledge corpus sync failed; continuing startup:",
        syncError,
      );
    }

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
  await disconnectMongo();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}
