import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  max: process.env.VERCEL ? 1 : 10,
  // Supabase (db.*.supabase.co / *.pooler.supabase.com) presents a self-signed
  // chain, so verification must be relaxed. Neon (*.neon.tech) presents a valid
  // CA-signed cert, so we verify properly. Anything else (e.g. local) gets no SSL.
  ssl: connectionString?.includes("supabase.")
    ? { rejectUnauthorized: false }
    : connectionString?.includes("neon.tech")
      ? { rejectUnauthorized: true }
      : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
