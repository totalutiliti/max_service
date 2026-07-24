CREATE TABLE operation_readiness_gates (
  gate_key text PRIMARY KEY CHECK (gate_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  area text NOT NULL CHECK (
    area IN ('business', 'legal', 'security', 'technology', 'finance', 'operation')
  ),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 500),
  owner_label text NOT NULL CHECK (char_length(owner_label) BETWEEN 3 AND 120),
  status text NOT NULL CHECK (
    status IN ('blocked', 'in_progress', 'evidence_ready')
  ),
  external_approval_required boolean NOT NULL DEFAULT false,
  evidence text NOT NULL DEFAULT '' CHECK (char_length(evidence) <= 1000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status <> 'evidence_ready'
    OR char_length(evidence) >= 20
  )
);

CREATE TABLE operation_readiness_gate_events (
  id uuid PRIMARY KEY,
  gate_key text NOT NULL REFERENCES operation_readiness_gates(gate_key),
  actor_id uuid NOT NULL REFERENCES users(id),
  from_status text NOT NULL CHECK (
    from_status IN ('blocked', 'in_progress', 'evidence_ready')
  ),
  to_status text NOT NULL CHECK (
    to_status IN ('blocked', 'in_progress', 'evidence_ready')
  ),
  gate_version integer NOT NULL CHECK (gate_version > 1),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gate_key, gate_version)
);

CREATE INDEX operation_readiness_gate_events_created_idx
  ON operation_readiness_gate_events (created_at DESC, id DESC);

INSERT INTO operation_readiness_gates (
  gate_key,
  area,
  title,
  description,
  owner_label,
  status,
  external_approval_required,
  evidence
) VALUES
  (
    'brand_and_domain',
    'business',
    'Marca e domínio',
    'Confirmar disponibilidade jurídica da marca Max Service e o domínio oficial do produto.',
    'Negócio + Jurídico',
    'blocked',
    true,
    ''
  ),
  (
    'marketplace_legal_model',
    'legal',
    'Modelo jurídico e fiscal',
    'Aprovar contratos, responsabilidades, emissão fiscal e o enquadramento do marketplace.',
    'Jurídico + Fiscal',
    'blocked',
    true,
    ''
  ),
  (
    'identity_provider',
    'security',
    'Identidade de produção',
    'Homologar cadastro, confirmação de contato, recuperação de conta e MFA administrativo.',
    'Tecnologia + Segurança',
    'in_progress',
    false,
    'Sessões demonstrativas revogáveis e autorização BFF/API já exercitadas localmente.'
  ),
  (
    'payment_provider',
    'finance',
    'PSP e fluxo financeiro',
    'Contratar PSP autorizado e validar split, chargeback, cancelamento e conciliação externa.',
    'Financeiro + Jurídico',
    'blocked',
    true,
    ''
  ),
  (
    'privacy_and_retention',
    'legal',
    'Privacidade e retenção',
    'Aprovar bases legais, retenção, exportação, anonimização e fornecedores de verificação.',
    'DPO + Jurídico',
    'in_progress',
    true,
    'Consentimentos, preferências e trilhas versionadas estão materializados com dados sintéticos.'
  ),
  (
    'backup_and_restore',
    'technology',
    'Backup e restauração',
    'Executar e registrar ensaio de backup, restauração e recuperação pontual do banco.',
    'Tecnologia',
    'blocked',
    false,
    ''
  ),
  (
    'authorization_evidence',
    'security',
    'RLS e autorização',
    'Automatizar testes negativos de RLS, IDOR, sessão e concorrência do fluxo principal.',
    'Tecnologia + Segurança',
    'in_progress',
    false,
    'RLS fail-closed, assinatura interna e proteções transacionais já existem no ambiente local.'
  ),
  (
    'pilot_scope',
    'operation',
    'Escopo do piloto',
    'Formalizar região, categorias, critérios de aceite, suporte e contatos responsáveis.',
    'Produto + Operação',
    'in_progress',
    true,
    'Sorocaba, bairros e seis categorias não reguladas estão configurados no piloto local.'
  );

ALTER TABLE operation_readiness_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_readiness_gates FORCE ROW LEVEL SECURITY;
ALTER TABLE operation_readiness_gate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_readiness_gate_events FORCE ROW LEVEL SECURITY;

CREATE POLICY operation_readiness_gates_read_policy
  ON operation_readiness_gates
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_readiness_gates_update_policy
  ON operation_readiness_gates
  FOR UPDATE
  USING (current_setting('app.actor_role', true) = 'operation')
  WITH CHECK (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_readiness_gate_events_read_policy
  ON operation_readiness_gate_events
  FOR SELECT
  USING (current_setting('app.actor_role', true) = 'operation');

CREATE POLICY operation_readiness_gate_events_insert_policy
  ON operation_readiness_gate_events
  FOR INSERT
  WITH CHECK (
    current_setting('app.actor_role', true) = 'operation'
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  );

GRANT SELECT, UPDATE (
  owner_label,
  status,
  evidence,
  version,
  updated_by,
  reviewed_at,
  updated_at
) ON operation_readiness_gates TO max_service_app;

GRANT SELECT, INSERT ON operation_readiness_gate_events TO max_service_app;
