jest.mock("axios");

import axios from "axios";
import express, { Express } from "express";
import supertest from "supertest";
import jwt from "jsonwebtoken";
import { orderProxy } from "../routes/orders";

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
  // POST: axios.post(url, data, config) -> config at [2]
  // GET:  axios.get(url, config)        -> config at [1]
  const config = (call[2] ?? call[1]) as { headers?: Record<string, string> };
  return config?.headers ?? {};
}

describe("Gateway Trusted Tenant Propagation (Task 0B.1a)", () => {
  let app: Express;
  let request: supertest.SuperTest<supertest.Test>;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/orders", orderProxy);
    request = supertest(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });
    mockedAxios.get.mockResolvedValue({ status: 200, data: { ok: true } });
  });

  it("should set X-Tenant-Id from verified JWT tenantId on POST /orders", async () => {
    const token = createToken("tenant-acme");
    await request
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: "PROD-001", quantity: 1 });

    const headers = getHeaders(mockedAxios.post.mock.calls[0]);
    expect(headers["X-Tenant-Id"]).toBe("tenant-acme");
  });

  it("should overwrite client-supplied X-Tenant-Id with JWT tenantId on POST /orders", async () => {
    const token = createToken("tenant-acme");
    await request
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Id", "tenant-beta")
      .send({ productId: "PROD-001", quantity: 1 });

    const headers = getHeaders(mockedAxios.post.mock.calls[0]);
    expect(headers["X-Tenant-Id"]).toBe("tenant-acme");
    expect(headers["X-Tenant-Id"]).not.toBe("tenant-beta");
  });

  it("should set X-Tenant-Id from verified JWT tenantId on GET /orders/:orderId", async () => {
    const token = createToken("tenant-beta");
    await request
      .get("/orders/ORD-123")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Id", "tenant-acme");

    const headers = getHeaders(mockedAxios.get.mock.calls[0]);
    expect(headers["X-Tenant-Id"]).toBe("tenant-beta");
  });

  it("should set X-Tenant-Id from verified JWT tenantId on GET /orders", async () => {
    const token = createToken("tenant-acme");
    await request
      .get("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("X-Tenant-Id", "tenant-beta");

    const headers = getHeaders(mockedAxios.get.mock.calls[0]);
    expect(headers["X-Tenant-Id"]).toBe("tenant-acme");
  });
});
