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
  partner: "00000000-0000-4000-8000-000000000301",
  advertiser: "00000000-0000-4000-8000-000000000501",
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
        '0047_private_storage_reconciliation.sql',
        '0048_partner_support_disputes.sql',
        '0049_partner_referral_risk_assessments.sql',
        '0050_campaign_targeting_monitoring.sql',
        '0051_contextual_advertising.sql',
        '0052_advertiser_idempotency.sql',
        '0053_advertiser_delivery_visibility.sql',
        '0054_contextual_ad_click.sql',
        '0055_operation_report_delivery_schedules.sql',
        '0056_data_subject_rights.sql'
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
      "0048_partner_support_disputes.sql",
      "0049_partner_referral_risk_assessments.sql",
      "0050_campaign_targeting_monitoring.sql",
      "0051_contextual_advertising.sql",
      "0052_advertiser_idempotency.sql",
      "0053_advertiser_delivery_visibility.sql",
      "0054_contextual_ad_click.sql",
      "0055_operation_report_delivery_schedules.sql",
      "0056_data_subject_rights.sql",
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
      const customerReportSchedules = await client.query("SELECT count(*)::int AS count FROM operation_report_delivery_schedules");
      const customerReportDeliveries = await client.query("SELECT count(*)::int AS count FROM operation_report_deliveries");
      const customerReportEvents = await client.query("SELECT count(*)::int AS count FROM operation_report_delivery_events");
      assert.equal(customerSchedule.rows[0].count, 0);
      assert.equal(customerGates.rows[0].count, 0);
      assert.equal(customerReportSchedules.rows[0].count, 0);
      assert.equal(customerReportDeliveries.rows[0].count, 0);
      assert.equal(customerReportEvents.rows[0].count, 0);

      await setActor(client, "provider", actors.provider);
      const providerSchedule = await client.query("SELECT count(*)::int AS count FROM provider_weekly_availability");
      const providerGates = await client.query("SELECT count(*)::int AS count FROM operation_readiness_gates");
      const providerReportSchedules = await client.query("SELECT count(*)::int AS count FROM operation_report_delivery_schedules");
      assert.equal(providerSchedule.rows[0].count, 7);
      assert.equal(providerGates.rows[0].count, 0);
      assert.equal(providerReportSchedules.rows[0].count, 0);

      await setActor(client, "operation", actors.operation);
      const operationGates = await client.query("SELECT count(*)::int AS count FROM operation_readiness_gates");
      const operationReportSchedules = await client.query("SELECT count(*)::int AS count FROM operation_report_delivery_schedules");
      const operationReportEvents = await client.query("SELECT count(*)::int AS count FROM operation_report_delivery_events");
      assert.equal(operationGates.rows[0].count, 8);
      assert.equal(operationReportSchedules.rows[0].count >= 1, true);
      assert.equal(operationReportEvents.rows[0].count >= 1, true);
    });
  } finally {
    await pool.end();
  }
});

test("RLS protege tentativas de cupom e expõe somente o estado agregado ao cliente atual", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await withRollback(pool, async (client) => {
      const attemptId = randomUUID();
      await setActor(client, "customer", actors.customer);
      await client.query(`
        INSERT INTO campaign_validation_attempts (
          id,
          customer_id,
          campaign_id,
          code_fingerprint,
          context_category_id,
          context_region_id,
          result
        ) VALUES (
          $1,
          $2,
          'a1000000-0000-4000-8000-000000000001',
          $3,
          '10000000-0000-4000-8000-000000000001',
          'b2000000-0000-4000-8000-000000000001',
          'accepted'
        )
      `, [attemptId, actors.customer, "b".repeat(64)]);

      const hiddenFromCustomer = await client.query(
        "SELECT count(*)::int AS count FROM campaign_validation_attempts WHERE id = $1",
        [attemptId],
      );
      assert.equal(hiddenFromCustomer.rows[0].count, 0);

      const ownAggregate = await client.query(`
        SELECT attempt_count_15m AS "attemptCount15m"
        FROM campaign_validation_abuse_state($1)
      `, [actors.customer]);
      assert.equal(ownAggregate.rows[0].attemptCount15m >= 1, true);

      await setActor(client, "provider", actors.provider);
      const hiddenFromProvider = await client.query(
        "SELECT count(*)::int AS count FROM campaign_validation_attempts WHERE id = $1",
        [attemptId],
      );
      assert.equal(hiddenFromProvider.rows[0].count, 0);
      await client.query("SAVEPOINT forbidden_campaign_monitoring");
      try {
        await client.query("SELECT * FROM campaign_validation_abuse_state($1)", [actors.customer]);
        assert.fail("O agregado de campanha deveria estar restrito ao cliente atual.");
      } catch (error) {
        assert.equal(error.code, "42501");
      }
      await client.query("ROLLBACK TO SAVEPOINT forbidden_campaign_monitoring");

      await setActor(client, "operation", actors.operation);
      const visibleToOperation = await client.query(
        "SELECT result FROM campaign_validation_attempts WHERE id = $1",
        [attemptId],
      );
      assert.equal(visibleToOperation.rows[0].result, "accepted");
      const targeting = await client.query(`
        SELECT targeting_mode AS "targetingMode", eligibility_snapshot AS "eligibilitySnapshot"
        FROM marketing_campaigns campaign
        LEFT JOIN campaign_reservations reservation ON reservation.campaign_id = campaign.id
        WHERE campaign.id = 'a1000000-0000-4000-8000-000000000001'
        LIMIT 1
      `);
      assert.equal(targeting.rows[0].targetingMode, "contextual");
      if (targeting.rows[0].eligibilitySnapshot) {
        assert.equal(typeof targeting.rows[0].eligibilitySnapshot, "object");
      }
    });
  } finally {
    await pool.end();
  }
});

test("RLS separa anunciante, moderação e entrega contextual sem identidade bruta", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await withRollback(pool, async (client) => {
      const campaignId = randomUUID();
      const publicCode = `ADS-${randomUUID().slice(0, 6).toUpperCase()}`;
      await setActor(client, "advertiser", actors.advertiser);
      await client.query(`
        INSERT INTO contextual_ad_campaigns (
          id,
          public_code,
          advertiser_id,
          name,
          headline,
          body,
          cta_label,
          destination_url,
          target_category_id,
          target_region_id,
          starts_at,
          ends_at,
          impression_limit,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          'Campanha integrada',
          'Materiais para um reparo seguro',
          'Conteúdo sintético submetido para validar isolamento e moderação.',
          'Conhecer oferta',
          'https://example.com/oferta-integrada',
          '10000000-0000-4000-8000-000000000001',
          'b2000000-0000-4000-8000-000000000001',
          now() - interval '1 minute',
          now() + interval '1 day',
          100,
          'pending_review'
        )
      `, [campaignId, publicCode, actors.advertiser]);
      await client.query(`
        INSERT INTO contextual_ad_moderation_events (
          id,
          campaign_id,
          actor_id,
          actor_role,
          event_type,
          to_status,
          note
        )
        VALUES ($1, $2, $3, 'advertiser', 'submitted', 'pending_review', $4)
      `, [
        randomUUID(),
        campaignId,
        actors.advertiser,
        "Peça sintética enviada para revisão no teste de RLS.",
      ]);
      const ownCampaign = await client.query(
        "SELECT status FROM contextual_ad_campaigns WHERE id = $1",
        [campaignId],
      );
      assert.equal(ownCampaign.rows[0].status, "pending_review");

      await setActor(client, "customer", actors.customer);
      const hiddenPending = await client.query(
        "SELECT count(*)::int AS count FROM contextual_ad_campaigns WHERE id = $1",
        [campaignId],
      );
      assert.equal(hiddenPending.rows[0].count, 0);

      await setActor(client, "operation", actors.operation);
      await client.query(`
        UPDATE contextual_ad_campaigns
        SET status = 'approved', reviewed_by = $2, reviewed_at = now()
        WHERE id = $1
      `, [campaignId, actors.operation]);

      await setActor(client, "customer", actors.customer);
      const visibleApproved = await client.query(
        "SELECT status FROM contextual_ad_campaigns WHERE id = $1",
        [campaignId],
      );
      assert.equal(visibleApproved.rows[0].status, "approved");
      const deliveryId = randomUUID();
      await client.query(`
        INSERT INTO contextual_ad_deliveries (
          id,
          campaign_id,
          delivery_token_hash,
          context_category_id,
          context_region_id
        )
        VALUES (
          $1,
          $2,
          $3,
          '10000000-0000-4000-8000-000000000001',
          'b2000000-0000-4000-8000-000000000001'
        )
      `, [deliveryId, campaignId, "c".repeat(64)]);
      const usage = await client.query(
        'SELECT impression_count AS "impressionCount" FROM contextual_ad_usage($1)',
        [campaignId],
      );
      assert.equal(usage.rows[0].impressionCount, 1);

      await setActor(client, "provider", actors.provider);
      const hiddenFromProvider = await client.query(
        "SELECT count(*)::int AS count FROM contextual_ad_campaigns WHERE id = $1",
        [campaignId],
      );
      assert.equal(hiddenFromProvider.rows[0].count, 0);
      await client.query("SAVEPOINT forbidden_ad_metrics");
      try {
        await client.query("SELECT * FROM contextual_ad_usage($1)", [campaignId]);
        assert.fail("As métricas publicitárias deveriam estar restritas.");
      } catch (error) {
        assert.equal(error.code, "42501");
      }
      await client.query("ROLLBACK TO SAVEPOINT forbidden_ad_metrics");

      await setActor(client, "advertiser", actors.advertiser);
      const advertiserDelivery = await client.query(
        "SELECT clicked_at FROM contextual_ad_deliveries WHERE id = $1",
        [deliveryId],
      );
      assert.equal(advertiserDelivery.rowCount, 1);
      assert.equal(advertiserDelivery.rows[0].clicked_at, null);
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

test("RLS mantém sinais preventivos restritos e reserva a revisão à Operação", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await withRollback(pool, async (client) => {
      const referralId = randomUUID();
      const assessmentId = randomUUID();

      await setActor(client, "partner", actors.partner);
      await client.query(`
        INSERT INTO partner_referrals (
          id,
          public_code,
          referral_link_id,
          partner_id,
          service_category_id,
          professional_name,
          email,
          status,
          source
        )
        VALUES (
          $1,
          $2,
          '70000000-0000-4000-8000-000000000001',
          $3,
          '10000000-0000-4000-8000-000000000001',
          'Autorreferência Sintética',
          'joao+rls@demo.maxservice',
          'invited',
          'manual'
        )
      `, [referralId, `RF-${referralId.slice(0, 8).toUpperCase()}`, actors.partner]);

      const context = await client.query(`
        SELECT
          self_referral AS "selfReferral",
          duplicate_partner_count AS "duplicatePartnerCount",
          recent_referral_count AS "recentReferralCount"
        FROM partner_referral_risk_context($1)
      `, [referralId]);
      assert.equal(context.rows[0].selfReferral, true);
      assert.equal(context.rows[0].duplicatePartnerCount, 0);

      const signals = [{
        code: "self_referral",
        severity: "high",
        title: "Possível autorreferência",
        detail: "Sinal sintético do teste integrado.",
      }];
      await client.query(`
        INSERT INTO partner_referral_risk_assessments (
          id,
          referral_id,
          policy_version,
          risk_level,
          signals
        )
        VALUES ($1, $2, 'REFERRAL-RISK-2026-01', 'high', $3::jsonb)
      `, [assessmentId, referralId, JSON.stringify(signals)]);
      await client.query(
        "UPDATE partner_referrals SET additional_verification_required = true WHERE id = $1",
        [referralId],
      );

      const partnerAssessment = await client.query(
        "SELECT count(*)::int AS count FROM partner_referral_risk_assessments WHERE referral_id = $1",
        [referralId],
      );
      assert.equal(partnerAssessment.rows[0].count, 0);
      const partnerSummary = await client.query(
        "SELECT additional_verification_required AS required FROM partner_referrals WHERE id = $1",
        [referralId],
      );
      assert.equal(partnerSummary.rows[0].required, true);

      await client.query("SAVEPOINT partner_risk_review");
      try {
        await client.query(`
          INSERT INTO partner_referral_risk_reviews (
            id,
            assessment_id,
            actor_id,
            outcome,
            note
          )
          VALUES ($1, $2, $3, 'cleared', 'Tentativa indevida de revisão pelo parceiro.')
        `, [randomUUID(), assessmentId, actors.partner]);
        assert.fail("parceiro não deveria revisar o próprio sinal preventivo");
      } catch (error) {
        assert.equal(error.code, "42501");
      }
      await client.query("ROLLBACK TO SAVEPOINT partner_risk_review");

      await setActor(client, "operation", actors.operation);
      const operationAssessment = await client.query(
        "SELECT risk_level AS level, signals FROM partner_referral_risk_assessments WHERE referral_id = $1",
        [referralId],
      );
      assert.equal(operationAssessment.rows[0].level, "high");
      assert.equal(operationAssessment.rows[0].signals[0].code, "self_referral");
      const review = await client.query(`
        INSERT INTO partner_referral_risk_reviews (
          id,
          assessment_id,
          actor_id,
          outcome,
          note
        )
        VALUES ($1, $2, $3, 'cleared', 'Sinal sintético conferido e liberado pela Operação.')
        RETURNING outcome
      `, [randomUUID(), assessmentId, actors.operation]);
      assert.equal(review.rows[0].outcome, "cleared");
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

test("RLS isola a contestação formal e reserva a decisão à Operação", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await withRollback(pool, async (client) => {
      const disputeId = randomUUID();
      const eventId = randomUUID();
      const supportCaseId = "76000000-0000-4000-8000-000000000001";

      await setActor(client, "operation", actors.operation);
      await client.query(`
        UPDATE partner_support_cases
        SET
          status = 'resolved',
          assigned_to = $2,
          resolution = 'Resolução sintética preparada para o teste de isolamento.',
          resolved_at = now(),
          updated_at = now()
        WHERE id = $1
      `, [supportCaseId, actors.operation]);

      await setActor(client, "partner", actors.partner);
      await client.query(`
        INSERT INTO partner_support_disputes (
          id,
          public_code,
          case_id,
          partner_id,
          reason,
          statement
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          'evidence_not_considered',
          'Contestação sintética criada para validar as fronteiras de acesso.'
        )
      `, [
        disputeId,
        `DP-${disputeId.slice(0, 6).toUpperCase()}`,
        supportCaseId,
        actors.partner,
      ]);
      await client.query(`
        INSERT INTO partner_support_dispute_events (
          id,
          dispute_id,
          actor_id,
          event_type,
          from_status,
          to_status,
          body
        ) VALUES (
          $1,
          $2,
          $3,
          'opened',
          NULL,
          'open',
          'Contestação sintética criada para validar as fronteiras de acesso.'
        )
      `, [eventId, disputeId, actors.partner]);

      await setActor(client, "customer", actors.customer);
      const customerView = await client.query(
        "SELECT count(*)::int AS count FROM partner_support_disputes WHERE id = $1",
        [disputeId],
      );
      assert.equal(customerView.rows[0].count, 0);

      await setActor(client, "partner", actors.partner);
      const partnerView = await client.query(
        "SELECT count(*)::int AS count FROM partner_support_disputes WHERE id = $1",
        [disputeId],
      );
      assert.equal(partnerView.rows[0].count, 1);
      const partnerDecision = await client.query(`
        UPDATE partner_support_disputes
        SET
          status = 'in_review',
          assigned_to = $2,
          reviewed_at = now(),
          updated_at = now()
        WHERE id = $1
        RETURNING id
      `, [disputeId, actors.operation]);
      assert.equal(partnerDecision.rowCount, 0);

      await setActor(client, "operation", actors.operation);
      const operationDecision = await client.query(`
        UPDATE partner_support_disputes
        SET
          status = 'in_review',
          assigned_to = $2,
          reviewed_at = now(),
          updated_at = now()
        WHERE id = $1
        RETURNING id
      `, [disputeId, actors.operation]);
      assert.equal(operationDecision.rowCount, 1);
    });
  } finally {
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
