# Max Service

Primeira base de produto para um marketplace regional de serviços. A plataforma conecta clientes a prestadores, permite solicitar e comparar propostas, conversar, agendar e acompanhar o serviço, com pontos de extensão para parceiros comerciais, moderação e pagamentos por PSP.

## Estado atual

- Fase 0 de descoberta e auditoria concluída e documentada em `docs/`.
- Landing page e primeira experiência SaaS navegável para cliente, profissional, parceiro e administração.
- A demonstração inclui entrada por perfil, painéis, atividades, mensagens e área de conta/plano com dados fictícios.
- API NestJS versionada e PostgreSQL 16 já sustentam categorias, solicitações, propostas e aceite.
- Solicitações criadas pelo painel do cliente são persistidas e reaparecem após recarregar a aplicação.
- O profissional recebe oportunidades do banco, envia ou atualiza sua proposta e o cliente compara valores e prazos antes de aceitar.
- O aceite cria um agendamento e uma conversa persistente, acessível somente pelo cliente e pelo profissional vinculados.
- Cliente e profissional trocam mensagens pelo painel; a lista, o histórico e a última mensagem sobrevivem a reinícios.
- A área **Atividade** apresenta a agenda persistente, detalhes do atendimento e a linha do tempo do serviço.
- O profissional inicia e conclui o atendimento por transições validadas; o cliente acompanha cada atualização sem poder alterar o estado.
- Após a conclusão, cliente e profissional avaliam a experiência uma única vez; notas e comentários permanecem vinculados ao atendimento.
- Cliente e profissional podem cancelar atendimentos agendados ou em execução, com motivo obrigatório, histórico e auditoria.
- Cada cancelamento abre automaticamente um chamado persistente; interrupções durante a execução entram como prioridade alta na fila da operação.
- Pedidos agendados bloqueiam novas propostas e aceite duplicado; cada mudança relevante gera histórico e auditoria.
- O banco aplica RLS por ator; a identidade demonstrativa é bloqueada fora de `DEMO_MODE`.
- Nenhum pagamento real, carteira, crédito, biometria ou consulta de antecedentes está ativo.
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
- serviços: `database`, `api` e `web`, todos com verificação de saúde;
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
- [Design system](docs/ux/design-system.md)

## Limites desta etapa

Esta entrega é uma fundação local de Fase 1, ainda com identidades e dados fictícios. Autenticação pública, uploads privados, entrega de mensagens em tempo real, resolução manual dos chamados, pagamentos e integrações externas permanecem desativados. Conversas, ciclo do agendamento, cancelamentos, chamados operacionais e avaliações bilaterais são persistentes. As credenciais do `compose.yaml` existem somente para desenvolvimento local e não podem ser reutilizadas em produção.
