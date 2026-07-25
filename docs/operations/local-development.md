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

O Docker Compose inicia PostgreSQL 16, Redis 8 autenticado, API NestJS, cofre S3, Prometheus e frontend. No primeiro build, o Prometheus LTS é recompilado a partir da origem oficial fixada com a atualização de segurança do gRPC; as etapas ficam em cache e a imagem final é verificada pela mesma política Trivy da CI. A migration versionada é aplicada na inicialização da API e cria apenas dados fictícios. A aplicação conecta com a role `max_service_app`, sem `BYPASSRLS`; a role administrativa local é usada somente pelo executor de migrations.

A demonstração cria sessões revogáveis no PostgreSQL. `BFF_INTERNAL_SECRET` assina o contexto entre web e API; `RATE_LIMIT_KEY_SECRET` deriva somente chaves opacas para os contadores compartilhados no Redis. `COOKIE_SECURE=false` permite o cookie no HTTP local e `TRANSPORT_SECURITY_CONFIGURED=false` mantém HSTS e o gate HTTPS honestamente desativados. Em HTTPS, o cookie deve ser seguro, o transporte precisa ser homologado e todas as chaves devem vir de um cofre, nunca do Compose.

Fluxo recomendado:

```bash
docker compose up -d --build
docker compose ps
npm test
npm run test:storage
npm run test:observability
```

Endereços locais:

- site: `http://127.0.0.1:4174`;
- SaaS: `http://127.0.0.1:4174/demo`;
- processo da API: `http://127.0.0.1:3001/health/live`;
- prontidão de banco, migrations, cofre e Redis: `http://127.0.0.1:3001/health/ready`;
- PostgreSQL: `127.0.0.1:54329`.
- Redis autenticado: `127.0.0.1:56379`;
- object storage privado: `127.0.0.1:59000`;
- console local do object storage: `127.0.0.1:59001`.
- Prometheus local: `http://127.0.0.1:59090`.

O serviço `storage-maintenance` executa uma reconciliação ao iniciar e repete a inspeção a cada 24 horas. A política local só considera objetos de prefixos conhecidos, exige idade mínima de 24 horas e limita cada rodada a cem exclusões. O resultado agregado aparece em **Operação → Conta**.

Para acompanhar a execução:

```bash
docker compose logs storage-maintenance
```

Nunca usar anexos ou dados reais em seed. Nunca aplicar `db push`. As senhas e o token de fixture literais do Compose são deliberadamente locais e devem ser substituídos por segredos provisionados fora do repositório em qualquer ambiente compartilhado. A porta do Prometheus também é exclusiva do loopback local.
