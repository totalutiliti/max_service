# Plano de implantação

O ambiente compartilhado `dev` na Azure foi autorizado exclusivamente para dados sintéticos. Staging e produção continuam sem autorização.

## Ambientes futuros

1. **local:** dados sintéticos e adaptadores fake;
2. **dev compartilhado:** integrações sandbox, acesso restrito;
3. **staging:** configuração semelhante à produção, sem dados reais;
4. **produção:** criada somente após gates técnico, jurídico e operacional.

## Pipeline proposto

Lint → typecheck → unitários → integração PostgreSQL → RLS/IDOR → E2E/a11y → build → gitleaks → dependências → imagem/Trivy → migration dry-run → aprovação → deploy → smoke test → observabilidade.

O workflow `Qualidade` já automatiza lint, builds, testes funcionais, auditoria de dependências, validação do Bicep e gitleaks. Um segundo job sobe os sete serviços em Docker limpo, incluindo Redis efêmero autenticado e Prometheus LTS recompilado a partir de origem fixada com a correção do gRPC, escaneia as imagens de API, web, Redis e Prometheus com Trivy fixado por digest, recusa vulnerabilidades corrigíveis altas ou críticas, recria as migrations em banco descartável, detecta drift por checksum e então executa E2E/a11y WCAG 2.2 AA no Chrome, smoke tests de saúde/autorização, exportador OpenMetrics, target autenticado e 13 regras de SLO/alerta, coordenação do rate limit entre clientes independentes, RLS, conflitos de agenda, reenvios concorrentes idempotentes e restauração de backup lógico em banco isolado. O restore compara migrations e checksums, dados críticos, grants, policies, RLS e constraints antes de remover os artefatos temporários. O ambiente Azure `dev` usa imagens imutáveis por commit, migration separada do runtime e smoke test pós-deploy; dry-run em staging e integração com observabilidade gerenciada continuam pendentes.

As imagens finais recebem somente as dependências necessárias a cada processo, iniciam diretamente pelo Node.js sem o npm CLI e removem ferramentas de build. O scanner avalia o sistema operacional e os pacotes JavaScript dessas imagens finais, não apenas o código-fonte.

## Infraestrutura

Frontend e API independentes, PostgreSQL gerenciado com backup/PITR, Redis gerenciado, object storage privado, cofre de segredos, identidade gerenciada, filas, logs estruturados, métricas, traces e alertas.

O ambiente local já separa liveness de readiness, oferece cockpit operacional autenticado, gera `x-request-id`, escreve logs JSON sem PII, coleta OpenMetrics com retenção limitada, SLI e regras testadas, coordena a proteção contra abuso no Redis com falha fechada e envia headers defensivos com CORS e limites de corpo fechados. O `dev` Azure acrescenta HTTPS do Container Apps, PostgreSQL e Redis gerenciados com TLS, Key Vault, identidade gerenciada, Log Analytics e armazenamento privado. CSP por nonce/hash, proteção de borda, traces distribuídos, Alertmanager/plantão, alertas externos e SLOs aprovados ainda dependem da evolução operacional.

## Gate de produção

- o cockpit operacional registra responsável, evidência, versão e histórico dos oito gates; nenhuma atualização isolada altera `productionAuthorized: false`;
- contrato do PSP e fluxo fiscal aprovados;
- termos, privacidade, retenção e suporte aprovados;
- backup e restauração lógica ensaiados no Docker e no CI; serviço gerenciado, PITR, RPO/RTO e restore do object storage ainda exigem homologação;
- RLS, autorização e sessão testados;
- resposta a incidentes e contatos de plantão definidos;
- categorias e região do piloto formalizadas;
- nenhuma feature regulada ativa.
