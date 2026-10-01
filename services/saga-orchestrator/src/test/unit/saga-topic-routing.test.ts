// Routing tests for the consolidated Kafka topics (Phase 0.5).
//
// The saga consumer now subscribes to the single topics inventory.result
// and payment.result. dispatchSagaEvent inspects the KafkaJS "event-type"
// header to route to the correct existing handler. These tests verify that
// routing without a live Kafka broker by mocking the saga engine and store.

jest.mock("../../saga/engine", () => ({
  __esModule: true,
  handleInventoryReserved: jest.fn(),
  handleInventoryReservationFailed: jest.fn(),
  handlePaymentProcessed: jest.fn(),
  handlePaymentFailed: jest.fn(),
}));

jest.mock("../../saga/store", () => {
  const saga = { orderId: "ORD-001", status: "AWAITING_PAYMENT" };
  return {
    __esModule: true,
    createSaga: jest.fn().mockResolvedValue(saga),
    getSaga: jest.fn().mockResolvedValue(saga),
    getAllSagas: jest.fn().mockResolvedValue([]),
    updateSaga: jest.fn().mockResolvedValue(saga),
    addSagaStep: jest.fn().mockResolvedValue(undefined),
  };
});

import type { Message } from "kafkajs";
import { dispatchSagaEvent } from "../../events/consumer";
import {
  handleInventoryReserved,
  handleInventoryReservationFailed,
  handlePaymentProcessed,
  handlePaymentFailed,
} from "../../saga/engine";
import { createSaga } from "../../saga/store";

const mockedReserved = handleInventoryReserved as jest.MockedFunction<
  typeof handleInventoryReserved
>;
const mockedReservationFailed = handleInventoryReservationFailed as jest.MockedFunction<
  typeof handleInventoryReservationFailed
>;
const mockedProcessed = handlePaymentProcessed as jest.MockedFunction<
  typeof handlePaymentProcessed
>;
const mockedFailed = handlePaymentFailed as jest.MockedFunction<
  typeof handlePaymentFailed
>;
const mockedCreateSaga = createSaga as jest.MockedFunction<typeof createSaga>;

function makeMessage(
  eventType: string | undefined,
  event: Record<string, unknown>,
): Message {
  return {
    headers:
      eventType === undefined ? undefined : { "event-type": eventType },
    value: Buffer.from(JSON.stringify(event)),
  } as unknown as Message;
}

const tenant = "tenant-acme";

const orderCreatedEvent = {
  orderId: "ORD-001",
  tenantId: tenant,
  productId: "PROD-001",
  quantity: 2,
  customerEmail: "test@example.com",
  paymentMode: "PREPAID",
  timestamp: new Date().toISOString(),
};

const reservedEvent = {
  orderId: "ORD-001",
  tenantId: tenant,
  productId: "PROD-001",
  quantity: 2,
  paymentMode: "PREPAID",
  reservationId: 1,
  timestamp: new Date().toISOString(),
};

const failedEvent = {
  orderId: "ORD-001",
  tenantId: tenant,
  productId: "PROD-001",
  quantity: 2,
  paymentMode: "PREPAID",
  reason: "INSUFFICIENT_STOCK",
  timestamp: new Date().toISOString(),
};

const processedEvent = {
  orderId: "ORD-001",
  tenantId: tenant,
  productId: "PROD-001",
  quantity: 2,
  paymentMode: "PREPAID",
  paymentId: "PAY-123",
  amount: 59.98,
  timestamp: new Date().toISOString(),
};

describe("Saga consolidated-topic routing (Phase 0.5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes inventory.reserved on inventory.result to the reserved path", async () => {
    await dispatchSagaEvent(
      "inventory.result",
      makeMessage("inventory.reserved", reservedEvent),
    );

    expect(mockedReserved).toHaveBeenCalledTimes(1);
    expect(mockedReserved).toHaveBeenCalledWith("ORD-001", tenant);
    expect(mockedReservationFailed).not.toHaveBeenCalled();
    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("routes inventory.reservation-failed on inventory.result to the failure path", async () => {
    await dispatchSagaEvent(
      "inventory.result",
      makeMessage("inventory.reservation-failed", failedEvent),
    );

    expect(mockedReservationFailed).toHaveBeenCalledTimes(1);
    expect(mockedReservationFailed).toHaveBeenCalledWith(
      "ORD-001",
      "INSUFFICIENT_STOCK",
      tenant,
      "PREPAID",
    );
    expect(mockedReserved).not.toHaveBeenCalled();
    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("routes payment.processed on payment.result to the processed path", async () => {
    await dispatchSagaEvent(
      "payment.result",
      makeMessage("payment.processed", processedEvent),
    );

    expect(mockedProcessed).toHaveBeenCalledTimes(1);
    expect(mockedProcessed).toHaveBeenCalledWith(
      "ORD-001",
      "PAY-123",
      tenant,
      "PREPAID",
    );
    expect(mockedReserved).not.toHaveBeenCalled();
    expect(mockedReservationFailed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("routes payment.failed on payment.result to the failed path", async () => {
    await dispatchSagaEvent(
      "payment.result",
      makeMessage("payment.failed", failedEvent),
    );

    expect(mockedFailed).toHaveBeenCalledTimes(1);
    expect(mockedFailed).toHaveBeenCalledWith(
      "ORD-001",
      "PROD-001",
      2,
      "INSUFFICIENT_STOCK",
      tenant,
      "PREPAID",
    );
    expect(mockedReserved).not.toHaveBeenCalled();
    expect(mockedReservationFailed).not.toHaveBeenCalled();
    expect(mockedProcessed).not.toHaveBeenCalled();
  });

  it("ignores an unknown event-type on inventory.result", async () => {
    await dispatchSagaEvent(
      "inventory.result",
      makeMessage("inventory.unknown", reservedEvent),
    );

    expect(mockedReserved).not.toHaveBeenCalled();
    expect(mockedReservationFailed).not.toHaveBeenCalled();
    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("ignores an unknown event-type on payment.result", async () => {
    await dispatchSagaEvent(
      "payment.result",
      makeMessage("payment.unknown", processedEvent),
    );

    expect(mockedReserved).not.toHaveBeenCalled();
    expect(mockedReservationFailed).not.toHaveBeenCalled();
    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("ignores a message with a missing event-type header", async () => {
    await dispatchSagaEvent(
      "inventory.result",
      makeMessage(undefined, reservedEvent),
    );

    expect(mockedReserved).not.toHaveBeenCalled();
    expect(mockedReservationFailed).not.toHaveBeenCalled();
    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("continues to route order.created to onOrderCreated unchanged", async () => {
    await dispatchSagaEvent(
      "order.created",
      makeMessage(undefined, orderCreatedEvent),
    );

    expect(mockedCreateSaga).toHaveBeenCalledTimes(1);
    expect(mockedCreateSaga).toHaveBeenCalledWith(
      "ORD-001",
      "PROD-001",
      2,
      "test@example.com",
      tenant,
    );
    expect(mockedReserved).not.toHaveBeenCalled();
    expect(mockedReservationFailed).not.toHaveBeenCalled();
    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });
});
