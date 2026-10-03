// Demo mode determinism for handlePayment.
//
// DEMO_MODE is a module-level constant in src/config.ts (evaluated at import
// time), so we re-import the consumer under an isolated module registry with
// process.env.DEMO_MODE set before each assertion. The producer is mocked, so
// no Kafka/MongoDB is required.

jest.mock("../../events/producer", () => ({
  publishPaymentProcessed: jest.fn(),
  publishPaymentFailed: jest.fn(),
}));

import type { publishPaymentProcessed, publishPaymentFailed } from "../../events/producer";

type HandlePayment = (event: {
  orderId: string;
  tenantId: string;
  productId: string;
  quantity: number;
  paymentMode: string;
  reservationId: number;
  timestamp: string;
}) => Promise<void>;

function baseEvent(overrides: Partial<{ paymentMode: string }> = {}) {
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

type Mocks = {
  handlePayment: HandlePayment;
  processedMock: jest.MockedFunction<typeof publishPaymentProcessed>;
  failedMock: jest.MockedFunction<typeof publishPaymentFailed>;
};

function setup(opts: {
  demoMode?: string;
  randomValue: number;
  paymentMode: string;
}): Mocks {
  if (opts.demoMode === undefined) {
    delete process.env.DEMO_MODE;
  } else {
    process.env.DEMO_MODE = opts.demoMode;
  }

  // A high random value would normally DECLINE in random mode (>= 0.7),
  // and a low value would normally APPROVE (< 0.7). We use these to prove
  // DEMO_MODE ignores randomness for the approval decision.
  Math.random = jest.fn().mockReturnValue(opts.randomValue);

  jest.resetModules();

  const consumer = require("../../events/consumer");
  const producer = require("../../events/producer") as {
    publishPaymentProcessed: jest.MockedFunction<typeof publishPaymentProcessed>;
    publishPaymentFailed: jest.MockedFunction<typeof publishPaymentFailed>;
  };
  return {
    handlePayment: consumer.handlePayment as HandlePayment,
    processedMock: producer.publishPaymentProcessed,
    failedMock: producer.publishPaymentFailed,
  };
}

describe("DEMO_MODE payment determinism (Phase 0D)", () => {
  const originalEnv = process.env.DEMO_MODE;
  const originalRandom = Math.random;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = originalEnv;
    }
    Math.random = originalRandom;
  });

  it("approves PREPAID orders in DEMO_MODE even when random would decline", async () => {
    const { handlePayment, processedMock, failedMock } = setup({
      demoMode: "true",
      randomValue: 0.99, // random mode: 0.99 >= 0.7 would DECLINE
      paymentMode: "PREPAID",
    });

    await handlePayment(baseEvent({ paymentMode: "PREPAID" }));

    expect(processedMock).toHaveBeenCalledTimes(1);
    expect(failedMock).not.toHaveBeenCalled();
    expect(processedMock.mock.calls[0][0].paymentMode).toBe("PREPAID");
    expect(processedMock.mock.calls[0][0].tenantId).toBe("tenant-acme");
  });

  it("approves SUCCESS orders in DEMO_MODE even when random would decline", async () => {
    const { handlePayment, processedMock, failedMock } = setup({
      demoMode: "true",
      randomValue: 0.99, // random mode: 0.99 >= 0.7 would DECLINE
      paymentMode: "SUCCESS",
    });

    await handlePayment(baseEvent({ paymentMode: "SUCCESS" }));

    expect(processedMock).toHaveBeenCalledTimes(1);
    expect(failedMock).not.toHaveBeenCalled();
    expect(processedMock.mock.calls[0][0].paymentMode).toBe("SUCCESS");
  });

  it("declines FAIL orders in DEMO_MODE even when random would approve", async () => {
    const { handlePayment, processedMock, failedMock } = setup({
      demoMode: "true",
      randomValue: 0.0, // random mode: 0.0 < 0.7 would APPROVE
      paymentMode: "FAIL",
    });

    await handlePayment(baseEvent({ paymentMode: "FAIL" }));

    expect(failedMock).toHaveBeenCalledTimes(1);
    expect(processedMock).not.toHaveBeenCalled();
    expect(failedMock.mock.calls[0][0].paymentMode).toBe("FAIL");
    expect(failedMock.mock.calls[0][0].reason).toBeDefined();
  });

  it("declines non-PREPAID (UNPAID) orders in DEMO_MODE even when random would approve", async () => {
    const { handlePayment, processedMock, failedMock } = setup({
      demoMode: "true",
      randomValue: 0.0, // random mode: 0.0 < 0.7 would APPROVE
      paymentMode: "UNPAID",
    });

    await handlePayment(baseEvent({ paymentMode: "UNPAID" }));

    expect(failedMock).toHaveBeenCalledTimes(1);
    expect(processedMock).not.toHaveBeenCalled();
    expect(failedMock.mock.calls[0][0].paymentMode).toBe("UNPAID");
    expect(failedMock.mock.calls[0][0].reason).toBeDefined();
  });

  it("preserves randomized behavior when DEMO_MODE=false (random approves)", async () => {
    const { handlePayment, processedMock, failedMock } = setup({
      demoMode: "false",
      randomValue: 0.0, // < 0.7 → APPROVE
      paymentMode: "PREPAID",
    });

    await handlePayment(baseEvent({ paymentMode: "PREPAID" }));

    expect(processedMock).toHaveBeenCalledTimes(1);
    expect(failedMock).not.toHaveBeenCalled();
  });

  it("preserves randomized behavior when DEMO_MODE=false (random declines)", async () => {
    const { handlePayment, processedMock, failedMock } = setup({
      demoMode: "false",
      randomValue: 0.99, // >= 0.7 → DECLINE
      paymentMode: "UNPAID",
    });

    await handlePayment(baseEvent({ paymentMode: "UNPAID" }));

    expect(failedMock).toHaveBeenCalledTimes(1);
    expect(processedMock).not.toHaveBeenCalled();
  });

  it("treats unset DEMO_MODE as non-demo (randomized)", async () => {
    const { handlePayment, processedMock, failedMock } = setup({
      demoMode: undefined,
      randomValue: 0.0, // < 0.7 → APPROVE
      paymentMode: "PREPAID",
    });

    await handlePayment(baseEvent({ paymentMode: "PREPAID" }));

    expect(processedMock).toHaveBeenCalledTimes(1);
    expect(failedMock).not.toHaveBeenCalled();
  });
});
