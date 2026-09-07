import { Router } from "express";
import { query } from "../db/connection";
import { getRedisClient } from "../db/redis";

const router = Router();
const CACHE_TTL = 60; // seconds

// GET /inventory — List all products
router.get("/", async (req, res) => {
  try {
    const result = await query(
      "SELECT id, sku, name, stock_quantity, reserved_quantity, (stock_quantity - reserved_quantity) as available_quantity FROM products ORDER BY id",
    );
    res.json({ products: result.rows });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

// GET /inventory/:sku — Get single product (with Redis cache)
router.get("/:sku", async (req, res) => {
  try {
    const { sku } = req.params;
    const redis = getRedisClient();
    const cacheKey = `inventory:${sku}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`💨 Cache hit for ${sku}`);
      return res.json({ source: "cache", product: JSON.parse(cached) });
    }

    // Cache miss — query DB
    const result = await query(
      "SELECT id, sku, name, stock_quantity, reserved_quantity, (stock_quantity - reserved_quantity) as available_quantity FROM products WHERE sku = $1",
      [sku],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = result.rows[0];

    // Write to cache
    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(product));
    console.log(`💾 Cache set for ${sku}`);

    res.json({ source: "database", product });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

export default router;
