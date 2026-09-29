jest.mock("../../saga/store", () => ({
  __esModule: true,
  getAllSagas: jest.fn(),
  getSaga: jest.fn(),
}));

import { getAllSagas } from "../../saga/store";
import router from "../../routes/sagas";

const mockedGetAllSagas = getAllSagas as jest.MockedFunction<typeof getAllSagas>;

const acmeSagas: any[] = [{ orderId: "A1", status: "COMPLETED" }];
const betaSagas: any[] = [{ orderId: "B1", status: "AWAITING_PAYMENT" }];

function mockReq(tenantId?: string) {
  const headers: Record<string, string> = tenantId
    ? { "x-tenant-id": tenantId }
    : {};
  return {
    method: "GET",
    url: "/",
    headers,
    header: (name: string) => headers[name.toLowerCase()],
    params: {},
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

describe("Saga route GET /sagas tenant scoping", () => {
  beforeEach(() => {
    mockedGetAllSagas.mockReset();
    mockedGetAllSagas.mockResolvedValue([]);
  });

  it("returns only the requesting tenant's Sagas and calls getAllSagas with tenantId", async () => {
    mockedGetAllSagas.mockImplementation((tenantId?: string) =>
      Promise.resolve(
        tenantId === "tenant-acme"
          ? acmeSagas
          : tenantId === "tenant-beta"
          ? betaSagas
          : [],
      ),
    );

    const resA = mockRes();
    (router as any).handle(mockReq("tenant-acme"), resA, () => {});
    await flush();
    expect(mockedGetAllSagas).toHaveBeenCalledWith("tenant-acme");
    expect(resA.statusCode).toBe(200);
    expect(resA.body).toEqual({ count: acmeSagas.length, sagas: acmeSagas });

    const resB = mockRes();
    (router as any).handle(mockReq("tenant-beta"), resB, () => {});
    await flush();
    expect(mockedGetAllSagas).toHaveBeenCalledWith("tenant-beta");
    expect(resB.body).toEqual({ count: betaSagas.length, sagas: betaSagas });

    // Cross-tenant isolation: beta does not see acme's sagas
    expect(resB.body.sagas).not.toEqual(acmeSagas);
  });

  it("returns 400 and never queries the repository when X-Tenant-Id is missing", async () => {
    const res = mockRes();
    (router as any).handle(mockReq(), res, () => {});
    await flush();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "X-Tenant-Id header is required",
    });
    expect(mockedGetAllSagas).not.toHaveBeenCalled();
  });
});
