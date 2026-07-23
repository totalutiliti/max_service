# Max Service

Primeira base de produto para um marketplace regional de serviços. A plataforma conecta clientes a prestadores, permite solicitar e comparar propostas, conversar, agendar e acompanhar o serviço, com pontos de extensão para parceiros comerciais, moderação e pagamentos por PSP.

## Estado atual

- Fase 0 de descoberta e auditoria concluída e documentada em `docs/`.
- Landing page e primeira experiência SaaS navegável para cliente, profissional, parceiro e administração.
- A demonstração inclui entrada por perfil, painéis, atividades, mensagens e área de conta/plano com dados fictícios.
- A entrada agora cria uma sessão opaca, temporária e revogável em cookie `HttpOnly`; troca de perfil invalida a sessão anterior e o logout revoga a atual.
- O BFF deriva o ator exclusivamente da sessão e assina o contexto enviado à API; parâmetros de perfil adulterados e cabeçalhos diretos são bloqueados.
- API NestJS versionada e PostgreSQL 16 já sustentam categorias, solicitações, propostas e aceite.
- Solicitações criadas pelo painel do cliente são persistidas e reaparecem após recarregar a aplicação.
- O cliente pode anexar até três imagens sintéticas JPEG/PNG de 512 KB ao pedido; os profissionais elegíveis ou contratados visualizam pelo BFF autenticado, sem URL pública.
- O profissional recebe oportunidades do banco, envia ou atualiza sua proposta e o cliente compara valores e prazos antes de aceitar.
- O aceite cria um agendamento e uma conversa persistente, acessível somente pelo cliente e pelo profissional vinculados.
- Cliente e profissional trocam mensagens pelo painel; a lista, o histórico e a última mensagem sobrevivem a reinícios.
- A área **Atividade** apresenta a agenda persistente, detalhes do atendimento e a linha do tempo do serviço.
- O profissional inicia e conclui o atendimento por transições validadas; o cliente acompanha cada atualização sem poder alterar o estado.
- Após a conclusão, cliente e profissional avaliam a experiência uma única vez; notas e comentários permanecem vinculados ao atendimento.
- Cliente e profissional podem cancelar atendimentos agendados ou em execução, com motivo obrigatório, histórico e auditoria.
- Cada cancelamento abre automaticamente um chamado persistente; interrupções durante a execução entram como prioridade alta na fila da operação.
- A operação consulta a linha do tempo do chamado, registra notas internas, assume a análise e resolve com justificativa auditável.
- Os quatro perfis têm uma central persistente de notificações, com contador de não lidas e leitura individual ou em massa.
- Propostas, aceite, mensagens, execução, avaliações, cancelamentos e atualizações de chamados geram avisos transacionais para o destinatário correto.
- O perfil parceiro possui código persistente, métricas reais da própria rede, histórico pesquisável e registro manual de novas indicações.
- A operação possui uma fila persistente de verificação de profissionais, revisão item a item, justificativa obrigatória e trilha de auditoria; o profissional acompanha o próprio status e checklist.
- O profissional envia versões de documentos sintéticos para um cofre S3 local privado; a operação baixa pelo BFF autenticado, com hash, limite de tamanho, assinatura de arquivo, RLS e auditoria de acesso.
- O financeiro sandbox congela a regra comercial no aceite, calcula as quatro parcelas, recebe eventos demonstrativos assinados e mantém ledger append-only com idempotência e reconciliação.
- Cliente, profissional, parceiro e operação possuem extratos separados por RLS; os valores são previsões ou lançamentos demonstrativos, nunca saldo bancário ou dinheiro movimentado.
- Pedidos agendados bloqueiam novas propostas e aceite duplicado; cada mudança relevante gera histórico e auditoria.
- O banco aplica RLS por ator; a identidade demonstrativa é bloqueada fora de `DEMO_MODE`.
- Nenhum pagamento real, carteira, crédito, biometria ou consulta de antecedentes está ativo; o processador financeiro é exclusivamente sandbox.
- O nome **Max Service** e a regra comercial **12% + 2% + 2%** são hipóteses pendentes de aprovação.

## Rodar localmente

Pré-requisitos para o frontend isolado: Node.js 22.13 ou superior e npm.

```bash
npm ci
npm run dev
```

Para validar uma entrega:

```bash
npm run lint
npm run build
npm test
```

## Rodar com Docker

```bash
docker compose up -d --build
```

A prévia fica disponível em `http://127.0.0.1:4174` e a plataforma SaaS em `http://127.0.0.1:4174/demo`. O container possui verificação de saúde e reinício automático.

- API: `http://127.0.0.1:3001/health`
- PostgreSQL local: `127.0.0.1:54329`
- armazenamento privado S3: `127.0.0.1:59000` (API) e `127.0.0.1:59001` (console local);
- serviços: `database`, `storage`, `api` e `web`;
- volume `max-service-postgres` mantém os pedidos entre reinícios.

## Princípios

- código e identidade próprios; concorrentes são apenas benchmark;
- mobile-first, linguagem simples e acessibilidade WCAG 2.2 AA;
- dados reais não entram em seed ou demonstração;
- regras comerciais são versionadas e configuráveis;
- dinheiro é processado por instituição autorizada, nunca por “carteira” improvisada;
- migrations versionadas, RLS fail-closed e auditoria append-only na fundação do backend.

## Documentação

- [Plano do projeto](PROJECT_PLAN.md)
- [Descoberta](docs/discovery/inventario-fontes.md)
- [Visão do produto](docs/product/visao-produto.md)
- [Arquitetura](docs/architecture/architecture-overview.md)
- [Segurança](docs/security/threat-model.md)
- [Autenticação e sessões](docs/security/authentication.md)
- [Design system](docs/ux/design-system.md)

## Limites desta etapa

Esta entrega é uma fundação local, ainda com identidades e dados fictícios. As sessões demonstrativas exercitam expiração, revogação, cookie seguro e autorização, mas não substituem cadastro público, senha forte, confirmação de contato, recuperação de conta ou MFA administrativo. Documentos e fotos de pedidos aceitam somente arquivos sintéticos; antivírus, quarentena automatizada, criptografia gerenciada e política final de retenção continuam obrigatórios antes de dados reais. Captura pública do link/QR de indicação, entrega em tempo real por push/WebSocket, e-mail/SMS, pagamentos reais e integrações externas permanecem desativados. Conversas, notificações internas, rede do parceiro, ciclo do agendamento, cancelamentos, tratamento de chamados, estados da verificação, anexos privados, versões documentais, avaliações e ledger financeiro sandbox são persistentes. As credenciais e chaves do `compose.yaml` existem somente para desenvolvimento local e não podem ser reutilizadas em produção.
