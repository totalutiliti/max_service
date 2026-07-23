INSERT INTO users (id, public_code, role, display_name, email)
VALUES (
  '00000000-0000-4000-8000-000000000402',
  'AD-CAMILA',
  'operation',
  'Camila Souza',
  'camila.operacao@demo.maxservice'
);

ALTER TABLE partner_support_cases
  ADD COLUMN sla_policy_version text,
  ADD COLUMN first_response_due_at timestamptz,
  ADD COLUMN resolution_due_at timestamptz,
  ADD COLUMN first_responded_at timestamptz;

UPDATE partner_support_cases support
SET
  sla_policy_version = 'SUPPORT-SLA-2026-01',
  first_response_due_at = support.created_at + interval '4 hours',
  resolution_due_at = support.created_at + interval '48 hours',
  first_responded_at = (
    SELECT min(event.created_at)
    FROM partner_support_events event
    WHERE event.case_id = support.id
      AND event.event_type = 'message'
      AND event.actor_id <> support.partner_id
  );

ALTER TABLE partner_support_cases
  ALTER COLUMN sla_policy_version SET DEFAULT 'SUPPORT-SLA-2026-01',
  ALTER COLUMN sla_policy_version SET NOT NULL,
  ALTER COLUMN first_response_due_at SET DEFAULT (now() + interval '4 hours'),
  ALTER COLUMN first_response_due_at SET NOT NULL,
  ALTER COLUMN resolution_due_at SET DEFAULT (now() + interval '48 hours'),
  ALTER COLUMN resolution_due_at SET NOT NULL,
  ADD CONSTRAINT partner_support_cases_sla_policy_check
    CHECK (sla_policy_version = 'SUPPORT-SLA-2026-01'),
  ADD CONSTRAINT partner_support_cases_first_response_due_check
    CHECK (first_response_due_at > created_at),
  ADD CONSTRAINT partner_support_cases_resolution_due_check
    CHECK (resolution_due_at > first_response_due_at),
  ADD CONSTRAINT partner_support_cases_first_responded_check
    CHECK (first_responded_at IS NULL OR first_responded_at >= created_at);

CREATE INDEX partner_support_cases_active_sla_idx
  ON partner_support_cases (first_response_due_at, resolution_due_at)
  WHERE status <> 'resolved';

ALTER TABLE partner_support_events
  DROP CONSTRAINT partner_support_events_event_type_check,
  DROP CONSTRAINT partner_support_events_check;

ALTER TABLE partner_support_events
  ADD CONSTRAINT partner_support_events_event_type_check
    CHECK (event_type IN ('message', 'status_changed', 'triage_changed')),
  ADD CONSTRAINT partner_support_events_check CHECK (
    (
      event_type IN ('message', 'triage_changed')
      AND from_status IS NULL
      AND to_status IS NULL
    )
    OR (
      event_type = 'status_changed'
      AND from_status IS NOT NULL
      AND to_status IS NOT NULL
      AND from_status <> to_status
    )
  );

DROP POLICY partner_support_cases_partner_insert_policy
  ON partner_support_cases;

CREATE POLICY partner_support_cases_partner_insert_policy
  ON partner_support_cases
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'partner'
    AND partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND status = 'open'
    AND priority = 'normal'
    AND assigned_to IS NULL
    AND resolution IS NULL
    AND resolved_at IS NULL
    AND first_responded_at IS NULL
    AND sla_policy_version = 'SUPPORT-SLA-2026-01'
    AND first_response_due_at = created_at + interval '4 hours'
    AND resolution_due_at = created_at + interval '48 hours'
    AND (
      referral_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM partner_referrals referral
        WHERE referral.id = partner_support_cases.referral_id
          AND referral.partner_id = partner_support_cases.partner_id
      )
    )
  );

DROP POLICY partner_support_cases_operation_update_policy
  ON partner_support_cases;

CREATE POLICY partner_support_cases_operation_update_policy
  ON partner_support_cases
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND (
      assigned_to IS NULL
      OR EXISTS (
        SELECT 1
        FROM users assignee
        WHERE assignee.id = partner_support_cases.assigned_to
          AND assignee.role = 'operation'
      )
    )
  );

DROP POLICY partner_support_events_insert_policy
  ON partner_support_events;

CREATE POLICY partner_support_events_insert_policy
  ON partner_support_events
  FOR INSERT
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND (
      (
        current_setting('app.actor_role', true) = 'partner'
        AND event_type = 'message'
        AND EXISTS (
          SELECT 1
          FROM partner_support_cases support
          WHERE support.id = partner_support_events.case_id
            AND support.partner_id = actor_id
            AND support.status <> 'resolved'
        )
      )
      OR (
        current_setting('app.actor_role', true) = 'operation'
        AND EXISTS (
          SELECT 1
          FROM partner_support_cases support
          WHERE support.id = partner_support_events.case_id
            AND (
              (
                partner_support_events.event_type IN ('message', 'triage_changed')
                AND support.status <> 'resolved'
              )
              OR (
                partner_support_events.event_type = 'status_changed'
                AND (
                  (
                    partner_support_events.from_status = 'open'
                    AND partner_support_events.to_status = 'in_review'
                    AND support.status = 'in_review'
                  )
                  OR (
                    partner_support_events.from_status = 'in_review'
                    AND partner_support_events.to_status = 'resolved'
                    AND support.status = 'resolved'
                  )
                )
              )
            )
        )
      )
    )
  );

GRANT UPDATE (
  priority,
  assigned_to,
  first_response_due_at,
  resolution_due_at,
  first_responded_at,
  updated_at
) ON partner_support_cases TO max_service_app;
