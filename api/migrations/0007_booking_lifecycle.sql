ALTER TABLE bookings
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz;

DROP POLICY requests_read_policy ON service_requests;
CREATE POLICY requests_read_policy ON service_requests FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR (
    current_setting('app.actor_role', true) = 'provider'
    AND (
      status IN ('open', 'proposals_received')
      OR EXISTS (
        SELECT 1
        FROM bookings b
        WHERE b.request_id = service_requests.id
          AND b.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
      )
    )
  )
);

DROP POLICY bookings_update_policy ON bookings;
CREATE POLICY bookings_provider_update_policy ON bookings FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'provider'
  AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
) WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY bookings_operation_update_policy ON bookings FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY requests_provider_booking_transition_policy
ON service_requests
FOR UPDATE
USING (
  current_setting('app.actor_role', true) = 'provider'
  AND EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.request_id = service_requests.id
      AND b.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
)
WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND status IN ('in_progress', 'completed')
  AND EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.request_id = service_requests.id
      AND b.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);
