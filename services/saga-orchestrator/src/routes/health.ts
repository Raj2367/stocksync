import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "saga-orchestrator",
    version: "1.0.0",
    dependencies: {
      kafka: "connected",
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
