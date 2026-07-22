# ADR 0004 - API e PostgreSQL no piloto local

**Status:** aceito para a Fase 1 local.

## Contexto

A interface já valida a proposta de valor, mas solicitações criadas no painel precisam sobreviver a recargas e ser visíveis somente aos atores autorizados. A arquitetura alvo prevê API NestJS e PostgreSQL; o frontend continua compatível com o ambiente Sites.

## Decisão

Adicionar uma API NestJS em processo separado e PostgreSQL 16 ao Docker Compose. O frontend acessa a API por um BFF de mesma origem. Migrations SQL são versionadas, a role de runtime não possui `BYPASSRLS` e cada transação define `app.actor_id` e `app.actor_role` antes de consultar dados protegidos.

No ambiente local, `DEMO_MODE` permite somente quatro identidades fictícias conhecidas. Esse mecanismo não é autenticação de produção e falha fechado quando o modo demonstrativo está desativado.

## Consequências

- solicitações, propostas, aceite e histórico passam a ter estado persistente;
- cliente, profissional, parceiro e operação recebem visibilidades distintas no banco;
- migração e seed demonstrativo permanecem reproduzíveis;
- produção exigirá provedor de identidade, executor de migrations separado e segredos externos;
- Redis, uploads e PSP continuam fora deste marco.
