import { Router } from "express";

const router = Router();
const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://inventory-service:3002";
import axios from "axios";

// Public endpoint — no auth required
router.get("/", async (req, res) => {
  try {
    const response = await axios.get(`${INVENTORY_SERVICE_URL}/inventory`, {
      timeout: 5000,
    });
    res.json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to fetch inventory" });
  }
});

router.get("/:sku", async (req, res) => {
  try {
    const response = await axios.get(
      `${INVENTORY_SERVICE_URL}/inventory/${req.params.sku}`,
      {
        timeout: 5000,
      },
    );
    res.json(response.data);
  } catch (error: any) {
    res
      .status(error.response?.status || 500)
      .json(error.response?.data || { error: "Failed to fetch product" });
  }
});

export { router as inventoryProxy };
