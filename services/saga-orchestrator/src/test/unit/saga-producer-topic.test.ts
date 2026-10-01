// Verifies the Saga producer publishes both outcome events to the single
// consolidated "saga.result" topic while preserving event-type headers and
// payloads byte-for-byte. The real kafkajs Kafka client is mocked, so no
// broker is required.

jest.mock("kafkajs", () => {
  const mockProducer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue({}),
  };
  const Kafka = jest.fn().mockImplementation(() => ({
    producer: () => mockProducer,
    consumer: () => ({
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
    }),
  }));
  return { Kafka, logLevel: { NOTHING: 0 }, __mockProducer: mockProducer };
});

import {
  publishOrderCompleted,
  publishOrderCancelled,
} from "../../events/producer";
import type {
  SagaOrderCompletedEvent,
  SagaOrderCancelledEvent,
} from "../../events/producer";

const mockProducer = (require("kafkajs") as { __mockProducer: any })
  .__mockProducer as {
  connect: jest.Mock;
  disconnect: jest.Mock;
  send: jest.Mock;
};

const completedEvent: SagaOrderCompletedEvent = {
  orderId: "ORD-001",
  tenantId: "tenant-acme",
  paymentMode: "PREPAID",
  paymentId: "PAY-123",
  timestamp: "2024-01-01T00:00:00.000Z",
};

const cancelledEvent: SagaOrderCancelledEvent = {
  orderId: "ORD-001",
  tenantId: "tenant-acme",
  paymentMode: "PREPAID",
  reason: "INSUFFICIENT_STOCK",
  timestamp: "2024-01-01T00:00:00.000Z",
};

describe("Saga producer topic consolidation (Phase 0.5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("publishes saga.order-completed to saga.result with preserved header and payload", async () => {
    await publishOrderCompleted(completedEvent);

    expect(mockProducer.send).toHaveBeenCalledTimes(1);
    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: "saga.result",
      messages: [
        {
          key: "ORD-001",
          value: JSON.stringify(completedEvent),
          headers: {
            "event-type": "saga.order-completed",
            source: "saga-orchestrator",
          },
        },
      ],
    });
  });

  it("publishes saga.order-cancelled to saga.result with preserved header and payload", async () => {
    await publishOrderCancelled(cancelledEvent);

    expect(mockProducer.send).toHaveBeenCalledTimes(1);
    expect(mockProducer.send).toHaveBeenCalledWith({
      topic: "saga.result",
      messages: [
        {
          key: "ORD-001",
          value: JSON.stringify(cancelledEvent),
          headers: {
            "event-type": "saga.order-cancelled",
            source: "saga-orchestrator",
          },
        },
      ],
    });
  });
});
