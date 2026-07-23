DROP POLICY users_read_policy ON users;

CREATE POLICY users_read_policy
  ON users
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    OR role = 'provider'
    OR (
      current_setting('app.actor_role', true) IN ('customer', 'provider')
      AND EXISTS (
        SELECT 1
        FROM bookings booking
        WHERE (
          booking.customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
          AND booking.provider_id = users.id
        )
        OR (
          booking.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
          AND booking.customer_id = users.id
        )
      )
    )
  );
