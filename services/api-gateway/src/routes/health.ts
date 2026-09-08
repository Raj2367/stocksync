import { Router } from "express";
import axios from "axios";

const router = Router();

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3001";
const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://inventory-service:3002";
const SAGA_SERVICE_URL =
  process.env.SAGA_SERVICE_URL || "http://saga-orchestrator:3004";

router.get("/", async (req, res) => {
  const checks: Record<string, string> = {};

  try {
    await axios.get(`${ORDER_SERVICE_URL}/health`, { timeout: 3000 });
    checks["order-service"] = "ok";
  } catch (e) {
    checks["order-service"] = "down";
  }

  try {
    await axios.get(`${INVENTORY_SERVICE_URL}/health`, { timeout: 3000 });
    checks["inventory-service"] = "ok";
  } catch (e) {
    checks["inventory-service"] = "down";
  }

  try {
    await axios.get(`${SAGA_SERVICE_URL}/health`, { timeout: 3000 });
    checks["saga-orchestrator"] = "ok";
  } catch (e) {
    checks["saga-orchestrator"] = "down";
  }

  const allHealthy = Object.values(checks).every((s) => s === "ok");

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ok" : "degraded",
    service: "api-gateway",
    version: "1.0.0",
    dependencies: checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
