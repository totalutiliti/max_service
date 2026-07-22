DROP POLICY users_read_policy ON users;

CREATE POLICY users_read_policy ON users FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR users.id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR users.role = 'provider'
  OR EXISTS (
    SELECT 1
    FROM bookings b
    WHERE (
      b.customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      OR b.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
    AND users.id IN (b.customer_id, b.provider_id)
  )
);
