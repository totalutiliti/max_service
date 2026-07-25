ALTER TABLE api_idempotency_records
  DROP CONSTRAINT api_idempotency_records_actor_role_check;

ALTER TABLE api_idempotency_records
  ADD CONSTRAINT api_idempotency_records_actor_role_check
  CHECK (actor_role IN ('customer', 'provider', 'partner', 'advertiser', 'operation'));
