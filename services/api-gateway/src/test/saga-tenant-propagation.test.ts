import axios from "axios";
import express, { Express } from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import { sagaProxy } from "../routes/sagas";

jest.mock("axios");

const JWT_SECRET =
  process.env.JWT_SECRET || "stocksync-dev-secret-change-in-production";

const mockedAxios = axios as jest.Mocked<typeof axios>;

function createToken(tenantId: string, role = "USER"): string {
  return jwt.sign(
    {
      userId: "user-1",
      email: "test@acme.stocksync",
      tenantId,
      role,
    },
    JWT_SECRET,
    { expiresIn: "24h" },
  );
}

function getHeaders(call: unknown[]): Record<string, string> {
  // GET: axios.get(url, config) -> config at [1]
  const config = (call[1] as { headers?: Record<string, string> }) ?? {};
  return config?.headers ?? {};
}

describe("Gateway Tenant Propagation for GET /sagas (0C.3b)", () => {
  let app: Express;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/sagas", sagaProxy);
    request = supertest(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { count: 0, sagas: [] },
    });
  });

  it("forwards the JWT tenantId and ignores a client-supplied X-Tenant-Id", async () => {
    // JWT tenant = tenant-acme; client header = tenant-beta
    const token = createToken("tenant-acme");
    await request
      .get("/sagas")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Id", "tenant-beta");

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    const headers = getHeaders(mockedAxios.get.mock.calls[0]);
    expect(headers["X-Tenant-Id"]).toBe("tenant-acme");
    expect(headers["X-Tenant-Id"]).not.toBe("tenant-beta");
  });
});

describe("Gateway Tenant Propagation for GET /sagas/:orderId (0C.3d)", () => {
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use("/sagas", sagaProxy);
    request = supertest(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { orderId: "ORD-123", status: "COMPLETED" },
    });
  });

  it("forwards the JWT tenantId and ignores a client-supplied X-Tenant-Id", async () => {
    const token = createToken("tenant-acme");
    await request
      .get("/sagas/ORD-123")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Id", "tenant-beta");

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    const headers = getHeaders(mockedAxios.get.mock.calls[0]);
    expect(headers["X-Tenant-Id"]).toBe("tenant-acme");
    expect(headers["X-Tenant-Id"]).not.toBe("tenant-beta");
  });
});
