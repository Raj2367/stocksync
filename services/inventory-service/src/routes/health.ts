import { Router } from "express";
import { pool } from "../db/connection";
import { getRedisClient } from "../db/redis";

const router = Router();

router.get("/", async (req, res) => {
  let pgStatus = "unknown";
  let redisStatus = "unknown";

  try {
    await pool.query("SELECT 1");
    pgStatus = "connected";
  } catch (e) {
    pgStatus = "disconnected";
  }

  try {
    const redis = getRedisClient();
    await redis.ping();
    redisStatus = "connected";
  } catch (e) {
    redisStatus = "disconnected";
  }

  res.json({
    status: "ok",
    service: "inventory-service",
    version: "1.0.0",
    dependencies: {
      postgresql: pgStatus,
      redis: redisStatus,
      kafka: "connected",
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
