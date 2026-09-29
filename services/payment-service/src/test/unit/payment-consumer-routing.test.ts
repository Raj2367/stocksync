jest.mock("../../events/producer", () => ({
  publishPaymentProcessed: jest.fn().mockResolvedValue(undefined),
  publishPaymentFailed: jest.fn().mockResolvedValue(undefined),
}));

import type { Message } from "kafkajs";
import { processInventoryMessage } from "../../events/consumer";
import {
  publishPaymentProcessed,
  publishPaymentFailed,
} from "../../events/producer";

const mockedProcessed = publishPaymentProcessed as jest.MockedFunction<
  typeof publishPaymentProcessed
>;
const mockedFailed = publishPaymentFailed as jest.MockedFunction<
  typeof publishPaymentFailed
>;

function makeMessage(eventType: string | undefined, event: Record<string, unknown>): Message {
  return {
    headers:
      eventType === undefined ? undefined : { "event-type": eventType },
    value: Buffer.from(JSON.stringify(event)),
  } as unknown as Message;
}

const baseEvent = {
  orderId: "ORD-001",
  tenantId: "tenant-acme",
  productId: "PROD-001",
  quantity: 2,
  paymentMode: "PREPAID",
  reservationId: 1,
  timestamp: new Date().toISOString(),
};

describe("Payment consumer inventory.result routing", () => {
  const originalRandom = Math.random;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedProcessed.mockResolvedValue(undefined);
    mockedFailed.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it("does NOT handle an inventory.reservation-failed event on inventory.result", async () => {
    const msg = makeMessage("inventory.reservation-failed", {
      ...baseEvent,
      reason: "INSUFFICIENT_STOCK",
    });

    await processInventoryMessage(msg);

    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("does NOT handle an unknown event-type on inventory.result", async () => {
    const msg = makeMessage("inventory.unknown", baseEvent);

    await processInventoryMessage(msg);

    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("does NOT handle a message missing the event-type header", async () => {
    const msg = makeMessage(undefined, baseEvent);

    await processInventoryMessage(msg);

    expect(mockedProcessed).not.toHaveBeenCalled();
    expect(mockedFailed).not.toHaveBeenCalled();
  });

  it("handles an inventory.reserved event and propagates tenantId/paymentMode", async () => {
    // DEMO_MODE is false by default; a low Math.random forces approval.
    Math.random = jest.fn().mockReturnValue(0.0);
    const msg = makeMessage("inventory.reserved", baseEvent);

    await processInventoryMessage(msg);

    expect(mockedProcessed).toHaveBeenCalledTimes(1);
    expect(mockedFailed).not.toHaveBeenCalled();
    expect(mockedProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-001",
        tenantId: "tenant-acme",
        productId: "PROD-001",
        quantity: 2,
        paymentMode: "PREPAID",
      }),
    );
  });
});
