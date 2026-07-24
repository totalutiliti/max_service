# Plano de implantação

Nenhum deploy está autorizado nesta etapa.

## Ambientes futuros

1. **local:** dados sintéticos e adaptadores fake;
2. **dev compartilhado:** integrações sandbox, acesso restrito;
3. **staging:** configuração semelhante à produção, sem dados reais;
4. **produção:** criada somente após gates técnico, jurídico e operacional.

## Pipeline proposto

Lint → typecheck → unitários → integração PostgreSQL → RLS/IDOR → E2E/a11y → build → gitleaks → dependências → imagem/Trivy → migration dry-run → aprovação → deploy → smoke test → observabilidade.

O workflow `Qualidade` já automatiza lint, builds, testes funcionais, auditoria de dependências e gitleaks. Um segundo job sobe os quatro serviços em Docker limpo, aplica todas as migrations, executa smoke tests de saúde/autorização, testa RLS, conflitos de agenda e reenvios concorrentes idempotentes e restaura um backup lógico em banco isolado. O restore compara migrations, dados críticos, grants, policies, RLS e constraints antes de remover os artefatos temporários. E2E/a11y em navegador, Trivy, dry-run em staging, deploy e observabilidade gerenciada continuam pendentes.

## Infraestrutura

Frontend e API independentes, PostgreSQL gerenciado com backup/PITR, Redis gerenciado, object storage privado, cofre de segredos, identidade gerenciada, filas, logs estruturados, métricas, traces e alertas.

O ambiente local já separa liveness de readiness, oferece cockpit operacional autenticado, gera `x-request-id`, escreve logs JSON sem PII, agrega uma janela limitada de métricas, aplica proteção contra abuso por réplica e envia headers defensivos com CORS e limites de corpo fechados. HTTPS/HSTS, CSP por nonce/hash, store distribuído para rate limit, coleta e retenção central de logs, exportação de métricas, traces, alertas externos e SLOs ainda dependem da infraestrutura escolhida.

## Gate de produção

- o cockpit operacional registra responsável, evidência, versão e histórico dos oito gates; nenhuma atualização isolada altera `productionAuthorized: false`;
- contrato do PSP e fluxo fiscal aprovados;
- termos, privacidade, retenção e suporte aprovados;
- backup e restauração lógica ensaiados no Docker e no CI; serviço gerenciado, PITR, RPO/RTO e restore do object storage ainda exigem homologação;
- RLS, autorização e sessão testados;
- resposta a incidentes e contatos de plantão definidos;
- categorias e região do piloto formalizadas;
- nenhuma feature regulada ativa.
