ALTER TABLE marketing_campaigns
  ADD COLUMN targeting_mode text NOT NULL DEFAULT 'contextual'
    CHECK (targeting_mode IN ('contextual', 'consented')),
  ADD COLUMN target_category_id uuid REFERENCES service_categories(id),
  ADD COLUMN target_region_id uuid REFERENCES service_regions(id);

CREATE INDEX marketing_campaigns_targeting_idx
  ON marketing_campaigns (targeting_mode, target_category_id, target_region_id)
  WHERE status = 'active';

ALTER TABLE campaign_reservations
  ADD COLUMN eligibility_snapshot jsonb NOT NULL DEFAULT jsonb_build_object(
    'targetingMode', 'contextual',
    'categoryMatched', true,
    'regionMatched', true,
    'consentRequired', false,
    'consentGranted', true
  ),
  ADD CONSTRAINT campaign_reservations_eligibility_snapshot_object
    CHECK (jsonb_typeof(eligibility_snapshot) = 'object');

CREATE TABLE campaign_validation_attempts (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES users(id),
  campaign_id uuid REFERENCES marketing_campaigns(id),
  code_fingerprint char(64) NOT NULL CHECK (code_fingerprint ~ '^[a-f0-9]{64}$'),
  context_category_id uuid REFERENCES service_categories(id),
  context_region_id uuid REFERENCES service_regions(id),
  result text NOT NULL CHECK (
    result IN (
      'accepted',
      'not_found',
      'outside_segment',
      'consent_required',
      'total_limit',
      'customer_limit',
      'blocked'
    )
  ),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_validation_attempts_customer_recent_idx
  ON campaign_validation_attempts (customer_id, occurred_at DESC);

CREATE INDEX campaign_validation_attempts_campaign_recent_idx
  ON campaign_validation_attempts (campaign_id, occurred_at DESC)
  WHERE campaign_id IS NOT NULL;

ALTER TABLE campaign_validation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_validation_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_validation_attempts_operation_read_policy
  ON campaign_validation_attempts
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY campaign_validation_attempts_customer_insert_policy
  ON campaign_validation_attempts
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'customer'
    AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND (
      campaign_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM marketing_campaigns campaign
        WHERE campaign.id = campaign_validation_attempts.campaign_id
      )
    )
  );

GRANT SELECT, INSERT ON campaign_validation_attempts TO max_service_app;

CREATE FUNCTION campaign_validation_abuse_state(target_customer_id uuid)
RETURNS TABLE (
  attempt_count_15m integer,
  rejected_count_15m integer,
  distinct_rejected_codes_24h integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.actor_role', true) <> 'customer'
    OR target_customer_id <> NULLIF(current_setting('app.actor_id', true), '')::uuid
  THEN
    RAISE EXCEPTION 'campaign validation monitoring is restricted to the current customer'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      count(*) FILTER (
        WHERE attempt.occurred_at >= now() - interval '15 minutes'
      )::integer,
      count(*) FILTER (
        WHERE attempt.occurred_at >= now() - interval '15 minutes'
          AND attempt.result <> 'accepted'
      )::integer,
      count(DISTINCT attempt.code_fingerprint) FILTER (
        WHERE attempt.occurred_at >= now() - interval '24 hours'
          AND attempt.result IN ('not_found', 'outside_segment', 'consent_required')
      )::integer
    FROM campaign_validation_attempts attempt
    WHERE attempt.customer_id = target_customer_id
      AND attempt.occurred_at >= now() - interval '24 hours';
END;
$$;

REVOKE ALL ON FUNCTION campaign_validation_abuse_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION campaign_validation_abuse_state(uuid) TO max_service_app;
