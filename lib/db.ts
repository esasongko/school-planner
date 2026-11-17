import { Pool, types } from "pg";

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoid timezone shifts).
types.setTypeParser(1082, (v: string) => v);

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export function getPool(): Pool {
  if (!globalForPg.pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForPg.pgPool = new Pool({ connectionString, max: 5 });
  }
  return globalForPg.pgPool;
}
