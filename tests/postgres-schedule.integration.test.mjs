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

test("migrations de agenda e prontidão estão aplicadas com constraints de exclusão", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const migrations = await pool.query(`
      SELECT name
      FROM schema_migrations
      WHERE name IN (
        '0042_provider_schedule.sql',
        '0043_booking_participant_visibility.sql',
        '0044_operation_readiness_gates.sql',
        '0045_runtime_migration_visibility.sql',
        '0046_idempotent_marketplace_mutations.sql',
        '0047_private_storage_reconciliation.sql'
      )
      ORDER BY name
    `);
    assert.deepEqual(migrations.rows.map((row) => row.name), [
      "0042_provider_schedule.sql",
      "0043_booking_participant_visibility.sql",
      "0044_operation_readiness_gates.sql",
      "0045_runtime_migration_visibility.sql",
      "0046_idempotent_marketplace_mutations.sql",
      "0047_private_storage_reconciliation.sql",
    ]);
    const constraints = await pool.query(`
      SELECT conrelid::regclass::text AS table_name
      FROM pg_constraint
      WHERE contype = 'x'
        AND conrelid IN (
          'bookings'::regclass,
          'provider_schedule_blocks'::regclass
        )
      ORDER BY table_name
    `);
    assert.deepEqual(constraints.rows.map((row) => row.table_name), [
      "bookings",
      "provider_schedule_blocks",
    ]);
  } finally {
    await pool.end();
  }
});

test("RLS isola agenda e gates de prontidão por papel", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await withRollback(pool, async (client) => {
      await setActor(client, "customer", actors.customer);
      const customerSchedule = await client.query("SELECT count(*)::int AS count FROM provider_weekly_availability");
      const customerGates = await client.query("SELECT count(*)::int AS count FROM operation_readiness_gates");
      assert.equal(customerSchedule.rows[0].count, 0);
      assert.equal(customerGates.rows[0].count, 0);

      await setActor(client, "provider", actors.provider);
      const providerSchedule = await client.query("SELECT count(*)::int AS count FROM provider_weekly_availability");
      const providerGates = await client.query("SELECT count(*)::int AS count FROM operation_readiness_gates");
      assert.equal(providerSchedule.rows[0].count, 7);
      assert.equal(providerGates.rows[0].count, 0);

      await setActor(client, "operation", actors.operation);
      const operationGates = await client.query("SELECT count(*)::int AS count FROM operation_readiness_gates");
      assert.equal(operationGates.rows[0].count, 8);
    });
  } finally {
    await pool.end();
  }
});

test("RLS isola registros idempotentes e permite concluir somente a operação do ator", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await withRollback(pool, async (client) => {
      const recordId = randomUUID();
      const idempotencyKey = randomUUID();
      await setActor(client, "customer", actors.customer);
      await client.query(`
        INSERT INTO api_idempotency_records (
          id,
          actor_id,
          actor_role,
          method,
          route,
          idempotency_key,
          request_hash,
          status,
          expires_at
        )
        VALUES ($1, $2, 'customer', 'POST', '/api/v1/service-requests', $3, $4, 'processing', now() + interval '24 hours')
      `, [recordId, actors.customer, idempotencyKey, "a".repeat(64)]);

      await setActor(client, "provider", actors.provider);
      const providerView = await client.query(
        "SELECT count(*)::int AS count FROM api_idempotency_records WHERE id = $1",
        [recordId],
      );
      assert.equal(providerView.rows[0].count, 0);

      await setActor(client, "customer", actors.customer);
      const completed = await client.query(`
        UPDATE api_idempotency_records
        SET
          status = 'completed',
          response_status = 201,
          response_body = '{"request":{"id":"synthetic"}}'::jsonb,
          completed_at = now()
        WHERE id = $1
        RETURNING id
      `, [recordId]);
      assert.equal(completed.rowCount, 1);

      const immutableReplay = await client.query(`
        UPDATE api_idempotency_records
        SET response_body = '{"request":{"id":"altered"}}'::jsonb
        WHERE id = $1
        RETURNING id
      `, [recordId]);
      assert.equal(immutableReplay.rowCount, 0);
    });
  } finally {
    await pool.end();
  }
});

test("RLS expõe a reconciliação agregada somente para a Operação", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const runId = randomUUID();
    await client.query(`
      INSERT INTO private_storage_reconciliation_runs (
        id,
        policy_version,
        mode,
        status,
        cutoff_at,
        completed_at,
        listed_objects,
        referenced_objects
      ) VALUES (
        $1,
        'PRIVATE-STORAGE-RECONCILIATION-2026-01',
        'dry_run',
        'succeeded',
        now() - interval '24 hours',
        now(),
        4,
        4
      )
    `, [runId]);
    await client.query("SET LOCAL ROLE max_service_app");

    await setActor(client, "customer", actors.customer);
    const customerView = await client.query(
      "SELECT count(*)::int AS count FROM private_storage_reconciliation_runs WHERE id = $1",
      [runId],
    );
    assert.equal(customerView.rows[0].count, 0);

    await setActor(client, "operation", actors.operation);
    const operationView = await client.query(
      "SELECT count(*)::int AS count FROM private_storage_reconciliation_runs WHERE id = $1",
      [runId],
    );
    assert.equal(operationView.rows[0].count, 1);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
});

test("slot ocupado desaparece e banco rejeita booking ou bloqueio sobreposto", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const requestOneId = randomUUID();
  const requestTwoId = randomUUID();
  const proposalOneId = randomUUID();
  const proposalTwoId = randomUUID();
  const bookingOneId = randomUUID();
  try {
    await withRollback(pool, async (client) => {
      await setActor(client, "customer", actors.customer);
      for (const [id, code, title] of [
        [requestOneId, `SV-${requestOneId.slice(0, 6).toUpperCase()}`, "Teste de agenda um"],
        [requestTwoId, `SV-${requestTwoId.slice(0, 6).toUpperCase()}`, "Teste de agenda dois"],
      ]) {
        await client.query(`
          INSERT INTO service_requests (
            id,
            public_code,
            customer_id,
            category_id,
            title,
            description,
            neighborhood,
            city,
            state,
            preferred_window,
            status,
            region_id,
            neighborhood_id
          ) VALUES (
            $1,
            $2,
            $3,
            '10000000-0000-4000-8000-000000000001',
            $4,
            'Registro temporário para validar concorrência e isolamento da agenda.',
            'Jardim Europa',
            'Sorocaba',
            'SP',
            'Agenda online',
            'open',
            'b2000000-0000-4000-8000-000000000001',
            'b2100000-0000-4000-8000-000000000001'
          )
        `, [id, code, actors.customer, title]);
      }

      await setActor(client, "provider", actors.provider);
      await client.query(`
        UPDATE bookings
        SET
          status = 'completed',
          completed_at = COALESCE(completed_at, now()),
          updated_at = now()
        WHERE provider_id = $1
          AND status IN ('scheduled', 'in_progress')
      `, [actors.provider]);
      await client.query(`
        INSERT INTO proposals (
          id,
          request_id,
          provider_id,
          amount_cents,
          estimated_minutes,
          message,
          status
        ) VALUES
          ($1, $2, $5, 18000, 90, 'Proposta temporária para teste transacional.', 'sent'),
          ($3, $4, $5, 19000, 90, 'Segunda proposta temporária para teste transacional.', 'sent')
      `, [proposalOneId, requestOneId, proposalTwoId, requestTwoId, actors.provider]);
      await client.query(
        "UPDATE service_requests SET status = 'proposals_received' WHERE id = ANY($1::uuid[])",
        [[requestOneId, requestTwoId]],
      );

      await setActor(client, "customer", actors.customer);
      const firstSlots = await client.query(
        "SELECT starts_at, ends_at FROM proposal_available_slots($1, $2) ORDER BY starts_at LIMIT 1",
        [actors.customer, proposalOneId],
      );
      assert.equal(firstSlots.rowCount, 1);
      const slot = firstSlots.rows[0];
      await client.query(`
        INSERT INTO bookings (
          id,
          request_id,
          proposal_id,
          customer_id,
          provider_id,
          status,
          scheduled_for,
          scheduled_until
        ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7)
      `, [
        bookingOneId,
        requestOneId,
        proposalOneId,
        actors.customer,
        actors.provider,
        slot.starts_at,
        slot.ends_at,
      ]);

      const secondSlots = await client.query(
        "SELECT starts_at FROM proposal_available_slots($1, $2)",
        [actors.customer, proposalTwoId],
      );
      assert.equal(
        secondSlots.rows.some((row) => row.starts_at.getTime() === slot.starts_at.getTime()),
        false,
      );

      await client.query("SAVEPOINT overlapping_booking");
      try {
        await client.query(`
          INSERT INTO bookings (
            id,
            request_id,
            proposal_id,
            customer_id,
            provider_id,
            status,
            scheduled_for,
            scheduled_until
          ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7)
        `, [
          randomUUID(),
          requestTwoId,
          proposalTwoId,
          actors.customer,
          actors.provider,
          slot.starts_at,
          slot.ends_at,
        ]);
        assert.fail("booking sobreposto deveria ser rejeitado");
      } catch (error) {
        assert.equal(error.code, "23P01");
      }
      await client.query("ROLLBACK TO SAVEPOINT overlapping_booking");

      await setActor(client, "provider", actors.provider);
      await client.query("SAVEPOINT overlapping_block");
      try {
        await client.query(`
          INSERT INTO provider_schedule_blocks (
            id,
            provider_id,
            starts_at,
            ends_at,
            reason
          ) VALUES ($1, $2, $3, $4, 'Bloqueio proposital do teste integrado')
        `, [randomUUID(), actors.provider, slot.starts_at, slot.ends_at]);
        assert.fail("bloqueio sobreposto deveria ser rejeitado");
      } catch (error) {
        assert.equal(error.code, "23514");
      }
      await client.query("ROLLBACK TO SAVEPOINT overlapping_block");
    });
  } finally {
    await pool.end();
  }
});
