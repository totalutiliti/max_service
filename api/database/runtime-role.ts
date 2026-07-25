import { Pool } from "pg";

const runtimeRoleName = "max_service_app";
const runtimeRoleLockName = "max-service-runtime-role-bootstrap-v1";

export function validateRuntimeDatabasePassword(value: string | undefined) {
  if (!value || value.length < 32) {
    throw new Error("RUNTIME_DATABASE_PASSWORD deve ter ao menos 32 caracteres.");
  }
  return value;
}

export async function ensureRuntimeDatabaseRole(options: {
  connectionString?: string;
  password?: string;
} = {}) {
  const connectionString = options.connectionString ?? process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL não configurada.");
  const password = validateRuntimeDatabasePassword(
    options.password ?? process.env.RUNTIME_DATABASE_PASSWORD,
  );
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SET lock_timeout TO '30s'");
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [runtimeRoleLockName]);
    locked = true;
    const passwordLiteral = await client.query<{ literal: string }>(
      "SELECT quote_literal($1::text) AS literal",
      [password],
    );
    const literal = passwordLiteral.rows[0]?.literal;
    if (!literal) throw new Error("Não foi possível preparar a credencial da role de runtime.");
    const exists = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
      [runtimeRoleName],
    );
    await client.query(
      exists.rows[0]?.exists
        ? `ALTER ROLE ${runtimeRoleName} LOGIN PASSWORD ${literal}`
        : `CREATE ROLE ${runtimeRoleName} LOGIN PASSWORD ${literal}`,
    );
    await client.query(
      `ALTER ROLE ${runtimeRoleName} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    const databaseGrant = await client.query<{ statement: string }>(
      `SELECT format('GRANT CONNECT ON DATABASE %I TO ${runtimeRoleName}', current_database()) AS statement`,
    );
    const statement = databaseGrant.rows[0]?.statement;
    if (!statement) throw new Error("Não foi possível preparar o acesso da role ao banco.");
    await client.query(statement);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${runtimeRoleName}`);
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [runtimeRoleLockName])
        .catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}
