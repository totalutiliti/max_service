CREATE TABLE partner_support_cases (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  partner_id uuid NOT NULL REFERENCES users(id),
  referral_id uuid REFERENCES partner_referrals(id),
  topic text NOT NULL CHECK (topic IN ('referral', 'account', 'finance_sandbox', 'other')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 120),
  assigned_to uuid REFERENCES users(id),
  resolution text CHECK (resolution IS NULL OR char_length(resolution) BETWEEN 10 AND 1000),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'resolved' AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
    OR (status <> 'resolved' AND resolution IS NULL AND resolved_at IS NULL)
  )
);

CREATE INDEX partner_support_cases_status_priority_created_idx
  ON partner_support_cases (status, priority, created_at DESC);

CREATE INDEX partner_support_cases_partner_updated_idx
  ON partner_support_cases (partner_id, updated_at DESC);

CREATE TABLE partner_support_events (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES partner_support_cases(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('message', 'status_changed')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('open', 'in_review', 'resolved')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('open', 'in_review', 'resolved')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (event_type = 'message' AND from_status IS NULL AND to_status IS NULL)
    OR (
      event_type = 'status_changed'
      AND from_status IS NOT NULL
      AND to_status IS NOT NULL
      AND from_status <> to_status
    )
  )
);

CREATE INDEX partner_support_events_case_created_idx
  ON partner_support_events (case_id, created_at, id);

INSERT INTO partner_support_cases (
  id, public_code, partner_id, referral_id, topic, priority, status, subject,
  assigned_to, created_at, updated_at
) VALUES (
  '76000000-0000-4000-8000-000000000001',
  'AT-7K2M',
  '00000000-0000-4000-8000-000000000301',
  '71000000-0000-4000-8000-000000000002',
  'referral',
  'normal',
  'in_review',
  'Dúvida sobre análise de indicação',
  '00000000-0000-4000-8000-000000000401',
  now() - interval '3 days',
  now() - interval '2 days 22 hours'
);

INSERT INTO partner_support_events (
  id, case_id, actor_id, event_type, from_status, to_status, body, created_at
) VALUES
  (
    '76100000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301',
    'message',
    NULL,
    NULL,
    'Gostaria de entender quais informações ainda faltam para concluir a análise desta indicação.',
    now() - interval '3 days'
  ),
  (
    '76100000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'status_changed',
    'open',
    'in_review',
    'A solicitação foi assumida pela equipe de Operação para conferência.',
    now() - interval '2 days 23 hours'
  ),
  (
    '76100000-0000-4000-8000-000000000003',
    '76000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000401',
    'message',
    NULL,
    NULL,
    'A indicação está em análise. Avisaremos por aqui quando a conferência for concluída.',
    now() - interval '2 days 22 hours'
  );

ALTER TABLE partner_support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_support_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_support_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_support_events FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_support_cases_read_policy
  ON partner_support_cases
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'partner'
      AND partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

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

CREATE POLICY partner_support_cases_operation_update_policy
  ON partner_support_cases
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY partner_support_events_read_policy
  ON partner_support_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM partner_support_cases support
      WHERE support.id = partner_support_events.case_id
    )
  );

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
                partner_support_events.event_type = 'message'
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

GRANT SELECT, INSERT ON partner_support_cases TO max_service_app;
GRANT UPDATE (status, assigned_to, resolution, resolved_at, updated_at)
  ON partner_support_cases TO max_service_app;
GRANT SELECT, INSERT ON partner_support_events TO max_service_app;

ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check,
  DROP CONSTRAINT notifications_entity_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'system', 'proposal_received', 'proposal_accepted', 'message_received',
    'booking_started', 'booking_completed', 'booking_cancelled',
    'review_received', 'case_opened', 'case_updated', 'referral_reviewed',
    'support_message'
  )),
  ADD CONSTRAINT notifications_entity_type_check CHECK (
    entity_type IN (
      'system', 'proposal', 'booking', 'conversation', 'service_review',
      'support_case', 'partner_referral', 'partner_support_case'
    )
  );

CREATE POLICY notifications_partner_support_insert_policy
  ON notifications
  FOR INSERT
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND user_id <> actor_id
    AND entity_type = 'partner_support_case'
    AND (
      (
        current_setting('app.actor_role', true) = 'partner'
        AND user_id = '00000000-0000-4000-8000-000000000401'::uuid
        AND EXISTS (
          SELECT 1
          FROM partner_support_cases support
          WHERE support.id = notifications.entity_id
            AND support.partner_id = notifications.actor_id
        )
      )
      OR (
        current_setting('app.actor_role', true) = 'operation'
        AND EXISTS (
          SELECT 1
          FROM partner_support_cases support
          WHERE support.id = notifications.entity_id
            AND support.partner_id = notifications.user_id
        )
      )
    )
  );
