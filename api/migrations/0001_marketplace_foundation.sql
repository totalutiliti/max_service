CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('customer', 'provider', 'partner', 'operation')),
  display_name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_categories (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_requests (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES users(id),
  category_id uuid NOT NULL REFERENCES service_categories(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 500),
  neighborhood text NOT NULL,
  city text NOT NULL,
  state char(2) NOT NULL,
  preferred_window text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'proposals_received', 'booked', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE proposals (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES service_requests(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  estimated_minutes integer NOT NULL CHECK (estimated_minutes > 0),
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 500),
  status text NOT NULL CHECK (status IN ('sent', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, provider_id)
);

CREATE TABLE request_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES service_requests(id),
  status text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_requests_customer_created_idx ON service_requests (customer_id, created_at DESC);
CREATE INDEX service_requests_status_created_idx ON service_requests (status, created_at DESC);
CREATE INDEX proposals_request_amount_idx ON proposals (request_id, amount_cents);
CREATE INDEX request_status_history_request_idx ON request_status_history (request_id, created_at);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at);

INSERT INTO service_categories (id, slug, name, icon, sort_order) VALUES
  ('10000000-0000-4000-8000-000000000001', 'eletricista', 'Eletricista', '⚡', 1),
  ('10000000-0000-4000-8000-000000000002', 'encanador', 'Encanador', '💧', 2),
  ('10000000-0000-4000-8000-000000000003', 'pedreiro', 'Pedreiro', '▦', 3),
  ('10000000-0000-4000-8000-000000000004', 'pintor', 'Pintor', '◒', 4),
  ('10000000-0000-4000-8000-000000000005', 'diarista', 'Diarista', '✦', 5),
  ('10000000-0000-4000-8000-000000000006', 'montagem', 'Montagem', '⌁', 6);

INSERT INTO users (id, public_code, role, display_name, email) VALUES
  ('00000000-0000-4000-8000-000000000101', 'CL-DEMO', 'customer', 'Marina Alves', 'marina@demo.maxservice'),
  ('00000000-0000-4000-8000-000000000201', 'PR-DEMO', 'provider', 'Rafael Santos', 'rafael@demo.maxservice'),
  ('00000000-0000-4000-8000-000000000202', 'PR-DEMO2', 'provider', 'Márcia Costa', 'marcia@demo.maxservice'),
  ('00000000-0000-4000-8000-000000000301', 'PC-DEMO', 'partner', 'João Martins', 'joao@demo.maxservice'),
  ('00000000-0000-4000-8000-000000000401', 'AD-DEMO', 'operation', 'Equipe Max', 'operacao@demo.maxservice');

INSERT INTO service_requests (
  id, public_code, customer_id, category_id, title, description,
  neighborhood, city, state, preferred_window, status, created_at
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  'SV-1048',
  '00000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000001',
  'Troca de chuveiro',
  'Preciso trocar um chuveiro que parou de aquecer e revisar a fiação do ponto.',
  'Jardim Europa',
  'Sorocaba',
  'SP',
  'Amanhã pela manhã',
  'booked',
  now() - interval '2 days'
);

INSERT INTO proposals (id, request_id, provider_id, amount_cents, estimated_minutes, message, status) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 9500, 90, 'Posso realizar amanhã às 09:30 e levo as ferramentas necessárias.', 'accepted'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 11000, 75, 'Tenho disponibilidade amanhã no período da manhã.', 'declined');

INSERT INTO request_status_history (request_id, status, actor_id, note) VALUES
  ('20000000-0000-4000-8000-000000000001', 'open', '00000000-0000-4000-8000-000000000101', 'Solicitação criada pelo cliente.'),
  ('20000000-0000-4000-8000-000000000001', 'booked', '00000000-0000-4000-8000-000000000101', 'Proposta aceita pelo cliente.');

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_status_history FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY users_read_policy ON users FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR role = 'provider'
);

CREATE POLICY requests_read_policy ON service_requests FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR (current_setting('app.actor_role', true) = 'provider' AND status IN ('open', 'proposals_received', 'booked'))
);

CREATE POLICY requests_insert_policy ON service_requests FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'customer'
  AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY requests_update_policy ON service_requests FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY proposals_read_policy ON proposals FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR EXISTS (
    SELECT 1 FROM service_requests r
    WHERE r.id = proposals.request_id
      AND r.customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);

CREATE POLICY proposals_insert_policy ON proposals FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY proposals_update_policy ON proposals FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR EXISTS (
    SELECT 1 FROM service_requests r
    WHERE r.id = proposals.request_id
      AND r.customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR EXISTS (
    SELECT 1 FROM service_requests r
    WHERE r.id = proposals.request_id
      AND r.customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);

CREATE POLICY request_history_read_policy ON request_status_history FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR EXISTS (SELECT 1 FROM service_requests r WHERE r.id = request_status_history.request_id)
);

CREATE POLICY request_history_insert_policy ON request_status_history FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) IN ('customer', 'provider', 'operation')
  AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY audit_insert_policy ON audit_events FOR INSERT WITH CHECK (
  actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND actor_role = current_setting('app.actor_role', true)
);

CREATE POLICY audit_read_policy ON audit_events FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
);

GRANT SELECT (id, public_code, role, display_name) ON users TO max_service_app;
GRANT SELECT ON service_categories TO max_service_app;
GRANT SELECT, INSERT, UPDATE ON service_requests TO max_service_app;
GRANT SELECT, INSERT, UPDATE ON proposals TO max_service_app;
GRANT SELECT, INSERT ON request_status_history TO max_service_app;
GRANT SELECT, INSERT ON audit_events TO max_service_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO max_service_app;
