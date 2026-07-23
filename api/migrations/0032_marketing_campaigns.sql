CREATE TABLE marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  coupon_code text NOT NULL UNIQUE CHECK (
    coupon_code = upper(coupon_code)
    AND coupon_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
  ),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 240),
  discount_type text NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value integer NOT NULL,
  max_discount_cents integer,
  min_amount_cents integer NOT NULL CHECK (min_amount_cents BETWEEN 100 AND 10000000),
  total_redemption_limit integer NOT NULL CHECK (total_redemption_limit BETWEEN 1 AND 100000),
  per_customer_limit integer NOT NULL CHECK (
    per_customer_limit BETWEEN 1 AND 100
    AND per_customer_limit <= total_redemption_limit
  ),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (
    (discount_type = 'fixed'
      AND discount_value BETWEEN 100 AND 1000000
      AND max_discount_cents IS NULL)
    OR
    (discount_type = 'percentage'
      AND discount_value BETWEEN 100 AND 5000
      AND max_discount_cents BETWEEN 100 AND 1000000)
  )
);

CREATE INDEX marketing_campaigns_status_window_idx
  ON marketing_campaigns (status, starts_at, ends_at);

CREATE TABLE marketing_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('created', 'activated', 'paused')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('active', 'paused')),
  to_status text NOT NULL CHECK (to_status IN ('active', 'paused')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_campaign_events_campaign_idx
  ON marketing_campaign_events (campaign_id, created_at DESC, id DESC);

CREATE TABLE campaign_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id),
  service_request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  booking_id uuid UNIQUE REFERENCES bookings(id),
  coupon_code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value integer NOT NULL,
  max_discount_cents integer,
  min_amount_cents integer NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved', 'redeemed', 'ineligible')),
  discount_amount_cents integer,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  CHECK (
    (status = 'reserved' AND booking_id IS NULL AND discount_amount_cents IS NULL AND redeemed_at IS NULL)
    OR
    (status = 'redeemed' AND booking_id IS NOT NULL AND discount_amount_cents > 0 AND redeemed_at IS NOT NULL)
    OR
    (status = 'ineligible' AND booking_id IS NOT NULL AND discount_amount_cents = 0 AND redeemed_at IS NOT NULL)
  )
);

CREATE INDEX campaign_reservations_campaign_status_idx
  ON campaign_reservations (campaign_id, status, reserved_at);
CREATE INDEX campaign_reservations_customer_status_idx
  ON campaign_reservations (customer_id, campaign_id, status);

INSERT INTO marketing_campaigns (
  id, name, coupon_code, description, discount_type, discount_value,
  max_discount_cents, min_amount_cents, total_redemption_limit,
  per_customer_limit, starts_at, ends_at, status, created_by
) VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'Boas-vindas Max',
  'BEMVINDO20',
  'R$ 20 de desconto no primeiro serviço elegível do piloto.',
  'fixed',
  2000,
  NULL,
  8000,
  100,
  1,
  now() - interval '1 day',
  now() + interval '180 days',
  'active',
  '00000000-0000-4000-8000-000000000401'
);

INSERT INTO marketing_campaign_events (
  id, campaign_id, actor_id, event_type, to_status, note
) VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000401',
  'created',
  'active',
  'Campanha sintética criada para validar o fluxo promocional do piloto.'
);

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign_events FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_reservations FORCE ROW LEVEL SECURITY;

CREATE POLICY marketing_campaigns_read_policy ON marketing_campaigns FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR (
    current_setting('app.actor_role', true) = 'customer'
    AND status = 'active'
    AND starts_at <= now()
    AND ends_at > now()
  )
);

CREATE POLICY marketing_campaigns_operation_insert_policy ON marketing_campaigns FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
  AND created_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY marketing_campaigns_operation_update_policy ON marketing_campaigns FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY marketing_campaign_events_operation_read_policy ON marketing_campaign_events FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY marketing_campaign_events_operation_insert_policy ON marketing_campaign_events FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
  AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY campaign_reservations_read_policy ON campaign_reservations FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY campaign_reservations_customer_insert_policy ON campaign_reservations FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'customer'
  AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND EXISTS (
    SELECT 1
    FROM service_requests request
    WHERE request.id = campaign_reservations.service_request_id
      AND request.customer_id = campaign_reservations.customer_id
  )
);

GRANT SELECT, INSERT ON marketing_campaigns TO max_service_app;
GRANT UPDATE (status, updated_at) ON marketing_campaigns TO max_service_app;
GRANT SELECT, INSERT ON marketing_campaign_events TO max_service_app;
GRANT SELECT, INSERT ON campaign_reservations TO max_service_app;

ALTER TABLE payment_intents
  ADD COLUMN list_amount_cents integer,
  ADD COLUMN discount_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN campaign_id uuid REFERENCES marketing_campaigns(id),
  ADD COLUMN campaign_reservation_id uuid UNIQUE REFERENCES campaign_reservations(id);

UPDATE payment_intents
SET list_amount_cents = gross_amount_cents
WHERE list_amount_cents IS NULL;

ALTER TABLE payment_intents
  ALTER COLUMN list_amount_cents SET NOT NULL,
  ADD CONSTRAINT payment_intents_list_amount_positive CHECK (list_amount_cents > 0),
  ADD CONSTRAINT payment_intents_discount_nonnegative CHECK (discount_amount_cents >= 0),
  ADD CONSTRAINT payment_intents_discount_reconciles CHECK (
    list_amount_cents = gross_amount_cents + discount_amount_cents
  ),
  ADD CONSTRAINT payment_intents_campaign_snapshot_coherent CHECK (
    (campaign_id IS NULL AND campaign_reservation_id IS NULL AND discount_amount_cents = 0)
    OR
    (campaign_id IS NOT NULL AND campaign_reservation_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION create_sandbox_financial_snapshot() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  active_rule commercial_rules%ROWTYPE;
  reservation_record campaign_reservations%ROWTYPE;
  proposal_amount integer;
  final_amount integer;
  discount_amount integer := 0;
  request_code text;
  request_title text;
  attributed_partner uuid;
  intent_id uuid := gen_random_uuid();
  transaction_id uuid := gen_random_uuid();
  platform_amount integer;
  partner_amount integer;
  cashback_amount integer;
  provider_amount integer;
BEGIN
  SELECT * INTO active_rule FROM commercial_rules WHERE status = 'active';
  SELECT proposal.amount_cents, request.public_code, request.title
    INTO proposal_amount, request_code, request_title
  FROM proposals proposal
  JOIN service_requests request ON request.id = NEW.request_id
  WHERE proposal.id = NEW.proposal_id;

  SELECT reservation.*
    INTO reservation_record
  FROM campaign_reservations reservation
  WHERE reservation.service_request_id = NEW.request_id
    AND reservation.status = 'reserved'
  FOR UPDATE;

  IF FOUND THEN
    IF proposal_amount >= reservation_record.min_amount_cents THEN
      IF reservation_record.discount_type = 'fixed' THEN
        discount_amount := LEAST(reservation_record.discount_value, proposal_amount - 100);
      ELSE
        discount_amount := LEAST(
          floor((proposal_amount::numeric * reservation_record.discount_value) / 10000)::integer,
          reservation_record.max_discount_cents,
          proposal_amount - 100
        );
      END IF;
    END IF;

    UPDATE campaign_reservations
    SET booking_id = NEW.id,
        status = CASE WHEN discount_amount > 0 THEN 'redeemed' ELSE 'ineligible' END,
        discount_amount_cents = discount_amount,
        redeemed_at = now()
    WHERE id = reservation_record.id;
  END IF;

  final_amount := proposal_amount - discount_amount;

  SELECT referral.partner_id INTO attributed_partner
  FROM partner_referrals referral
  WHERE referral.provider_id = NEW.provider_id AND referral.status = 'active'
  ORDER BY referral.activated_at NULLS LAST, referral.created_at
  LIMIT 1;

  platform_amount := floor((final_amount::numeric * active_rule.platform_fee_bps) / 10000)::integer;
  cashback_amount := floor((final_amount::numeric * active_rule.customer_cashback_bps) / 10000)::integer;
  partner_amount := CASE WHEN attributed_partner IS NULL THEN 0 ELSE floor((final_amount::numeric * active_rule.partner_commission_bps) / 10000)::integer END;
  provider_amount := final_amount - platform_amount - cashback_amount - partner_amount;

  INSERT INTO payment_intents (
    id, public_code, booking_id, rule_id, customer_id, provider_id, partner_id,
    request_public_code, service_title, list_amount_cents, discount_amount_cents,
    gross_amount_cents, campaign_id, campaign_reservation_id,
    currency, status, sandbox_reference, created_at, updated_at
  ) VALUES (
    intent_id, 'PI-' || upper(substr(md5(intent_id::text), 1, 6)), NEW.id, active_rule.id,
    NEW.customer_id, NEW.provider_id, attributed_partner, request_code, request_title,
    proposal_amount, discount_amount, final_amount,
    CASE WHEN reservation_record.id IS NULL THEN NULL ELSE reservation_record.campaign_id END,
    reservation_record.id,
    active_rule.currency, 'sandbox_authorized', 'sandbox_' || replace(intent_id::text, '-', ''),
    NEW.created_at, NEW.created_at
  );

  INSERT INTO payment_allocations (id, payment_intent_id, rule_id, beneficiary_id, entry_type, amount_cents, created_at) VALUES
    (gen_random_uuid(), intent_id, active_rule.id, NEW.provider_id, 'provider_receivable', provider_amount, NEW.created_at),
    (gen_random_uuid(), intent_id, active_rule.id, '00000000-0000-4000-8000-000000000401', 'platform_fee', platform_amount, NEW.created_at),
    (gen_random_uuid(), intent_id, active_rule.id, NEW.customer_id, 'customer_cashback', cashback_amount, NEW.created_at);
  IF attributed_partner IS NOT NULL AND partner_amount > 0 THEN
    INSERT INTO payment_allocations (id, payment_intent_id, rule_id, beneficiary_id, entry_type, amount_cents, created_at)
    VALUES (gen_random_uuid(), intent_id, active_rule.id, attributed_partner, 'partner_commission', partner_amount, NEW.created_at);
  END IF;

  INSERT INTO payment_transactions (
    id, payment_intent_id, idempotency_key, transaction_type, amount_cents, source, occurred_at, created_at
  ) VALUES (
    transaction_id, intent_id, 'authorization:' || intent_id::text, 'authorization',
    final_amount, 'migration_seed', NEW.created_at, NEW.created_at
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION create_sandbox_financial_snapshot() FROM PUBLIC;
