ALTER TABLE partner_referrals
  ADD COLUMN consent_at timestamptz,
  ADD COLUMN privacy_notice_version text;

UPDATE partner_referrals
SET
  consent_at = created_at,
  privacy_notice_version = 'demo-seed-v1'
WHERE source IN ('link', 'qr');

ALTER TABLE partner_referrals
  ADD CONSTRAINT partner_referrals_public_consent_check CHECK (
    source = 'manual'
    OR (consent_at IS NOT NULL AND privacy_notice_version IS NOT NULL)
  );

CREATE INDEX partner_referrals_link_created_idx
  ON partner_referrals (referral_link_id, created_at DESC);

CREATE POLICY partner_referral_links_public_read_policy ON partner_referral_links FOR SELECT USING (
  current_setting('app.actor_role', true) = 'public_referral'
  AND status = 'active'
);

CREATE POLICY partner_referrals_public_read_policy ON partner_referrals FOR SELECT USING (
  current_setting('app.actor_role', true) = 'public_referral'
  AND referral_link_id = NULLIF(current_setting('app.referral_link_id', true), '')::uuid
);

CREATE POLICY partner_referrals_public_insert_policy ON partner_referrals FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'public_referral'
  AND referral_link_id = NULLIF(current_setting('app.referral_link_id', true), '')::uuid
  AND provider_id IS NULL
  AND status = 'invited'
  AND source IN ('link', 'qr')
  AND consent_at IS NOT NULL
  AND privacy_notice_version = 'pilot-2026-07'
  AND EXISTS (
    SELECT 1
    FROM partner_referral_links link
    WHERE link.id = partner_referrals.referral_link_id
      AND link.partner_id = partner_referrals.partner_id
      AND link.status = 'active'
  )
);
