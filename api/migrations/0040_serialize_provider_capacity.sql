-- Serializa novas propostas por profissional para impedir que duas transações
-- concorrentes ultrapassem os limites de capacidade após a mesma contagem.
CREATE OR REPLACE FUNCTION enforce_provider_proposal_matching()
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
  WHERE profile.provider_id = NEW.provider_id
  FOR UPDATE;

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
