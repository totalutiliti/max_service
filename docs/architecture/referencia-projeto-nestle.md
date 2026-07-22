# Auditoria somente leitura do projeto Nestlé/HORECA

## Escopo e evidência

Inspeção realizada sem alterar nenhum arquivo da referência. Foram lidos manifestos, estrutura, autenticação, Prisma, migrations, RLS, frontend, Docker e CI. Arquivos `.env`, dados e identificadores de infraestrutura não foram copiados.

## Stack observada

- monorepo npm workspaces; Node.js 22 e TypeScript;
- API NestJS 11;
- web Next.js 15 (App Router), React 18 e Tailwind 3;
- Prisma 5, PostgreSQL 16;
- Redis 7 e BullMQ;
- Vitest 4, Docker Compose e GitHub Actions;
- Azure como destino documentado, sem reutilização de recursos.

## Padrões reutilizáveis

| Área | Padrão | Aplicação na Max Service |
|---|---|---|
| Estrutura | monorepo `apps/api`, `apps/web`, `packages/shared` | adotar na fundação do produto |
| Arquitetura | monólito modular | módulos por domínio do marketplace |
| Senhas | Argon2id, salt da biblioteca e pepper externo | parâmetros centralizados, benchmark em CI e rotação de pepper planejada |
| Sessão | access curto, refresh rotativo, hash no banco e detecção de reuso | adaptar para múltiplos dispositivos e revogação por sessão/família |
| BFF | cookies HttpOnly, Secure e SameSite | browser não recebe tokens em JavaScript |
| Isolamento | `SET LOCAL` dentro de transação e RLS deny-by-default | contexto por usuário/ator e políticas por recurso |
| Auditoria | eventos append-only | auditoria transacional para ações críticas |
| Banco | migrations versionadas; proibição de `db push` | expand/contract e revisão SQL |
| Assíncrono | Redis/BullMQ | notificações, arquivos e webhooks |
| Segurança | Helmet, validação global, CORS, CSP, rate limit | baseline com CSP mais restritiva |
| Qualidade | lint, typecheck, build, testes, audit, gitleaks e Trivy | gates equivalentes no CI |
| UI | tokens semânticos e componentes básicos acessíveis | estrutura reutilizável, identidade Max Service própria |

## Padrões que exigem adaptação

- O marketplace não é um tenant corporativo simples. Cliente, prestador e parceiro têm visibilidades diferentes sobre o mesmo serviço; RLS deve considerar `app.user_id`, papéis e tabelas de relacionamento.
- A referência usa papel proprietário/admin para migrations e role de runtime para RLS. Na Max Service, produção deve usar credenciais separadas e segredos provisionados fora do SQL.
- `AuditService` da referência não derruba o fluxo quando falha. Isso é aceitável para telemetria, mas ações administrativas e financeiras críticas devem persistir auditoria na mesma transação ou em outbox durável.
- A CSP observada aceita `unsafe-inline`; o novo frontend deve reduzir essa exceção antes de produção.
- O lockout por conta é fail-open quando Redis falha. O rate limit por IP permanece, mas o risco precisa de monitoramento e degradação explícita.

## Itens que não devem ser copiados

Domínio HORECA, nomes e logos, datasets, seeds, textos, `.env`, URLs, IDs Azure, credenciais, configurações de produção, migrations específicas e componentes com identidade Total IA/Nestlé.

## Riscos encontrados na referência

- migration antiga cria uma senha de desenvolvimento literal para a role de runtime;
- RLS usa `ENABLE`, não `FORCE`; o proprietário pode ignorar políticas;
- documentação registra testes legados que acessam o banco com role admin e sem contexto;
- e-mail de tentativa inexistente aparece em metadado de auditoria, exigindo regra de retenção/redação;
- configuração de runtime e documentação possuem pequenas divergências de versão.

## Recomendação

Manter a família tecnológica e os padrões comprovados, mas reimplementar o código no novo domínio. A fundação deve nascer com role de runtime sem bypass, testes de pool/contexto e autorização por recurso, sem herdar as dívidas conhecidas.
