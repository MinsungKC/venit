import "server-only";
import { Pool } from "pg";

/**
 * Lazily-created singleton pg pool. Returns null when DATABASE_URL is unset, which
 * signals callers to fall back to the static generated dataset (no-DB dev path).
 */
let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  return pool;
}
