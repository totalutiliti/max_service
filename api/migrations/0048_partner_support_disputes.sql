CREATE TABLE partner_support_disputes (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  case_id uuid NOT NULL UNIQUE REFERENCES partner_support_cases(id),
  partner_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL CHECK (
    reason IN (
      'resolution_incomplete',
      'evidence_not_considered',
      'commercial_divergence',
      'other'
    )
  ),
  statement text NOT NULL CHECK (char_length(statement) BETWEEN 20 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'in_review', 'upheld', 'rejected')
  ),
  assigned_to uuid REFERENCES users(id),
  decision text CHECK (
    decision IS NULL OR char_length(decision) BETWEEN 20 AND 1000
  ),
  opened_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      status = 'open'
      AND assigned_to IS NULL
      AND reviewed_at IS NULL
      AND decision IS NULL
      AND decided_at IS NULL
    )
    OR (
      status = 'in_review'
      AND assigned_to IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND decision IS NULL
      AND decided_at IS NULL
    )
    OR (
      status IN ('upheld', 'rejected')
      AND assigned_to IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND decision IS NOT NULL
      AND decided_at IS NOT NULL
    )
  )
);

CREATE INDEX partner_support_disputes_status_opened_idx
  ON partner_support_disputes (status, opened_at DESC);

CREATE INDEX partner_support_disputes_partner_updated_idx
  ON partner_support_disputes (partner_id, updated_at DESC);

CREATE TABLE partner_support_dispute_events (
  id uuid PRIMARY KEY,
  dispute_id uuid NOT NULL REFERENCES partner_support_disputes(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('opened', 'status_changed')),
  from_status text CHECK (
    from_status IS NULL OR from_status IN ('open', 'in_review', 'upheld', 'rejected')
  ),
  to_status text NOT NULL CHECK (
    to_status IN ('open', 'in_review', 'upheld', 'rejected')
  ),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      event_type = 'opened'
      AND from_status IS NULL
      AND to_status = 'open'
    )
    OR (
      event_type = 'status_changed'
      AND from_status IS NOT NULL
      AND from_status <> to_status
    )
  )
);

CREATE INDEX partner_support_dispute_events_dispute_created_idx
  ON partner_support_dispute_events (dispute_id, created_at, id);

ALTER TABLE partner_support_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_support_disputes FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_support_dispute_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_support_dispute_events FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_support_disputes_read_policy
  ON partner_support_disputes
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'partner'
      AND partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY partner_support_disputes_partner_insert_policy
  ON partner_support_disputes
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'partner'
    AND partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND status = 'open'
    AND assigned_to IS NULL
    AND reviewed_at IS NULL
    AND decision IS NULL
    AND decided_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM partner_support_cases support
      WHERE support.id = partner_support_disputes.case_id
        AND support.partner_id = partner_support_disputes.partner_id
        AND support.status = 'resolved'
    )
  );

CREATE POLICY partner_support_disputes_operation_update_policy
  ON partner_support_disputes
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND assigned_to IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM users assignee
      WHERE assignee.id = partner_support_disputes.assigned_to
        AND assignee.role = 'operation'
    )
  );

CREATE POLICY partner_support_dispute_events_read_policy
  ON partner_support_dispute_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM partner_support_disputes dispute
      WHERE dispute.id = partner_support_dispute_events.dispute_id
    )
  );

CREATE POLICY partner_support_dispute_events_insert_policy
  ON partner_support_dispute_events
  FOR INSERT
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND (
      (
        current_setting('app.actor_role', true) = 'partner'
        AND event_type = 'opened'
        AND from_status IS NULL
        AND to_status = 'open'
        AND EXISTS (
          SELECT 1
          FROM partner_support_disputes dispute
          WHERE dispute.id = partner_support_dispute_events.dispute_id
            AND dispute.partner_id = actor_id
            AND dispute.status = 'open'
        )
      )
      OR (
        current_setting('app.actor_role', true) = 'operation'
        AND event_type = 'status_changed'
        AND EXISTS (
          SELECT 1
          FROM partner_support_disputes dispute
          WHERE dispute.id = partner_support_dispute_events.dispute_id
            AND dispute.status = partner_support_dispute_events.to_status
            AND (
              (
                partner_support_dispute_events.from_status = 'open'
                AND partner_support_dispute_events.to_status = 'in_review'
              )
              OR (
                partner_support_dispute_events.from_status = 'in_review'
                AND partner_support_dispute_events.to_status IN ('upheld', 'rejected')
              )
            )
        )
      )
    )
  );

GRANT SELECT, INSERT ON partner_support_disputes TO max_service_app;
GRANT UPDATE (
  status,
  assigned_to,
  decision,
  reviewed_at,
  decided_at,
  updated_at
) ON partner_support_disputes TO max_service_app;
GRANT SELECT, INSERT ON partner_support_dispute_events TO max_service_app;
