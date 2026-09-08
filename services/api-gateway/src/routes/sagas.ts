import { Router } from "express";

const router = Router();
const SAGA_SERVICE_URL =
  process.env.SAGA_SERVICE_URL || "http://saga-orchestrator:3004";
import axios from "axios";

router.get("/", async (req, res) => {
  try {
    const response = await axios.get(`${SAGA_SERVICE_URL}/sagas`, {
      timeout: 5000,
    });
    res.json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to fetch sagas" });
  }
});

router.get("/:orderId", async (req, res) => {
  try {
    const response = await axios.get(
      `${SAGA_SERVICE_URL}/sagas/${req.params.orderId}`,
      {
        timeout: 5000,
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
