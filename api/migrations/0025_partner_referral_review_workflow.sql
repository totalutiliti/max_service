ALTER TABLE partner_referrals
  DROP CONSTRAINT partner_referrals_status_check;

ALTER TABLE partner_referrals
  ADD CONSTRAINT partner_referrals_status_check
  CHECK (status IN ('invited', 'in_review', 'approved', 'active', 'rejected'));

CREATE TABLE partner_referral_events (
  id uuid PRIMARY KEY,
  referral_id uuid NOT NULL REFERENCES partner_referrals(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('review_started', 'approved', 'rejected')),
  from_status text NOT NULL CHECK (from_status IN ('invited', 'in_review')),
  to_status text NOT NULL CHECK (to_status IN ('in_review', 'approved', 'rejected')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (event_type = 'review_started' AND from_status = 'invited' AND to_status = 'in_review')
    OR (event_type = 'approved' AND from_status = 'in_review' AND to_status = 'approved')
    OR (event_type = 'rejected' AND from_status = 'in_review' AND to_status = 'rejected')
  )
);

CREATE INDEX partner_referral_events_referral_created_idx
  ON partner_referral_events (referral_id, created_at DESC);

INSERT INTO partner_referral_events (
  id, referral_id, actor_id, event_type, from_status, to_status, note, created_at
)
SELECT
  gen_random_uuid(),
  referral.id,
  '00000000-0000-4000-8000-000000000401',
  'review_started',
  'invited',
  'in_review',
  'Análise operacional iniciada antes da implantação da trilha de eventos.',
  referral.created_at + interval '1 hour'
FROM partner_referrals referral
WHERE referral.status = 'in_review';

ALTER TABLE partner_referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_referral_events FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_referral_events_operation_read_policy
  ON partner_referral_events
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY partner_referral_events_operation_insert_policy
  ON partner_referral_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY partner_referrals_operation_update_policy
  ON partner_referrals
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (current_setting('app.actor_role', true) = 'operation');

GRANT SELECT, INSERT ON partner_referral_events TO max_service_app;
GRANT UPDATE (status) ON partner_referrals TO max_service_app;

ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check,
  DROP CONSTRAINT notifications_entity_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'system', 'proposal_received', 'proposal_accepted', 'message_received',
    'booking_started', 'booking_completed', 'booking_cancelled',
    'review_received', 'case_opened', 'case_updated', 'referral_reviewed'
  )),
  ADD CONSTRAINT notifications_entity_type_check CHECK (
    entity_type IN ('system', 'proposal', 'booking', 'conversation', 'service_review', 'support_case', 'partner_referral')
  );

DROP POLICY notifications_insert_policy ON notifications;

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
    OR (
      entity_type = 'partner_referral'
      AND current_setting('app.actor_role', true) = 'operation'
      AND EXISTS (
        SELECT 1 FROM partner_referrals referral
        WHERE referral.id = notifications.entity_id
          AND referral.partner_id = notifications.user_id
      )
    )
  )
);
