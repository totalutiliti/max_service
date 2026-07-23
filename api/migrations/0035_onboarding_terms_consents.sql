CREATE TABLE legal_documents (
  id uuid PRIMARY KEY,
  audience text NOT NULL CHECK (audience IN ('customer', 'provider')),
  document_type text NOT NULL CHECK (document_type IN ('terms_of_use', 'privacy_notice', 'provider_code')),
  version text NOT NULL CHECK (char_length(version) BETWEEN 3 AND 40),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 20 AND 500),
  content text NOT NULL CHECK (char_length(content) BETWEEN 80 AND 10000),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  approval_status text NOT NULL CHECK (approval_status IN ('draft', 'approved')),
  status text NOT NULL CHECK (status IN ('active', 'superseded')),
  effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audience, document_type, version)
);

CREATE UNIQUE INDEX legal_documents_one_active_type_idx
  ON legal_documents (audience, document_type)
  WHERE status = 'active';

CREATE TABLE onboarding_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  profile_type text NOT NULL CHECK (profile_type IN ('customer', 'provider')),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
  state char(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  neighborhood text CHECK (neighborhood IS NULL OR char_length(neighborhood) BETWEEN 2 AND 80),
  service_category_id uuid REFERENCES service_categories(id),
  years_experience integer CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),
  service_radius_km integer CHECK (service_radius_km IS NULL OR service_radius_km BETWEEN 1 AND 200),
  bio text CHECK (bio IS NULL OR char_length(bio) BETWEEN 20 AND 500),
  availability_summary text CHECK (
    availability_summary IS NULL OR char_length(availability_summary) BETWEEN 5 AND 200
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      profile_type = 'customer'
      AND neighborhood IS NOT NULL
      AND service_category_id IS NULL
      AND years_experience IS NULL
      AND service_radius_km IS NULL
      AND bio IS NULL
      AND availability_summary IS NULL
    )
    OR
    (
      profile_type = 'provider'
      AND neighborhood IS NULL
      AND service_category_id IS NOT NULL
      AND years_experience IS NOT NULL
      AND service_radius_km IS NOT NULL
      AND bio IS NOT NULL
      AND availability_summary IS NOT NULL
    )
  )
);

CREATE TABLE legal_acceptances (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES legal_documents(id),
  user_id uuid NOT NULL REFERENCES users(id),
  document_sha256 char(64) NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
  source text NOT NULL CHECK (source IN ('onboarding', 'account')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);

CREATE INDEX legal_acceptances_user_created_idx
  ON legal_acceptances (user_id, accepted_at DESC, id DESC);

CREATE TABLE consent_preferences (
  user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('marketing_communications', 'product_research')),
  granted boolean NOT NULL,
  privacy_document_id uuid NOT NULL REFERENCES legal_documents(id),
  source text NOT NULL CHECK (source IN ('onboarding', 'account')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, purpose)
);

CREATE TABLE consent_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('marketing_communications', 'product_research')),
  previous_granted boolean,
  granted boolean NOT NULL,
  privacy_document_id uuid NOT NULL REFERENCES legal_documents(id),
  source text NOT NULL CHECK (source IN ('onboarding', 'account')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consent_events_user_created_idx
  ON consent_events (user_id, created_at DESC, id DESC);

CREATE TABLE onboarding_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('completed', 'updated')),
  profile_version integer NOT NULL CHECK (profile_version > 0),
  accepted_document_ids jsonb NOT NULL CHECK (jsonb_typeof(accepted_document_ids) = 'array'),
  profile_snapshot jsonb NOT NULL CHECK (jsonb_typeof(profile_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX onboarding_events_user_created_idx
  ON onboarding_events (user_id, created_at DESC, id DESC);

INSERT INTO legal_documents (
  id, audience, document_type, version, title, summary, content,
  content_sha256, approval_status, status, effective_at
)
SELECT
  source.id::uuid,
  source.audience,
  source.document_type,
  'pilot-0.1',
  source.title,
  source.summary,
  source.content,
  encode(digest(source.content, 'sha256'), 'hex'),
  'draft',
  'active',
  now()
FROM (VALUES
  (
    'b1000000-0000-4000-8000-000000000001',
    'customer',
    'terms_of_use',
    'Termos de uso do cliente',
    'Regras da demonstração regional, contratação e uso responsável da plataforma.',
    'Minuta do piloto: o cliente registra necessidades, recebe propostas e acompanha serviços. Não há carteira, crédito, garantia automática ou pagamento real. Informações e arquivos devem ser sintéticos até a aprovação do ambiente de produção.'
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'customer',
    'privacy_notice',
    'Aviso de privacidade do cliente',
    'Finalidades, acessos e controles aplicados aos dados do cliente durante o piloto.',
    'Minuta do piloto: dados são usados para autenticação, combinação de oferta e demanda, atendimento e auditoria. O acesso é minimizado por perfil. Retenção, exportação e eliminação ainda dependem de aprovação jurídica antes do uso de dados reais.'
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'provider',
    'terms_of_use',
    'Termos de uso do profissional',
    'Regras da demonstração para propostas, execução, avaliações e recebíveis simulados.',
    'Minuta do piloto: o profissional consulta oportunidades autorizadas, registra propostas e acompanha serviços. Recebíveis, comissões e taxas são exclusivamente simulados. Documentos e imagens devem ser sintéticos nesta etapa.'
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    'provider',
    'privacy_notice',
    'Aviso de privacidade do profissional',
    'Finalidades e controles aplicados ao perfil e à verificação manual do profissional.',
    'Minuta do piloto: metadados de perfil, atuação e verificação são usados para moderação, operação do marketplace e auditoria. Não existe consulta automática de antecedentes, biometria, crédito ou score financeiro.'
  ),
  (
    'b1000000-0000-4000-8000-000000000005',
    'provider',
    'provider_code',
    'Código de conduta do profissional',
    'Compromissos de segurança, respeito, transparência e comunicação na plataforma.',
    'Minuta do piloto: o profissional deve informar condições e preços com clareza, respeitar horários e participantes, utilizar somente o chat transacional e interromper o atendimento diante de risco. Violações passam por revisão humana.'
  )
) AS source(id, audience, document_type, title, summary, content);

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_events FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_events FORCE ROW LEVEL SECURITY;

CREATE POLICY legal_documents_read_policy
  ON legal_documents
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR (
      status = 'active'
      AND audience = current_setting('app.actor_role', true)
      AND current_setting('app.actor_role', true) IN ('customer', 'provider')
    )
  );

CREATE POLICY onboarding_profiles_read_policy
  ON onboarding_profiles
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY onboarding_profiles_insert_policy
  ON onboarding_profiles
  FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND profile_type = current_setting('app.actor_role', true)
    AND current_setting('app.actor_role', true) IN ('customer', 'provider')
  );

CREATE POLICY onboarding_profiles_update_policy
  ON onboarding_profiles
  FOR UPDATE
  USING (user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid)
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND profile_type = current_setting('app.actor_role', true)
  );

CREATE POLICY legal_acceptances_read_policy
  ON legal_acceptances
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY legal_acceptances_insert_policy
  ON legal_acceptances
  FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM legal_documents document
      WHERE document.id = legal_acceptances.document_id
        AND document.status = 'active'
        AND document.audience = current_setting('app.actor_role', true)
        AND document.content_sha256 = legal_acceptances.document_sha256
    )
  );

CREATE POLICY consent_preferences_read_policy
  ON consent_preferences
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY consent_preferences_insert_policy
  ON consent_preferences
  FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM legal_documents document
      WHERE document.id = consent_preferences.privacy_document_id
        AND document.document_type = 'privacy_notice'
        AND document.status = 'active'
        AND document.audience = current_setting('app.actor_role', true)
    )
  );

CREATE POLICY consent_preferences_update_policy
  ON consent_preferences
  FOR UPDATE
  USING (user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid)
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM legal_documents document
      WHERE document.id = consent_preferences.privacy_document_id
        AND document.document_type = 'privacy_notice'
        AND document.status = 'active'
        AND document.audience = current_setting('app.actor_role', true)
    )
  );

CREATE POLICY consent_events_read_policy
  ON consent_events
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY consent_events_insert_policy
  ON consent_events
  FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY onboarding_events_read_policy
  ON onboarding_events
  FOR SELECT
  USING (
    current_setting('app.actor_role', true) = 'operation'
    OR user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

CREATE POLICY onboarding_events_insert_policy
  ON onboarding_events
  FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

GRANT SELECT ON legal_documents TO max_service_app;
GRANT SELECT, INSERT, UPDATE (
  city,
  state,
  neighborhood,
  service_category_id,
  years_experience,
  service_radius_km,
  bio,
  availability_summary,
  version,
  completed_at,
  updated_at
) ON onboarding_profiles TO max_service_app;
GRANT SELECT, INSERT ON legal_acceptances TO max_service_app;
GRANT SELECT, INSERT, UPDATE (granted, privacy_document_id, source, updated_at)
  ON consent_preferences TO max_service_app;
GRANT SELECT, INSERT ON consent_events TO max_service_app;
GRANT SELECT, INSERT ON onboarding_events TO max_service_app;
