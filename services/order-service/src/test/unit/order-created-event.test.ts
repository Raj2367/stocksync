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

describe("order.created Event Payload", () => {
  beforeEach(() => {
    mockedPublishOrderCreated.mockClear();
    mockedPublishOrderCreated.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await Order.deleteMany({});
  });

  it("should publish payload with correct tenantId from X-Tenant-Id header", async () => {
    await request(app)
      .post("/orders")
      .set("X-Tenant-Id", "tenant-acme")
      .send({ productId: "PROD-001", quantity: 1 });

    expect(mockedPublishOrderCreated).toHaveBeenCalledTimes(1);
    const event = mockedPublishOrderCreated.mock.calls[0][0];
    expect(event.tenantId).toBe("tenant-acme");
  });

  it("should publish payload with paymentMode from request body", async () => {
    await request(app)
      .post("/orders")
      .set("X-Tenant-Id", "tenant-acme")
      .send({ productId: "PROD-001", quantity: 1, paymentMode: "PREPAID" });

    const event = mockedPublishOrderCreated.mock.calls[0][0];
    expect(event.paymentMode).toBe("PREPAID");
  });

  it("should default paymentMode to UNPAID when not provided in body", async () => {
    await request(app)
      .post("/orders")
      .set("X-Tenant-Id", "tenant-acme")
      .send({ productId: "PROD-001", quantity: 1 });

    const event = mockedPublishOrderCreated.mock.calls[0][0];
    expect(event.paymentMode).toBe("UNPAID");
  });

  it("should preserve existing event fields (orderId, productId, quantity, customerEmail, timestamp)", async () => {
    await request(app)
      .post("/orders")
      .set("X-Tenant-Id", "tenant-acme")
      .send({ productId: "PROD-001", quantity: 2, customerEmail: "buyer@example.com" });

    const event = mockedPublishOrderCreated.mock.calls[0][0];
    expect(event.orderId).toBeDefined();
    expect(event.productId).toBe("PROD-001");
    expect(event.quantity).toBe(2);
    expect(event.customerEmail).toBe("buyer@example.com");
    expect(event.timestamp).toBeDefined();
  });

  it("should have all expected fields in the event payload", async () => {
    await request(app)
      .post("/orders")
      .set("X-Tenant-Id", "tenant-acme")
      .send({ productId: "PROD-001", quantity: 1, paymentMode: "PREPAID" });

    const event = mockedPublishOrderCreated.mock.calls[0][0];
    const expectedKeys = new Set([
      "orderId",
      "tenantId",
      "productId",
      "quantity",
      "customerEmail",
      "paymentMode",
      "timestamp",
    ]);
    expect(new Set(Object.keys(event))).toEqual(expectedKeys);
  });
});
