jest.mock("../../saga/store", () => ({
  __esModule: true,
  getSaga: jest.fn(),
}));

import { getSaga } from "../../saga/store";
import router from "../../routes/sagas";

const mockedGetSaga = getSaga as jest.MockedFunction<typeof getSaga>;

const acmeSaga: any = {
  orderId: "ORD-123",
  tenantId: "tenant-acme",
  status: "COMPLETED",
};

function mockReq(tenantId: string | undefined, orderId = "ORD-123") {
  const headers: Record<string, string> = tenantId
    ? { "x-tenant-id": tenantId }
    : {};
  return {
    method: "GET",
    url: `/${orderId}`,
    headers,
    header: (name: string) => headers[name.toLowerCase()],
    params: { orderId },
    query: {},
  } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("Saga route GET /sagas/:orderId tenant scoping (0C.3c)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows a tenant to retrieve its own saga", async () => {
    mockedGetSaga.mockResolvedValue(acmeSaga);
    const res = mockRes();
    (router as any).handle(mockReq("tenant-acme"), res, () => {});
    await flush();

    expect(mockedGetSaga).toHaveBeenCalledWith("ORD-123", "tenant-acme");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(acmeSaga);
  });

  it("returns 404 and does not leak existence when the saga belongs to another tenant", async () => {
    mockedGetSaga.mockResolvedValue(null);
    const res = mockRes();
    (router as any).handle(mockReq("tenant-beta"), res, () => {});
    await flush();

    expect(mockedGetSaga).toHaveBeenCalledWith("ORD-123", "tenant-beta");
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Saga not found" });
  });

  it("returns 400 and does not query the store when X-Tenant-Id is missing", async () => {
    mockedGetSaga.mockResolvedValue(null);
    const res = mockRes();
    (router as any).handle(mockReq(undefined), res, () => {});
    await flush();

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "X-Tenant-Id header is required" });
    expect(mockedGetSaga).not.toHaveBeenCalled();
  });
});
