# Prontidão do staging Azure

Status: **plano técnico não aplicado**
Baseline inventariado: `ba87426710b2c001b6931be04816c02a783a1dab`
Data do inventário: 2026-07-25
Responsável: Trilha C — infraestrutura e staging

Este documento não autoriza deploy, uso de dados reais, contratação ou custo. O staging
continua sintético e `productionAuthorized: false`. Domínio, contatos de alerta, orçamento,
RPO/RTO e valores finais dependem de aprovação humana.

## 1. Inventário confirmado do Azure Dev

O estado vivo foi consultado em modo somente leitura no resource group
`rg-max-service-dev`, em `Brazil South`.

| Componente | Estado confirmado | Real ou simulado | Evidência no baseline | Lacuna para staging |
|---|---|---|---|---|
| ACR | `acrmaxservicedev2026`, Basic, público, admin desativado, imagens por SHA Git não assinadas | real, apenas dev | `infra/azure/registry.bicep:13-23`; `infra/azure/README.md:7-10` | registry isolado, Premium para Private Link, retenção/assinatura/SBOM |
| Identidade de runtime | UAI `id-max-service-dev`, ACR Pull e leitura de secrets | real | `infra/azure/foundation.bicep:36-53`; `infra/azure/stateful.bicep:202-213` | identidade exclusiva de staging e revisão de least privilege |
| Identidade GitHub | UAI `id-max-service-github-dev`, OIDC do environment `azure-dev`, Contributor só no RG dev | real | `infra/azure/github-oidc.bicep:16-44`; `infra/azure/README.md:57-72` | identidade e environment separados para staging; aprovadores ainda indefinidos |
| Logs | Log Analytics `PerGB2018`, retenção 30 dias, ingestão e consulta públicas | real | `infra/azure/foundation.bicep:22-33` | retenção aprovada, diagnostic settings completos, acesso privado e alertas |
| Container Apps Environment | Consumption, público, sem VNet e sem redundância de zona | real | `infra/azure/foundation.bicep:55-68` | integração com VNet, segregação de subnets e estratégia de zona |
| API | externa, HTTPS do domínio gerenciado, 1 réplica de `0.5 vCPU/1 GiB`, imagem `02676fd51cee` | real com login demonstrativo | `infra/azure/runtime.bicep:55-80,130-274` | ingress interno, acesso somente pelo BFF/edge, duas réplicas para ensaio de HA |
| Web/BFF | externa, HTTPS do domínio gerenciado, scale-to-zero, `0.25 vCPU/0.5 GiB` | real com dados sintéticos | `infra/azure/runtime.bicep:276-413` | domínio/TLS final e edge bloqueados por decisão; ao menos 1 réplica em testes |
| PostgreSQL | Flexible Server 16 `Standard_B1ms`, 32 GiB, público, `AllowAzureServices`, senha, backup 7 dias, PITR disponível, HA e geo-backup desativados | gerenciado real; conteúdo sintético | `infra/azure/stateful.bicep:61-119`; `infra/azure/README.md:11,18` | rede privada, retenção, HA, teste real de PITR e RPO/RTO aprovados |
| RLS/migrations | job manual separado, conexão administrativa apenas no job; runtime usa `max_service_app` | real | `infra/azure/bootstrap.bicep:155-229`; `infra/azure/README.md:22-24` | dry-run e restore em staging após integração das migrations da Trilha A |
| Redis | Azure Managed Redis `Balanced_B0`, TLS 1.2, público, HA desativado | gerenciado real | `infra/azure/stateful.bicep:121-147`; `infra/azure/README.md:12,18` | Private Link, HA/capacidade e teste de failover |
| Key Vault | Standard, RBAC, soft delete e purge protection, público | real | `infra/azure/stateful.bicep:184-226` | Private Link, retenção 90 dias, política de rotação e break-glass |
| Object storage | MinIO interno fixado por digest sobre Azure Files Standard LRS/SMB, 5 GiB, uma réplica | real em dev, não homologado para documentos reais | `infra/azure/stateful.bicep:149-182,308-319`; `infra/azure/bootstrap.bicep:40-153` | Private Link, ZRS, backup/restore de objetos; antimalware pertence à Trilha B |
| Reconciliação | job diário `0 3 * * *`, retry 1, 30 minutos; ainda sem execução observada no momento do inventário | real | `infra/azure/runtime.bicep:415-516` | observar primeira execução, alerta de falha e evidência de expurgo/restore |
| Observabilidade de aplicação | logs JSON sem PII, OpenMetrics autenticado e Prometheus local testado | real local/CI; não gerenciado no Azure | `docs/operations/observability.md:1-159` | coletor gerenciado, retenção, traces, destinos externos e plantão |
| Alertas/custos | nenhum Action Group, metric alert, activity alert, budget ou lock encontrado no RG | ausente | limite explicitado em `infra/azure/README.md:74-76` | contatos, canais, orçamento e limites dependem de decisão |
| Rede/edge | sem VNet, subnet, Private Endpoint, NSG, NAT, Front Door, WAF ou Application Gateway | ausente | compromisso de dev em `infra/azure/README.md:18` | desenho privado e edge homologado |
| Backup/DR | teste lógico em Docker/CI; PostgreSQL gerenciado tem janela PITR de 7 dias, mas não existe restore gerenciado ensaiado nem backup coordenado do Azure Files | parcial | `docs/operations/backup-restore.md:1-45`; `PROJECT_PLAN.md:45` | teste PITR, snapshot/backup de objetos, cópia fora da falha comum e evidência assinada |

No momento da leitura, API, web, storage, PostgreSQL e Redis estavam `Running/Ready`.
As quatro execuções observadas do job de migration terminaram em `Succeeded`. Não foi
encontrada execução do job diário de reconciliação, coerente com um ambiente criado no
mesmo dia. Esses fatos não constituem homologação de staging.

## 2. Arquitetura proposta para staging

Separação obrigatória:

- resource group `rg-max-service-stg`;
- tags `environment=staging`, `data=synthetic-only`, `managed-by=bicep`;
- UAI de runtime `id-max-service-stg`;
- UAI de planejamento/deploy `id-max-service-github-stg`;
- GitHub environment `azure-staging`, com branch protegida e aprovadores;
- Key Vault, PostgreSQL, Redis, storage, Log Analytics e Container Apps exclusivos;
- nenhum segredo, endpoint stateful ou volume compartilhado com Dev;
- imagens identificadas por commit imutável; promoção por digest deve ser preferida.

Topologia proposta:

```text
Internet
  |
  +-- [edge/WAF condicional: bloqueado por domínio e custo]
  |
  +-- Web/BFF HTTPS
         |
         +-- API com ingress interno
                |
                +-- PostgreSQL em subnet delegada + DNS privado
                +-- Redis por Private Endpoint + DNS privado
                +-- Key Vault por Private Endpoint + DNS privado
                +-- MinIO interno sobre Azure Files ZRS + Private Endpoint
                +-- ACR Premium por Private Endpoint

Container Apps e serviços de dados -> Log Analytics / Azure Monitor
Azure Monitor -> Action Group condicional (contatos bloqueados)
```

Subnets iniciais, sujeitas a revisão de IP:

| Subnet | CIDR proposto | Uso |
|---|---:|---|
| `snet-container-apps` | `10.40.0.0/23` | infraestrutura do Container Apps Environment |
| `snet-postgres` | `10.40.2.0/24` | delegação exclusiva do PostgreSQL Flexible Server |
| `snet-private-endpoints` | `10.40.3.0/24` | ACR, Redis, Key Vault e Azure Files |

A API permanece `external: false`; somente o BFF a acessa dentro do environment. O web
continua no domínio HTTPS gerenciado do Container Apps enquanto domínio/certificado/edge
não forem aprovados. HSTS só pode ser considerado homologado após validar o host final,
cadeia TLS, preload e impacto em subdomínios.

## 3. Recursos, SKU e hipótese de custo

Estimativas abaixo são bandas mensais em USD, sem impostos, câmbio, reserva, tráfego ou
suporte, baseadas em baixa carga contínua. São **hipóteses para decisão**, não cotação. A
calculadora oficial e a disponibilidade dos SKUs em `Brazil South` devem ser verificadas
no dia da autorização.

| Recurso proposto | Região/SKU base | Estimativa USD/mês | Alternativa econômica | Impacto da alternativa |
|---|---|---:|---|---|
| Resource group/VNet/DNS privado | Brazil South | 0–5 | igual | sem impacto relevante |
| 4 Private Endpoints | Brazil South | 30–60 + dados | endpoints públicos com firewall | reduz paridade e aumenta superfície |
| ACR isolado | Premium | 50–90 | Standard público ou ACR dev | sem Private Link ou quebra isolamento |
| Log Analytics | PAYG, 30 dias, 2–5 GiB/mês | 6–30 | limite diário/amostragem | menor investigação e retenção |
| Container Apps | Consumption; API 2 réplicas, web 1, MinIO 1, jobs | 140–320 | API/web 1 réplica, scale-to-zero | não testa HA e cold start altera o ensaio |
| PostgreSQL 16 | GP `Standard_D2ds_v5`, 64 GiB, ZoneRedundant, 14 dias | 450–800 | `Standard_B2ms`, sem HA, 7 dias | não valida failover nem capacidade |
| Azure Managed Redis | `Balanced_B0`, HA, TLS, Private Link | 150–350 | B0 sem HA | não valida disponibilidade |
| Key Vault | Standard, RBAC, PE, 90 dias | 1–10 | público com firewall | maior superfície e menor paridade |
| Azure Files | Standard ZRS, 20 GiB, Private Link | 5–30 | LRS 5 GiB | perda de resiliência zonal |
| Azure Monitor/alertas | métricas/log alerts + Action Group | 5–40 + notificações | somente portal/logs | sem notificação externa |
| Edge/WAF condicional | Front Door Premium + WAF | 330–600 + tráfego | domínio ACA direto | sem WAF/private origin/domínio final |

Faixa indicativa:

- staging com HA, rede privada e sem edge: **USD 840–1.735/mês**;
- staging completo com Front Door Premium/WAF: **USD 1.170–2.335/mês**;
- perfil econômico, sem comprovar HA/edge: **USD 300–800/mês**.

O default do plano deve permanecer sem edge, sem budget e sem Action Group até aprovação.
O orçamento mensal e os limiares de `50/80/100%` precisam de valor e contatos fornecidos
pelo responsável financeiro.

## 4. Plano de criação e de destruição

Nenhum comando deste bloco foi executado.

Sequência futura:

1. aprovar custos, região, CIDRs, RPO/RTO, domínio e contatos;
2. criar/proteger o GitHub environment `azure-staging`;
3. bootstrap administrativo da identidade federada exclusiva;
4. executar build Bicep;
5. executar `plan-staging.ps1` e arquivar o JSON/texto do what-if;
6. obter aprovação técnica/financeira sobre o diff;
7. somente então autorizar uma execução separada de deploy;
8. migrar, validar RLS, smoke, observabilidade, restore e rollback;
9. manter `productionAuthorized: false`.

Destruição integral planejada:

```powershell
az group delete --name rg-max-service-stg --yes --no-wait
```

Antes da destruição:

- bloquear novos testes;
- registrar export/restore necessário e confirmar que só há dados sintéticos;
- preservar evidências sem secrets;
- remover vínculos externos de DNS/edge;
- remover environment/variáveis do GitHub em ação administrativa separada;
- documentar que Key Vault com purge protection continuará recuperável durante a retenção;
- confirmar que não existe lock `CanNotDelete`.

Uma alternativa recuperável é parar workloads e manter stateful por uma janela aprovada.
Ela reduz risco de perda, mas continua gerando custo.

## 5. RPO, RTO, backup e restore

Metas técnicas propostas, ainda **não aprovadas**:

| Componente | RPO proposto | RTO proposto | Mecanismo e prova exigida |
|---|---:|---:|---|
| PostgreSQL | 5 minutos | 2 horas | PITR em novo servidor, migrations/checksums, grants, RLS, constraints e smoke |
| Object storage | 24 horas | 4 horas | snapshot/backup do Azure Files, restore em share nova, hashes e metadados reconciliados |
| Redis | 0 para dados autoritativos; perda aceita | 30 minutos | reconstrução segura, rate limit fail-closed e sessão conforme política |
| Key Vault/configuração | 24 horas | 2 horas | soft delete/purge protection e restore controlado de versões |
| Runtime | commit aprovado | 30 minutos | redeploy do digest anterior e smoke |

Ensaio obrigatório de restore:

1. selecionar timestamp anterior conhecido;
2. restaurar PostgreSQL para **novo** servidor, nunca sobre o original;
3. restaurar objetos para share/bucket isolado;
4. apontar uma revisão temporária sem tráfego;
5. comparar migrations/checksums, contagens críticas, grants, policies, `FORCE RLS`,
   constraints, hashes dos objetos e auditoria;
6. executar testes negativos entre tenants e smoke funcional;
7. medir RPO/RTO observado;
8. destruir o ambiente temporário após aprovação da evidência;
9. registrar responsável, horário, resultado e riscos sem PII/secrets.

PITR disponível no PostgreSQL Dev não equivale a restore homologado. O dump lógico do CI
prova restaurabilidade do schema/dados em Docker, não a recuperação coordenada dos
serviços Azure.

## 6. HA, rollback e incidente

Estratégia de HA para o staging de paridade:

- PostgreSQL ZoneRedundant;
- Redis com HA;
- storage ZRS;
- API com mínimo de duas réplicas;
- web com pelo menos uma réplica, duas durante teste de falha;
- MinIO continua ponto único de processo; indisponibilidade deve falhar readiness e exige
  ADR antes de produção;
- uma única região não cobre desastre regional; região secundária é decisão de custo.

Rollback de aplicação:

1. interromper promoção ao primeiro erro de migration, readiness ou smoke;
2. manter migrations forward-compatible; nunca executar downgrade destrutivo automático;
3. restaurar 100% do tráfego ao digest anterior;
4. confirmar readiness, SLOs e logs por no mínimo 15 minutos;
5. se houver incompatibilidade de dados, abrir incidente e usar restore/PITR em novo
   servidor; não improvisar alteração manual do schema.

Runbook de incidente:

1. classificar impacto e congelar deploys;
2. correlacionar por `x-request-id`, sem copiar payload, contato ou token;
3. verificar web, API, PostgreSQL, Redis, storage, Key Vault e DNS privado;
4. acionar rollback se a causa for mudança recente;
5. acionar restore se integridade ou disponibilidade stateful estiver comprometida;
6. considerar recuperado apenas após probes, smoke e janela de observação;
7. registrar linha do tempo, decisões, responsável e ações corretivas;
8. comunicar por canal externo aprovado — **contatos e escala ainda bloqueados**.

## 7. Observabilidade e alertas

Mínimo para staging:

- Container Apps -> Log Analytics;
- diagnostic settings de ACR, PostgreSQL, Redis, Key Vault e storage;
- alertas de indisponibilidade/readiness, `5xx`, latência, restart, CPU/storage do banco,
  conexões, falha de jobs e erro de Private Endpoint/DNS;
- Action Group externo somente após informar contatos/canais;
- retenção e acesso aos logs aprovados;
- nenhuma label/log com e-mail, IP bruto, payload, query string, token ou ID do ator;
- teste de disparo e recebimento, não apenas regra criada.

OpenMetrics gerenciado e traces distribuídos permanecem integração pendente. O Prometheus
local é evidência do contrato e das regras, não um serviço de plantão.

## 8. Arquivos, dependências e conflitos

Propriedade da Trilha C:

- `infra/**`;
- `.github/workflows/**`;
- templates de ambiente e Compose;
- documentação de staging, custo, observabilidade, backup e incidentes.

Proibido nesta trilha:

- `apps/**` e regras de negócio;
- autenticação/autorização;
- uploads/processamento seguro de arquivos;
- `api/database/migrations/**`, schema e checksums;
- escolher PSP, IdP, domínio, contato ou orçamento;
- push, merge, deploy ou escrita Azure sem autorização explícita.

Dependências:

- Trilha A fornece autenticação real e a sequência única de migrations;
- Trilha B fornece scanner/quarentena e solicitações de integração;
- Trilha D confirma evidências e gates;
- Financeiro aprova orçamento/SKUs;
- Operação fornece contatos, escala e SLA;
- Segurança aprova edge, DNS, CIDRs e retenção;
- Jurídico/LGPD aprovam dados, retenção e piloto.

Conflitos previsíveis:

- Trilha A altera migrations enquanto staging precisa ensaiá-las;
- Trilha B pode pedir novos secrets, jobs, volumes ou filas;
- custom domain altera `APP_ORIGIN`, CORS, cookies, HSTS e callbacks;
- ACR privado muda a estratégia de build/promoção das imagens;
- MinIO/Azure Files não deve ser trocado sem ADR e compatibilidade do adaptador S3.

Ordem de integração:

1. infraestrutura parametrizada e plano de staging;
2. Trilha A em `dev`, com migrations consolidadas;
3. rebase e integração da Trilha B;
4. novo build/digest e what-if da Trilha C;
5. auditoria da Trilha D;
6. autorização humana;
7. criação de staging em execução separada;
8. PR de promoção `dev -> main` somente após homologação.

## 9. Critérios de aceite

O pacote de planejamento é aceito quando:

- todo Bicep compila sem erro;
- defaults dos templates Dev preservam seu comportamento;
- staging usa nomes, tags, secrets e identidades exclusivos;
- what-if é a única ação disponível pelo script/pipeline e falha se parâmetros bloqueados
  forem tratados como aprovados;
- API é interna, TLS inseguro é recusado e web usa origem explícita;
- PostgreSQL não possui acesso público e usa DNS/subnet privados;
- Redis, Key Vault, storage e ACR possuem plano de Private Endpoint;
- migrations antecedem runtime e falham fechado;
- custo, alternativa econômica e destruição estão documentados;
- restore, RPO/RTO, HA, rollback e incidente possuem critérios mensuráveis;
- alertas externos, budget, domínio e edge continuam condicionais;
- gitleaks e `git diff --check` passam;
- nenhum secret, dado real, deploy ou escrita Azure ocorre.

O ambiente só é homologado depois de what-if aprovado, criação autorizada, smoke, teste de
falha, alertas recebidos, restore medido e aceite formal. O presente documento atende
somente ao **plano técnico**.

## 10. Bloqueios humanos

| Decisão | Responsável requerido | Estado |
|---|---|---|
| orçamento mensal e thresholds | Financeiro/Produto | bloqueado |
| contatos, canais, escala e SLA | Operação | bloqueado |
| domínio, DNS, certificado e política HSTS | Marca/Segurança | bloqueado |
| Front Door Premium/WAF ou alternativa | Segurança/Financeiro | bloqueado |
| CIDRs e conectividade corporativa | Infraestrutura/Segurança | bloqueado |
| RPO/RTO e retenções | Negócio/Jurídico/Infraestrutura | bloqueado |
| HA e região secundária | Negócio/Financeiro | bloqueado |
| aceite de dados/documentos reais | Jurídico/LGPD/Segurança | proibido no staging atual |
| aprovadores do GitHub environment | Engenharia/Operação | bloqueado |
| janela de teste de restore/incidente | Operação | bloqueado |

## 11. Validações executadas e riscos residuais

Validações locais concluídas nesta trilha:

- `az bicep build --file infra/azure/staging/main.bicep --stdout`;
- `az bicep lint --file infra/azure/staging/main.bicep`;
- parser do Windows PowerShell para `plan-staging.ps1`;
- prova negativa: o script recusou worktree sujo antes de autenticar ou chamar Azure;
- parse YAML de `ci.yml` e `plan-azure-staging.yml`;
- `npm run lint`;
- `npm test`: build web/API, 44 testes API e 4 testes de HTML aprovados;
- `npm audit --omit=dev`: zero vulnerabilidades de produção;
- `git diff --check`.

Nenhum `az deployment ... what-if` remoto foi executado, porque a identidade, o GitHub
environment, o object ID, os aprovadores e o aceite de custo ainda não existem. Nenhum
comando Azure de criação/alteração foi executado.

Riscos residuais antes do primeiro apply:

- confirmar no provider Azure a disponibilidade de `Standard_D2ds_v5`, ZRS e HA em
  `Brazil South`, além de quotas; build Bicep não confirma capacidade regional;
- confirmar categories de diagnostic settings por recurso durante what-if;
- o group ID `redisEnterprise` e a zona `privatelink.redis.azure.net` foram confirmados
  em leitura contra o Redis Dev, mas a aprovação de Private Endpoint ainda precisa ser
  observada em staging;
- definir como importar/promover os digests ao ACR privado sem reabrir acesso público;
- criar um Azure Monitor Private Link Scope antes de desabilitar acesso público ao Log
  Analytics; o plano conserva ingestão/consulta públicas para não fingir essa cobertura;
- Front Door/WAF, domínio e certificado não estão no default IaC por dependerem de custo
  e decisão; o host ACA direto não comprova proteção de borda;
- MinIO é uma única réplica e permanece ponto único de processo;
- Action Group e budget são condicionais e ficam ausentes com defaults seguros;
- restore, failover, alerta externo e rollback ainda não foram observados em Azure;
- faixas de custo precisam ser recalculadas na calculadora oficial no dia da aprovação.

Gitleaks deve ser repetido sobre o commit final. Um scan de diretório depois do build
acusou apenas `prerenderSecret` gerado em `dist/` e ignorado pelo Git; o scan relevante é
o de conteúdo versionado, igual ao gate do CI.
