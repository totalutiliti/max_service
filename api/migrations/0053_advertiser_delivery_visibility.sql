CREATE POLICY advertiser_profiles_customer_read_policy
  ON advertiser_profiles
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'customer'
    AND status = 'active'
  );
