// Verifies the Order service consumer routes saga.result messages by the
// KafkaJS "event-type" header to the existing completion/cancellation
// handlers. The Order model is mocked, so no live database is required.

jest.mock("../../models/Order", () => ({
  __esModule: true,
  default: {
    updateOne: jest.fn().mockResolvedValue({ n: 1 }),
  },
}));

import { processSagaEvent } from "../../events/consumer";
import type { Message } from "kafkajs";

const Order = (require("../../models/Order") as { default: any }).default;
const mockedUpdateOne = Order.updateOne as jest.Mock;

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

describe("Order saga.result routing (Phase 0.5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUpdateOne.mockResolvedValue({ n: 1 });
  });

  it("routes saga.order-completed on saga.result to the completion path", async () => {
    await processSagaEvent(
      makeMessage("saga.order-completed", {
        orderId: "ORD-COMP-1",
        paymentId: "PAY-123",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    );

    expect(mockedUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = mockedUpdateOne.mock.calls[0];
    expect(filter).toEqual({ orderId: "ORD-COMP-1" });
    expect(update.$set.status).toBe("CONFIRMED");
    expect(update.$set.sagaStatus).toBe("COMPLETED");
    expect(update.$set.paymentId).toBe("PAY-123");
  });

  it("routes saga.order-cancelled on saga.result to the cancellation path", async () => {
    await processSagaEvent(
      makeMessage("saga.order-cancelled", {
        orderId: "ORD-CANCEL-1",
        reason: "Payment failed: INSUFFICIENT_FUNDS",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    );

    expect(mockedUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = mockedUpdateOne.mock.calls[0];
    expect(filter).toEqual({ orderId: "ORD-CANCEL-1" });
    expect(update.$set.status).toBe("CANCELLED");
    expect(update.$set.sagaStatus).toBe("CANCELLED");
    expect(update.$set.failureReason).toContain("INSUFFICIENT_FUNDS");
  });

  it("ignores an unknown event-type on saga.result", async () => {
    await processSagaEvent(
      makeMessage("saga.unknown", {
        orderId: "ORD-X-1",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    );

    expect(mockedUpdateOne).not.toHaveBeenCalled();
  });

  it("ignores a message with a missing event-type header", async () => {
    await processSagaEvent(
      makeMessage(undefined, {
        orderId: "ORD-Y-1",
        paymentId: "PAY-456",
        timestamp: "2024-01-01T00:00:00.000Z",
      }),
    );

    expect(mockedUpdateOne).not.toHaveBeenCalled();
  });
});
