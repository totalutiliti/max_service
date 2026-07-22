INSERT INTO service_requests (
  id, public_code, customer_id, category_id, title, description,
  neighborhood, city, state, preferred_window, status, created_at
) VALUES
  (
    '20000000-0000-4000-8000-000000000002',
    'SV-1052',
    '00000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000001',
    'Instalação de ventilador de teto',
    'Preciso instalar um ventilador de teto em um quarto com ponto elétrico pronto.',
    'Vila Carvalho',
    'Sorocaba',
    'SP',
    'Hoje à tarde',
    'open',
    now() - interval '45 minutes'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'SV-1053',
    '00000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000004',
    'Pintura de quarto pequeno',
    'Quero pintar um quarto pequeno de branco, incluindo preparação de duas paredes.',
    'Campolim',
    'Sorocaba',
    'SP',
    'A combinar',
    'open',
    now() - interval '20 minutes'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO request_status_history (request_id, status, actor_id, note)
SELECT id, 'open', customer_id, 'Solicitação demonstrativa criada.'
FROM service_requests
WHERE id IN (
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003'
)
AND NOT EXISTS (
  SELECT 1 FROM request_status_history h
  WHERE h.request_id = service_requests.id AND h.status = 'open'
);
