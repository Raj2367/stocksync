import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import Order from "../../models/Order";
import { connectKafka, disconnectKafka } from "../../events/producer";

// We test against the running docker service via HTTP
const ORDER_SERVICE_URL = "http://localhost:3001";

describe("Order Service Integration Tests", () => {
  beforeEach(async () => {
    // Clean up test orders
    await Order.deleteMany({ customerEmail: { $regex: /^test-/ } });
  });

  describe("POST /orders", () => {
    it("should create an order and publish order.created event", async () => {
      const response = await request(ORDER_SERVICE_URL)
        .post("/orders")
        .send({
          productId: "PROD-001",
          quantity: 2,
          customerEmail: "test-integration@example.com",
        })
        .expect(201);

      expect(response.body.message).toBe("Order created successfully");
      expect(response.body.order).toMatchObject({
        productId: "PROD-001",
        quantity: 2,
        status: "PENDING",
        sagaStatus: "AWAITING_INVENTORY",
      });
      expect(response.body.order.orderId).toBeDefined();

      // Verify in database
      const dbOrder = await Order.findOne({
        orderId: response.body.order.orderId,
      });
      expect(dbOrder).toBeTruthy();
      expect(dbOrder?.status).toBe("PENDING");
    });

    it("should reject invalid quantity", async () => {
      await request(ORDER_SERVICE_URL)
        .post("/orders")
        .send({
          productId: "PROD-001",
          quantity: 0,
          customerEmail: "test-integration@example.com",
        })
        .expect(400);
    });

    it("should reject missing productId", async () => {
      await request(ORDER_SERVICE_URL)
        .post("/orders")
        .send({
          quantity: 2,
          customerEmail: "test-integration@example.com",
        })
        .expect(400);
    });
  });

  describe("GET /orders/:orderId", () => {
    it("should retrieve an existing order", async () => {
      // First create an order
      const createRes = await request(ORDER_SERVICE_URL).post("/orders").send({
        productId: "PROD-002",
        quantity: 1,
        customerEmail: "test-integration@example.com",
      });

      const orderId = createRes.body.order.orderId;

      const getRes = await request(ORDER_SERVICE_URL)
        .get(`/orders/${orderId}`)
        .expect(200);

      expect(getRes.body.orderId).toBe(orderId);
      expect(getRes.body.productId).toBe("PROD-002");
    });

    it("should return 404 for non-existent order", async () => {
      await request(ORDER_SERVICE_URL)
        .get("/orders/non-existent-id")
        .expect(404);
    });
  });

  describe("GET /orders", () => {
    it("should list orders with limit", async () => {
      // Create a few orders
      for (let i = 0; i < 3; i++) {
        await request(ORDER_SERVICE_URL)
          .post("/orders")
          .send({
            productId: `PROD-00${i + 1}`,
            quantity: 1,
            customerEmail: `test-integration-${i}@example.com`,
          });
      }

      const response = await request(ORDER_SERVICE_URL)
        .get("/orders?limit=2")
        .expect(200);

      expect(response.body.count).toBeLessThanOrEqual(2);
      expect(Array.isArray(response.body.orders)).toBe(true);
    });
  });

  describe("Saga Event Handling", () => {
    it("should update order to CONFIRMED on saga.order-completed", async () => {
      // CRITICAL: Insert directly into MongoDB. Do NOT call POST /orders (that triggers real saga).
      const orderId = `test-saga-complete-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      await Order.create({
        orderId,
        productId: "PROD-TEST-001",
        quantity: 1,
        customerEmail: "test-saga@example.com",
        status: "PENDING",
        sagaStatus: "AWAITING_PAYMENT",
      });

      // Publish saga completed event manually
      const { Kafka } = require("kafkajs");
      const kafka = new Kafka({
        clientId: "test-producer",
        brokers: ["localhost:9092"],
      });
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({
        topic: "saga.order-completed",
        messages: [
          {
            key: orderId,
            value: JSON.stringify({
              orderId,
              paymentId: "PAY-TEST-123",
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      await producer.disconnect();

      // Wait for event processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify order updated
      const dbOrder = await Order.findOne({ orderId });
      expect(dbOrder).toBeTruthy();
      expect(dbOrder?.status).toBe("CONFIRMED");
      expect(dbOrder?.sagaStatus).toBe("COMPLETED");
      expect(dbOrder?.paymentId).toBe("PAY-TEST-123");
    }, 15000);

    it("should update order to CANCELLED on saga.order-cancelled", async () => {
      const orderId = `test-saga-cancel-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      await Order.create({
        orderId,
        productId: "PROD-TEST-002",
        quantity: 1,
        customerEmail: "test-saga@example.com",
        status: "PENDING",
        sagaStatus: "AWAITING_PAYMENT",
      });

      const { Kafka } = require("kafkajs");
      const kafka = new Kafka({
        clientId: "test-producer",
        brokers: ["localhost:9092"],
      });
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({
        topic: "saga.order-cancelled",
        messages: [
          {
            key: orderId,
            value: JSON.stringify({
              orderId,
              reason: "Payment failed: INSUFFICIENT_FUNDS",
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      await producer.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const dbOrder = await Order.findOne({ orderId });
      expect(dbOrder).toBeTruthy();
      expect(dbOrder?.status).toBe("CANCELLED");
      expect(dbOrder?.sagaStatus).toBe("CANCELLED");
      expect(dbOrder?.failureReason).toContain("INSUFFICIENT_FUNDS");
    }, 15000);
  });
});
