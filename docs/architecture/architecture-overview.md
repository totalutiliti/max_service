# Visão de arquitetura

## Alvo da Fase 1

Monorepo npm com frontend Next.js, API NestJS, pacote compartilhado, PostgreSQL, Redis/BullMQ e armazenamento privado de objetos. O primeiro protótipo visual fica isolado da fundação transacional e não representa produção.

```text
Browser/PWA
    |
Next.js BFF - cookies HttpOnly, CSRF, headers
    |
NestJS /api/v1 - autenticação, autorização e módulos
    |---------------- PostgreSQL + RLS
    |---------------- Redis/BullMQ
    |---------------- Object storage privado
    |---------------- PSP sandbox / e-mail / SMS
```

## Módulos

Identity, Accounts, Customers, Providers, Partners, Advertisers, Catalog, Geography, ServiceRequests, Proposals, Bookings, Messaging, Payments, Commissions, Cashback, Reviews, Moderation, Documents, Notifications, Support, Audit e Administration.

## Regras de fronteira

- controllers validam transporte; serviços de aplicação orquestram casos de uso;
- domínio não depende de SDK de PSP, storage ou mensageria;
- adaptadores implementam portas substituíveis;
- transações delimitam mudanças de estado e outbox;
- consumidores e webhooks são idempotentes;
- valores comerciais vêm de regras versionadas;
- nenhuma autorização depende do frontend.

## ADRs iniciais

- `decisoes/0001-monolito-modular.md` - monólito modular antes de microserviços;
- `decisoes/0002-pagamentos-por-psp.md` - PSP autorizado e sem carteira própria;
- `decisoes/0003-prototipo-sites.md` - protótipo visual local separado da fundação backend.
