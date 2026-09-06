import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

router.get("/", (req, res) => {
  const mongoStatus =
    mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({
    status: "ok",
    service: "order-service",
    version: "1.0.0",
    dependencies: {
      mongodb: mongoStatus,
      kafka: "connected", // We'll make this dynamic later
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
