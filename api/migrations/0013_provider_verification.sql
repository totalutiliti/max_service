CREATE TABLE provider_verifications (
  id uuid PRIMARY KEY,
  public_code text NOT NULL UNIQUE,
  provider_id uuid NOT NULL UNIQUE REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('submitted', 'in_review', 'changes_requested', 'approved')),
  review_priority text NOT NULL CHECK (review_priority IN ('standard', 'attention')),
  policy_version text NOT NULL,
  submitted_at timestamptz NOT NULL,
  assigned_to uuid REFERENCES users(id),
  decision_reason text CHECK (decision_reason IS NULL OR char_length(decision_reason) BETWEEN 10 AND 1000),
  decided_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('approved', 'changes_requested') AND decision_reason IS NOT NULL AND decided_at IS NOT NULL)
    OR (status NOT IN ('approved', 'changes_requested') AND decision_reason IS NULL AND decided_at IS NULL)
  )
);

CREATE TABLE provider_document_checks (
  id uuid PRIMARY KEY,
  verification_id uuid NOT NULL REFERENCES provider_verifications(id),
  document_type text NOT NULL CHECK (document_type IN ('identity', 'address', 'professional_qualification', 'profile_photo')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 3 AND 100),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'changes_requested')),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 10 AND 1000),
  checked_by uuid REFERENCES users(id),
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verification_id, document_type),
  CHECK (
    (status = 'pending' AND note IS NULL AND checked_by IS NULL AND checked_at IS NULL)
    OR (status <> 'pending' AND note IS NOT NULL AND checked_by IS NOT NULL AND checked_at IS NOT NULL)
  )
);

CREATE TABLE provider_verification_events (
  id uuid PRIMARY KEY,
  verification_id uuid NOT NULL REFERENCES provider_verifications(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('submitted', 'review_started', 'document_reviewed', 'approved', 'changes_requested')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('submitted', 'in_review', 'changes_requested', 'approved')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('submitted', 'in_review', 'changes_requested', 'approved')),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX provider_verifications_status_updated_idx ON provider_verifications (status, review_priority, updated_at DESC);
CREATE INDEX provider_document_checks_verification_status_idx ON provider_document_checks (verification_id, status);
CREATE INDEX provider_verification_events_verification_created_idx ON provider_verification_events (verification_id, created_at DESC);

INSERT INTO provider_verifications (
  id, public_code, provider_id, status, review_priority, policy_version,
  submitted_at, assigned_to, decision_reason, decided_at, updated_at
) VALUES
  (
    '80000000-0000-4000-8000-000000000001', 'VF-RS01', '00000000-0000-4000-8000-000000000201',
    'approved', 'standard', 'provider-v1', now() - interval '80 days',
    '00000000-0000-4000-8000-000000000401',
    'Documentação demonstrativa conferida conforme a política provider-v1.',
    now() - interval '78 days', now() - interval '78 days'
  ),
  (
    '80000000-0000-4000-8000-000000000002', 'VF-MC02', '00000000-0000-4000-8000-000000000202',
    'submitted', 'standard', 'provider-v1', now() - interval '7 hours',
    NULL, NULL, NULL, now() - interval '7 hours'
  ),
  (
    '80000000-0000-4000-8000-000000000003', 'VF-JL03', '00000000-0000-4000-8000-000000000203',
    'in_review', 'attention', 'provider-v1', now() - interval '31 hours',
    '00000000-0000-4000-8000-000000000401', NULL, NULL, now() - interval '4 hours'
  ),
  (
    '80000000-0000-4000-8000-000000000004', 'VF-CG04', '00000000-0000-4000-8000-000000000204',
    'changes_requested', 'standard', 'provider-v1', now() - interval '4 days',
    '00000000-0000-4000-8000-000000000401',
    'Reenvie o comprovante de endereço demonstrativo com leitura integral.',
    now() - interval '2 days', now() - interval '2 days'
  );

INSERT INTO provider_document_checks (
  id, verification_id, document_type, label, status, note, checked_by, checked_at, created_at, updated_at
) VALUES
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'identity', 'Documento de identidade', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '79 days', now() - interval '80 days', now() - interval '79 days'),
  ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', 'address', 'Comprovante de endereço', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '79 days', now() - interval '80 days', now() - interval '79 days'),
  ('81000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001', 'professional_qualification', 'Qualificação profissional', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '79 days', now() - interval '80 days', now() - interval '79 days'),
  ('81000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000001', 'profile_photo', 'Foto do perfil', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '79 days', now() - interval '80 days', now() - interval '79 days'),

  ('81000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000002', 'identity', 'Documento de identidade', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 hours', now() - interval '7 hours', now() - interval '3 hours'),
  ('81000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000002', 'address', 'Comprovante de endereço', 'pending', NULL, NULL, NULL, now() - interval '7 hours', now() - interval '7 hours'),
  ('81000000-0000-4000-8000-000000000007', '80000000-0000-4000-8000-000000000002', 'professional_qualification', 'Qualificação profissional', 'pending', NULL, NULL, NULL, now() - interval '7 hours', now() - interval '7 hours'),
  ('81000000-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000002', 'profile_photo', 'Foto do perfil', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 hours', now() - interval '7 hours', now() - interval '3 hours'),

  ('81000000-0000-4000-8000-000000000009', '80000000-0000-4000-8000-000000000003', 'identity', 'Documento de identidade', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 hours', now() - interval '31 hours', now() - interval '3 hours'),
  ('81000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000003', 'address', 'Comprovante de endereço', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 hours', now() - interval '31 hours', now() - interval '3 hours'),
  ('81000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000003', 'professional_qualification', 'Qualificação profissional', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 hours', now() - interval '31 hours', now() - interval '3 hours'),
  ('81000000-0000-4000-8000-000000000012', '80000000-0000-4000-8000-000000000003', 'profile_photo', 'Foto do perfil', 'pending', NULL, NULL, NULL, now() - interval '31 hours', now() - interval '31 hours'),

  ('81000000-0000-4000-8000-000000000013', '80000000-0000-4000-8000-000000000004', 'identity', 'Documento de identidade', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 days', now() - interval '4 days', now() - interval '3 days'),
  ('81000000-0000-4000-8000-000000000014', '80000000-0000-4000-8000-000000000004', 'address', 'Comprovante de endereço', 'changes_requested', 'A referência demonstrativa não permite leitura integral.', '00000000-0000-4000-8000-000000000401', now() - interval '2 days', now() - interval '4 days', now() - interval '2 days'),
  ('81000000-0000-4000-8000-000000000015', '80000000-0000-4000-8000-000000000004', 'professional_qualification', 'Qualificação profissional', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 days', now() - interval '4 days', now() - interval '3 days'),
  ('81000000-0000-4000-8000-000000000016', '80000000-0000-4000-8000-000000000004', 'profile_photo', 'Foto do perfil', 'accepted', 'Metadados demonstrativos conferidos.', '00000000-0000-4000-8000-000000000401', now() - interval '3 days', now() - interval '4 days', now() - interval '3 days');

INSERT INTO provider_verification_events (id, verification_id, actor_id, event_type, from_status, to_status, note, created_at) VALUES
  ('82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 'submitted', NULL, 'submitted', 'Cadastro demonstrativo enviado para análise.', now() - interval '80 days'),
  ('82000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000401', 'review_started', 'submitted', 'in_review', 'Análise demonstrativa iniciada pela operação.', now() - interval '79 days'),
  ('82000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000401', 'approved', 'in_review', 'approved', 'Documentação demonstrativa aprovada conforme a política provider-v1.', now() - interval '78 days'),
  ('82000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000202', 'submitted', NULL, 'submitted', 'Cadastro demonstrativo enviado para análise.', now() - interval '7 hours'),
  ('82000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000203', 'submitted', NULL, 'submitted', 'Cadastro demonstrativo enviado para análise.', now() - interval '31 hours'),
  ('82000000-0000-4000-8000-000000000006', '80000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000401', 'review_started', 'submitted', 'in_review', 'Análise demonstrativa iniciada pela operação.', now() - interval '4 hours'),
  ('82000000-0000-4000-8000-000000000007', '80000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000204', 'submitted', NULL, 'submitted', 'Cadastro demonstrativo enviado para análise.', now() - interval '4 days'),
  ('82000000-0000-4000-8000-000000000008', '80000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000401', 'review_started', 'submitted', 'in_review', 'Análise demonstrativa iniciada pela operação.', now() - interval '3 days'),
  ('82000000-0000-4000-8000-000000000009', '80000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000401', 'changes_requested', 'in_review', 'changes_requested', 'Reenvio do comprovante demonstrativo solicitado ao profissional.', now() - interval '2 days');

ALTER TABLE provider_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_document_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_document_checks FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_verification_events FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_verifications_read_policy ON provider_verifications FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

CREATE POLICY provider_verifications_operation_update_policy ON provider_verifications FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY provider_document_checks_read_policy ON provider_document_checks FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR EXISTS (
    SELECT 1 FROM provider_verifications verification
    WHERE verification.id = provider_document_checks.verification_id
      AND verification.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);

CREATE POLICY provider_document_checks_operation_update_policy ON provider_document_checks FOR UPDATE USING (
  current_setting('app.actor_role', true) = 'operation'
) WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
);

CREATE POLICY provider_verification_events_read_policy ON provider_verification_events FOR SELECT USING (
  current_setting('app.actor_role', true) = 'operation'
  OR EXISTS (
    SELECT 1 FROM provider_verifications verification
    WHERE verification.id = provider_verification_events.verification_id
      AND verification.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);

CREATE POLICY provider_verification_events_operation_insert_policy ON provider_verification_events FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'operation'
  AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
);

GRANT SELECT, UPDATE ON provider_verifications TO max_service_app;
GRANT SELECT, UPDATE ON provider_document_checks TO max_service_app;
GRANT SELECT, INSERT ON provider_verification_events TO max_service_app;
