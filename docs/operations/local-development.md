# Desenvolvimento local

## Protótipo atual

```bash
npm ci
npm run dev
```

Validação:

```bash
npm run lint
npm run build
npm test
```

O protótipo não precisa de segredos nem persiste dados pessoais.

## Fundação planejada

O backend será adicionado em workspace separado com PostgreSQL 16 e Redis 7 via Docker Compose. O arquivo `.env.example` conterá apenas nomes e placeholders. Migrations usarão role administrativa local; aplicação e testes de RLS usarão role de runtime sem `BYPASSRLS`.

Fluxo esperado:

```bash
npm ci
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed
npm run dev
npm test
```

Nunca usar anexos ou dados reais em seed. Nunca usar `prisma db push`.
