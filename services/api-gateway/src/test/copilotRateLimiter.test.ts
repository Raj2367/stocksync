import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth";
import { copilotRateLimiter } from "../middleware/copilotRateLimiter";

jest.mock("../db/redis", () => ({
  getRedisClient: jest.fn(),
}));

import { getRedisClient } from "../db/redis";

const mockGetRedisClient = getRedisClient as jest.MockedFunction<typeof getRedisClient>;

interface MockRedis {
  incrCalls: string[];
  expireCalls: Array<[string, number]>;
  ttlCalls: string[];
  incrReturn: number;
  expireReturn: "OK";
  ttlReturn: number;
  shouldError: boolean;
}

function createMockRedis(overrides: Partial<MockRedis> = {}): MockRedis {
  const calls: MockRedis = {
    incrCalls: [],
    expireCalls: [],
    ttlCalls: [],
    incrReturn: 1,
    expireReturn: "OK",
    ttlReturn: 60,
    shouldError: false,
    ...overrides,
  };

  mockGetRedisClient.mockReturnValue({
    incr: async (key: string) => {
      if (calls.shouldError) throw new Error("Redis connection failed");
      calls.incrCalls.push(key);
      return calls.incrReturn;
    },
    expire: async (key: string, seconds: number) => {
      if (calls.shouldError) throw new Error("Redis connection failed");
      calls.expireCalls.push([key, seconds]);
      return calls.expireReturn;
    },
    ttl: async (key: string) => {
      if (calls.shouldError) throw new Error("Redis connection failed");
      calls.ttlCalls.push(key);
      return calls.ttlReturn;
    },
  } as any);

  return calls;
}

function createMockReq(tenantId: string = "tenant-acme"): AuthRequest {
  return {
    user: {
      userId: "u1",
      tenantId,
      role: "USER",
      email: "user@example.com",
    },
  } as unknown as AuthRequest;
}

function createMockRes(): Response {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe("copilotRateLimiter", () => {
  let mockRedis: MockRedis;
  let mockReq: AuthRequest;
  let mockRes: Response;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = createMockRedis();
    mockReq = createMockReq();
    mockRes = createMockRes();
    mockNext = jest.fn() as NextFunction;
  });

  it("uses key copilot_rate_limit:tenant-acme for tenant-acme", async () => {
    mockRedis.incrReturn = 1;

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRedis.incrCalls).toEqual(["copilot_rate_limit:tenant-acme"]);
  });

  it("calls next() for requests 1 through 10", async () => {
    for (let i = 1; i <= 10; i++) {
      mockRedis.incrReturn = i;
      await copilotRateLimiter(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    }
  });

  it("expire is called when incr returns 1", async () => {
    mockRedis.incrReturn = 1;

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRedis.expireCalls).toEqual([["copilot_rate_limit:tenant-acme", 60]]);
  });

  it("expire is NOT called on subsequent increments (current > 1)", async () => {
    mockRedis.incrReturn = 5;

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRedis.expireCalls).toEqual([]);
  });

  it("request 11 returns HTTP 429 with expected body", async () => {
    mockRedis.incrReturn = 11;
    mockRedis.ttlReturn = 30;

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Too many requests",
      message: "Rate limit exceeded. Try again in 30 seconds.",
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers", async () => {
    mockRedis.incrReturn = 1;
    mockRedis.ttlReturn = 55;

    const baseTime = new Date("2024-01-01T00:00:00Z").getTime();
    const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(baseTime);

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    dateNowSpy.mockRestore();

    expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 10);
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 9);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "X-RateLimit-Reset",
      "2024-01-01T00:00:55.000Z",
    );
  });

  it("two different tenantIds use different Redis keys", async () => {
    mockRedis.incrReturn = 1;

    const req1 = createMockReq("tenant-acme");
    await copilotRateLimiter(req1, mockRes, mockNext);

    const req2 = createMockReq("tenant-beta");
    await copilotRateLimiter(req2, mockRes, mockNext);

    expect(mockRedis.incrCalls).toEqual([
      "copilot_rate_limit:tenant-acme",
      "copilot_rate_limit:tenant-beta",
    ]);
  });

  it("Redis error is caught, logged, and next() is called", async () => {
    mockRedis.shouldError = true;

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Copilot rate limiter error:",
      expect.any(Error),
    );
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("all three Redis operations are called in correct order", async () => {
    mockRedis.incrReturn = 1;

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRedis.incrCalls).toEqual(["copilot_rate_limit:tenant-acme"]);
    expect(mockRedis.ttlCalls).toEqual(["copilot_rate_limit:tenant-acme"]);
    expect(mockNext).toHaveBeenCalled();
  });

  it("does not use IP for the rate limit key", async () => {
    mockRedis.incrReturn = 1;
    (mockReq as any).ip = "192.168.1.100";

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRedis.incrCalls).toEqual(["copilot_rate_limit:tenant-acme"]);
    expect(mockRedis.incrCalls[0]).not.toContain("192.168.1.100");
  });

  it("does not use request body tenantId", async () => {
    mockRedis.incrReturn = 1;
    (mockReq as any).body = { tenantId: "tenant-from-body" };

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRedis.incrCalls).toEqual(["copilot_rate_limit:tenant-acme"]);
  });

  it("X-RateLimit-Remaining does not go below 0", async () => {
    mockRedis.incrReturn = 15;
    mockRedis.ttlReturn = 30;

    await copilotRateLimiter(mockReq, mockRes, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 10);
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 0);
  });
});
