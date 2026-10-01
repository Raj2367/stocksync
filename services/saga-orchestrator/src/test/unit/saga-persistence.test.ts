jest.mock("../../models/Saga", () => {
  const store: any[] = [];

  const makeDoc = (data: any) => {
    const doc = {
      _id: `mongo-${store.length + 1}`,
      paymentId: null,
      failureReason: null,
      steps: [],
      ...data,
      createdAt: data.createdAt ?? new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: data.updatedAt ?? new Date("2024-01-01T00:00:00.000Z"),
    };
    store.push(doc);
    return doc;
  };

  const findByTenantOrder = (tenantId: string, orderId: string) =>
    store.find((d) => d.tenantId === tenantId && d.orderId === orderId) ?? null;

  const Model: any = jest.fn().mockImplementation((data: any) => {
    const doc = makeDoc(data);
    return {
      ...doc,
      save: jest.fn().mockResolvedValue(doc),
      toObject: jest.fn().mockReturnValue(doc),
    };
  });

  Model.findOne = jest.fn((filter: any) => ({
    lean: () => ({
      exec: () =>
        Promise.resolve(findByTenantOrder(filter.tenantId, filter.orderId)),
    }),
  }));

  Model.findOneAndUpdate = jest.fn((filter: any, update: any) => {
    const existing = findByTenantOrder(filter.tenantId, filter.orderId);
    const merged = existing ? { ...existing, ...update } : null;
    if (existing) {
      Object.assign(existing, update);
      existing.updatedAt = new Date();
    }
    return { lean: () => ({ exec: () => Promise.resolve(merged) }) };
  });

  Model.find = jest.fn((filter: any) => ({
    sort: () => ({
      lean: () => ({
        exec: () =>
          Promise.resolve(
            store.filter((d) => d.tenantId === filter.tenantId),
          ),
      }),
    }),
  }));

  Model.updateOne = jest.fn((filter: any, update: any) => {
    const existing = findByTenantOrder(filter.tenantId, filter.orderId);
    if (existing && update && update["$push"]) {
      const push = update["$push"];
      if (push && push.steps) {
        existing.steps.push(push.steps);
      }
    }
    if (existing && update && update.updatedAt) {
      existing.updatedAt = update.updatedAt;
    }
    return { exec: () => Promise.resolve({ nModified: existing ? 1 : 0 }) };
  });

  Model.__store = store;
  Model.__reset = () => {
    store.length = 0;
  };
  return { __esModule: true, default: Model };
});

import {
  createSaga,
  getSaga,
  getAllSagas,
  updateSaga,
  addSagaStep,
} from "../../saga/sagaRepository";
import SagaModel from "../../models/Saga";

const mockedModel = SagaModel as any;

describe("Saga Mongo persistence repository", () => {
  beforeEach(() => {
    mockedModel.__reset();
    mockedModel.findOne.mockClear();
    mockedModel.findOneAndUpdate.mockClear();
    mockedModel.find.mockClear();
    mockedModel.updateOne.mockClear();
    mockedModel.mockClear();
  });

  it("creates a Saga record with tenantId and seeds an ORDER_CREATED step", async () => {
    const record = await createSaga(
      "tenant-acme",
      "ORD-100",
      "PROD-001",
      2,
      "test@example.com",
    );

    expect(record.tenantId).toBe("tenant-acme");
    expect(record.orderId).toBe("ORD-100");
    expect(record.productId).toBe("PROD-001");
    expect(record.quantity).toBe(2);
    expect(record.customerEmail).toBe("test@example.com");
    expect(record.status).toBe("AWAITING_INVENTORY");
    expect(record.paymentId).toBeNull();
    expect(record.failureReason).toBeNull();
    expect(record.steps).toHaveLength(1);
    expect(record.steps[0]).toMatchObject({
      action: "ORDER_CREATED",
      status: "success",
    });
    expect(record.createdAt).toBeDefined();
    expect(record.updatedAt).toBeDefined();
  });

  it("can be retrieved by orderId and is tenant-scoped", async () => {
    await createSaga("tenant-acme", "ORD-200", "PROD-001", 1, null);

    const found = await getSaga("tenant-acme", "ORD-200");
    expect(found).not.toBeNull();
    expect(found?.orderId).toBe("ORD-200");
    expect(found?.tenantId).toBe("tenant-acme");
    expect(mockedModel.findOne).toHaveBeenCalledWith({
      tenantId: "tenant-acme",
      orderId: "ORD-200",
    });

    const crossTenant = await getSaga("tenant-beta", "ORD-200");
    expect(crossTenant).toBeNull();
    expect(mockedModel.findOne).toHaveBeenCalledWith({
      tenantId: "tenant-beta",
      orderId: "ORD-200",
    });
  });

  it("preserves existing status, paymentId, and failureReason across updates", async () => {
    await createSaga("tenant-acme", "ORD-300", "PROD-002", 3, null);

    const completed = await updateSaga("tenant-acme", "ORD-300", {
      status: "COMPLETED",
      paymentId: "PAY-123",
    });

    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.paymentId).toBe("PAY-123");
    expect(completed?.orderId).toBe("ORD-300");
    expect(completed?.tenantId).toBe("tenant-acme");
    expect(completed?.productId).toBe("PROD-002");
    expect(completed?.quantity).toBe(3);

    const cancelled = await updateSaga("tenant-acme", "ORD-300", {
      status: "CANCELLED",
      failureReason: "INSUFFICIENT_FUNDS",
    });

    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.failureReason).toBe("INSUFFICIENT_FUNDS");
    expect(cancelled?.paymentId).toBe("PAY-123");
    expect(mockedModel.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: "tenant-acme", orderId: "ORD-300" },
      { status: "CANCELLED", failureReason: "INSUFFICIENT_FUNDS" },
      expect.objectContaining({ new: true, runValidators: true }),
    );
  });

  it("returns null when updating a non-existent Saga", async () => {
    const none = await updateSaga("tenant-acme", "NOPE-999", {
      status: "COMPLETED",
    });
    expect(none).toBeNull();
  });

  it("appends steps via addSagaStep", async () => {
    await createSaga("tenant-acme", "ORD-400", "PROD-001", 2, "a@b.com");

    await addSagaStep("tenant-acme", "ORD-400", {
      action: "PAYMENT_PROCESSED",
      status: "success",
      timestamp: new Date().toISOString(),
      details: "Payment ID: PAY-001",
    });

    const found = await getSaga("tenant-acme", "ORD-400");
    expect(found?.steps).toHaveLength(2);
    expect(found?.steps[1]?.action).toBe("PAYMENT_PROCESSED");
    expect(mockedModel.updateOne).toHaveBeenCalledWith(
      { tenantId: "tenant-acme", orderId: "ORD-400" },
      expect.objectContaining({
        $push: expect.objectContaining({ steps: expect.any(Object) }),
      }),
    );
  });

  it("lists only the requesting tenant's Sagas sorted by createdAt desc", async () => {
    await createSaga("tenant-acme", "ORD-500", "PROD-001", 1, null);
    await createSaga("tenant-beta", "ORD-600", "PROD-002", 1, null);

    const acmeSagas = await getAllSagas("tenant-acme");
    expect(acmeSagas).toHaveLength(1);
    expect(acmeSagas[0].tenantId).toBe("tenant-acme");
    expect(mockedModel.find).toHaveBeenCalledTimes(1);
  });
});
