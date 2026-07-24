import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Pool } = pg;

const sourceDatabaseUrl = process.env.RESTORE_DATABASE_URL
  ?? process.env.TEST_DATABASE_URL
  ?? "postgresql://max_service_admin:max_service_admin_local@127.0.0.1:54329/max_service";
const runtimeDatabaseUrl = process.env.RESTORE_RUNTIME_DATABASE_URL
  ?? "postgresql://max_service_app:max_service_runtime_local@127.0.0.1:54329/max_service";
const databaseService = process.env.RESTORE_DATABASE_SERVICE ?? "database";
const sourceUrl = new URL(sourceDatabaseUrl);
const sourceDatabase = sourceUrl.pathname.replace(/^\//, "");
const adminUser = decodeURIComponent(sourceUrl.username);
const drillDatabase = `max_service_restore_${Date.now().toString(36)}_${process.pid}`;
const dumpPath = `/tmp/${drillDatabase}.dump`;

assert.match(sourceDatabase, /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/, "Nome do banco de origem inválido.");
assert.match(adminUser, /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/, "Usuário administrativo inválido.");
assert.match(drillDatabase, /^[a-z][a-z0-9_]{0,62}$/, "Nome do banco temporário inválido.");

function dockerDatabase(...args) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", databaseService, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "sem diagnóstico").trim();
    throw new Error(`Falha no ensaio de recuperação (${args[0]}): ${detail}`);
  }
  return result.stdout.trim();
}

function databaseUrlFor(baseUrl, databaseName) {
  const target = new URL(baseUrl);
  target.pathname = `/${databaseName}`;
  return target.toString();
}

async function snapshot(pool) {
  const [migrations, counts, security] = await Promise.all([
    pool.query("SELECT name FROM schema_migrations ORDER BY name"),
    pool.query(`
      SELECT 'users' AS resource, count(*)::int AS count FROM users
      UNION ALL
      SELECT 'service_categories', count(*)::int FROM service_categories
      UNION ALL
      SELECT 'service_requests', count(*)::int FROM service_requests
      UNION ALL
      SELECT 'proposals', count(*)::int FROM proposals
      UNION ALL
      SELECT 'bookings', count(*)::int FROM bookings
      UNION ALL
      SELECT 'partner_support_disputes', count(*)::int FROM partner_support_disputes
      UNION ALL
      SELECT 'partner_support_dispute_events', count(*)::int FROM partner_support_dispute_events
      UNION ALL
      SELECT 'operation_readiness_gates', count(*)::int FROM operation_readiness_gates
      UNION ALL
      SELECT 'operation_readiness_gate_events', count(*)::int FROM operation_readiness_gate_events
      ORDER BY resource
    `),
    pool.query(`
      SELECT
        count(*) FILTER (WHERE relrowsecurity)::int AS "rlsEnabled",
        count(*) FILTER (WHERE relforcerowsecurity)::int AS "rlsForced",
        (
          SELECT count(*)::int
          FROM pg_policies
          WHERE schemaname = 'public'
        ) AS policies,
        (
          SELECT count(*)::int
          FROM pg_constraint
          WHERE contype = 'x'
            AND conrelid IN ('bookings'::regclass, 'provider_schedule_blocks'::regclass)
        ) AS "scheduleExclusions"
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
    `),
  ]);
  return {
    migrations: migrations.rows.map((row) => row.name),
    counts: Object.fromEntries(counts.rows.map((row) => [row.resource, row.count])),
    security: security.rows[0],
  };
}

async function verifyRuntimeIsolation(restoredUrl) {
  const pool = new Pool({ connectionString: restoredUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const withoutContext = await client.query(
      "SELECT count(*)::int AS count FROM operation_readiness_gates",
    );
    assert.equal(withoutContext.rows[0].count, 0, "RLS deve falhar fechado sem contexto.");

    await client.query(
      "SELECT set_config('app.actor_id', $1, true), set_config('app.actor_role', 'customer', true)",
      ["00000000-0000-4000-8000-000000000101"],
    );
    const customerView = await client.query(
      "SELECT count(*)::int AS count FROM operation_readiness_gates",
    );
    assert.equal(customerView.rows[0].count, 0, "Cliente não pode enxergar gates restaurados.");

    await client.query(
      "SELECT set_config('app.actor_id', $1, true), set_config('app.actor_role', 'operation', true)",
      ["00000000-0000-4000-8000-000000000401"],
    );
    const operationView = await client.query(
      "SELECT count(*)::int AS count FROM operation_readiness_gates",
    );
    assert.equal(operationView.rows[0].count, 8, "Operação deve enxergar os oito gates restaurados.");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

let restoredAdminPool;
let drillPassed = false;
try {
  const sourcePool = new Pool({ connectionString: sourceDatabaseUrl, max: 2 });
  let sourceSnapshot;
  try {
    sourceSnapshot = await snapshot(sourcePool);
  } finally {
    await sourcePool.end();
  }

  dockerDatabase(
    "pg_dump",
    "--username", adminUser,
    "--format=custom",
    "--no-owner",
    "--file", dumpPath,
    sourceDatabase,
  );
  const dumpBytes = Number(dockerDatabase("stat", "-c", "%s", dumpPath));
  assert.ok(Number.isFinite(dumpBytes) && dumpBytes > 4096, "O backup gerado está vazio ou incompleto.");

  dockerDatabase(
    "createdb",
    "--username", adminUser,
    "--owner", adminUser,
    "--template", "template0",
    drillDatabase,
  );
  dockerDatabase(
    "pg_restore",
    "--username", adminUser,
    "--dbname", drillDatabase,
    "--no-owner",
    "--exit-on-error",
    dumpPath,
  );
  dockerDatabase(
    "psql",
    "--username", adminUser,
    "--dbname", "postgres",
    "--set", "ON_ERROR_STOP=1",
    "--command", `GRANT CONNECT ON DATABASE ${drillDatabase} TO max_service_app`,
  );

  restoredAdminPool = new Pool({
    connectionString: databaseUrlFor(sourceDatabaseUrl, drillDatabase),
    max: 2,
  });
  const restoredSnapshot = await snapshot(restoredAdminPool);
  assert.deepEqual(restoredSnapshot.migrations, sourceSnapshot.migrations, "A lista de migrations divergiu.");
  assert.deepEqual(restoredSnapshot.counts, sourceSnapshot.counts, "As contagens críticas divergiram.");
  assert.deepEqual(restoredSnapshot.security, sourceSnapshot.security, "As proteções estruturais divergiram.");
  assert.equal(restoredSnapshot.counts.operation_readiness_gates, 8);
  assert.equal(restoredSnapshot.security.scheduleExclusions, 2);
  assert.equal(restoredSnapshot.security.rlsEnabled, restoredSnapshot.security.rlsForced);

  await restoredAdminPool.end();
  restoredAdminPool = undefined;
  await verifyRuntimeIsolation(databaseUrlFor(runtimeDatabaseUrl, drillDatabase));

  console.log(JSON.stringify({
    status: "passed",
    sourceDatabase,
    temporaryDatabase: drillDatabase,
    dumpBytes,
    migrations: sourceSnapshot.migrations.length,
    protectedTables: sourceSnapshot.security.rlsForced,
    policies: sourceSnapshot.security.policies,
    criticalCounts: sourceSnapshot.counts,
  }, null, 2));
  drillPassed = true;
} finally {
  let cleanupError;
  if (restoredAdminPool) await restoredAdminPool.end().catch(() => undefined);
  try {
    dockerDatabase(
      "dropdb",
      "--username", adminUser,
      "--if-exists",
      "--force",
      drillDatabase,
    );
  } catch (error) {
    cleanupError = error;
    console.error(error instanceof Error ? error.message : error);
  }
  try {
    dockerDatabase("rm", "-f", dumpPath);
  } catch (error) {
    cleanupError ??= error;
    console.error(error instanceof Error ? error.message : error);
  }
  if (cleanupError && drillPassed) throw cleanupError;
}
