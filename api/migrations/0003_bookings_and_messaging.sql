CREATE TABLE bookings (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  proposal_id uuid NOT NULL UNIQUE REFERENCES proposals(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE booking_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  status text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  member_role text NOT NULL CHECK (member_role IN ('customer', 'provider')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bookings_actor_status_idx ON bookings (customer_id, provider_id, status);
CREATE INDEX booking_history_booking_idx ON booking_status_history (booking_id, created_at);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

CREATE POLICY bookings_read_policy ON bookings FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY bookings_insert_policy ON bookings FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'customer'
  AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY bookings_update_policy ON bookings FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY booking_history_read_policy ON booking_status_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_status_history.booking_id)
);

CREATE POLICY booking_history_insert_policy ON booking_status_history FOR INSERT WITH CHECK (
  actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_status_history.booking_id)
);

CREATE POLICY conversations_read_policy ON conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM bookings b WHERE b.id = conversations.booking_id)
);

CREATE POLICY conversations_insert_policy ON conversations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM bookings b WHERE b.id = conversations.booking_id)
);

CREATE POLICY members_read_policy ON conversation_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN bookings b ON b.id = c.booking_id
    WHERE c.id = conversation_members.conversation_id
  )
);

CREATE POLICY members_insert_policy ON conversation_members FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN bookings b ON b.id = c.booking_id
    WHERE c.id = conversation_members.conversation_id
  )
);

CREATE POLICY messages_read_policy ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN bookings b ON b.id = c.booking_id
    WHERE c.id = messages.conversation_id
  )
);

CREATE POLICY messages_insert_policy ON messages FOR INSERT WITH CHECK (
  sender_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM conversations c
    JOIN bookings b ON b.id = c.booking_id
    WHERE c.id = messages.conversation_id
  )
);

DROP POLICY users_read_policy ON users;
CREATE POLICY users_read_policy ON users FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR role = 'provider'
  OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE (
      b.customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      OR b.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
    AND id IN (b.customer_id, b.provider_id)
  )
);

GRANT SELECT, INSERT, UPDATE ON bookings TO max_service_app;
GRANT SELECT, INSERT ON booking_status_history TO max_service_app;
GRANT SELECT, INSERT ON conversations TO max_service_app;
GRANT SELECT, INSERT ON conversation_members TO max_service_app;
GRANT SELECT, INSERT ON messages TO max_service_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO max_service_app;

INSERT INTO bookings (
  id, request_id, proposal_id, customer_id, provider_id, status, scheduled_for, created_at
)
SELECT
  gen_random_uuid(),
  r.id,
  p.id,
  r.customer_id,
  p.provider_id,
  'scheduled',
  (
    date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 9 hours'
  ) AT TIME ZONE 'America/Sao_Paulo',
  GREATEST(r.updated_at, p.updated_at)
FROM proposals p
JOIN service_requests r ON r.id = p.request_id
WHERE p.status = 'accepted'
ON CONFLICT (request_id) DO NOTHING;

INSERT INTO booking_status_history (booking_id, status, actor_id, note)
SELECT b.id, 'scheduled', b.customer_id, 'Agendamento criado a partir da proposta aceita.'
FROM bookings b
WHERE NOT EXISTS (SELECT 1 FROM booking_status_history h WHERE h.booking_id = b.id);

INSERT INTO conversations (id, booking_id, created_at)
SELECT gen_random_uuid(), b.id, b.created_at
FROM bookings b
ON CONFLICT (booking_id) DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id, member_role)
SELECT c.id, b.customer_id, 'customer'
FROM conversations c JOIN bookings b ON b.id = c.booking_id
ON CONFLICT DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id, member_role)
SELECT c.id, b.provider_id, 'provider'
FROM conversations c JOIN bookings b ON b.id = c.booking_id
ON CONFLICT DO NOTHING;

INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
SELECT gen_random_uuid(), c.id, b.provider_id, 'Olá! Recebi a confirmação. Podemos alinhar os detalhes por aqui.', b.created_at + interval '1 minute'
FROM conversations c JOIN bookings b ON b.id = c.booking_id
WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id);

INSERT INTO messages (id, conversation_id, sender_id, body, created_at)
SELECT gen_random_uuid(), c.id, b.customer_id, 'Perfeito. O horário combinado funciona para mim.', b.created_at + interval '2 minutes'
FROM conversations c JOIN bookings b ON b.id = c.booking_id
WHERE (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) = 1;
