# Plano do projeto

## Objetivo

Entregar um MVP regional, seguro e demonstrável, capaz de validar a aquisição de clientes e prestadores antes de ativar integrações reguladas ou expansão nacional.

## Fases e gates

| Fase | Entrega | Gate de saída |
|---|---|---|
| 0 - Descoberta | requisitos, contradições, auditoria da referência e arquitetura | decisões críticas classificadas; sem pendência silenciosa |
| 1 - Fundação | monorepo, API, PostgreSQL, migrations, autenticação, sessões, RLS, auditoria e testes | banco recriado do zero; testes negativos de autorização verdes |
| 2 - Experiência | design system, landing, cadastro, login, onboarding e layouts por perfil | WCAG 2.2 AA; 360, 390, 768 e 1440 px validados |
| 3 - Marketplace | solicitações, propostas, chat, agenda, estados e avaliações | jornada cliente-prestador executada ponta a ponta |
| 4 - Operação | parceiros, QR Code, moderação e administração | ações críticas justificadas e auditadas |
| 5 - Financeiro sandbox | interface PSP, webhook assinado fake, split e ledger | idempotência e reconciliação testadas; nenhum dinheiro real |
| 6 - Prontidão | segurança, desempenho, acessibilidade e documentação | checklist de produção aprovado por responsáveis técnico, jurídico e financeiro |

## Hipóteses de trabalho

- marca provisória: Max Service;
- piloto: uma região limitada do interior de São Paulo;
- catálogo piloto: eletricista, encanador, pedreiro, pintor, diarista e montagem/reparos;
- comissão de demonstração: plataforma 12%, parceiro 2% e cashback 2%;
- PSP sandbox com split; sem custódia pela Max Service;
- aprovação manual de prestador após validações sintáticas e documentais.

## Não objetivos do MVP

Carteira, conta de pagamento, PIX operado pela empresa, custódia, crédito, investimento de cashback, biometria facial, antecedentes automatizados, orçamento por IA, categorias reguladas, iOS nativo e expansão nacional.

## Critérios de qualidade permanentes

- sem segredos versionados;
- dados sintéticos;
- valores monetários em decimal e horários em UTC;
- autorização no backend e isolamento testado;
- uploads privados e URLs temporárias;
- feature flags para integrações de risco;
- lint, typecheck, build, testes e scanner de segredos no CI.
