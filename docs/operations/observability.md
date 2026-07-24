# Saúde e observabilidade

## Probes públicos

- `GET /health/live`: confirma somente que o processo da API está ativo. Não consulta dependências.
- `GET /health/ready`: confirma PostgreSQL, migrations e cofre privado. Retorna `503` quando uma dependência obrigatória bloqueia tráfego.
- `GET /health`: alias compatível do readiness.

As respostas públicas usam somente identificadores conhecidos, estado e latência. Não expõem URLs internas, credenciais, nomes de buckets, objetos, migrations ou payloads de negócio.

O Docker usa `/health/ready`; portanto o frontend só inicia depois que API, banco, esquema e armazenamento estão coerentes.

## Cockpit da Operação

`GET /api/v1/operation/system-health` exige sessão operacional no BFF e canal interno assinado. Cliente, prestador e parceiro recebem `403`; uma chamada direta com cabeçalhos não assinados recebe `401`.

O painel em **Operação → Conta** apresenta:

- API e tempo de atividade;
- conexão do PostgreSQL pela role de runtime;
- quantidade e sincronismo das migrations;
- acesso ao cofre privado;
- modo demonstrativo de identidade;
- financeiro sandbox;
- configuração opcional de Web Push;
- bloqueadores de tráfego local separados de gates de produção.

O diagnóstico é consolidado por cinco segundos para evitar que health checks repetidos ampliem carga sobre banco e storage. Nenhum estado “saudável” altera a política `productionAuthorized: false`.

## Evidência automatizada

`npm run test:smoke` valida liveness, readiness, cockpit operacional, bloqueio do cliente e rejeição do canal interno não assinado. O teste roda depois de um `docker compose up --wait` limpo no GitHub Actions.

## Próximos requisitos de produção

- métricas Prometheus/OpenTelemetry;
- logs JSON com correlação e política de retenção;
- traces entre borda, BFF, API, banco, filas e storage;
- alertas externos e plantão;
- SLOs, burn rate e orçamento de erro;
- integração com plataforma gerenciada de observabilidade;
- testes de falha controlada e múltiplas réplicas.
