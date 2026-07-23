CREATE FUNCTION marketing_campaign_usage(
  target_campaign_id uuid,
  target_customer_id uuid
) RETURNS TABLE (
  total_usage integer,
  customer_usage integer
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
    RAISE EXCEPTION 'campaign usage is restricted to the current customer'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      count(*) FILTER (
        WHERE reservation.status IN ('reserved', 'redeemed')
      )::integer,
      count(*) FILTER (
        WHERE reservation.customer_id = target_customer_id
          AND reservation.status IN ('reserved', 'redeemed')
      )::integer
    FROM campaign_reservations reservation
    WHERE reservation.campaign_id = target_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION marketing_campaign_usage(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketing_campaign_usage(uuid, uuid) TO max_service_app;
