import { Router } from "express";
import { query, getClient } from "../db/connection";
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

// POST /inventory/release — Release reserved stock (compensating transaction)
router.post("/release", async (req, res) => {
  try {
    const { orderId, productId, quantity } = req.body;

    if (!orderId || !productId || !quantity) {
      return res
        .status(400)
        .json({ error: "orderId, productId, and quantity are required" });
    }

    const client = await getClient();

    try {
      await client.query("BEGIN");

      // Find the reservation
      const reservationResult = await client.query(
        "SELECT id, product_id, quantity FROM inventory_reservations WHERE order_id = $1 AND status = $2",
        [orderId, "reserved"],
      );

      if (reservationResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ error: "No active reservation found for this order" });
      }

      const reservation = reservationResult.rows[0];

      // Release the stock
      await client.query(
        "UPDATE products SET reserved_quantity = reserved_quantity - $1 WHERE id = $2",
        [reservation.quantity, reservation.product_id],
      );

      // Mark reservation as released
      await client.query(
        "UPDATE inventory_reservations SET status = $1, updated_at = NOW() WHERE id = $2",
        ["released", reservation.id],
      );

      await client.query("COMMIT");

      console.log(
        `♻️ Released ${reservation.quantity} units for order ${orderId}`,
      );

      // Invalidate cache
      try {
        const { getRedisClient } = await import("../db/redis");
        const redis = getRedisClient();
        await redis.del(`inventory:${productId}`);
      } catch (e) {
        console.warn("Failed to invalidate cache:", e);
      }

      res.json({
        message: "Inventory released successfully",
        orderId,
        productId,
        quantityReleased: reservation.quantity,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error releasing inventory:", error);
    res.status(500).json({ error: "Failed to release inventory" });
  }
});

export default router;
