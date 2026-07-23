DROP POLICY consent_events_insert_policy ON consent_events;

CREATE POLICY consent_events_insert_policy
  ON consent_events
  FOR INSERT
  WITH CHECK (
    user_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM legal_documents document
      WHERE document.id = consent_events.privacy_document_id
        AND document.document_type = 'privacy_notice'
        AND document.status = 'active'
        AND document.audience = current_setting('app.actor_role', true)
    )
  );
