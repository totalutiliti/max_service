CREATE OR REPLACE FUNCTION contextual_ad_track_click(p_delivery_token_hash text)
RETURNS TABLE(destination_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH clicked AS (
    UPDATE contextual_ad_deliveries delivery
    SET clicked_at = COALESCE(delivery.clicked_at, now())
    FROM contextual_ad_campaigns campaign
    WHERE delivery.delivery_token_hash = p_delivery_token_hash
      AND campaign.id = delivery.campaign_id
      AND campaign.status = 'approved'
      AND campaign.ends_at > now()
    RETURNING campaign.destination_url
  )
  SELECT clicked.destination_url
  FROM clicked;
$$;

REVOKE ALL ON FUNCTION contextual_ad_track_click(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contextual_ad_track_click(text) TO max_service_app;
