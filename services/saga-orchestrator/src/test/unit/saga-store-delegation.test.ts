jest.mock("../../saga/sagaRepository", () => ({
  __esModule: true,
  createSaga: jest.fn(),
  getSaga: jest.fn(),
  getAllSagas: jest.fn(),
  updateSaga: jest.fn(),
  addSagaStep: jest.fn(),
}));

import {
  createSaga,
  getSaga,
  getAllSagas,
  updateSaga,
  addSagaStep,
} from "../../saga/store";
import {
  createSaga as repoCreateSaga,
  getSaga as repoGetSaga,
  getAllSagas as repoGetAllSagas,
  updateSaga as repoUpdateSaga,
  addSagaStep as repoAddSagaStep,
} from "../../saga/sagaRepository";

const mockedCreate = repoCreateSaga as jest.MockedFunction<
  typeof repoCreateSaga
>;
const mockedGet = repoGetSaga as jest.MockedFunction<typeof repoGetSaga>;
const mockedGetAll = repoGetAllSagas as jest.MockedFunction<
  typeof repoGetAllSagas
>;
const mockedUpdate = repoUpdateSaga as jest.MockedFunction<
  typeof repoUpdateSaga
>;
const mockedAddStep = repoAddSagaStep as jest.MockedFunction<
  typeof repoAddSagaStep
>;

describe("Saga store facade delegates to MongoDB repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createSaga delegates to the repository (default tenant placeholder)", async () => {
    mockedCreate.mockResolvedValue({ orderId: "ORD-1" } as any);
    await createSaga("ORD-1", "PROD-1", 2, "test@example.com");
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledWith(
      "",
      "ORD-1",
      "PROD-1",
      2,
      "test@example.com",
    );
  });

  it("createSaga forwards an explicit tenantId to the repository", async () => {
    mockedCreate.mockResolvedValue({ orderId: "ORD-1", tenantId: "tenant-acme" } as any);
    await createSaga("ORD-1", "PROD-1", 2, "test@example.com", "tenant-acme");
    expect(mockedCreate).toHaveBeenCalledWith(
      "tenant-acme",
      "ORD-1",
      "PROD-1",
      2,
      "test@example.com",
    );
  });

  it("getSaga delegates to the repository by orderId", async () => {
    mockedGet.mockResolvedValue({ orderId: "ORD-1" } as any);
    const saga = await getSaga("ORD-1");
    expect(saga?.orderId).toBe("ORD-1");
    expect(mockedGet).toHaveBeenCalledWith("", "ORD-1");
  });

  it("getSaga forwards an explicit tenantId", async () => {
    mockedGet.mockResolvedValue(null);
    await getSaga("ORD-1", "tenant-acme");
    expect(mockedGet).toHaveBeenCalledWith("tenant-acme", "ORD-1");
  });

  it("getAllSagas delegates to the repository", async () => {
    mockedGetAll.mockResolvedValue([] as any);
    await getAllSagas();
    expect(mockedGetAll).toHaveBeenCalledWith("");
  });

  it("updateSaga delegates updates to the repository", async () => {
    mockedUpdate.mockResolvedValue({ orderId: "ORD-1", status: "CANCELLED" } as any);
    const result = await updateSaga("ORD-1", { status: "CANCELLED" });
    expect(result?.status).toBe("CANCELLED");
    expect(mockedUpdate).toHaveBeenCalledWith("", "ORD-1", {
      status: "CANCELLED",
    });
  });

  it("updateSaga forwards an explicit tenantId and update payload", async () => {
    mockedUpdate.mockResolvedValue({ paymentId: "PAY-1" } as any);
    await updateSaga("ORD-1", { status: "COMPLETED", paymentId: "PAY-1" }, "tenant-acme");
    expect(mockedUpdate).toHaveBeenCalledWith("tenant-acme", "ORD-1", {
      status: "COMPLETED",
      paymentId: "PAY-1",
    });
  });

  it("addSagaStep delegates step recording to the repository", async () => {
    mockedAddStep.mockResolvedValue(undefined);
    const step = {
      action: "PAYMENT_PROCESSED",
      status: "success" as const,
      timestamp: new Date().toISOString(),
      details: "Payment ID: PAY-001",
    };
    await addSagaStep("ORD-1", step);
    expect(mockedAddStep).toHaveBeenCalledWith("", "ORD-1", step);
  });
});
