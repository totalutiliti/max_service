# Desenvolvimento local

## Frontend isolado

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

Esse modo não inicia o banco nem a API e serve somente para trabalhar na interface.

## Plataforma completa local

O Docker Compose inicia PostgreSQL 16, API NestJS e frontend. A migration versionada é aplicada na inicialização da API e cria apenas dados fictícios. A aplicação conecta com a role `max_service_app`, sem `BYPASSRLS`; a role administrativa local é usada somente pelo executor de migrations.

Fluxo recomendado:

```bash
docker compose up -d --build
docker compose ps
npm test
```

Endereços locais:

- site: `http://127.0.0.1:4174`;
- SaaS: `http://127.0.0.1:4174/demo`;
- saúde da API: `http://127.0.0.1:3001/health`;
- PostgreSQL: `127.0.0.1:54329`.

Nunca usar anexos ou dados reais em seed. Nunca aplicar `db push`. As senhas literais do Compose são deliberadamente locais e devem ser substituídas por segredos provisionados fora do repositório em qualquer ambiente compartilhado.
