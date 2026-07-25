import { runMigrations } from "./migrations.js";
import { ensureRuntimeDatabaseRole } from "./runtime-role.js";

async function migrate() {
  await ensureRuntimeDatabaseRole();
  const result = await runMigrations();
  console.log(JSON.stringify({
    event: "database_migration_completed",
    total: result.total,
    applied: result.applied,
    backfilled: result.backfilled,
  }));
}

migrate().catch((error: unknown) => {
  console.error(JSON.stringify({
    event: "database_migration_failed",
    message: error instanceof Error ? error.message : "Falha desconhecida.",
  }));
  process.exitCode = 1;
});
