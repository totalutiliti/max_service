# Auditoria independente de prontidão para liberação

## Identificação

- Data da coleta: `2026-07-25`.
- Baseline auditado: `ba87426710b2c001b6931be04816c02a783a1dab`.
- Branches confirmadas após `git fetch`: `dev`, `main`, `origin/dev` e `origin/main` no mesmo baseline.
- Estado inicial: worktree limpo.
- Escopo: evidência local, código versionado, banco Docker e consultas somente leitura ao Azure Dev/GitHub.
- Limite: esta auditoria não constitui pentest, parecer jurídico, homologação financeira nem autorização de produção.

O Azure Dev executa as imagens de aplicação do commit `02676fd51cee`. O commit
`ba87426` posterior registra evidências e documentação e não foi promovido como
uma nova imagem. O ambiente permanece destinado exclusivamente a dados
sintéticos e mantém `productionAuthorized: false`.

## Classificação

- **Confirmado:** a afirmação foi localizada no código ou configuração e
  reproduzida por teste ou consulta independente proporcional ao risco.
- **Parcialmente confirmado:** existe evidência, mas o escopo da afirmação é
  maior que o que foi testado, ou existe uma exceção relevante.
- **Não confirmado:** não foi encontrada evidência suficiente ou o componente
  ainda não existe.

Nenhum resultado `confirmado` nesta auditoria substitui aceite formal do
responsável pelo gate.

## Matriz do estado real e simulado

| Componente | Situação atual | Real ou simulado | Evidência | Bloqueador | Trilha |
|---|---|---|---|---|---|
| Marketplace | Pedidos, propostas, agenda, conversa, ciclo do serviço, cancelamento e avaliação persistentes | Real no ambiente sintético | `tests/e2e/marketplace-journey.spec.ts`, `tests/e2e/cancellation-operations.spec.ts` | Piloto real e homologação operacional | D |
| Operação e parceiros | Moderação, indicação, suporte, disputa, campanhas, publicidade e privacidade persistentes | Real no ambiente sintético | oito jornadas funcionais listadas pelo Playwright | Usuários reais, políticas aprovadas e teste de usabilidade | D |
| Identidade | Token opaco, hash, expiração, revogação, cookie seguro, BFF assinado e RLS | Mecânica real sobre cinco atores fixos demonstrativos | `api/auth/demo-session.service.ts`, `app/api/v1/_session.ts`, `api/auth/internal-auth.middleware.ts` | Cadastro, credencial/IdP, confirmação, recuperação e MFA | A |
| Arquivos privados | Quatro fluxos com S3 privado, metadados, hash, RLS, auditoria e idempotência | Persistência real; conteúdo obrigatoriamente sintético | `api/storage/private-object-storage.service.ts` e migrations `0017`, `0019`, `0020`, `0030` | Quarentena, antimalware, retenção e credenciais mínimas | B |
| Financeiro | Regra versionada, split, ledger, eventos assinados e reconciliação | Sandbox; nenhum PSP ou dinheiro real | `docs/security/payment-security.md`, `api/finance/finance.service.ts` | PSP, fiscal, chargeback, contrato e homologação | Gate externo |
| Relatórios recorrentes | Agenda, snapshot, checksum e histórico persistentes | Entrega simulada; constraint `disabled_local` | migration `0055_operation_report_delivery_schedules.sql` | Provedor, confirmação de contato, opt-out e retenção | Gate externo |
| Web Push | Fila, preferências, retentativa e revogação implementadas | Real somente quando VAPID é configurado; Azure não possui homologação registrada | `api/notifications/push-delivery.service.ts` | Chaves por ambiente, observabilidade e homologação | C |
| E-mail/SMS | Não existe adaptador de entrega | Ausente | `README.md`, `docs/security/lgpd.md` | Fornecedor, contrato, finalidade, contato confirmado e retenção | Gate externo |
| Azure Dev | ACR, Container Apps, PostgreSQL, Redis, Key Vault, storage, jobs e OIDC | Infraestrutura real, marcada `synthetic-only` | `docs/operations/azure-dev-evidence.md` e consultas `az containerapp show` | Rede privada, HA, borda, custos, recuperação e staging | C |
| Observabilidade | Logs JSON, OpenMetrics, Prometheus local e regras de alerta | Coleta local real; operação externa parcial | `docs/operations/observability.md`, `infra/observability/` | Destino externo, plantão, traces, retenção e SLO aprovado | C |
| Recuperação | Dump e restauração lógica automatizados | Ensaio local/CI real; não é PITR | `scripts/backup-restore-drill.mjs`, `docs/operations/backup-restore.md` | PITR, RPO/RTO e restauração coordenada de objetos | C |
| Jurídico/LGPD/marca | Gates e minutas persistentes | Fluxo técnico real; aprovações ausentes | `docs/security/lgpd.md`, `docs/discovery/contradicoes-e-pendencias.md` | Decisão e aceite formal | Gate externo |

## 1. Cobertura das 18 execuções E2E

- **Afirmação anterior:** existem 18 jornadas E2E cobrindo os caminhos
  críticos.
- **Evidência encontrada:** `npm run test:e2e -- --list` enumerou exatamente
  18 testes em nove arquivos. Dez execuções são de acesso, navegação e
  acessibilidade, incluindo cinco variações por perfil. Oito são fluxos
  funcionais: marketplace, cancelamento, indicação, suporte/disputa,
  campanhas, publicidade, privacidade e relatório simulado.
- **Resultado:** **parcialmente confirmado**. Existem 18 execuções Playwright,
  mas não 18 jornadas transacionais independentes.
- **Risco:** médio. A contagem pode transmitir cobertura maior que a real.
  Cadastro real, recuperação, MFA, antimalware, falha de scanner, PSP e
  recuperação de desastre não estão cobertos porque ainda não existem.
- **Recomendação:** publicar separadamente a quantidade de testes de
  acesso/a11y e de jornadas funcionais; ampliar a suíte depois das trilhas A e
  B e executar a mesma suíte em staging.
- **Trilha responsável:** A, B e C; consolidação por D.
- **Gate de liberação:** testes funcionais e de segurança em staging.

## 2. Testes negativos de autorização

- **Afirmação anterior:** autorização entre perfis, canal interno e RLS possuem
  testes negativos.
- **Evidência encontrada:** testes recusam origem externa, cabeçalhos internos
  sem assinatura, troca de papel/caminho na assinatura, cliente na superfície
  da Operação, ausência de contexto no PostgreSQL e acessos cruzados em
  agenda, privacidade, publicidade, suporte, arquivos e gates.
- **Resultado:** **parcialmente confirmado**.
- **Risco:** alto antes de identidade real. Os testes usam UUIDs e papéis
  demonstrativos; não cobrem cadastro dinâmico, recuperação, MFA, rotação,
  sessões por dispositivo nem privilégio administrativo separado.
- **Recomendação:** repetir a matriz positiva e negativa com identidades
  dinâmicas, conta bloqueada, contato não confirmado, MFA pendente e sessão
  revogada/rotacionada.
- **Trilha responsável:** A.
- **Gate de liberação:** identidade de produção e autorização.

## 3. RLS habilitado e forçado

- **Afirmação anterior:** todas as tabelas aplicáveis usam RLS fail-closed.
- **Evidência encontrada:** consulta ao PostgreSQL Docker encontrou 80 tabelas
  de aplicação, desconsiderando `schema_migrations`; 79 possuem
  `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`. A tabela interna
  `notification_push_deliveries` não usa RLS.
- **Resultado:** **parcialmente confirmado**.
- **Risco:** baixo para o runtime atual e alto se os grants mudarem. A exceção
  não concede privilégios diretos a `max_service_app` e é operada por funções
  `SECURITY DEFINER`, mas qualquer concessão futura ampliaria a exposição de
  endpoints e chaves de Web Push.
- **Recomendação:** transformar a exceção em contrato automatizado: afirmar
  que a tabela permanece sem grants diretos, revisar owner/search path de cada
  função e falhar o CI se a superfície aumentar.
- **Trilha responsável:** A para identidade/RLS; C para worker e operação.
- **Gate de liberação:** segurança do banco e revisão de privilégios.

## 4. Papéis que contornam RLS

- **Afirmação anterior:** o runtime não contorna RLS.
- **Evidência encontrada:** `max_service_app` está configurado como
  `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION` e
  `NOBYPASSRLS`. A consulta local confirmou todos esses atributos e retornou
  zero pedidos sem contexto de ator. `max_service_admin`, usado por migrations
  e manutenção local, é superusuário e possui `BYPASSRLS`.
- **Resultado:** **confirmado com ressalva operacional**.
- **Risco:** alto se a credencial administrativa for entregue ao runtime ou a
  jobs com escopo excessivo. O owner/admin sempre pode contornar a política.
- **Recomendação:** manter credenciais separadas para migration, runtime,
  scanner, reconciliação e purge; inventariar funções `SECURITY DEFINER` e
  provar que a aplicação não recebe a credencial administrativa.
- **Trilha responsável:** C, com testes de A/B.
- **Gate de liberação:** least privilege e gestão de segredos.

## 5. Backup lógico versus PITR

- **Afirmação anterior:** backup e restore foram testados, sem equivaler a
  PITR.
- **Evidência encontrada:** o CI produz dump, restaura em banco descartável e
  compara migrations, checksums, dados críticos, constraints, grants,
  policies e RLS. `docs/operations/backup-restore.md` declara explicitamente
  que o ensaio não substitui backup gerenciado, PITR ou DR.
- **Resultado:** **confirmado**; não foi encontrada afirmação técnica que
  promovesse o ensaio local a PITR.
- **Risco:** alto enquanto PITR, restauração de object storage e exercício
  regional não forem comprovados.
- **Recomendação:** definir RPO/RTO, habilitar a política gerenciada aprovada e
  executar restore point-in-time e de objetos em staging com evidência
  assinada.
- **Trilha responsável:** C.
- **Gate de liberação:** continuidade, PITR e recuperação.

## 6. Login do Azure Dev

- **Afirmação anterior:** Azure Dev usa login demonstrativo.
- **Evidência encontrada:** `DEMO_MODE=true` está no template de runtime; a
  evidência do Azure registra entrada por escolha de perfil; a interface
  permite escolher livremente cinco perfis, inclusive Operação.
- **Resultado:** **confirmado**.
- **Risco:** crítico para qualquer dado real. Um visitante não autenticado
  pode assumir atores sintéticos privilegiados por desenho.
- **Recomendação:** manter a marcação `synthetic-only`, impedir carga de dados
  reais e desligar completamente as rotas demonstrativas quando a identidade
  de produção estiver habilitada.
- **Trilha responsável:** A; configuração final por C.
- **Gate de liberação:** identidade de produção.

## 7. Separação entre dados sintéticos e reais

- **Afirmação anterior:** Azure Dev e a demonstração usam somente dados
  sintéticos.
- **Evidência encontrada:** tags, documentação, textos da interface, seeds,
  domínios de e-mail permitidos e gates afirmam `synthetic-only`. O ambiente
  Azure Dev e os componentes locais são separados por resource group e
  configuração.
- **Resultado:** **parcialmente confirmado**.
- **Risco:** alto. A proibição é principalmente processual. O sistema não
  detecta se uma imagem/documento contém CPF, endereço ou conteúdo real, e os
  uploads atuais liberam arquivos `not_scanned` para download autorizado.
- **Recomendação:** restringir acesso ao Dev, aplicar banner e política
  operacional, não reutilizar buckets/bancos/segredos entre ambientes e
  impedir piloto real até identidade e processamento seguro de arquivos.
- **Trilha responsável:** B e C.
- **Gate de liberação:** classificação de dados e isolamento de ambientes.

## 8. PII em métricas, logs e traces

- **Afirmação anterior:** telemetria não expõe PII.
- **Evidência encontrada:** o middleware HTTP registra request ID criado no
  servidor, método, família de rota normalizada, status, duração, papel e
  replay; descarta query string, payload e identidade. OpenMetrics usa labels
  fechadas e sem rota, ator, IP, contato ou ID. Não existe instrumentação de
  traces distribuídos. Erros do provedor Web Push podem ser persistidos em
  texto sanitizado apenas por comprimento, sem uma allowlist de códigos.
- **Resultado:** **parcialmente confirmado**.
- **Risco:** médio. O contrato HTTP é minimizado, mas não há auditoria de todos
  os emissores de log, política central de redaction/retention nem prova de que
  mensagens de SDK externo nunca incluam endpoint ou contato.
- **Recomendação:** usar códigos de erro fechados para integrações, testar
  redaction, definir retenção/imutabilidade e revisar logs/traces antes de
  habilitar fornecedores externos.
- **Trilha responsável:** C; adaptadores específicos por A/B.
- **Gate de liberação:** observabilidade e privacidade.

## 9. Tokens e segredos em configuração ou evidência

- **Afirmação anterior:** não existem segredos de produção versionados.
- **Evidência encontrada:** `gitleaks git --redact` examinou 77 commits e não
  encontrou vazamentos. Valores deliberadamente locais estão versionados no
  Compose e em `infra/observability/metrics-token.local.txt`; os nomes e a
  documentação os classificam como exclusivos de desenvolvimento. A
  evidência Azure não contém valores do Key Vault.
- **Resultado:** **confirmado com ressalva**.
- **Risco:** médio se algum valor local for promovido por cópia de
  configuração. O arquivo local versionado não é segredo, embora tenha formato
  de credencial.
- **Recomendação:** proibir esses valores em staging/produção por teste de
  configuração, gerar credenciais por ambiente no cofre e nunca copiar
  Compose para templates produtivos.
- **Trilha responsável:** C.
- **Gate de liberação:** gestão de segredos.

## 10. Reprodutibilidade do Prometheus e SBOM

- **Afirmação anterior:** o Prometheus recompilado é reproduzível e possui
  correção de segurança.
- **Evidência encontrada:** imagens base estão fixadas por digest, fonte por
  tag e commit, interface oficial por SHA-256, gRPC por versão e build usa
  `-trimpath`. A imagem final é verificada pelo Trivy. Não há geração,
  assinatura ou publicação de SBOM CycloneDX/SPDX, nem attestation de
  proveniência.
- **Resultado:** **parcialmente confirmado**. O build é fortemente fixado, mas
  SBOM não existe e a reprodutibilidade bit a bit não foi comparada.
- **Risco:** médio para cadeia de suprimentos.
- **Recomendação:** gerar SBOM das quatro imagens, armazenar como artefato,
  produzir proveniência/assinatura e comparar hashes em dois builds limpos.
- **Trilha responsável:** C.
- **Gate de liberação:** supply chain e inventário de componentes.

## 11. Destinatários externos de alertas

- **Afirmação anterior:** existem regras de alerta.
- **Evidência encontrada:** seis recording rules e sete alerting rules são
  validadas pelo `promtool` e smoke test. Não existe Alertmanager, action group,
  webhook, e-mail, escala ou contato externo configurado.
- **Resultado:** **não confirmado** para entrega externa; confirmado somente
  para avaliação local das regras.
- **Risco:** alto. Uma falha fora de uma sessão de observação não aciona uma
  pessoa responsável.
- **Recomendação:** definir plantão e severidades, provisionar destino externo
  em staging, testar notificação e resolução e registrar runbook.
- **Trilha responsável:** C.
- **Gate de liberação:** resposta a incidentes e plantão.

## 12. Aceite formal dos gates

- **Afirmação anterior:** oito gates persistentes registram responsável,
  evidência, versão e histórico.
- **Evidência encontrada:** a tabela possui oito registros e RLS exclusivo da
  Operação. No baseline local, quatro estão `blocked` ou sem avanço e quatro
  estão `in_progress`; nenhum está `evidence_ready`. Marca/domínio, modelo
  jurídico, PSP e escopo do piloto exigem aprovação externa. O enum não possui
  estado `approved`, e `productionAuthorized` permanece falso.
- **Resultado:** **confirmado** para rastreabilidade; **não confirmado** para
  aceite formal.
- **Risco:** crítico se `evidence_ready` for interpretado futuramente como
  autorização.
- **Recomendação:** manter autorização de produção separada, exigir aprovador
  nomeado, data, referência verificável e segregação de funções para cada
  aceite técnico, jurídico, financeiro e operacional.
- **Trilha responsável:** C para o mecanismo; responsáveis humanos para o
  aceite.
- **Gate de liberação:** todos os oito gates e autorização explícita.

## 13. Funcionalidades visíveis que continuam simuladas

- **Afirmação anterior:** a interface diferencia funcionalidades reais de
  simulações.
- **Evidência encontrada:** financeiro usa rótulos `SANDBOX` e
  `SEM DINHEIRO REAL`; relatórios indicam simulação; documentos exibem aviso de
  conteúdo sintético e ausência de antivírus; onboarding informa que usa
  dados sintéticos. A entrada por perfil, embora visualmente completa, é uma
  sessão demonstrativa. Publicidade não cobra, Web Push depende de VAPID,
  antifraude não consulta fontes externas e a aprovação de indicação não cria
  conta real.
- **Resultado:** **parcialmente confirmado**.
- **Risco:** médio de interpretação comercial ou operacional incorreta,
  especialmente para login, verificação de prestador e “aprovação”.
- **Recomendação:** manter badges e textos inequívocos, incluir um inventário
  de adapters ativos no cockpit e impedir feature flags externas sem
  homologação verificável.
- **Trilha responsável:** A, B e C.
- **Gate de liberação:** comunicação de produto e integrações homologadas.

## Gates resultantes

| Gate | Estado no baseline | Evidência suficiente para produção |
|---|---|---|
| Identidade e MFA | Em implementação | Não |
| Arquivos e antimalware | Bloqueado | Não |
| Autorização/RLS | Evidência técnica parcial | Não; repetir com identidade real |
| Staging e rede | Ausente | Não |
| Recuperação/PITR | Restore lógico apenas | Não |
| Observabilidade/plantão | Regras locais | Não |
| PSP/fiscal | Sandbox | Não |
| Jurídico/LGPD/marca/piloto | Decisão externa pendente | Não |

## Conclusão independente

O baseline sustenta um MVP demonstrável tecnicamente consistente para dados
sintéticos. Marketplace, persistência, controles de autorização, CI e Azure
Dev têm evidência concreta. A evidência não autoriza usuários, documentos ou
pagamentos reais.

A liberação permanece bloqueada por identidade de produção, processamento
seguro de arquivos, staging, rede/borda, PITR e recuperação de objetos,
destinos externos de alerta, SBOM/proveniência, PSP e aceitações formais
jurídica, fiscal, LGPD, marca e piloto.
