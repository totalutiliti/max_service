UPDATE bookings
SET
  scheduled_for = (
    date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo') + interval '1 day 9 hours'
  ) AT TIME ZONE 'America/Sao_Paulo',
  updated_at = now()
WHERE status = 'scheduled';
