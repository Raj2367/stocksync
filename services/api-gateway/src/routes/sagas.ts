import { Router } from "express";
import axios from "axios";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const SAGA_SERVICE_URL =
  process.env.SAGA_SERVICE_URL || "http://saga-orchestrator:3004";

// GET /sagas — List sagas for the tenant identified by the verified JWT.
// The JWT-derived tenantId is always forwarded; a client-supplied
// X-Tenant-Id header is ignored so it cannot override the JWT value.
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const response = await axios.get(`${SAGA_SERVICE_URL}/sagas`, {
      timeout: 5000,
      headers: { "X-Tenant-Id": req.user!.tenantId },
    });
    res.json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to fetch sagas" });
  }
});

// GET /sagas/:orderId — Get specific saga scoped to the verified JWT tenant.
// The JWT-derived tenantId is always forwarded; a client-supplied
// X-Tenant-Id header is ignored so it cannot override the JWT value.
router.get("/:orderId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const response = await axios.get(
      `${SAGA_SERVICE_URL}/sagas/${req.params.orderId}`,
      {
        timeout: 5000,
        headers: { "X-Tenant-Id": req.user!.tenantId },
      },
    );
    res.json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to fetch saga" });
  }
});

export { router as sagaProxy };
