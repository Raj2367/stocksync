jest.mock("../../events/producer");

import { handlePayment } from "../../events/consumer";
import {
  publishPaymentProcessed,
  publishPaymentFailed,
} from "../../events/producer";

const mockedPublishPaymentProcessed = publishPaymentProcessed as jest.MockedFunction<typeof publishPaymentProcessed>;
const mockedPublishPaymentFailed = publishPaymentFailed as jest.MockedFunction<typeof publishPaymentFailed>;

function makeEvent(overrides: Partial<{
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  reservationId: number;
  timestamp: string;
}> = {}) {
  return {
    orderId: "ORD-001",
    tenantId: "tenant-acme",
    productId: "PROD-001",
    quantity: 2,
    paymentMode: "PREPAID",
    reservationId: 1,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("Payment Tenant Event Propagation", () => {
  let originalRandom: typeof Math.random;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPublishPaymentProcessed.mockResolvedValue(undefined);
    mockedPublishPaymentFailed.mockResolvedValue(undefined);
    originalRandom = Math.random;
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  describe("payment.processed (success)", () => {
    it("should propagate tenantId and paymentMode from incoming event", async () => {
      Math.random = jest.fn().mockReturnValue(0.0);

      await handlePayment(makeEvent());

      expect(mockedPublishPaymentProcessed).toHaveBeenCalledTimes(1);
      const event = mockedPublishPaymentProcessed.mock.calls[0][0];
      expect(event.tenantId).toBe("tenant-acme");
      expect(event.paymentMode).toBe("PREPAID");
    });

    it("should preserve existing fields in payment.processed", async () => {
      Math.random = jest.fn().mockReturnValue(0.0);

      await handlePayment(makeEvent({ quantity: 3 }));

      const event = mockedPublishPaymentProcessed.mock.calls[0][0];
      expect(event.orderId).toBe("ORD-001");
      expect(event.productId).toBe("PROD-001");
      expect(event.quantity).toBe(3);
      expect(event.paymentId).toBeDefined();
      expect(event.amount).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it("should have all expected fields in the payload", async () => {
      Math.random = jest.fn().mockReturnValue(0.0);

      await handlePayment(makeEvent());

      const event = mockedPublishPaymentProcessed.mock.calls[0][0];
      const expectedKeys = new Set([
        "orderId",
        "tenantId",
        "productId",
        "quantity",
        "paymentMode",
        "paymentId",
        "amount",
        "timestamp",
      ]);
      expect(new Set(Object.keys(event))).toEqual(expectedKeys);
    });
  });

  describe("payment.failed (decline)", () => {
    it("should propagate tenantId and paymentMode from incoming event", async () => {
      Math.random = jest.fn().mockReturnValue(0.99);

      await handlePayment(makeEvent());

      expect(mockedPublishPaymentFailed).toHaveBeenCalledTimes(1);
      const event = mockedPublishPaymentFailed.mock.calls[0][0];
      expect(event.tenantId).toBe("tenant-acme");
      expect(event.paymentMode).toBe("PREPAID");
    });

    it("should preserve existing fields in payment.failed", async () => {
      Math.random = jest.fn().mockReturnValue(0.99);

      await handlePayment(makeEvent({ quantity: 3 }));

      const event = mockedPublishPaymentFailed.mock.calls[0][0];
      expect(event.orderId).toBe("ORD-001");
      expect(event.productId).toBe("PROD-001");
      expect(event.quantity).toBe(3);
      expect(event.reason).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it("should have all expected fields in the payload", async () => {
      Math.random = jest.fn().mockReturnValue(0.99);

      await handlePayment(makeEvent());

      const event = mockedPublishPaymentFailed.mock.calls[0][0];
      const expectedKeys = new Set([
        "orderId",
        "tenantId",
        "productId",
        "quantity",
        "paymentMode",
        "reason",
        "timestamp",
      ]);
      expect(new Set(Object.keys(event))).toEqual(expectedKeys);
    });
  });
});
