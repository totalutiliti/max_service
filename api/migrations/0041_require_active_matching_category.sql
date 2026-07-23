CREATE FUNCTION enforce_active_provider_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'sent' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM provider_matching_profiles matching
    JOIN service_categories category
      ON category.id = matching.primary_category_id
    JOIN service_requests request
      ON request.id = NEW.request_id
      AND request.category_id = category.id
    WHERE matching.provider_id = NEW.provider_id
      AND category.active = true
  ) THEN
    RAISE EXCEPTION 'A categoria principal do profissional está indisponível.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_active_provider_category() FROM PUBLIC;

-- O prefixo z mantém esta checagem depois do guard principal, preservando
-- mensagens mais específicas para perfil ausente, pausa e categoria divergente.
CREATE TRIGGER proposals_z_active_category_guard
  BEFORE INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION enforce_active_provider_category();

DROP POLICY requests_read_policy ON service_requests;
CREATE POLICY requests_read_policy ON service_requests FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR (
    current_setting('app.actor_role', true) = 'provider'
    AND (
      (
        status IN ('open', 'proposals_received')
        AND EXISTS (
          SELECT 1
          FROM service_categories category
          WHERE category.id = service_requests.category_id
            AND category.active = true
        )
        AND EXISTS (
          SELECT 1
          FROM provider_service_regions coverage
          JOIN service_regions region ON region.id = coverage.region_id
          WHERE coverage.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
            AND coverage.region_id = service_requests.region_id
            AND coverage.active = true
            AND region.active = true
        )
        AND EXISTS (
          SELECT 1
          FROM provider_matching_profiles matching
          WHERE matching.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
            AND matching.primary_category_id = service_requests.category_id
            AND matching.availability_status <> 'paused'
        )
        AND EXISTS (
          SELECT 1
          FROM provider_verifications verification
          WHERE verification.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
            AND verification.status = 'approved'
        )
      )
      OR EXISTS (
        SELECT 1
        FROM bookings booking
        WHERE booking.request_id = service_requests.id
          AND booking.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      )
    )
  )
);
