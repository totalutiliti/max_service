# Plano de implantação

Nenhum deploy está autorizado nesta etapa.

## Ambientes futuros

1. **local:** dados sintéticos e adaptadores fake;
2. **dev compartilhado:** integrações sandbox, acesso restrito;
3. **staging:** configuração semelhante à produção, sem dados reais;
4. **produção:** criada somente após gates técnico, jurídico e operacional.

## Pipeline proposto

Lint → typecheck → unitários → integração PostgreSQL → RLS/IDOR → E2E/a11y → build → gitleaks → dependências → imagem/Trivy → migration dry-run → aprovação → deploy → smoke test → observabilidade.

O workflow `Qualidade` já automatiza lint, builds, testes funcionais, auditoria de dependências e gitleaks. Um segundo job sobe os quatro serviços em Docker limpo, aplica todas as migrations e executa testes reais de RLS e concorrência no PostgreSQL. E2E/a11y em navegador, Trivy, dry-run em staging, deploy, smoke test e observabilidade continuam pendentes.

## Infraestrutura

Frontend e API independentes, PostgreSQL gerenciado com backup/PITR, Redis gerenciado, object storage privado, cofre de segredos, identidade gerenciada, filas, logs estruturados, métricas, traces e alertas.

## Gate de produção

- o cockpit operacional registra responsável, evidência, versão e histórico dos oito gates; nenhuma atualização isolada altera `productionAuthorized: false`;
- contrato do PSP e fluxo fiscal aprovados;
- termos, privacidade, retenção e suporte aprovados;
- backup e restauração ensaiados;
- RLS, autorização e sessão testados;
- resposta a incidentes e contatos de plantão definidos;
- categorias e região do piloto formalizadas;
- nenhuma feature regulada ativa.
