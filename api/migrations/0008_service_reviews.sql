CREATE TABLE service_reviews (
  id uuid PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  author_id uuid NOT NULL REFERENCES users(id),
  subject_id uuid NOT NULL REFERENCES users(id),
  author_role text NOT NULL CHECK (author_role IN ('customer', 'provider')),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL CHECK (char_length(comment) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, author_id),
  CHECK (author_id <> subject_id)
);

CREATE INDEX service_reviews_subject_created_idx ON service_reviews (subject_id, created_at DESC);

ALTER TABLE service_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY service_reviews_read_policy ON service_reviews FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.id = service_reviews.booking_id
  )
);

CREATE POLICY service_reviews_insert_policy ON service_reviews FOR INSERT WITH CHECK (
  author_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND author_role = current_setting('app.actor_role', true)
  AND EXISTS (
    SELECT 1
    FROM bookings b
    WHERE b.id = service_reviews.booking_id
      AND b.status = 'completed'
      AND (
        (
          current_setting('app.actor_role', true) = 'customer'
          AND b.customer_id = service_reviews.author_id
          AND b.provider_id = service_reviews.subject_id
        )
        OR (
          current_setting('app.actor_role', true) = 'provider'
          AND b.provider_id = service_reviews.author_id
          AND b.customer_id = service_reviews.subject_id
        )
      )
  )
);

GRANT SELECT, INSERT ON service_reviews TO max_service_app;
