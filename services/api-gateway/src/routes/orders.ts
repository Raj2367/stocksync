import { Router } from "express";
import axios from "axios";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://order-service:3001";

router.post("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const response = await axios.post(`${ORDER_SERVICE_URL}/orders`, req.body, {
      timeout: 10000,
      headers: { "Content-Type": "application/json" },
    });
    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error("Order creation error:", error.message);
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to create order" });
  }
});

router.get("/:orderId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/orders/${req.params.orderId}`,
      {
        timeout: 5000,
      },
    );
    res.json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to fetch order" });
  }
});

router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const response = await axios.get(`${ORDER_SERVICE_URL}/orders`, {
      timeout: 5000,
      params: req.query,
    });
    res.json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to list orders" });
  }
});

export { router as orderProxy };
