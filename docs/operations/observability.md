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

## Correlação e logs estruturados

Toda resposta emitida pela API recebe um `x-request-id` UUID gerado no servidor. O BFF encaminha esse identificador ao navegador, inclusive em downloads privados, permitindo relacionar uma falha percebida na interface ao evento da API sem confiar em um ID enviado pelo cliente.

Ao término de cada requisição, a API escreve uma linha JSON em `stdout` com:

- horário, evento e `requestId`;
- método e família de rota normalizada;
- status HTTP e duração em milissegundos;
- papel autenticado ou `anonymous`.

Query strings são descartadas, UUIDs viram `:id`, códigos públicos viram `:code` e segmentos fora da lista fechada viram `:value`. Payload, contato, descrição, endereço, cookie, assinatura, token e ID do ator não entram no evento.

## Métricas locais

O mesmo middleware mantém no máximo mil amostras em memória. O cockpit mostra uma janela móvel de cinco minutos com requisições de aplicação, probes separados, rejeições `4xx`, erros `5xx`, chamadas acima de um segundo, latência média, p95 e até cinco famílias de rota mais acessadas.

Essas métricas são deliberadamente locais à réplica e zeram quando o processo reinicia. Elas comprovam o contrato e dão diagnóstico ao piloto, mas não oferecem retenção, consulta histórica, agregação entre réplicas, alertas ou SLO. O bloco aparece somente no endpoint autenticado da Operação; liveness e readiness públicos não expõem tráfego.

## Evidência automatizada

`npm run test:smoke` valida liveness, readiness, `x-request-id`, encaminhamento pelo BFF, cockpit operacional, métricas agregadas, bloqueio do cliente e rejeição do canal interno não assinado. Testes unitários também comprovam normalização sem PII, cálculo da janela e limite de retenção. O conjunto roda depois de um `docker compose up --wait` limpo no GitHub Actions.

## Próximos requisitos de produção

- exportação OpenTelemetry/Prometheus das métricas já definidas;
- coleta, busca e política de retenção para os logs JSON já correlacionados;
- traces entre borda, BFF, API, banco, filas e storage;
- alertas externos e plantão;
- SLOs, burn rate e orçamento de erro;
- integração com plataforma gerenciada de observabilidade;
- testes de falha controlada e múltiplas réplicas.
