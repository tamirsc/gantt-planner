import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";

export type Db = PgDatabase<any, typeof schema>;

export interface DbHandle {
  db: Db;
  close(): Promise<void>;
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

/**
 * Open the database. With DATABASE_URL a real Postgres is used; otherwise an
 * embedded PGlite instance (in memory, or on disk when `pgliteDir` is given).
 */
export async function openDb(opts: { databaseUrl?: string | undefined; pgliteDir?: string | undefined } = {}): Promise<DbHandle> {
  if (opts.databaseUrl) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(opts.databaseUrl, { max: 10 });
    const db = drizzle(client, { schema }) as unknown as Db;
    await migrate(db);
    return { db, close: () => client.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = opts.pgliteDir ? new PGlite(opts.pgliteDir) : new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db);
  return { db, close: () => client.close() };
}

/** Minimal forward-only SQL migrator: applies migrations/*.sql in name order, once each. */
export async function migrate(db: Db): Promise<void> {
  await db.execute(sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  // postgres-js returns the rows array itself; PGlite returns { rows }. Accept both.
  const result = (await db.execute(sql`select name from _migrations`)) as unknown;
  const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as { name: string }[];
  const applied = new Set(rows.map((r) => String(r.name)));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    for (const statement of body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      await db.execute(sql.raw(statement));
    }
    await db.execute(sql`insert into _migrations (name) values (${file})`);
  }
}
