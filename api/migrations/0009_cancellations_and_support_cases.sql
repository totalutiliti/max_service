CREATE TABLE booking_cancellations (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  actor_role text NOT NULL CHECK (actor_role IN ('customer', 'provider')),
  reason_code text NOT NULL CHECK (reason_code IN ('schedule_change', 'no_longer_needed', 'participant_unavailable', 'safety_concern', 'other')),
  details text NOT NULL CHECK (char_length(details) BETWEEN 10 AND 500),
  prior_status text NOT NULL CHECK (prior_status IN ('scheduled', 'in_progress')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_cases (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  booking_id uuid NOT NULL UNIQUE REFERENCES bookings(id),
  opened_by uuid NOT NULL REFERENCES users(id),
  case_type text NOT NULL CHECK (case_type = 'cancellation'),
  priority text NOT NULL CHECK (priority IN ('normal', 'high')),
  status text NOT NULL CHECK (status IN ('open', 'in_review', 'resolved')),
  title text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_cases_status_priority_created_idx ON support_cases (status, priority, created_at);

ALTER TABLE booking_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_cancellations FORCE ROW LEVEL SECURITY;
ALTER TABLE support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_cases FORCE ROW LEVEL SECURITY;

CREATE POLICY booking_cancellations_read_policy ON booking_cancellations FOR SELECT USING (
  EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_cancellations.booking_id)
);

CREATE POLICY booking_cancellations_insert_policy ON booking_cancellations FOR INSERT WITH CHECK (
  requested_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND actor_role = current_setting('app.actor_role', true)
  AND EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.id = booking_cancellations.booking_id
      AND b.status IN ('scheduled', 'in_progress')
      AND (
        (actor_role = 'customer' AND b.customer_id = requested_by)
        OR (actor_role = 'provider' AND b.provider_id = requested_by)
      )
  )
);

CREATE POLICY support_cases_read_policy ON support_cases FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR opened_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
  OR EXISTS (SELECT 1 FROM bookings b WHERE b.id = support_cases.booking_id)
);

CREATE POLICY support_cases_insert_policy ON support_cases FOR INSERT WITH CHECK (
  opened_by = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND current_setting('app.actor_role', true) IN ('customer', 'provider')
  AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = support_cases.booking_id)
);

DROP POLICY bookings_provider_update_policy ON bookings;
CREATE POLICY bookings_provider_update_policy ON bookings FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'provider'
  AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND status IN ('scheduled', 'in_progress')
) WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND status IN ('in_progress', 'completed', 'cancelled')
);

CREATE POLICY bookings_customer_cancel_update_policy ON bookings FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'customer'
  AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND status IN ('scheduled', 'in_progress')
) WITH CHECK (
  current_setting('app.actor_role', true) = 'customer'
  AND customer_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND status = 'cancelled'
);

DROP POLICY requests_provider_booking_transition_policy ON service_requests;
CREATE POLICY requests_provider_booking_transition_policy ON service_requests FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'provider'
  AND EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.request_id = service_requests.id
      AND b.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
) WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND status IN ('in_progress', 'completed', 'cancelled')
  AND EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.request_id = service_requests.id
      AND b.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);

GRANT SELECT, INSERT ON booking_cancellations TO max_service_app;
GRANT SELECT, INSERT ON support_cases TO max_service_app;
