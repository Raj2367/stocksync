import { createClient, RedisClientType } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let client: RedisClientType;

export async function connectRedis(): Promise<void> {
  client = createClient({ url: REDIS_URL });

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  await client.connect();
  console.log("✅ Redis connected");
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.disconnect();
    console.log("🔌 Redis disconnected");
  }
}

export function getRedisClient(): RedisClientType {
  if (!client) {
    throw new Error("Redis not connected");
  }
  return client;
}
