jest.mock("../../events/producer");
jest.mock("axios");

import axios from "axios";
import { createSaga, getSaga, SagaStatus } from "../../saga/store";
import {
  onInventoryReservationFailed,
  onPaymentProcessed,
  onPaymentFailed,
} from "../../events/consumer";
import {
  publishOrderCompleted,
  publishOrderCancelled,
} from "../../events/producer";

const mockedPublishOrderCompleted = publishOrderCompleted as jest.MockedFunction<typeof publishOrderCompleted>;
const mockedPublishOrderCancelled = publishOrderCancelled as jest.MockedFunction<typeof publishOrderCancelled>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Saga Tenant Event Propagation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPublishOrderCompleted.mockResolvedValue(undefined);
    mockedPublishOrderCancelled.mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  describe("saga.order-completed (from payment.processed)", () => {
    it("should accept incoming event with tenantId and paymentMode", async () => {
      createSaga("ORD-001", "PROD-001", 2, "test@example.com");

      await onPaymentProcessed({
        orderId: "ORD-001",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        paymentId: "PAY-123",
        amount: 59.98,
        timestamp: new Date().toISOString(),
      });

      expect(mockedPublishOrderCompleted).toHaveBeenCalledTimes(1);
    });

    it("should propagate tenantId and paymentMode in saga.order-completed", async () => {
      createSaga("ORD-002", "PROD-001", 2, "test@example.com");

      await onPaymentProcessed({
        orderId: "ORD-002",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        paymentId: "PAY-456",
        amount: 59.98,
        timestamp: new Date().toISOString(),
      });

      expect(mockedPublishOrderCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ORD-002",
          tenantId: "tenant-acme",
          paymentMode: "PREPAID",
          paymentId: "PAY-456",
        })
      );
    });

    it("should preserve existing fields in saga.order-completed", async () => {
      createSaga("ORD-003", "PROD-002", 1, null);

      await onPaymentProcessed({
        orderId: "ORD-003",
        tenantId: "tenant-beta",
        productId: "PROD-002",
        quantity: 1,
        paymentMode: "UNPAID",
        paymentId: "PAY-789",
        amount: 89.99,
        timestamp: new Date().toISOString(),
      });

      const event = mockedPublishOrderCompleted.mock.calls[0][0];
      expect(event.orderId).toBe("ORD-003");
      expect(event.paymentId).toBe("PAY-789");
      expect(event.timestamp).toBeDefined();
    });
  });

  describe("saga.order-cancelled (from inventory.reservation-failed)", () => {
    it("should accept incoming event with tenantId and paymentMode", async () => {
      createSaga("ORD-004", "PROD-001", 2, "test@example.com");

      await onInventoryReservationFailed({
        orderId: "ORD-004",
        tenantId: "tenant-beta",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        reason: "INSUFFICIENT_STOCK",
        timestamp: new Date().toISOString(),
      });

      expect(mockedPublishOrderCancelled).toHaveBeenCalledTimes(1);
    });

    it("should propagate tenantId and paymentMode in saga.order-cancelled", async () => {
      createSaga("ORD-005", "PROD-001", 2, "test@example.com");

      await onInventoryReservationFailed({
        orderId: "ORD-005",
        tenantId: "tenant-beta",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "UNPAID",
        reason: "INSUFFICIENT_STOCK",
        timestamp: new Date().toISOString(),
      });

      expect(mockedPublishOrderCancelled).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ORD-005",
          tenantId: "tenant-beta",
          paymentMode: "UNPAID",
          reason: "Inventory reservation failed: INSUFFICIENT_STOCK",
        })
      );
    });
  });

  describe("saga.order-cancelled (from payment.failed)", () => {
    it("should accept incoming event with tenantId and paymentMode", async () => {
      createSaga("ORD-006", "PROD-001", 2, "test@example.com");

      await onPaymentFailed({
        orderId: "ORD-006",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        reason: "INSUFFICIENT_FUNDS",
        timestamp: new Date().toISOString(),
      });

      expect(mockedPublishOrderCancelled).toHaveBeenCalledTimes(1);
    });

    it("should propagate tenantId and paymentMode in saga.order-cancelled", async () => {
      createSaga("ORD-007", "PROD-001", 2, "test@example.com");

      await onPaymentFailed({
        orderId: "ORD-007",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        reason: "BANK_DECLINED",
        timestamp: new Date().toISOString(),
      });

      expect(mockedPublishOrderCancelled).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "ORD-007",
          tenantId: "tenant-acme",
          paymentMode: "PREPAID",
          reason: "Payment failed: BANK_DECLINED",
        })
      );
    });
  });

  describe("Existing Saga behavior unchanged", () => {
    it("should update saga status to COMPLETED on payment.processed", async () => {
      createSaga("ORD-008", "PROD-001", 2, "test@example.com");

      await onPaymentProcessed({
        orderId: "ORD-008",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        paymentId: "PAY-001",
        amount: 59.98,
        timestamp: new Date().toISOString(),
      });

      const saga = getSaga("ORD-008");
      expect(saga?.status).toBe("COMPLETED");
      expect(saga?.paymentId).toBe("PAY-001");
    });

    it("should update saga status to CANCELLED on inventory.reservation-failed", async () => {
      createSaga("ORD-009", "PROD-001", 2, "test@example.com");

      await onInventoryReservationFailed({
        orderId: "ORD-009",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        reason: "INSUFFICIENT_STOCK",
        timestamp: new Date().toISOString(),
      });

      const saga = getSaga("ORD-009");
      expect(saga?.status).toBe("CANCELLED");
      expect(saga?.failureReason).toBe("INSUFFICIENT_STOCK");
    });

    it("should attempt inventory compensation on payment.failed", async () => {
      createSaga("ORD-010", "PROD-001", 2, "test@example.com");

      await onPaymentFailed({
        orderId: "ORD-010",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        reason: "CARD_EXPIRED",
        timestamp: new Date().toISOString(),
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        "http://inventory-service:3002/inventory/release",
        { orderId: "ORD-010", productId: "PROD-001", quantity: 2 },
      );

      const saga = getSaga("ORD-010");
      expect(saga?.status).toBe("CANCELLED");
    });
  });
});
