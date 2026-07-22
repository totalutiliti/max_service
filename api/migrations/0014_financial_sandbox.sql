CREATE TABLE commercial_rules (
  id uuid PRIMARY KEY,
  version text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  currency char(3) NOT NULL CHECK (currency = 'BRL'),
  platform_fee_bps integer NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  partner_commission_bps integer NOT NULL CHECK (partner_commission_bps BETWEEN 0 AND 10000),
  customer_cashback_bps integer NOT NULL CHECK (customer_cashback_bps BETWEEN 0 AND 10000),
  effective_from timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (platform_fee_bps + partner_commission_bps + customer_cashback_bps <= 10000)
);

CREATE UNIQUE INDEX commercial_rules_one_active_idx ON commercial_rules ((status)) WHERE status = 'active';

CREATE TABLE payment_intents (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  rule_id uuid NOT NULL REFERENCES commercial_rules(id),
  customer_id uuid NOT NULL REFERENCES users(id),
  provider_id uuid NOT NULL REFERENCES users(id),
  partner_id uuid REFERENCES users(id),
  request_public_code text NOT NULL,
  service_title text NOT NULL,
  gross_amount_cents integer NOT NULL CHECK (gross_amount_cents > 0),
  currency char(3) NOT NULL CHECK (currency = 'BRL'),
  status text NOT NULL CHECK (status IN ('sandbox_authorized', 'sandbox_settled', 'sandbox_refunded')),
  sandbox_reference text NOT NULL UNIQUE,
  settled_at timestamptz,
  refunded_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'sandbox_settled' AND settled_at IS NOT NULL AND refunded_at IS NULL)
    OR (status = 'sandbox_refunded' AND refunded_at IS NOT NULL)
    OR (status = 'sandbox_authorized' AND settled_at IS NULL AND refunded_at IS NULL))
);

CREATE TABLE payment_allocations (
  id uuid PRIMARY KEY,
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id),
  rule_id uuid NOT NULL REFERENCES commercial_rules(id),
  beneficiary_id uuid NOT NULL REFERENCES users(id),
  entry_type text NOT NULL CHECK (entry_type IN ('provider_receivable', 'platform_fee', 'partner_commission', 'customer_cashback')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_intent_id, entry_type)
);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY,
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id),
  idempotency_key text NOT NULL UNIQUE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('authorization', 'settlement', 'refund')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  source text NOT NULL CHECK (source IN ('migration_seed', 'signed_sandbox_webhook')),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE financial_ledger_entries (
  id uuid PRIMARY KEY,
  payment_intent_id uuid NOT NULL REFERENCES payment_intents(id),
  allocation_id uuid NOT NULL REFERENCES payment_allocations(id),
  transaction_id uuid NOT NULL REFERENCES payment_transactions(id),
  beneficiary_id uuid NOT NULL REFERENCES users(id),
  entry_type text NOT NULL CHECK (entry_type IN ('provider_receivable', 'platform_fee', 'partner_commission', 'customer_cashback')),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, allocation_id)
);

CREATE INDEX payment_intents_participants_status_idx ON payment_intents (customer_id, provider_id, partner_id, status);
CREATE INDEX payment_allocations_beneficiary_idx ON payment_allocations (beneficiary_id, entry_type, payment_intent_id);
CREATE INDEX payment_transactions_intent_created_idx ON payment_transactions (payment_intent_id, created_at DESC);
CREATE INDEX financial_ledger_beneficiary_created_idx ON financial_ledger_entries (beneficiary_id, created_at DESC);

INSERT INTO commercial_rules (
  id, version, status, currency, platform_fee_bps, partner_commission_bps, customer_cashback_bps, effective_from
) VALUES (
  '90000000-0000-4000-8000-000000000001', 'sandbox-12-2-2-v1', 'active', 'BRL', 1200, 200, 200, now()
);

INSERT INTO partner_referrals (
  id, public_code, referral_link_id, partner_id, provider_id, service_category_id,
  professional_name, email, status, source, created_at, activated_at
) VALUES (
  '71000000-0000-4000-8000-000000000004', 'RF-RS01', '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000001', 'Rafael Santos', 'rafael.santos@finance.demo.maxservice',
  'active', 'manual', now() - interval '90 days', now() - interval '88 days'
) ON CONFLICT (provider_id) DO NOTHING;

CREATE FUNCTION create_sandbox_financial_snapshot() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_rule commercial_rules%ROWTYPE;
  proposal_amount integer;
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

  SELECT referral.partner_id INTO attributed_partner
  FROM partner_referrals referral
  WHERE referral.provider_id = NEW.provider_id AND referral.status = 'active'
  ORDER BY referral.activated_at NULLS LAST, referral.created_at
  LIMIT 1;

  platform_amount := floor((proposal_amount::numeric * active_rule.platform_fee_bps) / 10000)::integer;
  cashback_amount := floor((proposal_amount::numeric * active_rule.customer_cashback_bps) / 10000)::integer;
  partner_amount := CASE WHEN attributed_partner IS NULL THEN 0 ELSE floor((proposal_amount::numeric * active_rule.partner_commission_bps) / 10000)::integer END;
  provider_amount := proposal_amount - platform_amount - cashback_amount - partner_amount;

  INSERT INTO payment_intents (
    id, public_code, booking_id, rule_id, customer_id, provider_id, partner_id,
    request_public_code, service_title, gross_amount_cents, currency, status, sandbox_reference, created_at, updated_at
  ) VALUES (
    intent_id, 'PI-' || upper(substr(md5(intent_id::text), 1, 6)), NEW.id, active_rule.id,
    NEW.customer_id, NEW.provider_id, attributed_partner, request_code, request_title,
    proposal_amount, active_rule.currency, 'sandbox_authorized', 'sandbox_' || replace(intent_id::text, '-', ''), NEW.created_at, NEW.created_at
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
    transaction_id, intent_id, 'authorization:' || intent_id::text, 'authorization', proposal_amount, 'migration_seed', NEW.created_at, NEW.created_at
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION create_sandbox_financial_snapshot() FROM PUBLIC;
CREATE TRIGGER bookings_create_sandbox_finance
AFTER INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION create_sandbox_financial_snapshot();

WITH booking_snapshots AS (
  SELECT
    gen_random_uuid() AS intent_id,
    booking.id AS booking_id,
    booking.customer_id,
    booking.provider_id,
    referral.partner_id,
    request.public_code AS request_code,
    request.title AS service_title,
    proposal.amount_cents,
    booking.status AS booking_status,
    booking.created_at,
    booking.completed_at,
    cancellation.created_at AS cancelled_at
  FROM bookings booking
  JOIN proposals proposal ON proposal.id = booking.proposal_id
  JOIN service_requests request ON request.id = booking.request_id
  LEFT JOIN booking_cancellations cancellation ON cancellation.booking_id = booking.id
  LEFT JOIN LATERAL (
    SELECT linked.partner_id
    FROM partner_referrals linked
    WHERE linked.provider_id = booking.provider_id AND linked.status = 'active'
    ORDER BY linked.activated_at NULLS LAST, linked.created_at
    LIMIT 1
  ) referral ON true
)
INSERT INTO payment_intents (
  id, public_code, booking_id, rule_id, customer_id, provider_id, partner_id,
  request_public_code, service_title, gross_amount_cents, currency, status, sandbox_reference,
  settled_at, refunded_at, reconciled_at, created_at, updated_at
)
SELECT
  snapshot.intent_id,
  'PI-' || upper(substr(md5(snapshot.intent_id::text), 1, 6)),
  snapshot.booking_id,
  '90000000-0000-4000-8000-000000000001',
  snapshot.customer_id,
  snapshot.provider_id,
  snapshot.partner_id,
  snapshot.request_code,
  snapshot.service_title,
  snapshot.amount_cents,
  'BRL',
  CASE snapshot.booking_status WHEN 'completed' THEN 'sandbox_settled' WHEN 'cancelled' THEN 'sandbox_refunded' ELSE 'sandbox_authorized' END,
  'sandbox_' || replace(snapshot.intent_id::text, '-', ''),
  CASE WHEN snapshot.booking_status = 'completed' THEN snapshot.completed_at END,
  CASE WHEN snapshot.booking_status = 'cancelled' THEN COALESCE(snapshot.cancelled_at, snapshot.created_at) END,
  CASE WHEN snapshot.booking_status IN ('completed', 'cancelled') THEN now() END,
  snapshot.created_at,
  now()
FROM booking_snapshots snapshot
ON CONFLICT (booking_id) DO NOTHING;

INSERT INTO payment_allocations (id, payment_intent_id, rule_id, beneficiary_id, entry_type, amount_cents, created_at)
SELECT gen_random_uuid(), intent.id, intent.rule_id, intent.provider_id, 'provider_receivable',
  intent.gross_amount_cents
    - floor((intent.gross_amount_cents::numeric * rule.platform_fee_bps) / 10000)::integer
    - floor((intent.gross_amount_cents::numeric * rule.customer_cashback_bps) / 10000)::integer
    - CASE WHEN intent.partner_id IS NULL THEN 0 ELSE floor((intent.gross_amount_cents::numeric * rule.partner_commission_bps) / 10000)::integer END,
  intent.created_at
FROM payment_intents intent JOIN commercial_rules rule ON rule.id = intent.rule_id
ON CONFLICT (payment_intent_id, entry_type) DO NOTHING;

INSERT INTO payment_allocations (id, payment_intent_id, rule_id, beneficiary_id, entry_type, amount_cents, created_at)
SELECT gen_random_uuid(), intent.id, intent.rule_id, '00000000-0000-4000-8000-000000000401', 'platform_fee',
  floor((intent.gross_amount_cents::numeric * rule.platform_fee_bps) / 10000)::integer, intent.created_at
FROM payment_intents intent JOIN commercial_rules rule ON rule.id = intent.rule_id
ON CONFLICT (payment_intent_id, entry_type) DO NOTHING;

INSERT INTO payment_allocations (id, payment_intent_id, rule_id, beneficiary_id, entry_type, amount_cents, created_at)
SELECT gen_random_uuid(), intent.id, intent.rule_id, intent.customer_id, 'customer_cashback',
  floor((intent.gross_amount_cents::numeric * rule.customer_cashback_bps) / 10000)::integer, intent.created_at
FROM payment_intents intent JOIN commercial_rules rule ON rule.id = intent.rule_id
ON CONFLICT (payment_intent_id, entry_type) DO NOTHING;

INSERT INTO payment_allocations (id, payment_intent_id, rule_id, beneficiary_id, entry_type, amount_cents, created_at)
SELECT gen_random_uuid(), intent.id, intent.rule_id, intent.partner_id, 'partner_commission',
  floor((intent.gross_amount_cents::numeric * rule.partner_commission_bps) / 10000)::integer, intent.created_at
FROM payment_intents intent JOIN commercial_rules rule ON rule.id = intent.rule_id
WHERE intent.partner_id IS NOT NULL
ON CONFLICT (payment_intent_id, entry_type) DO NOTHING;

INSERT INTO payment_transactions (
  id, payment_intent_id, idempotency_key, transaction_type, amount_cents, source, occurred_at, created_at
)
SELECT gen_random_uuid(), intent.id, 'authorization:' || intent.id::text, 'authorization', intent.gross_amount_cents,
  'migration_seed', intent.created_at, intent.created_at
FROM payment_intents intent
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO payment_transactions (
  id, payment_intent_id, idempotency_key, transaction_type, amount_cents, source, occurred_at, created_at
)
SELECT gen_random_uuid(), intent.id, 'settlement:' || intent.id::text, 'settlement', intent.gross_amount_cents,
  'migration_seed', intent.settled_at, intent.settled_at
FROM payment_intents intent
WHERE intent.status = 'sandbox_settled'
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO payment_transactions (
  id, payment_intent_id, idempotency_key, transaction_type, amount_cents, source, occurred_at, created_at
)
SELECT gen_random_uuid(), intent.id, 'refund:' || intent.id::text, 'refund', intent.gross_amount_cents,
  'migration_seed', intent.refunded_at, intent.refunded_at
FROM payment_intents intent
WHERE intent.status = 'sandbox_refunded'
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO financial_ledger_entries (
  id, payment_intent_id, allocation_id, transaction_id, beneficiary_id, entry_type, direction, amount_cents, created_at
)
SELECT gen_random_uuid(), intent.id, allocation.id, transaction.id, allocation.beneficiary_id,
  allocation.entry_type, 'credit', allocation.amount_cents, transaction.occurred_at
FROM payment_intents intent
JOIN payment_transactions transaction ON transaction.payment_intent_id = intent.id AND transaction.transaction_type = 'settlement'
JOIN payment_allocations allocation ON allocation.payment_intent_id = intent.id
WHERE allocation.amount_cents > 0
ON CONFLICT (transaction_id, allocation_id) DO NOTHING;

ALTER TABLE commercial_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_ledger_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY commercial_rules_read_policy ON commercial_rules FOR SELECT USING (
  current_setting('app.actor_role', true) IN ('customer', 'provider', 'partner', 'operation')
);

CREATE POLICY payment_intents_read_policy ON payment_intents FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR partner_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY payment_intents_operation_update_policy ON payment_intents FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY payment_allocations_read_policy ON payment_allocations FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR beneficiary_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY payment_transactions_read_policy ON payment_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM payment_intents intent WHERE intent.id = payment_transactions.payment_intent_id)
);

CREATE POLICY payment_transactions_operation_insert_policy ON payment_transactions FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY financial_ledger_entries_read_policy ON financial_ledger_entries FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR beneficiary_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY financial_ledger_entries_operation_insert_policy ON financial_ledger_entries FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

GRANT SELECT ON commercial_rules TO max_service_app;
GRANT SELECT, UPDATE ON payment_intents TO max_service_app;
GRANT SELECT ON payment_allocations TO max_service_app;
GRANT SELECT, INSERT ON payment_transactions TO max_service_app;
GRANT SELECT, INSERT ON financial_ledger_entries TO max_service_app;
