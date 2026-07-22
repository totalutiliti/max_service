CREATE POLICY provider_verification_events_provider_upload_insert_policy
ON provider_verification_events FOR INSERT WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND actor_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  AND event_type = 'document_uploaded'
  AND from_status IS NULL
  AND to_status IS NULL
  AND EXISTS (
    SELECT 1 FROM provider_verifications verification
    WHERE verification.id = provider_verification_events.verification_id
      AND verification.provider_id = NULLIF(current_setting('app.actor_id', true), '')::uuid
  )
);
