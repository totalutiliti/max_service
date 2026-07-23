DROP POLICY users_read_policy ON users;

CREATE POLICY users_read_policy ON users FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR (
    role = 'provider'
    AND current_setting('app.actor_role', true) IN ('customer', 'provider', 'partner', 'operation')
  )
);
