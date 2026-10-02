import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";
import { getRedisClient } from "../db/redis";

const windowSeconds = 60;
const maxRequests = 10;

export async function copilotRateLimiter(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const tenantId = req.user!.tenantId;
  const key = `copilot_rate_limit:${tenantId}`;

  try {
    const redis = getRedisClient();
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - current));
    res.setHeader(
      "X-RateLimit-Reset",
      new Date(Date.now() + ttl * 1000).toISOString(),
    );

    if (current > maxRequests) {
      res.status(429).json({
        error: "Too many requests",
        message: `Rate limit exceeded. Try again in ${ttl} seconds.`,
      });
      return;
    }

    next();
  } catch (error) {
    console.error("Copilot rate limiter error:", error);
    next();
  }
}
