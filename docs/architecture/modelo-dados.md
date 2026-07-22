# Modelo de dados

## Convenções

- UUID v7 ou identificador aleatório equivalente como chave interna;
- `public_code` opcional e não autorizativo (`CL-`, `PR-`, `PC-`);
- UTC em timestamps; `numeric` para dinheiro;
- `created_at`, `updated_at` e, quando aplicável, `deleted_at` para ciclo de vida;
- histórico financeiro, estados, consentimentos, verificações e auditoria são append-only;
- migrations versionadas; nenhuma alteração por `db push`.

## Agregados principais

### Identidade e acesso

`users`, `identities`, `sessions`, `roles`, `permissions`, `user_roles`, `terms_versions`, `terms_acceptances`, `consent_records`.

### Perfis e geografia

`customer_profiles`, `provider_profiles`, `partner_profiles`, `advertiser_profiles`, `addresses`, `regions`, `provider_service_areas`.

### Catálogo e verificação

`service_categories`, `provider_categories`, `provider_documents`, `provider_verifications` e histórico de decisões.

### Marketplace

`service_requests`, `service_request_attachments`, `proposals`, `bookings`, `booking_status_history`, `booking_cancellations`, `conversations`, `conversation_members`, `messages`, `message_attachments`, `service_reviews`.

### Crescimento e receita

`referrals`, `referral_attributions`, `commission_rules`, `commissions`, `cashback_ledger`, `payment_intents`, `payment_transactions`, `webhook_events`, `advertisements`, `advertisement_targeting`.

### Operação

`notifications`, `support_cases`, `audit_events`, `outbox_events` e `feature_flags`.

## Invariantes

- uma proposta pertence a uma solicitação e a um prestador elegível;
- apenas o cliente proprietário aceita proposta;
- um booking nasce de exatamente uma proposta aceita;
- o ciclo básico de booking é `scheduled → in_progress → completed`; apenas o prestador vinculado executa essas transições;
- toda transição de booking gera histórico no mesmo commit;
- um booking só pode ter um cancelamento, solicitado por cliente ou prestador vinculado enquanto estiver agendado ou em execução;
- cada cancelamento abre exatamente um `support_case`; interrupções em execução recebem prioridade alta;
- uma avaliação só existe após conclusão e uma vez por autor/booking;
- cada avaliação tem como alvo a outra parte do booking e não pode ser editada ou apagada pelo fluxo da aplicação;
- um evento de PSP tem chave idempotente única;
- lançamentos de comissão/cashback não são editados: correções geram estorno;
- regra financeira aplicada é congelada por versão no booking/payment intent.
