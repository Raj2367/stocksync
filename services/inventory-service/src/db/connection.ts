import { Pool, PoolClient } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://stocksync:stocksync@localhost:5432/inventory";

export const pool = new Pool({
  connectionString: DATABASE_URL,
});

export async function connectDB(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT NOW()");
    console.log("PostgreSQL connected at:", result.rows[0].now);
  } finally {
    client.release();
  }
}

export async function disconnectDB(): Promise<void> {
  await pool.end();
  console.log("🔌 PostgreSQL disconnected");
}

export async function query(text: string, params?: any[]): Promise<any> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log("Executed query", {
    text: text.substring(0, 50),
    duration,
    rows: result.rowCount,
  });
  return result;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}
