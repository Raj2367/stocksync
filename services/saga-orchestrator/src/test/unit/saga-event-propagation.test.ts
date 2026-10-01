jest.mock("../../events/producer");
jest.mock("axios");
jest.mock("../../saga/sagaRepository", () => {
  const docs: Record<string, any> = {};

  const newDoc = (
    tenantId: string,
    orderId: string,
    productId: string,
    quantity: number,
    customerEmail: string | null,
  ) => ({
    orderId,
    tenantId,
    productId,
    quantity,
    customerEmail,
    status: "AWAITING_INVENTORY",
    paymentId: null,
    failureReason: null,
    steps: [
      {
        action: "ORDER_CREATED",
        status: "success",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
    ],
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  });

  const createSaga = jest.fn(
    (
      tenantId: string,
      orderId: string,
      productId: string,
      quantity: number,
      customerEmail: string | null,
    ) => {
      const doc = newDoc(tenantId, orderId, productId, quantity, customerEmail);
      docs[orderId] = doc;
      return Promise.resolve(doc);
    },
  );
  const getSaga = jest.fn(
    (tenantId: string, orderId: string) =>
      Promise.resolve(docs[orderId] ?? null),
  );
  const getAllSagas = jest.fn((tenantId: string) =>
    Promise.resolve(
      Object.values(docs).filter((d) => d.tenantId === tenantId),
    ),
  );
  const updateSaga = jest.fn(
    (tenantId: string, orderId: string, updates: any) => {
      const doc = docs[orderId];
      if (!doc) return Promise.resolve(null);
      Object.assign(doc, updates);
      doc.updatedAt = new Date();
      return Promise.resolve(doc);
    },
  );
  const addSagaStep = jest.fn(
    (tenantId: string, orderId: string, step: any) => {
      const doc = docs[orderId];
      if (doc) doc.steps.push(step);
      return Promise.resolve(undefined);
    },
  );

  return {
    __esModule: true,
    createSaga,
    getSaga,
    getAllSagas,
    updateSaga,
    addSagaStep,
    __reset: () => {
      Object.keys(docs).forEach((k) => delete docs[k]);
    },
  };
});

import axios from "axios";
import { createSaga, getSaga, SagaStatus } from "../../saga/store";
import {
  onOrderCreated,
  onInventoryReserved,
  onInventoryReservationFailed,
  onPaymentProcessed,
  onPaymentFailed,
} from "../../events/consumer";
import {
  publishOrderCompleted,
  publishOrderCancelled,
} from "../../events/producer";
import * as SagaRepo from "../../saga/sagaRepository";

const mockedPublishOrderCompleted = publishOrderCompleted as jest.MockedFunction<typeof publishOrderCompleted>;
const mockedPublishOrderCancelled = publishOrderCancelled as jest.MockedFunction<typeof publishOrderCancelled>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("Saga Tenant Event Propagation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SagaRepo as any).__reset();
    mockedPublishOrderCompleted.mockResolvedValue(undefined);
    mockedPublishOrderCancelled.mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  describe("saga.order-completed (from payment.processed)", () => {
    it("should accept incoming event with tenantId and paymentMode", async () => {
      await createSaga("ORD-001", "PROD-001", 2, "test@example.com");

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
      await createSaga("ORD-002", "PROD-001", 2, "test@example.com");

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
      await createSaga("ORD-003", "PROD-002", 1, null);

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
      await createSaga("ORD-004", "PROD-001", 2, "test@example.com");

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
      await createSaga("ORD-005", "PROD-001", 2, "test@example.com");

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
      await createSaga("ORD-006", "PROD-001", 2, "test@example.com");

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
      await createSaga("ORD-007", "PROD-001", 2, "test@example.com");

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
      await createSaga("ORD-008", "PROD-001", 2, "test@example.com");

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

      const saga = await getSaga("ORD-008");
      expect(saga?.status).toBe("COMPLETED");
      expect(saga?.paymentId).toBe("PAY-001");
    });

    it("should update saga status to CANCELLED on inventory.reservation-failed", async () => {
      await createSaga("ORD-009", "PROD-001", 2, "test@example.com");

      await onInventoryReservationFailed({
        orderId: "ORD-009",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
        reason: "INSUFFICIENT_STOCK",
        timestamp: new Date().toISOString(),
      });

      const saga = await getSaga("ORD-009");
      expect(saga?.status).toBe("CANCELLED");
      expect(saga?.failureReason).toBe("INSUFFICIENT_STOCK");
    });

    it("should attempt inventory compensation on payment.failed", async () => {
      await createSaga("ORD-010", "PROD-001", 2, "test@example.com");

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

      const saga = await getSaga("ORD-010");
      expect(saga?.status).toBe("CANCELLED");
    });
  });
});

describe("Saga started (from order.created)", () => {
  it("should create a persisted Saga with the incoming tenantId", async () => {
    await onOrderCreated({
      orderId: "ORD-NEW",
      tenantId: "tenant-acme",
      productId: "PROD-001",
      quantity: 2,
      customerEmail: "test@example.com",
      paymentMode: "PREPAID",
      timestamp: new Date().toISOString(),
    });

    expect((SagaRepo.createSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-NEW",
      "PROD-001",
      2,
      "test@example.com",
    );

    const saga = await getSaga("ORD-NEW");
    expect(saga?.tenantId).toBe("tenant-acme");
    expect(saga?.orderId).toBe("ORD-NEW");
    expect(saga?.status).toBe("AWAITING_INVENTORY");
    expect(saga?.steps).toHaveLength(1);
    expect(saga?.steps[0]?.action).toBe("ORDER_CREATED");
  });
});

describe("inventory.reserved Saga path", () => {
  it("threads tenantId into awaited store ops and moves Saga to AWAITING_PAYMENT", async () => {
    await createSaga("ORD-IR", "PROD-001", 2, "test@example.com", "tenant-acme");

    await onInventoryReserved({
      orderId: "ORD-IR",
      tenantId: "tenant-acme",
      productId: "PROD-001",
      quantity: 2,
      paymentMode: "PREPAID",
      reservationId: 1,
      timestamp: new Date().toISOString(),
    });

    expect((SagaRepo.getSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-IR",
    );
    expect((SagaRepo.updateSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-IR",
      { status: "AWAITING_PAYMENT" },
    );
    expect((SagaRepo.addSagaStep as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-IR",
      expect.objectContaining({ action: "INVENTORY_RESERVED", status: "success" }),
    );

    const saga = await getSaga("ORD-IR", "tenant-acme");
    expect(saga?.status).toBe("AWAITING_PAYMENT");
    expect(saga?.steps.some((s) => s.action === "INVENTORY_RESERVED")).toBe(true);
    expect(saga?.steps[0]?.action).toBe("ORDER_CREATED");
  });
});

describe("inventory.reservation-failed Saga path", () => {
  it("threads tenantId into awaited store ops and cancels the Saga with failureReason", async () => {
    await createSaga("ORD-IF", "PROD-001", 2, "test@example.com", "tenant-beta");

    await onInventoryReservationFailed({
      orderId: "ORD-IF",
      tenantId: "tenant-beta",
      productId: "PROD-001",
      quantity: 2,
      paymentMode: "UNPAID",
      reason: "INSUFFICIENT_STOCK",
      timestamp: new Date().toISOString(),
    });

    expect((SagaRepo.getSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-beta",
      "ORD-IF",
    );
    expect((SagaRepo.updateSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-beta",
      "ORD-IF",
      { status: "CANCELLED", failureReason: "INSUFFICIENT_STOCK" },
    );
    expect((SagaRepo.addSagaStep as jest.Mock)).toHaveBeenCalledWith(
      "tenant-beta",
      "ORD-IF",
      expect.objectContaining({
        action: "INVENTORY_RESERVATION_FAILED",
        status: "failure",
      }),
    );

    const saga = await getSaga("ORD-IF", "tenant-beta");
    expect(saga?.status).toBe("CANCELLED");
    expect(saga?.failureReason).toBe("INSUFFICIENT_STOCK");
    expect(
      saga?.steps.some((s) => s.action === "INVENTORY_RESERVATION_FAILED"),
    ).toBe(true);
    expect(saga?.steps[0]?.action).toBe("ORDER_CREATED");

    expect(mockedPublishOrderCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-IF",
        tenantId: "tenant-beta",
        paymentMode: "UNPAID",
      }),
    );
  });
});

describe("payment.processed Saga path", () => {
  it("threads tenantId into awaited store ops and completes the Saga", async () => {
    await createSaga("ORD-PP", "PROD-001", 2, "test@example.com", "tenant-acme");

    await onPaymentProcessed({
      orderId: "ORD-PP",
      tenantId: "tenant-acme",
      productId: "PROD-001",
      quantity: 2,
      paymentMode: "PREPAID",
      paymentId: "PAY-PP-1",
      amount: 59.98,
      timestamp: new Date().toISOString(),
    });

    expect((SagaRepo.getSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-PP",
    );
    expect((SagaRepo.updateSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-PP",
      { status: "COMPLETED", paymentId: "PAY-PP-1" },
    );
    expect((SagaRepo.addSagaStep as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-PP",
      expect.objectContaining({
        action: "PAYMENT_PROCESSED",
        status: "success",
      }),
    );

    const saga = await getSaga("ORD-PP", "tenant-acme");
    expect(saga?.status).toBe("COMPLETED");
    expect(saga?.paymentId).toBe("PAY-PP-1");
    expect(
      saga?.steps.some((s) => s.action === "PAYMENT_PROCESSED"),
    ).toBe(true);
    expect(saga?.steps[0]?.action).toBe("ORDER_CREATED");

    expect(mockedPublishOrderCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-PP",
        tenantId: "tenant-acme",
        paymentMode: "PREPAID",
        paymentId: "PAY-PP-1",
      }),
    );
  });
});

describe("payment.failed Saga path", () => {
  it("threads tenantId into awaited store ops, compensates, and cancels the Saga", async () => {
    await createSaga("ORD-PF", "PROD-001", 2, "test@example.com", "tenant-acme");

    await onPaymentFailed({
      orderId: "ORD-PF",
      tenantId: "tenant-acme",
      productId: "PROD-001",
      quantity: 2,
      paymentMode: "PREPAID",
      reason: "CARD_EXPIRED",
      timestamp: new Date().toISOString(),
    });

    expect((SagaRepo.getSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-PF",
    );
    expect((SagaRepo.updateSaga as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-PF",
      { status: "CANCELLING", failureReason: "CARD_EXPIRED" },
    );
    expect((SagaRepo.updateSaga as jest.Mock)).toHaveBeenLastCalledWith(
      "tenant-acme",
      "ORD-PF",
      { status: "CANCELLED" },
    );
    expect((SagaRepo.addSagaStep as jest.Mock)).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-PF",
      expect.objectContaining({ action: "PAYMENT_FAILED", status: "failure" }),
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "http://inventory-service:3002/inventory/release",
      { orderId: "ORD-PF", productId: "PROD-001", quantity: 2 },
    );

    const saga = await getSaga("ORD-PF", "tenant-acme");
    expect(saga?.status).toBe("CANCELLED");
    expect(saga?.failureReason).toBe("CARD_EXPIRED");
    expect(
      saga?.steps.some((s) => s.action === "PAYMENT_FAILED"),
    ).toBe(true);
    expect(
      saga?.steps.some((s) => s.action === "RELEASE_INVENTORY"),
    ).toBe(true);
    expect(saga?.steps[0]?.action).toBe("ORDER_CREATED");

    expect(mockedPublishOrderCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-PF",
        tenantId: "tenant-acme",
        paymentMode: "PREPAID",
        reason: "Payment failed: CARD_EXPIRED",
      }),
    );
  });
});
