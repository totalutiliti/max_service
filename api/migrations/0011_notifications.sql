CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK (type IN (
    'system', 'proposal_received', 'proposal_accepted', 'message_received',
    'booking_started', 'booking_completed', 'booking_cancelled',
    'review_received', 'case_opened', 'case_updated'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 500),
  entity_type text NOT NULL CHECK (entity_type IN ('system', 'proposal', 'booking', 'conversation', 'service_review', 'support_case')),
  entity_id uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

INSERT INTO notifications (id, user_id, actor_id, type, title, body, entity_type, entity_id, created_at)
SELECT
  gen_random_uuid(),
  recipient.id,
  '00000000-0000-4000-8000-000000000401',
  'system',
  'Bem-vindo à central Max',
  'Seus avisos importantes aparecerão aqui e permanecerão disponíveis após recarregar a plataforma.',
  'system',
  '00000000-0000-4000-8000-000000000401',
  now()
FROM users recipient;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_read_policy ON notifications FOR SELECT USING (
  user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY notifications_update_policy ON notifications FOR UPDATE USING (
  user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
) WITH CHECK (
  user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY notifications_insert_policy ON notifications FOR INSERT WITH CHECK (
  actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND user_id <> actor_id
  AND (
    (
      entity_type = 'proposal'
      AND EXISTS (
        SELECT 1 FROM proposals p
        JOIN service_requests r ON r.id = p.request_id
        WHERE p.id = notifications.entity_id
          AND (
            (p.provider_id = notifications.actor_id AND r.customer_id = notifications.user_id)
            OR (r.customer_id = notifications.actor_id AND p.provider_id = notifications.user_id)
          )
      )
    )
    OR (
      entity_type = 'booking'
      AND EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.id = notifications.entity_id
          AND (
            (b.customer_id = notifications.actor_id AND b.provider_id = notifications.user_id)
            OR (b.provider_id = notifications.actor_id AND b.customer_id = notifications.user_id)
          )
      )
    )
    OR (
      entity_type = 'conversation'
      AND EXISTS (
        SELECT 1
        FROM conversation_members sender
        JOIN conversation_members recipient ON recipient.conversation_id = sender.conversation_id
        WHERE sender.conversation_id = notifications.entity_id
          AND sender.user_id = notifications.actor_id
          AND recipient.user_id = notifications.user_id
      )
    )
    OR (
      entity_type = 'service_review'
      AND EXISTS (
        SELECT 1 FROM service_reviews review
        WHERE review.id = notifications.entity_id
          AND review.author_id = notifications.actor_id
          AND review.subject_id = notifications.user_id
      )
    )
    OR (
      entity_type = 'support_case'
      AND (
        (
          current_setting('app.actor_role', true) = 'operation'
          AND EXISTS (
            SELECT 1 FROM support_cases support
            WHERE support.id = notifications.entity_id
              AND support.opened_by = notifications.user_id
          )
        )
        OR (
          current_setting('app.actor_role', true) IN ('customer', 'provider')
          AND notifications.user_id = '00000000-0000-4000-8000-000000000401'::uuid
          AND EXISTS (
            SELECT 1 FROM support_cases support
            WHERE support.id = notifications.entity_id
              AND support.opened_by = notifications.actor_id
          )
        )
      )
    )
  )
);

GRANT SELECT, INSERT ON notifications TO max_service_app;
GRANT UPDATE (read_at) ON notifications TO max_service_app;
