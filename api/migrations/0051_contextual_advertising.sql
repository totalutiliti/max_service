ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer', 'provider', 'partner', 'advertiser', 'operation'));

INSERT INTO users (id, public_code, role, display_name, email)
VALUES (
  '00000000-0000-4000-8000-000000000501',
  'AN-DEMO',
  'advertiser',
  'Casa Forte Materiais',
  'midia@demo.maxservice'
);

ALTER TABLE demo_sessions DROP CONSTRAINT demo_sessions_role_check;
ALTER TABLE demo_sessions
  ADD CONSTRAINT demo_sessions_role_check
  CHECK (role IN ('customer', 'provider', 'partner', 'advertiser', 'operation'));

DROP POLICY demo_sessions_insert_policy ON demo_sessions;
CREATE POLICY demo_sessions_insert_policy ON demo_sessions FOR INSERT WITH CHECK (
  token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
  AND (
    (role = 'customer' AND user_id = '00000000-0000-4000-8000-000000000101'::uuid)
    OR (role = 'provider' AND user_id = '00000000-0000-4000-8000-000000000201'::uuid)
    OR (role = 'partner' AND user_id = '00000000-0000-4000-8000-000000000301'::uuid)
    OR (role = 'advertiser' AND user_id = '00000000-0000-4000-8000-000000000501'::uuid)
    OR (role = 'operation' AND user_id = '00000000-0000-4000-8000-000000000401'::uuid)
  )
);

CREATE TABLE advertiser_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  brand_name text NOT NULL CHECK (char_length(brand_name) BETWEEN 3 AND 120),
  website_url text NOT NULL CHECK (website_url ~ '^https://'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contextual_ad_campaigns (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  advertiser_id uuid NOT NULL REFERENCES advertiser_profiles(user_id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  headline text NOT NULL CHECK (char_length(headline) BETWEEN 5 AND 90),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 240),
  cta_label text NOT NULL CHECK (char_length(cta_label) BETWEEN 2 AND 32),
  destination_url text NOT NULL CHECK (destination_url ~ '^https://'),
  target_category_id uuid REFERENCES service_categories(id),
  target_region_id uuid REFERENCES service_regions(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  impression_limit integer NOT NULL DEFAULT 10000
    CHECK (impression_limit BETWEEN 1 AND 1000000),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'paused', 'ended')),
  policy_version text NOT NULL DEFAULT 'CONTEXTUAL-ADS-2026-01',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (
    (status IN ('approved', 'rejected', 'paused') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR status IN ('pending_review', 'ended')
  )
);

CREATE INDEX contextual_ad_campaigns_delivery_idx
  ON contextual_ad_campaigns (
    status,
    target_category_id,
    target_region_id,
    starts_at,
    ends_at
  );

CREATE INDEX contextual_ad_campaigns_advertiser_idx
  ON contextual_ad_campaigns (advertiser_id, created_at DESC);

CREATE TABLE contextual_ad_moderation_events (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES contextual_ad_campaigns(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  actor_role text NOT NULL CHECK (actor_role IN ('advertiser', 'operation')),
  event_type text NOT NULL
    CHECK (event_type IN ('submitted', 'approved', 'rejected', 'paused', 'activated')),
  from_status text,
  to_status text NOT NULL,
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  policy_version text NOT NULL DEFAULT 'CONTEXTUAL-ADS-2026-01',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contextual_ad_moderation_events_campaign_idx
  ON contextual_ad_moderation_events (campaign_id, created_at DESC);

CREATE TABLE contextual_ad_deliveries (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES contextual_ad_campaigns(id) ON DELETE CASCADE,
  delivery_token_hash char(64) NOT NULL UNIQUE
    CHECK (delivery_token_hash ~ '^[a-f0-9]{64}$'),
  context_category_id uuid NOT NULL REFERENCES service_categories(id),
  context_region_id uuid NOT NULL REFERENCES service_regions(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  CHECK (clicked_at IS NULL OR clicked_at >= occurred_at)
);

CREATE INDEX contextual_ad_deliveries_campaign_recent_idx
  ON contextual_ad_deliveries (campaign_id, occurred_at DESC);

CREATE INDEX contextual_ad_deliveries_retention_idx
  ON contextual_ad_deliveries (occurred_at);

CREATE FUNCTION contextual_ad_usage(target_campaign_id uuid)
RETURNS TABLE (
  impression_count integer,
  click_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.actor_role', true) NOT IN ('customer', 'advertiser', 'operation')
  THEN
    RAISE EXCEPTION 'contextual ad metrics are restricted'
      USING ERRCODE = '42501';
  END IF;

  IF current_setting('app.actor_role', true) = 'advertiser'
    AND NOT EXISTS (
      SELECT 1
      FROM contextual_ad_campaigns campaign
      WHERE campaign.id = target_campaign_id
        AND campaign.advertiser_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  THEN
    RAISE EXCEPTION 'contextual ad metrics are restricted to the owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE delivery.clicked_at IS NOT NULL)::integer
    FROM contextual_ad_deliveries delivery
    WHERE delivery.campaign_id = target_campaign_id;
END;
$$;

INSERT INTO advertiser_profiles (user_id, brand_name, website_url)
VALUES (
  '00000000-0000-4000-8000-000000000501',
  'Casa Forte Materiais',
  'https://example.com/casa-forte'
);

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
  status,
  reviewed_by,
  reviewed_at
)
VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'ADS-CF01',
  '00000000-0000-4000-8000-000000000501',
  'Elétrica segura no piloto',
  'Materiais elétricos para o seu reparo',
  'Confira itens essenciais para instalações residenciais, com especificações claras antes da compra.',
  'Conhecer oferta',
  'https://example.com/ofertas-eletrica',
  '10000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  now() - interval '1 day',
  now() + interval '90 days',
  10000,
  'approved',
  '00000000-0000-4000-8000-000000000401',
  now() - interval '1 day'
);

INSERT INTO contextual_ad_moderation_events (
  id,
  campaign_id,
  actor_id,
  actor_role,
  event_type,
  from_status,
  to_status,
  note,
  created_at
)
VALUES (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000401',
  'operation',
  'approved',
  'pending_review',
  'approved',
  'Peça demonstrativa aprovada para contexto de elétrica no piloto, sem perfilamento comportamental.',
  now() - interval '1 day'
);

ALTER TABLE advertiser_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE advertiser_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE contextual_ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE contextual_ad_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE contextual_ad_moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE contextual_ad_moderation_events FORCE ROW LEVEL SECURITY;
ALTER TABLE contextual_ad_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE contextual_ad_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY advertiser_profiles_read_policy
  ON advertiser_profiles
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY contextual_ad_campaigns_read_policy
  ON contextual_ad_campaigns
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR advertiser_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    OR (
      current_setting('app.actor_role', true) = 'customer'
      AND status = 'approved'
      AND starts_at <= now()
      AND ends_at > now()
    )
  );

CREATE POLICY contextual_ad_campaigns_advertiser_insert_policy
  ON contextual_ad_campaigns
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'advertiser'
    AND advertiser_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND status = 'pending_review'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE POLICY contextual_ad_campaigns_operation_update_policy
  ON contextual_ad_campaigns
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY contextual_ad_moderation_events_read_policy
  ON contextual_ad_moderation_events
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR EXISTS (
      SELECT 1
      FROM contextual_ad_campaigns campaign
      WHERE campaign.id = contextual_ad_moderation_events.campaign_id
        AND campaign.advertiser_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY contextual_ad_moderation_events_insert_policy
  ON contextual_ad_moderation_events
  FOR INSERT
  WITH CHECK (
    actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_role = current_setting('app.actor_role', true)
    AND actor_role IN ('advertiser', 'operation')
  );

CREATE POLICY contextual_ad_deliveries_customer_insert_policy
  ON contextual_ad_deliveries
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'customer'
    AND EXISTS (
      SELECT 1
      FROM contextual_ad_campaigns campaign
      WHERE campaign.id = contextual_ad_deliveries.campaign_id
        AND campaign.status = 'approved'
        AND campaign.starts_at <= now()
        AND campaign.ends_at > now()
        AND (
          campaign.target_category_id IS NULL
          OR campaign.target_category_id = contextual_ad_deliveries.context_category_id
        )
        AND (
          campaign.target_region_id IS NULL
          OR campaign.target_region_id = contextual_ad_deliveries.context_region_id
        )
    )
  );

CREATE POLICY contextual_ad_deliveries_customer_update_policy
  ON contextual_ad_deliveries
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'customer')
  WITH CHECK (current_setting('app.actor_role', true) = 'customer');

CREATE POLICY contextual_ad_deliveries_advertiser_read_policy
  ON contextual_ad_deliveries
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR EXISTS (
      SELECT 1
      FROM contextual_ad_campaigns campaign
      WHERE campaign.id = contextual_ad_deliveries.campaign_id
        AND campaign.advertiser_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

GRANT SELECT ON advertiser_profiles TO max_service_app;
GRANT SELECT, INSERT, UPDATE ON contextual_ad_campaigns TO max_service_app;
GRANT SELECT, INSERT ON contextual_ad_moderation_events TO max_service_app;
GRANT SELECT, INSERT, UPDATE ON contextual_ad_deliveries TO max_service_app;
REVOKE ALL ON FUNCTION contextual_ad_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contextual_ad_usage(uuid) TO max_service_app;
