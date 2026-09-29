jest.mock("../../events/producer");

import express, { Express } from "express";
import request from "supertest";
import Order from "../../models/Order";
import router from "../../routes/orders";
import { publishOrderCreated } from "../../events/producer";

const mockedPublishOrderCreated = publishOrderCreated as jest.MockedFunction<typeof publishOrderCreated>;

const app: Express = express();
app.use(express.json());
app.use("/orders", router);

describe("Order Service Tenant Isolation", () => {
  beforeEach(() => {
    mockedPublishOrderCreated.mockClear();
    mockedPublishOrderCreated.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await Order.deleteMany({});
  });

  describe("POST /orders", () => {
    it("should store the tenant ID from X-Tenant-Id header", async () => {
      const res = await request(app)
        .post("/orders")
        .set("X-Tenant-Id", "tenant-acme")
        .send({ productId: "PROD-001", quantity: 2 });

      expect(res.status).toBe(201);
      expect(res.body.order.orderId).toBeDefined();

      const dbOrder = await Order.findOne({ orderId: res.body.order.orderId });
      expect(dbOrder).toBeTruthy();
      expect(dbOrder?.tenantId).toBe("tenant-acme");
    });

    it("should not accept tenantId from request body (body cannot override header)", async () => {
      const res = await request(app)
        .post("/orders")
        .set("X-Tenant-Id", "tenant-acme")
        .send({ productId: "PROD-001", quantity: 2, tenantId: "tenant-beta" });

      expect(res.status).toBe(201);

      const dbOrder = await Order.findOne({ orderId: res.body.order.orderId });
      expect(dbOrder?.tenantId).toBe("tenant-acme");
      expect(dbOrder?.tenantId).not.toBe("tenant-beta");
    });

    it("should return 400 when X-Tenant-Id header is missing", async () => {
      const res = await request(app)
        .post("/orders")
        .send({ productId: "PROD-001", quantity: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("X-Tenant-Id");
    });
  });

  describe("GET /orders/:orderId", () => {
    let orderId: string;

    beforeEach(async () => {
      const order = await Order.create({
        orderId: "test-ord-001",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 1,
        customerEmail: "test@example.com",
      });
      orderId = order.orderId;
    });

    it("should return the correct tenant's order", async () => {
      const res = await request(app)
        .get(`/orders/${orderId}`)
        .set("X-Tenant-Id", "tenant-acme");

      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe("tenant-acme");
    });

    it("should return 404 when another tenant requests the order", async () => {
      const res = await request(app)
        .get(`/orders/${orderId}`)
        .set("X-Tenant-Id", "tenant-beta");

      expect(res.status).toBe(404);
    });

    it("should return 400 when X-Tenant-Id header is missing", async () => {
      const res = await request(app).get(`/orders/${orderId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("X-Tenant-Id");
    });
  });

  describe("GET /orders", () => {
    beforeEach(async () => {
      await Order.create([
        { orderId: "test-list-001", tenantId: "tenant-acme", productId: "PROD-001", quantity: 1, customerEmail: null },
        { orderId: "test-list-002", tenantId: "tenant-acme", productId: "PROD-002", quantity: 1, customerEmail: null },
        { orderId: "test-list-003", tenantId: "tenant-beta", productId: "PROD-003", quantity: 1, customerEmail: null },
      ]);
    });

    it("should list only the requesting tenant's orders", async () => {
      const res = await request(app)
        .get("/orders")
        .set("X-Tenant-Id", "tenant-acme");

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.orders.every((o: any) => o.tenantId === "tenant-acme")).toBe(true);
    });

    it("should return 400 when X-Tenant-Id header is missing", async () => {
      const res = await request(app).get("/orders");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("X-Tenant-Id");
    });
  });
});
