import request from "supertest";
import { query, pool } from "../../db/connection";
import { getRedisClient } from "../../db/redis";

const INVENTORY_SERVICE_URL = "http://localhost:3002";

describe("Inventory Service Integration Tests", () => {
  beforeEach(async () => {
    // Reset test product stock
    await query(
      "UPDATE products SET stock_quantity = 100, reserved_quantity = 0 WHERE sku = 'PROD-TEST-001'",
    );
    await query(
      "DELETE FROM inventory_reservations WHERE order_id LIKE 'test-%'",
    );

    // Clear redis cache
    try {
      const redis = getRedisClient();
      await redis.del("inventory:PROD-001");
      await redis.del("inventory:PROD-TEST-001");
    } catch (e) {
      // ignore
    }
  });
  afterAll(async () => {
    // 1. Close PostgreSQL pool
    if (pool) {
      await pool.end();
    }

    // 2. Close Redis client
    try {
      const redis = getRedisClient();
      if (redis && redis.isOpen) {
        // Use .isOpen or similar based on your redis library
        await redis.quit();
      }
    } catch (e) {
      // ignore
    }
  });

  describe("GET /inventory", () => {
    it("should list all products", async () => {
      const response = await request(INVENTORY_SERVICE_URL)
        .get("/inventory")
        .expect(200);

      expect(Array.isArray(response.body.products)).toBe(true);
      expect(response.body.products.length).toBeGreaterThan(0);
    });
  });

  describe("GET /inventory/:sku", () => {
    it("should return product from database on first request", async () => {
      const response = await request(INVENTORY_SERVICE_URL)
        .get("/inventory/PROD-001")
        .expect(200);

      expect(response.body.source).toBe("database");
      expect(response.body.product.sku).toBe("PROD-001");
      expect(response.body.product.available_quantity).toBeDefined();
    });

    it("should return product from cache on second request", async () => {
      // First request
      await request(INVENTORY_SERVICE_URL).get("/inventory/PROD-001");

      // Second request should hit cache
      const response = await request(INVENTORY_SERVICE_URL)
        .get("/inventory/PROD-001")
        .expect(200);

      expect(response.body.source).toBe("cache");
    });

    it("should return 404 for unknown product", async () => {
      await request(INVENTORY_SERVICE_URL)
        .get("/inventory/UNKNOWN-SKU")
        .expect(404);
    });
  });

  describe("POST /inventory/release", () => {
    it("should release reserved inventory", async () => {
      // First reserve some stock manually
      await query(
        "UPDATE products SET reserved_quantity = reserved_quantity + 5 WHERE sku = 'PROD-001'",
      );
      await query(
        "INSERT INTO inventory_reservations (order_id, product_id, quantity, status) VALUES ('test-release-001', (SELECT id FROM products WHERE sku = 'PROD-001'), 5, 'reserved')",
      );

      const beforeRelease = await query(
        "SELECT reserved_quantity FROM products WHERE sku = 'PROD-001'",
      );

      const response = await request(INVENTORY_SERVICE_URL)
        .post("/inventory/release")
        .send({
          orderId: "test-release-001",
          productId: "PROD-001",
          quantity: 5,
        })
        .expect(200);

      expect(response.body.message).toBe("Inventory released successfully");
      expect(response.body.quantityReleased).toBe(5);

      const afterRelease = await query(
        "SELECT reserved_quantity FROM products WHERE sku = 'PROD-001'",
      );

      expect(parseInt(afterRelease.rows[0].reserved_quantity)).toBe(
        parseInt(beforeRelease.rows[0].reserved_quantity) - 5,
      );
    });

    it("should return 404 for non-existent reservation", async () => {
      await request(INVENTORY_SERVICE_URL)
        .post("/inventory/release")
        .send({
          orderId: "non-existent",
          productId: "PROD-001",
          quantity: 1,
        })
        .expect(404);
    });
  });

  describe("Kafka Consumer: order.created", () => {
    // Generate a unique SKU for this test suite
    const TEST_SKU = `TEST-KAFKA-${Date.now()}`;

    beforeAll(async () => {
      // 1. Explicitly insert the test product so we know it exists
      await query(
        "INSERT INTO products (sku, name, stock_quantity, reserved_quantity) VALUES ($1, $2, 100, 0)",
        [TEST_SKU, "Test Product for Kafka"],
      );
    });

    afterAll(async () => {
      // 2. Cleanup: Delete reservations first to avoid foreign key constraints, then delete the product
      await query(
        "DELETE FROM inventory_reservations WHERE product_id = (SELECT id FROM products WHERE sku = $1)",
        [TEST_SKU],
      );
      await query("DELETE FROM products WHERE sku = $1", [TEST_SKU]);
    });

    it("should reserve stock when order.created event is received", async () => {
      const orderId = `test-kafka-${Date.now()}`;
      const { Kafka } = require("kafkajs");
      const kafka = new Kafka({
        clientId: "test-producer",
        brokers: ["localhost:9092"],
      });
      const producer = kafka.producer();
      await producer.connect();

      // Get initial stock using the isolated TEST_SKU
      const before = await query(
        "SELECT reserved_quantity FROM products WHERE sku = $1",
        [TEST_SKU],
      );
      const initialReserved = parseInt(before.rows[0].reserved_quantity);

      // Publish order.created using the isolated TEST_SKU
      await producer.send({
        topic: "order.created",
        messages: [
          {
            key: orderId,
            value: JSON.stringify({
              orderId,
              productId: TEST_SKU, // <-- Updated to use TEST_SKU
              quantity: 3,
              customerEmail: "test@example.com",
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      await producer.disconnect();

      let finalReserved = initialReserved;
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const after = await query(
          "SELECT reserved_quantity FROM products WHERE sku = $1",
          [TEST_SKU],
        );

        if (after.rows.length > 0) {
          finalReserved = parseInt(after.rows[0].reserved_quantity);
          // If the background worker has finished updating the DB, exit the loop early!
          if (finalReserved === initialReserved + 3) {
            break;
          }
        }
      }

      expect(finalReserved).toBe(initialReserved + 3);

      // Verify reservation record exists
      const reservation = await query(
        "SELECT * FROM inventory_reservations WHERE order_id = $1",
        [orderId],
      );
      expect(reservation.rows.length).toBe(1);
      expect(reservation.rows[0].status).toBe("reserved");
    }, 15000);

    it("should publish inventory.reservation-failed for insufficient stock", async () => {
      const orderId = `test-kafka-fail-${Date.now()}`;
      const { Kafka } = require("kafkajs");
      const kafka = new Kafka({
        clientId: "test-producer",
        brokers: ["localhost:9092"],
      });

      // STEP 1: Start consumer FIRST (before publishing)
      const consumer = kafka.consumer({
        groupId: `test-consumer-${Date.now()}`,
      });
      await consumer.connect();
      await consumer.subscribe({
        topic: "inventory.reservation-failed",
        fromBeginning: true,
      });

      let receivedEvent: any = null;
      await consumer.run({
        eachMessage: async ({ message }: any) => {
          const event = JSON.parse(message.value.toString());
          if (event.orderId === orderId) {
            receivedEvent = event;
          }
        },
      });

      // Give consumer time to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // STEP 2: Now publish the event
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({
        topic: "order.created",
        messages: [
          {
            key: orderId,
            value: JSON.stringify({
              orderId,
              productId: TEST_SKU, // <-- Updated this one too for consistency
              quantity: 99999, // Absurd quantity → should fail
              customerEmail: "test@example.com",
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      await producer.disconnect();

      // STEP 3: Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await consumer.disconnect();

      expect(receivedEvent).toBeTruthy();
      expect(receivedEvent.reason).toBe("INSUFFICIENT_STOCK");
    }, 25000);
  });
});
