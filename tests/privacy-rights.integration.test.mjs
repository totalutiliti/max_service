import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgresql://max_service_admin:max_service_admin_local@127.0.0.1:54329/max_service";

const actors = {
  customer: "00000000-0000-4000-8000-000000000101",
  provider: "00000000-0000-4000-8000-000000000201",
  operation: "00000000-0000-4000-8000-000000000401",
};

async function setActor(client, role, actorId) {
  await client.query(
    "SELECT set_config('app.actor_id', $1, true), set_config('app.actor_role', $2, true)",
    [actorId, role],
  );
}

async function withRollback(pool, run) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE max_service_app");
    await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

test("RLS isola solicitações, eventos e recibos de exportação por titular", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const requestId = randomUUID();
  const requestCode = `DS-${requestId.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  try {
    await withRollback(pool, async (client) => {
      await setActor(client, "customer", actors.customer);
      await client.query(`
        INSERT INTO data_subject_requests (
          id, public_code, subject_id, request_type, description, due_at
        ) VALUES ($1, $2, $3, 'access', $4, now() + interval '15 days')
      `, [
        requestId,
        requestCode,
        actors.customer,
        "Solicitação temporária para provar o isolamento da central de privacidade.",
      ]);
      await client.query(`
        INSERT INTO data_subject_request_events (
          id, request_id, actor_id, event_type, to_status,
          request_version, note, snapshot
        ) VALUES ($1, $2, $3, 'created', 'open', 1, $4, '{}'::jsonb)
      `, [
        randomUUID(),
        requestId,
        actors.customer,
        "Solicitação temporária registrada pelo titular durante o teste integrado.",
      ]);

      const ownRequest = await client.query(
        "SELECT count(*)::int AS count FROM data_subject_requests WHERE id = $1",
        [requestId],
      );
      assert.equal(ownRequest.rows[0].count, 1);

      const identity = await client.query("SELECT * FROM current_data_subject_identity()");
      assert.equal(identity.rows[0].public_code, "CL-DEMO");
      assert.equal(identity.rows[0].email, "marina@demo.maxservice");

      await setActor(client, "provider", actors.provider);
      const hiddenRequest = await client.query(
        "SELECT count(*)::int AS count FROM data_subject_requests WHERE id = $1",
        [requestId],
      );
      const hiddenEvent = await client.query(
        "SELECT count(*)::int AS count FROM data_subject_request_events WHERE request_id = $1",
        [requestId],
      );
      assert.equal(hiddenRequest.rows[0].count, 0);
      assert.equal(hiddenEvent.rows[0].count, 0);

      await client.query("SAVEPOINT forged_subject");
      try {
        await client.query(`
          INSERT INTO data_subject_requests (
            id, public_code, subject_id, request_type, description, due_at
          ) VALUES ($1, $2, $3, 'correction', $4, now() + interval '15 days')
        `, [
          randomUUID(),
          `DS-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
          actors.customer,
          "Tentativa temporária de registrar um pedido em nome de outro titular.",
        ]);
        assert.fail("O prestador não deveria registrar solicitação para outro titular.");
      } catch (error) {
        assert.equal(error.code, "42501");
      }
      await client.query("ROLLBACK TO SAVEPOINT forged_subject");

      await setActor(client, "customer", actors.customer);
      await client.query(`
        UPDATE data_subject_requests
        SET
          status = 'fulfilled',
          resolution_note = $2,
          version = 2,
          updated_at = now(),
          completed_at = now()
        WHERE id = $1
      `, [
        requestId,
        "Pacote temporário disponibilizado ao próprio titular durante o teste integrado.",
      ]);
      const receiptId = randomUUID();
      await client.query(`
        INSERT INTO data_subject_export_receipts (
          id, public_code, request_id, subject_id, manifest_version,
          checksum, section_counts
        ) VALUES ($1, $2, $3, $4, 'privacy-export-1', $5, $6::jsonb)
      `, [
        receiptId,
        `PX-${receiptId.replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        requestId,
        actors.customer,
        "a".repeat(64),
        JSON.stringify({ profile: 1 }),
      ]);

      await setActor(client, "provider", actors.provider);
      const hiddenReceipt = await client.query(
        "SELECT count(*)::int AS count FROM data_subject_export_receipts WHERE id = $1",
        [receiptId],
      );
      assert.equal(hiddenReceipt.rows[0].count, 0);

      await setActor(client, "operation", actors.operation);
      const visibleRequest = await client.query(
        "SELECT count(*)::int AS count FROM data_subject_requests WHERE id = $1",
        [requestId],
      );
      const visibleReceipt = await client.query(
        "SELECT count(*)::int AS count FROM data_subject_export_receipts WHERE id = $1",
        [receiptId],
      );
      assert.equal(visibleRequest.rows[0].count, 1);
      assert.equal(visibleReceipt.rows[0].count, 1);

      await client.query("SAVEPOINT operation_identity");
      try {
        await client.query("SELECT * FROM current_data_subject_identity()");
        assert.fail("A Operação não deveria usar a função de identidade do titular.");
      } catch (error) {
        assert.equal(error.code, "42501");
      }
      await client.query("ROLLBACK TO SAVEPOINT operation_identity");
    });
  } finally {
    await pool.end();
  }
});

test("Operação só conduz transições versionadas depois de assumir a solicitação", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const requestId = randomUUID();
  try {
    await withRollback(pool, async (client) => {
      await setActor(client, "customer", actors.customer);
      await client.query(`
        INSERT INTO data_subject_requests (
          id, public_code, subject_id, request_type, description, due_at
        ) VALUES ($1, $2, $3, 'correction', $4, now() + interval '15 days')
      `, [
        requestId,
        `DS-${requestId.replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        actors.customer,
        "Solicitação temporária de correção para validar a decisão operacional.",
      ]);

      await setActor(client, "operation", actors.operation);
      const updated = await client.query(`
        UPDATE data_subject_requests
        SET
          status = 'in_review',
          assigned_to = $2,
          version = version + 1,
          updated_at = now()
        WHERE id = $1 AND version = 1
        RETURNING status, version, assigned_to
      `, [requestId, actors.operation]);
      assert.equal(updated.rows[0].status, "in_review");
      assert.equal(updated.rows[0].version, 2);
      assert.equal(updated.rows[0].assigned_to, actors.operation);

      await client.query(`
        INSERT INTO data_subject_request_events (
          id, request_id, actor_id, event_type, from_status, to_status,
          request_version, note, snapshot
        ) VALUES ($1, $2, $3, 'status_changed', 'open', 'in_review', 2, $4, '{}'::jsonb)
      `, [
        randomUUID(),
        requestId,
        actors.operation,
        "Operação assumiu a análise temporária com justificativa suficiente.",
      ]);
      const events = await client.query(
        "SELECT count(*)::int AS count FROM data_subject_request_events WHERE request_id = $1",
        [requestId],
      );
      assert.equal(events.rows[0].count, 1);
    });
  } finally {
    await pool.end();
  }
});
