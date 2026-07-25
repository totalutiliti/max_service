import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

const migrationNamePattern = /^(\d{4})_[a-z0-9_]+\.sql$/;
const migrationLockName = "max-service-schema-migrations-v1";

export interface MigrationDescriptor {
  name: string;
  checksum: string;
  sql: string;
}

export interface AppliedMigration {
  name: string;
  checksum: string | null;
}

export interface MigrationState {
  pending: MigrationDescriptor[];
  backfill: MigrationDescriptor[];
}

export function checksumMigrationSql(sql: string) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export function validateMigrationNames(names: string[]) {
  const sorted = [...names].sort();
  const duplicates = sorted.filter((name, index) => index > 0 && name === sorted[index - 1]);
  if (duplicates.length > 0) {
    throw new Error(`Migration duplicada: ${duplicates[0]}.`);
  }
  sorted.forEach((name, index) => {
    const match = migrationNamePattern.exec(name);
    if (!match) {
      throw new Error(`Nome de migration inválido: ${name}.`);
    }
    const expectedNumber = index + 1;
    const actualNumber = Number(match[1]);
    if (actualNumber !== expectedNumber) {
      throw new Error(
        `Sequência de migrations inválida: esperado ${String(expectedNumber).padStart(4, "0")}, recebido ${match[1]}.`,
      );
    }
  });
  return sorted;
}

export function inspectMigrationState(
  expected: MigrationDescriptor[],
  applied: AppliedMigration[],
): MigrationState {
  const expectedByName = new Map(expected.map((migration) => [migration.name, migration]));
  const appliedByName = new Map(applied.map((migration) => [migration.name, migration]));
  const unknown = applied.filter((migration) => !expectedByName.has(migration.name));
  if (unknown.length > 0) {
    throw new Error(`Migration aplicada não existe no código: ${unknown[0].name}.`);
  }

  let pendingFound = false;
  const pending: MigrationDescriptor[] = [];
  const backfill: MigrationDescriptor[] = [];
  for (const migration of expected) {
    const record = appliedByName.get(migration.name);
    if (!record) {
      pendingFound = true;
      pending.push(migration);
      continue;
    }
    if (pendingFound) {
      throw new Error(`Migration aplicada fora de ordem: ${migration.name}.`);
    }
    if (record.checksum && record.checksum !== migration.checksum) {
      throw new Error(`Checksum divergente para migration imutável: ${migration.name}.`);
    }
    if (!record.checksum) backfill.push(migration);
  }
  return { pending, backfill };
}

async function loadMigrations(migrationsDirectory: string) {
  const names = validateMigrationNames(
    (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")),
  );
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(migrationsDirectory, name), "utf8");
    return {
      name,
      sql,
      checksum: checksumMigrationSql(sql),
    } satisfies MigrationDescriptor;
  }));
}

export async function runMigrations(options: {
  connectionString?: string;
  migrationsDirectory?: string;
} = {}) {
  const connectionString = options.connectionString ?? process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL não configurada.");

  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SET lock_timeout TO '30s'");
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [migrationLockName]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");

    const migrationsDirectory = options.migrationsDirectory
      ?? join(process.cwd(), "api", "migrations");
    const migrations = await loadMigrations(migrationsDirectory);
    const applied = await client.query<AppliedMigration>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    const state = inspectMigrationState(migrations, applied.rows);

    for (const migration of state.backfill) {
      await client.query(
        "UPDATE schema_migrations SET checksum = $2 WHERE name = $1 AND checksum IS NULL",
        [migration.name, migration.checksum],
      );
    }
    await client.query("ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL");

    for (const migration of state.pending) {
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return {
      total: migrations.length,
      applied: state.pending.length,
      backfilled: state.backfill.length,
    };
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [migrationLockName])
        .catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}
