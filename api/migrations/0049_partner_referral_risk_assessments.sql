ALTER TABLE partner_referrals
  ADD COLUMN additional_verification_required boolean NOT NULL DEFAULT false;

CREATE TABLE partner_referral_risk_assessments (
  id uuid PRIMARY KEY,
  referral_id uuid NOT NULL UNIQUE REFERENCES partner_referrals(id),
  policy_version text NOT NULL CHECK (policy_version = 'REFERRAL-RISK-2026-01'),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'attention', 'high')),
  signals jsonb NOT NULL CHECK (jsonb_typeof(signals) = 'array'),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (risk_level = 'low' AND jsonb_array_length(signals) = 0)
    OR (risk_level IN ('attention', 'high') AND jsonb_array_length(signals) > 0)
  )
);

CREATE INDEX partner_referral_risk_assessments_level_evaluated_idx
  ON partner_referral_risk_assessments (risk_level, evaluated_at DESC);

CREATE TABLE partner_referral_risk_reviews (
  id uuid PRIMARY KEY,
  assessment_id uuid NOT NULL UNIQUE REFERENCES partner_referral_risk_assessments(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL CHECK (outcome IN ('cleared', 'confirmed')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 20 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX partner_referral_risk_reviews_created_idx
  ON partner_referral_risk_reviews (created_at DESC);

INSERT INTO partner_referral_risk_assessments (
  id,
  referral_id,
  policy_version,
  risk_level,
  signals,
  evaluated_at
)
SELECT
  gen_random_uuid(),
  referral.id,
  'REFERRAL-RISK-2026-01',
  'low',
  '[]'::jsonb,
  referral.created_at
FROM partner_referrals referral;

CREATE FUNCTION canonical_referral_email(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT regexp_replace(lower(trim(value)), '\+[^@]*@', '@');
$$;

CREATE FUNCTION partner_referral_risk_context(target_referral_id uuid)
RETURNS TABLE (
  self_referral boolean,
  duplicate_partner_count integer,
  recent_referral_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_referral partner_referrals%ROWTYPE;
  target_partner_email text;
  actor_role text := current_setting('app.actor_role', true);
  actor_id uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  configured_referral_link_id uuid := NULLIF(current_setting('app.referral_link_id', true), '')::uuid;
BEGIN
  SELECT referral.*
  INTO target_referral
  FROM partner_referrals referral
  WHERE referral.id = target_referral_id
    AND (
      actor_role = 'operation'
      OR (actor_role = 'partner' AND referral.partner_id = actor_id)
      OR (actor_role = 'public_referral' AND referral.referral_link_id = configured_referral_link_id)
    );

  IF target_referral.id IS NULL THEN
    RAISE EXCEPTION 'Indicação indisponível para avaliação preventiva.' USING ERRCODE = '42501';
  END IF;

  SELECT email
  INTO target_partner_email
  FROM users
  WHERE id = target_referral.partner_id;

  RETURN QUERY
  SELECT
    canonical_referral_email(target_partner_email) = canonical_referral_email(target_referral.email),
    (
      SELECT count(DISTINCT other.partner_id)::integer
      FROM partner_referrals other
      WHERE other.id <> target_referral.id
        AND other.partner_id <> target_referral.partner_id
        AND canonical_referral_email(other.email) = canonical_referral_email(target_referral.email)
    ),
    (
      SELECT count(*)::integer
      FROM partner_referrals other
      WHERE other.id <> target_referral.id
        AND other.partner_id = target_referral.partner_id
        AND other.created_at >= target_referral.created_at - interval '24 hours'
        AND other.created_at <= target_referral.created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION canonical_referral_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION partner_referral_risk_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_referral_risk_context(uuid) TO max_service_app;

ALTER TABLE partner_referral_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_referral_risk_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_referral_risk_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_referral_risk_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_referral_risk_assessments_operation_read_policy
  ON partner_referral_risk_assessments
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY partner_referral_risk_assessments_capture_insert_policy
  ON partner_referral_risk_assessments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM partner_referrals referral
      WHERE referral.id = partner_referral_risk_assessments.referral_id
        AND (
          (
            current_setting('app.actor_role', true) = 'partner'
            AND referral.partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
          )
          OR (
            current_setting('app.actor_role', true) = 'public_referral'
            AND referral.referral_link_id = NULLIF(current_setting('app.referral_link_id', true), '')::uuid
          )
        )
    )
  );

CREATE POLICY partner_referral_risk_reviews_operation_read_policy
  ON partner_referral_risk_reviews
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY partner_referral_risk_reviews_operation_insert_policy
  ON partner_referral_risk_reviews
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY partner_referrals_capture_risk_flag_update_policy
  ON partner_referrals
  FOR UPDATE
  USING (
    status = 'invited'
    AND (
      (
        current_setting('app.actor_role', true) = 'partner'
        AND partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      )
      OR (
        current_setting('app.actor_role', true) = 'public_referral'
        AND referral_link_id = NULLIF(current_setting('app.referral_link_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    status = 'invited'
    AND (
      (
        current_setting('app.actor_role', true) = 'partner'
        AND partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      )
      OR (
        current_setting('app.actor_role', true) = 'public_referral'
        AND referral_link_id = NULLIF(current_setting('app.referral_link_id', true), '')::uuid
      )
    )
  );

GRANT SELECT, INSERT ON partner_referral_risk_assessments TO max_service_app;
GRANT SELECT, INSERT ON partner_referral_risk_reviews TO max_service_app;
GRANT UPDATE (additional_verification_required) ON partner_referrals TO max_service_app;
