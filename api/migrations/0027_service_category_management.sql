ALTER TABLE service_categories
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT service_categories_sort_order_positive CHECK (sort_order > 0),
  ADD CONSTRAINT service_categories_sort_order_unique UNIQUE (sort_order) DEFERRABLE INITIALLY IMMEDIATE;

UPDATE service_categories
SET updated_at = created_at;

CREATE TABLE service_category_events (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES service_categories(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('activated', 'deactivated', 'reordered')),
  from_active boolean,
  to_active boolean,
  from_sort_order integer,
  to_sort_order integer,
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      event_type = 'activated'
      AND from_active = false
      AND to_active = true
      AND from_sort_order IS NULL
      AND to_sort_order IS NULL
    )
    OR (
      event_type = 'deactivated'
      AND from_active = true
      AND to_active = false
      AND from_sort_order IS NULL
      AND to_sort_order IS NULL
    )
    OR (
      event_type = 'reordered'
      AND from_active IS NULL
      AND to_active IS NULL
      AND from_sort_order > 0
      AND to_sort_order > 0
      AND from_sort_order <> to_sort_order
    )
  )
);

CREATE INDEX service_category_events_category_created_idx
  ON service_category_events (category_id, created_at DESC, id DESC);

CREATE FUNCTION prevent_last_active_service_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.active = true
    AND NEW.active = false
    AND NOT EXISTS (
      SELECT 1
      FROM service_categories category
      WHERE category.id <> OLD.id
        AND category.active = true
    )
  THEN
    RAISE EXCEPTION 'O catálogo precisa manter ao menos uma categoria ativa.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_categories_keep_one_active
  BEFORE UPDATE OF active ON service_categories
  FOR EACH ROW
  EXECUTE FUNCTION prevent_last_active_service_category();

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE service_category_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_category_events FORCE ROW LEVEL SECURITY;

CREATE POLICY service_categories_read_policy
  ON service_categories
  FOR SELECT
  USING (
    active = true
    OR current_setting('app.actor_role', true) IN ('customer', 'provider', 'partner', 'operation')
  );

CREATE POLICY service_categories_operation_update_policy
  ON service_categories
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY service_category_events_operation_read_policy
  ON service_category_events
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY service_category_events_operation_insert_policy
  ON service_category_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

GRANT UPDATE (active, sort_order, updated_at) ON service_categories TO max_service_app;
GRANT SELECT, INSERT ON service_category_events TO max_service_app;
