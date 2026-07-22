# Plano de implantação

Nenhum deploy está autorizado nesta etapa.

## Ambientes futuros

1. **local:** dados sintéticos e adaptadores fake;
2. **dev compartilhado:** integrações sandbox, acesso restrito;
3. **staging:** configuração semelhante à produção, sem dados reais;
4. **produção:** criada somente após gates técnico, jurídico e operacional.

## Pipeline proposto

Lint → typecheck → unitários → integração PostgreSQL → RLS/IDOR → E2E/a11y → build → gitleaks → dependências → imagem/Trivy → migration dry-run → aprovação → deploy → smoke test → observabilidade.

## Infraestrutura

Frontend e API independentes, PostgreSQL gerenciado com backup/PITR, Redis gerenciado, object storage privado, cofre de segredos, identidade gerenciada, filas, logs estruturados, métricas, traces e alertas.

## Gate de produção

- contrato do PSP e fluxo fiscal aprovados;
- termos, privacidade, retenção e suporte aprovados;
- backup e restauração ensaiados;
- RLS, autorização e sessão testados;
- resposta a incidentes e contatos de plantão definidos;
- categorias e região do piloto formalizadas;
- nenhuma feature regulada ativa.
