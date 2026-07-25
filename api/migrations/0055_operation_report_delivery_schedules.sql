CREATE TABLE operation_report_delivery_schedules (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE CHECK (public_code ~ '^RE-[A-Z0-9]{4,12}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 3 AND 80),
  period_days integer NOT NULL CHECK (period_days IN (7, 30, 90)),
  cadence text NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
  recipient_name text NOT NULL CHECK (char_length(recipient_name) BETWEEN 3 AND 120),
  recipient_email text NOT NULL CHECK (
    char_length(recipient_email) BETWEEN 6 AND 254
    AND recipient_email = lower(recipient_email)
    AND recipient_email ~ '^[^[:space:]@]+@([^[:space:]@]+\.)?example\.test$|^[^[:space:]@]+@demo\.maxservice$'
  ),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 10 AND 300),
  consent_confirmed_at timestamptz NOT NULL,
  consent_method text NOT NULL DEFAULT 'operation_explicit_attestation'
    CHECK (consent_method = 'operation_explicit_attestation'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  provider_mode text NOT NULL DEFAULT 'disabled_local'
    CHECK (provider_mode = 'disabled_local'),
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (last_run_at IS NULL OR last_run_at >= created_at)
);

CREATE INDEX operation_report_delivery_schedules_due_idx
  ON operation_report_delivery_schedules (status, next_run_at, id);

CREATE TABLE operation_report_deliveries (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE CHECK (public_code ~ '^EN-[A-Z0-9]{4,12}$'),
  schedule_id uuid NOT NULL REFERENCES operation_report_delivery_schedules(id),
  period_days integer NOT NULL CHECK (period_days IN (7, 30, 90)),
  scheduled_for timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'simulated' CHECK (status = 'simulated'),
  provider_mode text NOT NULL DEFAULT 'disabled_local'
    CHECK (provider_mode = 'disabled_local'),
  recipient_fingerprint char(64) NOT NULL
    CHECK (recipient_fingerprint ~ '^[a-f0-9]{64}$'),
  recipient_masked text NOT NULL CHECK (char_length(recipient_masked) BETWEEN 6 AND 254),
  report_checksum char(64) NOT NULL CHECK (report_checksum ~ '^[a-f0-9]{64}$'),
  report_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(report_snapshot) = 'object'
    AND report_snapshot ? 'schemaVersion'
    AND report_snapshot ? 'summary'
  ),
  created_by uuid NOT NULL REFERENCES users(id)
);

CREATE INDEX operation_report_deliveries_schedule_created_idx
  ON operation_report_deliveries (schedule_id, generated_at DESC, id DESC);

CREATE TABLE operation_report_delivery_events (
  id uuid PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES operation_report_delivery_schedules(id),
  delivery_id uuid REFERENCES operation_report_deliveries(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (
    event_type IN ('created', 'paused', 'activated', 'simulated')
  ),
  from_status text CHECK (from_status IS NULL OR from_status IN ('active', 'paused')),
  to_status text NOT NULL CHECK (to_status IN ('active', 'paused')),
  schedule_version integer NOT NULL CHECK (schedule_version > 0),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (event_type = 'simulated' AND delivery_id IS NOT NULL)
    OR (event_type <> 'simulated' AND delivery_id IS NULL)
  )
);

CREATE INDEX operation_report_delivery_events_schedule_created_idx
  ON operation_report_delivery_events (schedule_id, created_at DESC, id DESC);

INSERT INTO operation_report_delivery_schedules (
  id,
  public_code,
  label,
  period_days,
  cadence,
  recipient_name,
  recipient_email,
  purpose,
  consent_confirmed_at,
  next_run_at,
  created_by,
  updated_by
) VALUES (
  'e1000000-0000-4000-8000-000000000001',
  'RE-DEMO',
  'Resumo semanal do piloto',
  7,
  'weekly',
  'Operação Max Service',
  'operacao@demo.maxservice',
  'Acompanhar semanalmente os indicadores agregados e os desvios do piloto.',
  now(),
  date_trunc('day', now()) + interval '8 days 12 hours',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000401'
);

INSERT INTO operation_report_delivery_events (
  id,
  schedule_id,
  actor_id,
  event_type,
  to_status,
  schedule_version,
  note,
  snapshot
) VALUES (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000401',
  'created',
  'active',
  1,
  'Agendamento demonstrativo criado com consentimento explícito e destinatário sintético.',
  '{"periodDays":7,"cadence":"weekly","providerMode":"disabled_local"}'::jsonb
);

ALTER TABLE operation_report_delivery_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_report_delivery_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE operation_report_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_report_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE operation_report_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_report_delivery_events FORCE ROW LEVEL SECURITY;

CREATE POLICY operation_report_delivery_schedules_operation_read_policy
  ON operation_report_delivery_schedules
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_report_delivery_schedules_operation_insert_policy
  ON operation_report_delivery_schedules
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND created_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND updated_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND provider_mode = 'disabled_local'
  );

CREATE POLICY operation_report_delivery_schedules_operation_update_policy
  ON operation_report_delivery_schedules
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND updated_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND provider_mode = 'disabled_local'
  );

CREATE POLICY operation_report_deliveries_operation_read_policy
  ON operation_report_deliveries
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_report_deliveries_operation_insert_policy
  ON operation_report_deliveries
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND created_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND provider_mode = 'disabled_local'
    AND status = 'simulated'
  );

CREATE POLICY operation_report_delivery_events_operation_read_policy
  ON operation_report_delivery_events
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_report_delivery_events_operation_insert_policy
  ON operation_report_delivery_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

GRANT SELECT, INSERT ON operation_report_delivery_schedules TO max_service_app;
GRANT UPDATE (
  status,
  next_run_at,
  last_run_at,
  version,
  updated_by,
  updated_at
) ON operation_report_delivery_schedules TO max_service_app;
GRANT SELECT, INSERT ON operation_report_deliveries TO max_service_app;
GRANT SELECT, INSERT ON operation_report_delivery_events TO max_service_app;
