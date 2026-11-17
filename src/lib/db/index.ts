import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.SKETCHFRAME_DATA_DIR || "data");

/** Hosted (Turso) when TURSO_DATABASE_URL is set, otherwise a local SQLite file. */
export const REMOTE_DB = !!process.env.TURSO_DATABASE_URL;

function create() {
  if (process.env.VERCEL && !REMOTE_DB) {
    // Serverless disks are temporary: a local SQLite file would silently lose everything.
    throw new Error("TURSO_DATABASE_URL is not set — connect a Turso database to this Vercel project.");
  }
  const client = REMOTE_DB
    ? createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
    : (fs.mkdirSync(DATA_DIR, { recursive: true }), createClient({ url: `file:${path.join(DATA_DIR, "sketchframe.db")}` }));
  const db = drizzle(client, { schema });
  // Migrations run once per process, so a fresh deploy or `npm run dev` needs no setup step.
  const ready = (async () => {
    await client.execute("PRAGMA foreign_keys = ON");
    if (!REMOTE_DB) await client.execute("PRAGMA journal_mode = WAL");
    await migrate(db, { migrationsFolder: path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle") });
  })();
  return { db, ready };
}

// Survive dev-server HMR without opening a new connection on each reload.
const g = globalThis as unknown as { __sf_db?: ReturnType<typeof create> };
const instance = (g.__sf_db ??= create());

export async function getDb() {
  await instance.ready;
  return instance.db;
}

export { schema };
