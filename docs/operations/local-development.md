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

A demonstração cria sessões revogáveis no PostgreSQL. `BFF_INTERNAL_SECRET` assina o contexto entre web e API, `COOKIE_SECURE=false` permite o cookie no HTTP local e `TRANSPORT_SECURITY_CONFIGURED=false` mantém HSTS e o gate HTTPS honestamente desativados. Em HTTPS, o cookie deve ser seguro, o transporte precisa ser homologado e ambas as chaves devem vir de um cofre, nunca do Compose.

Fluxo recomendado:

```bash
docker compose up -d --build
docker compose ps
npm test
npm run test:storage
```

Endereços locais:

- site: `http://127.0.0.1:4174`;
- SaaS: `http://127.0.0.1:4174/demo`;
- processo da API: `http://127.0.0.1:3001/health/live`;
- prontidão de banco, migrations e cofre: `http://127.0.0.1:3001/health/ready`;
- PostgreSQL: `127.0.0.1:54329`.
- object storage privado: `127.0.0.1:59000`;
- console local do object storage: `127.0.0.1:59001`.

O serviço `storage-maintenance` executa uma reconciliação ao iniciar e repete a inspeção a cada 24 horas. A política local só considera objetos de prefixos conhecidos, exige idade mínima de 24 horas e limita cada rodada a cem exclusões. O resultado agregado aparece em **Operação → Conta**.

Para acompanhar a execução:

```bash
docker compose logs storage-maintenance
```

Nunca usar anexos ou dados reais em seed. Nunca aplicar `db push`. As senhas literais do Compose são deliberadamente locais e devem ser substituídas por segredos provisionados fora do repositório em qualquer ambiente compartilhado.
