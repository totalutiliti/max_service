CREATE TABLE partner_referral_links (
  id uuid PRIMARY KEY,
  partner_id uuid NOT NULL UNIQUE REFERENCES users(id),
  referral_code text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partner_referrals (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  referral_link_id uuid NOT NULL REFERENCES partner_referral_links(id),
  partner_id uuid NOT NULL REFERENCES users(id),
  provider_id uuid UNIQUE REFERENCES users(id),
  service_category_id uuid NOT NULL REFERENCES service_categories(id),
  professional_name text NOT NULL CHECK (char_length(professional_name) BETWEEN 3 AND 120),
  email text NOT NULL CHECK (position('@' IN email) > 1),
  status text NOT NULL CHECK (status IN ('invited', 'in_review', 'active', 'rejected')),
  source text NOT NULL CHECK (source IN ('link', 'qr', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  CHECK ((status = 'active' AND provider_id IS NOT NULL AND activated_at IS NOT NULL) OR status <> 'active')
);

CREATE UNIQUE INDEX partner_referrals_partner_email_idx ON partner_referrals (partner_id, lower(email));
CREATE INDEX partner_referrals_partner_status_created_idx ON partner_referrals (partner_id, status, created_at DESC);

INSERT INTO users (id, public_code, role, display_name, email) VALUES
  ('00000000-0000-4000-8000-000000000203', 'PR-JL4Q', 'provider', 'João Lima', 'joao.lima@demo.maxservice'),
  ('00000000-0000-4000-8000-000000000204', 'PR-CG7B', 'provider', 'Carlos Gomes', 'carlos.gomes@demo.maxservice');

INSERT INTO partner_referral_links (id, partner_id, referral_code, slug, status) VALUES (
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000301',
  'PC-7K2M',
  'joao-martins',
  'active'
);

INSERT INTO partner_referrals (
  id, public_code, referral_link_id, partner_id, provider_id, service_category_id,
  professional_name, email, status, source, created_at, activated_at
) VALUES
  (
    '71000000-0000-4000-8000-000000000001', 'RF-JL4Q', '70000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000203',
    '10000000-0000-4000-8000-000000000004', 'João Lima', 'joao.lima@demo.maxservice',
    'active', 'link', now() - interval '18 days', now() - interval '16 days'
  ),
  (
    '71000000-0000-4000-8000-000000000002', 'RF-AP2A', '70000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301', NULL,
    '10000000-0000-4000-8000-000000000005', 'Ana Prado', 'ana.prado@demo.maxservice',
    'in_review', 'qr', now() - interval '1 day', NULL
  ),
  (
    '71000000-0000-4000-8000-000000000003', 'RF-CG7B', '70000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000204',
    '10000000-0000-4000-8000-000000000002', 'Carlos Gomes', 'carlos.gomes@demo.maxservice',
    'active', 'link', now() - interval '32 days', now() - interval '29 days'
  );

ALTER TABLE partner_referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_referral_links FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_referrals FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_referral_links_read_policy ON partner_referral_links FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY partner_referrals_read_policy ON partner_referrals FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY partner_referrals_insert_policy ON partner_referrals FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'partner'
  AND partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND provider_id IS NULL
  AND status = 'invited'
  AND source = 'manual'
  AND EXISTS (
    SELECT 1 FROM partner_referral_links link
    WHERE link.id = partner_referrals.referral_link_id
      AND link.partner_id = partner_referrals.partner_id
      AND link.status = 'active'
  )
);

GRANT SELECT ON partner_referral_links TO max_service_app;
GRANT SELECT, INSERT ON partner_referrals TO max_service_app;
