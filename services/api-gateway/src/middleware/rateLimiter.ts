import { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../db/redis";

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = `rate_limit:${req.ip}`;
  const windowSeconds = 60;
  const maxRequests = 100;

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
    console.error("Rate limiter error:", error);
    next();
  }
}
