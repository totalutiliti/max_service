import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import pg from "pg";

const { Pool } = pg;
const sourceDatabaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgresql://max_service_admin:max_service_admin_local@127.0.0.1:54329/max_service";
const sourceUrl = new URL(sourceDatabaseUrl);
const administrationUrl = new URL(sourceDatabaseUrl);
administrationUrl.pathname = "/postgres";
const temporaryDatabase = `max_service_identity_${Date.now().toString(36)}_${process.pid}`;
const testDatabaseUrl = new URL(sourceDatabaseUrl);
testDatabaseUrl.pathname = `/${temporaryDatabase}`;
const runtimeUrl = new URL(testDatabaseUrl);
runtimeUrl.username = "max_service_app";
runtimeUrl.password = process.env.TEST_RUNTIME_DATABASE_PASSWORD
  ?? "max_service_runtime_local";

process.env.DATABASE_URL = runtimeUrl.toString();
process.env.DEMO_MODE = "false";
process.env.PRODUCTION_IDENTITY_ENABLED = "true";
process.env.IDENTITY_PROVIDER_MODE = "external_oidc";
process.env.IDENTITY_SESSION_ABSOLUTE_MINUTES = "720";
process.env.IDENTITY_SESSION_IDLE_MINUTES = "60";
process.env.IDENTITY_SESSION_ROTATION_MINUTES = "15";

const { DatabaseService } = await import(
  "../.api-dist/api/database/database.service.js"
);
const { runMigrations } = await import(
  "../.api-dist/api/database/migrations.js"
);
const { IdentitySessionService } = await import(
  "../.api-dist/api/auth/identity-session.service.js"
);

before(async () => {
  assert.match(
    sourceUrl.username,
    /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/,
    "Usuário administrativo inválido.",
  );
  const administration = new Pool({
    connectionString: administrationUrl.toString(),
    max: 1,
  });
  try {
    await administration.query(
      `CREATE DATABASE "${temporaryDatabase}" OWNER "${sourceUrl.username}" TEMPLATE template0`,
    );
    await runMigrations({
      connectionString: testDatabaseUrl.toString(),
    });
  } finally {
    await administration.end();
  }
});

after(async () => {
  const administration = new Pool({
    connectionString: administrationUrl.toString(),
    max: 1,
  });
  try {
    await administration.query(
      `DROP DATABASE IF EXISTS "${temporaryDatabase}" WITH (FORCE)`,
    );
  } finally {
    await administration.end();
  }
});

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createIdentity(admin, role, suffix) {
  const userId = randomUUID();
  const publicCode = `ID-${suffix}-${userId.slice(0, 6)}`.toUpperCase();
  const email = `identity-${suffix}-${userId}@integration.maxservice`;
  const subjectDigest = digest(`integration:${role}:${userId}`);
  await admin.query(`
    INSERT INTO users (
      id,
      public_code,
      role,
      display_name,
      email,
      account_status,
      contact_verified_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now())
  `, [userId, publicCode, role, `Identity ${suffix}`, email]);
  await admin.query(`
    INSERT INTO identity_accounts (
      user_id,
      provider_key,
      subject_digest,
      status,
      contact_verified_at
    ) VALUES ($1, 'integration_test', $2, 'active', now())
  `, [userId, subjectDigest]);
  return {
    userId,
    role,
    email,
    subjectDigest,
  };
}

function principal(identity, mfaCompletedAt = null) {
  return {
    userId: identity.userId,
    role: identity.role,
    providerKey: "integration_test",
    providerSubjectDigest: identity.subjectDigest,
    contactVerified: true,
    mfaCompletedAt,
  };
}

test("sessão de produção rotaciona, detecta reuso e revoga a família", async () => {
  const admin = new Pool({ connectionString: testDatabaseUrl.toString(), max: 1 });
  const database = new DatabaseService();
  const sessions = new IdentitySessionService(database);
  let identity;
  try {
    const migration = await admin.query(`
      SELECT count(*)::int AS count
      FROM schema_migrations
      WHERE name = '0057_production_identity_foundation.sql'
    `);
    assert.equal(
      migration.rows[0].count,
      1,
      "A migration 0057 deve estar aplicada antes do teste de integração.",
    );

    identity = await createIdentity(admin, "customer", "customer");
    const issued = await sessions.issue(principal(identity));
    assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(issued.session.actorId, identity.userId);
    assert.equal(issued.session.identityMode, "production");
    assert.equal(issued.session.email, identity.email);

    const resolved = await sessions.resolve(issued.token);
    assert.equal(resolved.id, issued.session.id);

    const rotated = await sessions.rotate(issued.token);
    assert.notEqual(rotated.token, issued.token);
    assert.notEqual(rotated.session.id, issued.session.id);
    assert.equal(rotated.session.actorId, identity.userId);
    assert.equal((await sessions.resolve(rotated.token)).id, rotated.session.id);

    await assert.rejects(
      sessions.resolve(issued.token),
      /Sessão ausente, expirada ou revogada/,
    );
    await assert.rejects(
      sessions.resolve(rotated.token),
      /Sessão ausente, expirada ou revogada/,
    );

    const familyBySession = await admin.query(`
      SELECT
        family_id AS "familyId",
        count(*) OVER ()::int AS total,
        count(*) FILTER (WHERE revoked_at IS NOT NULL) OVER ()::int AS revoked
      FROM identity_sessions
      WHERE family_id = (
        SELECT family_id FROM identity_sessions WHERE id = $1
      )
      ORDER BY generation
    `, [issued.session.id]);
    assert.equal(familyBySession.rows.length, 2);
    assert.equal(familyBySession.rows[0].total, 2);
    assert.equal(familyBySession.rows[0].revoked, 2);

    const reuseAudit = await admin.query(`
      SELECT outcome, reason_code AS "reasonCode", details
      FROM identity_security_events
      WHERE actor_id = $1 AND event_type = 'session_reuse_detected'
      ORDER BY created_at DESC
      LIMIT 1
    `, [identity.userId]);
    assert.equal(reuseAudit.rows[0].outcome, "blocked");
    assert.equal(reuseAudit.rows[0].reasonCode, "rotated_token_reused");
    assert.equal("token" in reuseAudit.rows[0].details, false);
  } finally {
    await database.onModuleDestroy();
    if (identity) {
      await admin.query(
        "DELETE FROM identity_security_events WHERE actor_id = $1",
        [identity.userId],
      ).catch(() => undefined);
      await admin.query("DELETE FROM users WHERE id = $1", [identity.userId])
        .catch(() => undefined);
    }
    await admin.end();
  }
});

test("inventário, revogação global, RLS e MFA da operação falham de forma segura", async () => {
  const admin = new Pool({ connectionString: testDatabaseUrl.toString(), max: 1 });
  const runtime = new Pool({ connectionString: runtimeUrl.toString(), max: 1 });
  const database = new DatabaseService();
  const sessions = new IdentitySessionService(database);
  const identities = [];
  try {
    const customer = await createIdentity(admin, "customer", "inventory");
    const operation = await createIdentity(admin, "operation", "operation");
    identities.push(customer, operation);

    const first = await sessions.issue(principal(customer));
    const second = await sessions.issue(principal(customer));
    await admin.query(`
      INSERT INTO identity_contact_challenges (
        id, user_id, purpose, token_hash, expires_at
      ) VALUES ($1, $2, 'contact_verification', $3, now() + interval '15 minutes')
    `, [randomUUID(), customer.userId, digest(`challenge:${customer.userId}`)]);

    const operationClient = await runtime.connect();
    try {
      await operationClient.query("BEGIN");
      await operationClient.query(`
        SELECT
          set_config('app.actor_id', $1, true),
          set_config('app.actor_role', 'operation', true)
      `, [operation.userId]);
      const foreignSessions = await operationClient.query(
        "SELECT count(*)::int AS count FROM identity_sessions WHERE user_id = $1",
        [customer.userId],
      );
      const foreignChallenges = await operationClient.query(
        "SELECT count(*)::int AS count FROM identity_contact_challenges WHERE user_id = $1",
        [customer.userId],
      );
      const foreignIdentityAccounts = await operationClient.query(
        "SELECT count(*)::int AS count FROM identity_accounts WHERE user_id = $1",
        [customer.userId],
      );
      assert.equal(foreignSessions.rows[0].count, 0);
      assert.equal(foreignChallenges.rows[0].count, 0);
      assert.equal(foreignIdentityAccounts.rows[0].count, 0);
    } finally {
      await operationClient.query("ROLLBACK").catch(() => undefined);
      operationClient.release();
    }

    const inventory = await sessions.inventory(first.token);
    assert.equal(inventory.currentSessionId, first.session.id);
    assert.equal(inventory.sessions.length, 2);
    assert.equal(inventory.sessions.every((entry) => entry.state === "active"), true);

    const revoked = await sessions.revokeAll(first.token);
    assert.equal(revoked.revokedSessionCount, 2);
    await assert.rejects(() => sessions.resolve(first.token));
    await assert.rejects(() => sessions.resolve(second.token));

    const invisibleWithoutContext = await runtime.query(
      "SELECT count(*)::int AS count FROM identity_sessions",
    );
    assert.equal(invisibleWithoutContext.rows[0].count, 0);
    await assert.rejects(
      runtime.query(`
        INSERT INTO identity_security_events (
          id, event_type, outcome, reason_code
        ) VALUES ($1, 'authentication_failed', 'rejected', 'direct_write')
      `, [randomUUID()]),
      (error) => error?.code === "42501",
    );

    await assert.rejects(
      sessions.issue(principal(operation)),
      /MFA é obrigatório/,
    );
    const withMfa = await sessions.issue(principal(operation, new Date()));
    assert.equal(withMfa.session.assuranceLevel, "mfa");
    await sessions.revokeCurrent(withMfa.token);
    await assert.rejects(() => sessions.resolve(withMfa.token));
  } finally {
    await database.onModuleDestroy();
    await runtime.end();
    for (const identity of identities) {
      await admin.query(
        "DELETE FROM identity_security_events WHERE actor_id = $1",
        [identity.userId],
      ).catch(() => undefined);
      await admin.query("DELETE FROM users WHERE id = $1", [identity.userId])
        .catch(() => undefined);
    }
    await admin.end();
  }
});
