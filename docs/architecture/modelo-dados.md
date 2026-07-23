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

`users`, `demo_sessions`, `legal_documents`, `legal_acceptances`, `onboarding_profiles`, `consent_preferences` e seus históricos append-only estão materializados no piloto. `identities`, sessões de produção, `roles`, `permissions` e `user_roles` permanecem como alvo; as minutas legais atuais precisam ser substituídas por versões aprovadas antes da coleta de dados reais.

### Perfis e geografia

`service_regions`, `service_region_neighborhoods`, `provider_service_regions`, `provider_matching_profiles`, `provider_matching_events` e seus históricos append-only estão materializados no piloto. Pedidos e perfis de onboarding mantêm as chaves regionais e um snapshot textual da localização. O perfil de matching preserva categoria principal, disponibilidade, aceite de urgências e limites de capacidade com versão monotônica. `customer_profiles`, `provider_profiles`, `partner_profiles`, `advertiser_profiles` e endereços completos permanecem como alvo posterior.

### Catálogo e verificação

`service_categories`, `service_category_events`, `provider_categories` (alvo), `provider_document_checks`, `provider_document_files`, `provider_verifications` e `provider_verification_events`. Os eventos do catálogo registram ativação, desativação e reordenação com justificativa. Os bytes de `provider_document_files` ficam no object storage privado; o banco contém somente metadados e hash.

### Marketplace

`service_requests`, `service_request_attachments`, `proposals`, `bookings`, `booking_status_history`, `booking_cancellations`, `provider_schedule_settings`, `provider_weekly_availability`, `provider_schedule_blocks`, `provider_schedule_events`, `conversations`, `conversation_members`, `messages`, `message_attachments`, `service_reviews`. `service_request_attachments` e `message_attachments` estão materializadas no piloto com metadados no PostgreSQL e bytes no object storage privado.

### Crescimento e receita

`partner_referral_links`, `partner_referrals`, `partner_referral_events`, `marketing_campaigns`, `marketing_campaign_events`, `campaign_reservations`, `commercial_rules`, `payment_intents`, `payment_allocations`, `payment_transactions`, `financial_ledger_entries`; campanhas congelam a regra na reserva, e comissões, cashback e recebíveis são tipos de alocação/ledger. Publicidade permanece como evolução posterior.

### Operação

`notifications`, `notification_preferences`, `notification_preference_events`, `push_subscriptions`, `notification_push_deliveries`, `support_cases`, `support_case_events`, `partner_support_cases`, `partner_support_events`, `partner_support_attachments`, `audit_events`, `outbox_events` e `feature_flags`.

## Invariantes

- uma proposta pertence a uma solicitação e a um prestador elegível;
- uma oportunidade aberta só é visível quando categoria, região ativa, verificação aprovada e disponibilidade do profissional são compatíveis;
- uma nova proposta respeita os limites persistidos de propostas ativas e serviços simultâneos; atualização da própria proposta não consome capacidade adicional;
- toda alteração do perfil de matching incrementa a versão e gera evento append-only e auditoria no mesmo fluxo transacional;
- apenas o cliente proprietário aceita proposta;
- um booking nasce de exatamente uma proposta aceita;
- o aceite usa somente um slot futuro calculado pelo servidor a partir da jornada semanal, dos bookings ativos e dos bloqueios do prestador;
- `scheduled_for` e `scheduled_until` formam um intervalo positivo e alinhado a 30 minutos, dentro de um único dia da jornada local;
- bookings `scheduled`/`in_progress` do mesmo prestador não se sobrepõem; um bloqueio ativo também não se sobrepõe a outro bloqueio nem a booking ativo;
- confirmação e bloqueio serializam pelo mesmo advisory lock do prestador, fechando a janela de corrida entre tabelas;
- toda alteração da jornada ou de bloqueio incrementa a versão e gera `provider_schedule_events` append-only e auditoria;
- o ciclo básico de booking é `scheduled → in_progress → completed`; apenas o prestador vinculado executa essas transições;
- toda transição de booking gera histórico no mesmo commit;
- um booking só pode ter um cancelamento, solicitado por cliente ou prestador vinculado enquanto estiver agendado ou em execução;
- cada cancelamento abre exatamente um `support_case`; interrupções em execução recebem prioridade alta;
- notas e transições do chamado são append-only em `support_case_events`, visíveis apenas para a operação;
- resolver um chamado exige justificativa, responsável e instante de resolução;
- cada notificação pertence a um destinatário e só pode ser emitida a partir de uma relação transacional comprovada;
- leitura de notificação altera apenas `read_at`; conteúdo, origem e destinatário permanecem imutáveis;
- cada assinatura Web Push pertence a um usuário e aparelho, só é criada ou revogada dentro da própria sessão e nunca expõe a chave privada VAPID ao navegador;
- cada preferência de entrega pertence ao destinatário, possui versão monotônica e evento append-only com estado anterior/posterior;
- cada notificação cria entregas apenas para assinaturas ativas e assuntos autorizados no mesmo commit; a fila é inacessível ao papel de aplicação, possui claim interno com lock, no máximo cinco tentativas e finalização de endpoints expirados;
- o horário silencioso é calculado no fuso persistido, inclusive quando atravessa a meia-noite; a fila volta a conferir assunto e janela no claim, e uma alteração suprime entregas desativadas ainda pendentes;
- um parceiro possui um código ativo e enxerga somente indicações vinculadas à própria rede;
- convite manual nasce como `invited`; ativação exige um prestador convertido e instante de ativação;
- captura por link ou QR exige código ativo, consentimento datado e versão do aviso de privacidade; repetição do mesmo e-mail na rede não cria nova indicação;
- a triagem segue `invited → in_review → approved | rejected`; aprovação significa aptidão para onboarding e não cria conta nem ativa automaticamente o profissional;
- cada mudança da triagem exige justificativa e gera `partner_referral_events` append-only e `audit_events`; o parceiro consulta o status, mas os eventos internos são exclusivos da operação;
- cada atendimento do parceiro pertence à sua rede, pode vincular somente uma indicação da mesma rede e aceita mensagens apenas enquanto não estiver resolvido;
- a Operação pode atribuir o atendimento apenas a um usuário operacional e elevar a prioridade de normal para alta, nunca reduzi-la durante o caso; cada mudança exige justificativa, evento append-only e auditoria;
- a política `SUPPORT-SLA-2026-01` define primeira resposta/resolução em 4 h/48 h no fluxo normal e 1 h/8 h na prioridade alta; os prazos ficam persistidos e o primeiro prazo é preservado depois da resposta;
- cada mensagem de atendimento aceita no máximo um anexo append-only PDF/JPEG/PNG sintético de 2 MB; evento, caso e autor são vinculados por chave estrangeira composta;
- o anexo de atendimento é visível somente ao parceiro titular e à Operação; o object storage guarda os bytes e `partner_support_attachments` preserva chave aleatória, nome normalizado, tipo, tamanho, hash e autoria;
- a ordem das categorias é positiva e única; somente a operação altera `active` ou `sort_order`, sempre com justificativa, `service_category_events` append-only e auditoria;
- o catálogo mantém ao menos uma categoria ativa; uma categoria inativa é rejeitada em novos pedidos e indicações, mas continua visível nos relacionamentos históricos;
- uma verificação só sai de `submitted` para `in_review`; a decisão final é `approved` ou `changes_requested`;
- aprovação exige todos os itens aceitos; correção exige ao menos um item marcado; cada ação gera evento e auditoria;
- uma avaliação só existe após conclusão e uma vez por autor/booking;
- cada avaliação tem como alvo a outra parte do booking e não pode ser editada ou apagada pelo fluxo da aplicação;
- um evento de PSP tem chave idempotente única;
- lançamentos de recebível, taxa, comissão e cashback não são editados: correções geram débitos de estorno;
- regra financeira aplicada é congelada por versão no booking/payment intent.
- uma campanha possui código único, janela, estado, pedido mínimo e limites total/por cliente; apenas a Operação cria ou muda o estado, sempre com justificativa e evento append-only; a contagem global usa uma função de escopo mínimo para não ampliar a leitura do cliente sob RLS;
- cada pedido possui no máximo uma reserva de campanha; a reserva congela código e regra, e o aceite a transforma uma única vez em `redeemed` ou `ineligible`;
- o desconto é calculado no servidor sobre a proposta aceita, preserva ao menos R$ 1 de valor final e fica reconciliado por `valor de lista = valor final + desconto` no payment intent;
- a soma das alocações de um intent é exatamente o valor bruto, com o resíduo de arredondamento absorvido pelo recebível do profissional;
- liquidação exige serviço concluído; estorno de autorização exige serviço cancelado;
- uma sessão demonstrativa referencia exatamente um usuário e papel compatíveis, persiste apenas o hash do token e deixa de autorizar após expiração ou revogação;
- identidade, papel, hash, validade e criação da sessão são imutáveis; `last_seen_at` só avança e `revoked_at` nunca volta a nulo;
- sem `app.session_token_hash`, a role de runtime não lê nem altera sessões.
- cada versão documental possui chave de objeto aleatória, hash SHA-256, tipo e tamanho validados; nenhuma versão é sobrescrita pela aplicação;
- somente o profissional proprietário e a operação consultam os metadados; o arquivo é entregue como anexo privado, sem URL pública;
- cada pedido aceita até três imagens append-only JPEG/PNG de 512 KB, com chave de objeto aleatória, hash SHA-256 e validação conjunta de MIME, extensão e assinatura;
- imagens de pedido são visíveis ao cliente proprietário, aos profissionais enquanto a solicitação é oportunidade aberta e, após o aceite, somente ao profissional contratado e à operação;
- cada mensagem aceita no máximo uma imagem append-only JPEG/PNG de 512 KB; a chave do objeto, o hash SHA-256 e o remetente são vinculados por constraints à conversa e à mensagem;
- anexos de mensagem são visíveis exclusivamente aos membros cliente e profissional da conversa; parceiro, operação e conexão sem contexto recebem zero linhas;
- o cursor de sincronização referencia uma mensagem visível da própria conversa e avança pela tupla imutável `(created_at, id)`, comparada integralmente no PostgreSQL para preservar precisão;
- cada membro mantém um cursor de leitura que referencia uma mensagem da mesma conversa, avança de forma monotônica e contabiliza como não lidas somente as mensagens posteriores enviadas pela outra parte;
