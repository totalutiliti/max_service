CREATE TABLE provider_matching_profiles (
  provider_id uuid PRIMARY KEY REFERENCES users(id),
  primary_category_id uuid NOT NULL REFERENCES service_categories(id),
  availability_status text NOT NULL CHECK (
    availability_status IN ('available_now', 'scheduled', 'paused')
  ),
  accepts_urgent boolean NOT NULL DEFAULT false,
  active_proposal_limit integer NOT NULL CHECK (active_proposal_limit BETWEEN 1 AND 20),
  active_job_limit integer NOT NULL CHECK (active_job_limit BETWEEN 1 AND 20),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_matching_profiles_category_status_idx
  ON provider_matching_profiles (primary_category_id, availability_status, provider_id);

CREATE TABLE provider_matching_events (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('configured', 'updated')),
  profile_version integer NOT NULL CHECK (profile_version > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_matching_events_provider_created_idx
  ON provider_matching_events (provider_id, created_at DESC, id DESC);

INSERT INTO provider_matching_profiles (
  provider_id,
  primary_category_id,
  availability_status,
  accepts_urgent,
  active_proposal_limit,
  active_job_limit
) VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000001',
    'available_now',
    true,
    8,
    4
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '10000000-0000-4000-8000-000000000001',
    'scheduled',
    false,
    6,
    3
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '10000000-0000-4000-8000-000000000004',
    'scheduled',
    true,
    6,
    3
  ),
  (
    '00000000-0000-4000-8000-000000000204',
    '10000000-0000-4000-8000-000000000002',
    'paused',
    false,
    4,
    2
  );

INSERT INTO provider_matching_profiles (
  provider_id,
  primary_category_id,
  availability_status,
  accepts_urgent,
  active_proposal_limit,
  active_job_limit
)
SELECT
  profile.user_id,
  profile.service_category_id,
  'scheduled',
  false,
  6,
  3
FROM onboarding_profiles profile
WHERE profile.profile_type = 'provider'
ON CONFLICT (provider_id) DO UPDATE SET
  primary_category_id = EXCLUDED.primary_category_id,
  updated_at = now();

CREATE FUNCTION enforce_provider_proposal_matching()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_request service_requests%ROWTYPE;
  matching provider_matching_profiles%ROWTYPE;
  active_proposals integer;
  active_jobs integer;
BEGIN
  IF NEW.status <> 'sent' THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO target_request
  FROM service_requests request
  WHERE request.id = NEW.request_id;

  IF target_request.id IS NULL
    OR target_request.status NOT IN ('open', 'proposals_received')
  THEN
    RAISE EXCEPTION 'A solicitação não está disponível para proposta.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO matching
  FROM provider_matching_profiles profile
  WHERE profile.provider_id = NEW.provider_id;

  IF matching.provider_id IS NULL THEN
    RAISE EXCEPTION 'Configure o perfil de oportunidades antes de enviar propostas.'
      USING ERRCODE = '23514';
  END IF;

  IF matching.availability_status = 'paused' THEN
    RAISE EXCEPTION 'O recebimento de oportunidades está pausado.'
      USING ERRCODE = '23514';
  END IF;

  IF matching.primary_category_id <> target_request.category_id THEN
    RAISE EXCEPTION 'A solicitação não corresponde à categoria principal do profissional.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM provider_verifications verification
    WHERE verification.provider_id = NEW.provider_id
      AND verification.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'O perfil profissional precisa estar aprovado.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM provider_service_regions coverage
    JOIN service_regions region ON region.id = coverage.region_id
    WHERE coverage.provider_id = NEW.provider_id
      AND coverage.region_id = target_request.region_id
      AND coverage.active = true
      AND region.active = true
  ) THEN
    RAISE EXCEPTION 'A solicitação está fora da cobertura ativa do profissional.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM proposals existing
    WHERE existing.request_id = NEW.request_id
      AND existing.provider_id = NEW.provider_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
  INTO active_proposals
  FROM proposals proposal
  WHERE proposal.provider_id = NEW.provider_id
    AND proposal.status = 'sent';

  IF active_proposals >= matching.active_proposal_limit THEN
    RAISE EXCEPTION 'O limite de propostas ativas foi atingido.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer
  INTO active_jobs
  FROM bookings booking
  WHERE booking.provider_id = NEW.provider_id
    AND booking.status IN ('scheduled', 'in_progress');

  IF active_jobs >= matching.active_job_limit THEN
    RAISE EXCEPTION 'A capacidade de serviços em andamento foi atingida.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_provider_proposal_matching() FROM PUBLIC;

CREATE TRIGGER proposals_matching_guard
  BEFORE INSERT ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION enforce_provider_proposal_matching();

ALTER TABLE provider_matching_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_matching_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_matching_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_matching_events FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_matching_profiles_read_policy
  ON provider_matching_profiles
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_matching_profiles_insert_policy
  ON provider_matching_profiles
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_matching_profiles_update_policy
  ON provider_matching_profiles
  FOR UPDATE
  USING (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY provider_matching_events_read_policy
  ON provider_matching_events
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      current_setting('app.actor_role', true) = 'provider'
      AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    )
  );

CREATE POLICY provider_matching_events_insert_policy
  ON provider_matching_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'provider'
    AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_id = provider_id
  );

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

DROP POLICY proposals_insert_policy ON proposals;
CREATE POLICY proposals_insert_policy ON proposals FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND status = 'sent'
  AND EXISTS (
    SELECT 1
    FROM service_requests request
    WHERE request.id = proposals.request_id
      AND request.status IN ('open', 'proposals_received')
  )
);

GRANT SELECT, INSERT, UPDATE (
  primary_category_id,
  availability_status,
  accepts_urgent,
  active_proposal_limit,
  active_job_limit,
  version,
  updated_at
) ON provider_matching_profiles TO max_service_app;
GRANT SELECT, INSERT ON provider_matching_events TO max_service_app;
