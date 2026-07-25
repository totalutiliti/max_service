# Saúde e observabilidade

## Probes públicos

- `GET /health/live`: confirma somente que o processo da API está ativo. Não consulta dependências.
- `GET /health/ready`: confirma PostgreSQL, migrations, cofre privado e Redis do rate limit. Retorna `503` quando uma dependência obrigatória bloqueia tráfego.
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
- coordenação distribuída do rate limit, com modo e disponibilidade sem expor URL ou credenciais;
- última reconciliação agregada entre objetos e metadados, sem expor chaves ou nomes de arquivo;
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
- indicador booleano de replay idempotente, sem registrar a chave.

Query strings são descartadas, UUIDs viram `:id`, códigos públicos viram `:code` e segmentos fora da lista fechada viram `:value`. Payload, contato, descrição, endereço, cookie, assinatura, token e ID do ator não entram no evento.

## Métricas locais e exportação OpenMetrics

O mesmo middleware mantém no máximo mil amostras em memória. O cockpit mostra uma janela móvel de cinco minutos com requisições de aplicação, probes separados, replays idempotentes, rejeições `4xx`, bloqueios `429`, erros `5xx`, chamadas acima de um segundo, latência média, p95 e até cinco famílias de rota mais acessadas.

As métricas do cockpit são deliberadamente locais à réplica e zeram quando o processo reinicia. O bloco aparece somente no endpoint autenticado da Operação; liveness e readiness públicos não expõem tráfego. A retenção histórica curta, as consultas e as regras locais ficam no coletor descrito abaixo.

O mesmo cockpit apresenta exclusivamente agregados da proteção contra abuso: políticas ativas, contadores opacos observados pela réplica e bloqueios locais por política nos últimos cinco minutos. A decisão de bloqueio é coordenada no Redis entre réplicas; chaves, códigos, atores, endereços, URL e credenciais não fazem parte da resposta.

O check **Transporte HTTPS** diferencia os headers defensivos já aplicados no código da terminação TLS/HSTS que depende da borda. No Docker local ele permanece em atenção e bloqueia produção, sem bloquear o tráfego de demonstração.

`GET /internal/metrics` exporta o contrato OpenMetrics 1.0 para coleta por Prometheus ou serviço compatível. O endpoint é opt-in (`METRICS_ENABLED=true`), exige `Authorization: Bearer` com `METRICS_BEARER_TOKEN` de ao menos 32 caracteres, responde `404` quando desativado, `503` quando habilitado sem credencial válida e `401` para uma credencial ausente ou incorreta. O token não deve ser enviado ao navegador; em produção, o coletor deve alcançar a API por rede privada e obter a credencial de um cofre.

Catálogo exportado:

- `max_service_http_requests_total`, agregado somente por método fechado, classe HTTP e tipo de tráfego;
- `max_service_http_request_duration_seconds`, histograma cumulativo em segundos;
- `max_service_http_idempotency_replays_total`;
- `max_service_dependency_status` e duração dos checks conhecidos;
- prontidão local, autorização de produção, quantidade de bloqueadores, início e uptime da réplica.

Não existem labels de rota, ator, ID, código público, IP, e-mail, query string ou conteúdo. Métodos desconhecidos viram `OTHER`; dependências vêm da lista fechada do código. Contadores zeram no reinício da réplica, comportamento esperado para séries identificadas pelo coletor por `instance`.

### Coleta e rotação

Configuração mínima do coletor:

```yaml
scrape_configs:
  - job_name: max-service-api
    metrics_path: /internal/metrics
    scheme: https
    authorization:
      type: Bearer
      credentials_file: /run/secrets/max-service-metrics-token
    static_configs:
      - targets: ["api.internal.example:443"]
```

Para rotacionar, gere um token aleatório com no mínimo 32 caracteres no cofre, atualize o segredo do workload e depois o `credentials_file` do coletor dentro de uma janela coordenada. Confirme `200`, o `Content-Type` OpenMetrics e `# EOF`; revogue o token anterior e registre a mudança sem copiar seu valor para ticket ou log. A credencial local do Compose é pública por definição e nunca pode ser promovida.

## Coletor e SLOs locais

O Docker executa o Prometheus `3.13.1` LTS em uma imagem reproduzível do projeto. O build fixa por digest as imagens de Go e de runtime, fixa o código-fonte oficial no commit `73ff57ce2b8161059ac7fe5188f03f1c3d22b29a`, valida o pacote oficial da interface por SHA-256 e recompila `prometheus` e `promtool` com `google.golang.org/grpc` `1.82.1`. Essa substituição preserva a LTS e remove a vulnerabilidade corrigível `GHSA-hrxh-6v49-42gf` presente nos binários originais; a CI escaneia a imagem final e continua recusando qualquer achado corrigível HIGH ou CRITICAL, sem lista de exceções.

O coletor consulta a API a cada cinco segundos usando o segredo montado como arquivo, mantém no máximo 48 horas ou 256 MB e publica a interface somente em `http://127.0.0.1:59090`. A porta local não possui autenticação e nunca deve ser exposta em rede compartilhada ou produção.

O contrato `SLO-LOCAL-2026-01` é uma hipótese técnica para o piloto, não um compromisso comercial aprovado:

- disponibilidade mensal provisória de `99,5%`, considerando `5xx` como erro e excluindo probes e o próprio scrape;
- latência p95 provisória de até um segundo para requisições de aplicação;
- alerta de página quando o alvo ou a prontidão falham por dois minutos;
- alerta rápido quando o consumo projetado do orçamento de erro supera `14,4x` nas janelas de cinco minutos e uma hora;
- alerta sustentado quando supera `6x` nas janelas de 30 minutos e seis horas;
- alerta de ticket quando a latência p95 permanece acima de um segundo por dez minutos ou uma dependência fica crítica.

O Prometheus contém seis recording rules e sete alerting rules. `for` e `keep_firing_for` reduzem ruído e os alertas de página ficam restritos a sintomas associados à indisponibilidade. Não existe envio externo nesta etapa: Alertmanager, destino de notificação, escala, contatos e horários de plantão dependem de decisão operacional.

## Runbook operacional

1. Confirme em **Status → Targets** se `max-service-api` está `UP` e veja **Alerts** em `http://127.0.0.1:59090`.
2. Consulte `/health/ready` e o cockpit **Operação → Conta**. Use `x-request-id` para correlacionar a falha com os logs JSON, sem copiar payloads ou dados pessoais.
3. Diferencie falha de coleta, indisponibilidade real, dependência crítica, aumento de `5xx` e latência. Não desative RLS, rate limit fail-closed ou validações para recuperar tráfego.
4. Em mudança recente, interrompa a promoção e aplique o rollback homologado. Em falha de banco, Redis ou storage, preserve evidências agregadas e acione o responsável da dependência.
5. Considere recuperado somente após target `UP`, readiness saudável, alerta resolvido e janela de observação de cinco minutos. Registre horário, impacto, decisão, responsável e request IDs relevantes, nunca tokens ou conteúdo do usuário.

Sem Alertmanager homologado, a aba de alertas é apenas evidência local e não substitui monitoramento externo, blackbox ou plantão.

## Evidência automatizada

`npm run test:smoke` valida liveness, readiness incluindo Redis, autenticação e formato do OpenMetrics, `x-request-id`, headers defensivos no frontend e API, CORS fechado, rejeição de payload grande, encaminhamento pelo BFF, cockpit operacional, métricas agregadas, última reconciliação do cofre, resposta `429`, cabeçalhos de rate limit, bloqueio do cliente, rejeição do canal interno não assinado e concorrência idempotente em 33 ações de marketplace, comunicação, atendimento, disputa formal, análise preventiva de indicações, agenda, ciclo do serviço e operação, incluindo os quatro uploads privados. `npm run test:observability` prova target autenticado, séries SLI, 13 regras saudáveis e ausência de alerta indevido. O `promtool` oficial valida configuração, PromQL e cenários positivos/negativos das regras. O teste de integração usa dois clientes independentes e comprova que ambos consomem o mesmo contador Redis. `npm run test:storage` cria objetos sintéticos controlados e prova dry-run, expurgo seletivo, preservação de referência e auditoria agregada. O conjunto roda depois de um `docker compose up --wait` limpo no GitHub Actions.

## Próximos requisitos de produção

- Prometheus/OpenTelemetry gerenciado, alta disponibilidade, retenção aprovada e agregação entre réplicas; o coletor local de 48 horas já valida o contrato;
- coleta, busca e política de retenção para os logs JSON já correlacionados;
- traces entre borda, BFF, API, banco, filas e storage;
- Alertmanager ou serviço equivalente, alertas externos e plantão;
- aprovação dos SLOs, burn rate e orçamento de erro provisórios;
- integração com plataforma gerenciada de observabilidade;
- testes de falha controlada e múltiplas réplicas.
