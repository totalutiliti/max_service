import assert from "node:assert/strict";
import { appendFile, cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { runMigrations } from "../.api-dist/api/database/migrations.js";

const { Pool } = pg;
const sourceDatabaseUrl = process.env.MIGRATION_DRY_RUN_DATABASE_URL
  ?? process.env.TEST_DATABASE_URL
  ?? "postgresql://max_service_admin:max_service_admin_local@127.0.0.1:54329/max_service";
const sourceUrl = new URL(sourceDatabaseUrl);
const adminUser = decodeURIComponent(sourceUrl.username);
const temporaryDatabase = `max_service_migration_${Date.now().toString(36)}_${process.pid}`;
const migrationsDirectory = join(process.cwd(), "api", "migrations");
const scratchDirectory = await mkdtemp(join(tmpdir(), "max-service-migrations-"));
const driftDirectory = join(scratchDirectory, "drift");

assert.match(adminUser, /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/, "Usuário administrativo inválido.");
assert.match(
  temporaryDatabase,
  /^[a-z][a-z0-9_]{0,62}$/,
  "Nome do banco temporário inválido.",
);

function databaseUrlFor(databaseName) {
  const target = new URL(sourceDatabaseUrl);
  target.pathname = `/${databaseName}`;
  return target.toString();
}

const administrationUrl = databaseUrlFor("postgres");
const temporaryDatabaseUrl = databaseUrlFor(temporaryDatabase);
const administrationPool = new Pool({ connectionString: administrationUrl, max: 1 });
let validationPool;
let databaseCreated = false;

try {
  await administrationPool.query(
    `CREATE DATABASE "${temporaryDatabase}" OWNER "${adminUser}" TEMPLATE template0`,
  );
  databaseCreated = true;

  const concurrentRuns = await Promise.all([
    runMigrations({
      connectionString: temporaryDatabaseUrl,
      migrationsDirectory,
    }),
    runMigrations({
      connectionString: temporaryDatabaseUrl,
      migrationsDirectory,
    }),
  ]);
  const appliedByRun = concurrentRuns.map((run) => run.applied).sort((a, b) => a - b);
  const expectedFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.deepEqual(
    appliedByRun,
    [0, expectedFiles.length],
    "Execuções concorrentes devem aplicar cada migration uma única vez.",
  );

  const idempotentRun = await runMigrations({
    connectionString: temporaryDatabaseUrl,
    migrationsDirectory,
  });
  assert.equal(idempotentRun.applied, 0, "A segunda passagem serial deve ser idempotente.");
  assert.equal(idempotentRun.backfilled, 0, "Banco novo não deve exigir backfill.");

  validationPool = new Pool({ connectionString: temporaryDatabaseUrl, max: 1 });
  const [history, security] = await Promise.all([
    validationPool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (
          WHERE checksum ~ '^[0-9a-f]{64}$'
        )::int AS "checksummed"
      FROM schema_migrations
    `),
    validationPool.query(`
      SELECT
        count(*) FILTER (WHERE relrowsecurity)::int AS "rlsEnabled",
        count(*) FILTER (WHERE relforcerowsecurity)::int AS "rlsForced",
        (
          SELECT count(*)::int
          FROM pg_policies
          WHERE schemaname = 'public'
        ) AS policies
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
    `),
  ]);
  assert.equal(history.rows[0].total, expectedFiles.length);
  assert.equal(history.rows[0].checksummed, expectedFiles.length);
  assert.ok(security.rows[0].rlsForced > 0, "O esquema ensaiado deve possuir RLS forçado.");
  assert.equal(security.rows[0].rlsEnabled, security.rows[0].rlsForced);

  await cp(migrationsDirectory, driftDirectory, { recursive: true });
  const lastMigration = expectedFiles.at(-1);
  assert.ok(lastMigration, "Ao menos uma migration deve existir.");
  await appendFile(
    join(driftDirectory, lastMigration),
    "\n-- alteração sintética que deve ser recusada\n",
    "utf8",
  );
  await assert.rejects(
    runMigrations({
      connectionString: temporaryDatabaseUrl,
      migrationsDirectory: driftDirectory,
    }),
    /Checksum divergente para migration imutável/,
  );

  console.log(JSON.stringify({
    status: "passed",
    temporaryDatabase,
    migrations: history.rows[0].total,
    checksummedMigrations: history.rows[0].checksummed,
    concurrentSerialization: true,
    idempotentReplay: true,
    driftRejected: true,
    protectedTables: security.rows[0].rlsForced,
    policies: security.rows[0].policies,
  }, null, 2));
} finally {
  let cleanupError;
  if (validationPool) await validationPool.end().catch(() => undefined);
  if (databaseCreated) {
    await administrationPool.query(`DROP DATABASE IF EXISTS "${temporaryDatabase}" WITH (FORCE)`)
      .catch((error) => {
        console.error("Falha ao remover o banco temporário de migrations.");
        cleanupError = error;
      });
  }
  await administrationPool.end().catch(() => undefined);
  await rm(scratchDirectory, { recursive: true, force: true }).catch(() => undefined);
  if (cleanupError) throw cleanupError;
}
