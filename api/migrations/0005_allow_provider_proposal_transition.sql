CREATE POLICY requests_provider_proposal_transition_policy
ON service_requests
FOR UPDATE
USING (
  current_setting('app.actor_role', true) = 'provider'
  AND status = 'open'
)
WITH CHECK (
  current_setting('app.actor_role', true) = 'provider'
  AND status = 'proposals_received'
);
