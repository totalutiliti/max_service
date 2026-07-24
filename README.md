# Max Service

Primeira base de produto para um marketplace regional de serviços. A plataforma conecta clientes a prestadores, permite solicitar e comparar propostas, conversar, agendar e acompanhar o serviço, com pontos de extensão para parceiros comerciais, moderação e pagamentos por PSP.

## Estado atual

- Fase 0 de descoberta e auditoria concluída e documentada em `docs/`.
- Landing page e primeira experiência SaaS navegável para cliente, profissional, parceiro e administração.
- A demonstração inclui entrada por perfil, painéis, atividades, mensagens e área de conta/plano com dados fictícios.
- A experiência web é instalável como PWA, com manifest e ícones próprios, convite de instalação e tela offline; o service worker guarda somente a estrutura pública e nunca armazena sessões, APIs ou dados protegidos.
- A entrada agora cria uma sessão opaca, temporária e revogável em cookie `HttpOnly`; troca de perfil invalida a sessão anterior e o logout revoga a atual.
- O BFF deriva o ator exclusivamente da sessão e assina o contexto enviado à API; parâmetros de perfil adulterados e cabeçalhos diretos são bloqueados.
- API NestJS versionada e PostgreSQL 16 já sustentam categorias, solicitações, propostas e aceite.
- Criação de pedido, envio de proposta, aceite, mensagens, comandos JSON do atendimento, agenda, ciclo do serviço, operação e os quatro fluxos de upload privado usam `Idempotency-Key` vinculada à assinatura BFF→API; chave, efeito e resposta são confirmados na mesma transação, com replay observável, bloqueio de reutilização com outro conteúdo e compensação do objeto em falhas ordinárias.
- Solicitações criadas pelo painel do cliente são persistidas e reaparecem após recarregar a aplicação.
- O cliente pode anexar até três imagens sintéticas JPEG/PNG de 512 KB ao pedido; os profissionais elegíveis ou contratados visualizam pelo BFF autenticado, sem URL pública.
- O profissional recebe oportunidades do banco, envia ou atualiza sua proposta e o cliente compara valores, prazos e horários realmente disponíveis antes de aceitar.
- O profissional configura uma jornada semanal e bloqueios pontuais; a agenda desconta compromissos confirmados e impede no PostgreSQL duas reservas ou bloqueios sobrepostos.
- O aceite exige um horário retornado pelo servidor e cria agendamento com início/fim e conversa persistente, acessíveis somente pelo cliente e pelo profissional vinculados.
- Cliente e profissional trocam mensagens pelo painel; a lista, o histórico, a última mensagem e os contadores reais de não lidas sobrevivem a reinícios e são sincronizados automaticamente por cursor enquanto a tela está ativa.
- Cliente e profissional podem enviar uma imagem sintética JPEG/PNG de até 512 KB por mensagem, com legenda opcional, hash de integridade, download privado, RLS e auditoria.
- A área **Atividade** apresenta a agenda persistente, jornada semanal, bloqueios, próximos compromissos, detalhes do atendimento e a linha do tempo do serviço.
- O profissional inicia e conclui o atendimento por transições validadas; o cliente acompanha cada atualização sem poder alterar o estado.
- Após a conclusão, cliente e profissional avaliam a experiência uma única vez; notas e comentários permanecem vinculados ao atendimento.
- Cliente e profissional podem cancelar atendimentos agendados ou em execução, com motivo obrigatório, histórico e auditoria.
- Cada cancelamento abre automaticamente um chamado persistente; interrupções durante a execução entram como prioridade alta na fila da operação.
- A operação consulta a linha do tempo do chamado, registra notas internas, assume a análise e resolve com justificativa auditável.
- A aba **Atividade** da Operação apresenta a trilha real e pesquisável de ações do marketplace, atendimentos, moderação, parceiros e financeiro sandbox, sem expor o payload bruto da auditoria.
- A Visão geral da Operação consolida relatórios de 7, 30 ou 90 dias com funil, ritmo de aquisição, desempenho por categoria, campanhas, suporte e reconciliação; a exportação CSV contém somente agregados sem PII.
- Cada período possui metas versionadas de cobertura, conversão, primeira proposta, SLA e reconciliação; o cockpit compara a janela anterior e abre alertas automáticos, enquanto alterações exigem justificativa auditável.
- A área **Configurações** da Operação controla a ordem e a disponibilidade das categorias; cada mudança exige justificativa, preserva o histórico e gera evento append-only e auditoria.
- A área **Conta** da Operação mantém oito gates persistentes de prontidão, com responsável, evidência, versão, histórico append-only e conflito otimista; evidência pronta não autoriza produção.
- A mesma área possui um cockpit de saúde que verifica API, PostgreSQL, sincronismo das migrations, cofre privado e modos de integração, separando bloqueios de tráfego local dos gates de produção.
- A Operação cria, agenda, pausa e acompanha campanhas promocionais com validade, limite total e por cliente; o cliente valida e reserva o cupom no pedido.
- O cupom é recalculado no aceite da proposta, e o financeiro sandbox preserva valor original, desconto, valor final e campanha em um snapshot conciliável.
- Cliente, parceiro e página pública consomem o mesmo catálogo persistente; categorias desativadas deixam de aceitar novos pedidos e indicações sem ocultar vínculos anteriores.
- Os quatro perfis têm uma central persistente de notificações, com atualização automática do contador, leitura individual ou em massa.
- Cada usuário pode ativar Web Push por aparelho; a assinatura fica protegida por sessão e RLS, as entregas usam fila transacional com retentativa limitada e endpoints expirados são revogados automaticamente.
- A área de Conta permite escolher separadamente avisos de marketplace, mensagens, atendimento e plataforma, além de uma janela silenciosa por fuso brasileiro; mudanças são versionadas, auditadas e reavaliam entregas ainda pendentes.
- Cliente e profissional possuem onboarding persistente na área de Conta, com campos específicos por perfil, documentos legais versionados, aceite vinculado ao hash do texto e consentimentos opcionais separados.
- Regiões e bairros do piloto são persistentes e administráveis com justificativa; pedidos derivam a localização do catálogo ativo e profissionais só recebem oportunidades em áreas vinculadas à própria cobertura.
- O matching do profissional cruza categoria principal, cobertura ativa, verificação aprovada, disponibilidade e capacidade; a lista explica o score sem critérios ocultos, e RLS mais gatilho no PostgreSQL impedem proposta incompatível mesmo fora da interface.
- O profissional controla disponibilidade, aceite de urgências e limites de propostas/serviços; a Operação acompanha elegibilidade e bloqueios em um cockpit persistente, versionado e auditável.
- Propostas, aceite, mensagens, execução, avaliações, cancelamentos e atualizações de chamados geram avisos transacionais para o destinatário correto.
- O perfil parceiro possui código persistente, métricas reais da própria rede, histórico pesquisável, registro manual e captura pública por link ou QR Code escaneável.
- Parceiro e Operação compartilham uma central persistente de atendimento: o parceiro abre solicitações vinculadas opcionalmente à própria indicação, ambos conversam no mesmo histórico e recebem notificações, e somente a Operação altera o estado com justificativa auditável.
- A fila operacional possui busca, filtros por estado e prazo, atribuição entre operadores, prioridade irreversível durante o caso e SLA versionado: 4 h para primeira resposta e 48 h para resolução no fluxo normal; 1 h e 8 h na prioridade alta.
- Parceiro e Operação podem anexar um PDF, JPEG ou PNG sintético de até 2 MB a cada mensagem do atendimento; o arquivo fica no cofre privado, com hash, RLS e auditoria de envio e download.
- O atendimento da rede é isolado dos chamados internos de cancelamento; eventos são append-only, casos resolvidos bloqueiam novas mensagens e o RLS impede leitura ou escrita entre perfis.
- A página pública de indicação valida o código ativo, exige consentimento versionado, registra o interesse sem criar conta definitiva e limita duplicidade e abuso.
- A operação recebe essas indicações em uma fila própria, inicia a análise e registra aprovação para onboarding ou rejeição com justificativa, evento append-only, auditoria e notificação ao parceiro.
- A operação possui uma fila persistente de verificação de profissionais, revisão item a item, justificativa obrigatória e trilha de auditoria; o profissional acompanha o próprio status e checklist.
- O profissional envia versões de documentos sintéticos para um cofre S3 local privado; a operação baixa pelo BFF autenticado, com hash, limite de tamanho, assinatura de arquivo, RLS e auditoria de acesso.
- O financeiro sandbox congela a regra comercial e o desconto promocional no aceite, calcula as quatro parcelas, recebe eventos demonstrativos assinados e mantém ledger append-only com idempotência e reconciliação.
- Cliente, profissional, parceiro e operação possuem extratos separados por RLS; os valores são previsões ou lançamentos demonstrativos, nunca saldo bancário ou dinheiro movimentado.
- Pedidos agendados bloqueiam novas propostas e aceite duplicado; cada mudança relevante gera histórico e auditoria.
- O banco aplica RLS por ator; a identidade demonstrativa é bloqueada fora de `DEMO_MODE`.
- O CI reproduz lint, builds, testes funcionais, auditoria de dependências, scanner de segredos e uma instalação Docker limpa para testar migrations, RLS e conflitos de agenda no PostgreSQL.
- O mesmo pipeline gera um backup lógico, restaura em banco isolado, compara dados e proteções, prova o RLS com a role de runtime e remove todos os artefatos temporários.
- Smoke tests exercitam liveness, readiness, cockpit operacional, bloqueio entre perfis, rejeição de cabeçalhos internos não assinados e pares concorrentes de 27 ações idempotentes cobertas, incluindo os quatro uploads privados.
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
npm run test:integration
npm run test:restore
npm run test:smoke
```

`test:integration` e `test:restore` exigem o PostgreSQL local do Docker ativo em `127.0.0.1:54329`; `test:smoke` exige também API e web. O ensaio de restauração nunca usa o banco original como destino.

## Rodar com Docker

```bash
docker compose up -d --build
```

A prévia fica disponível em `http://127.0.0.1:4174` e a plataforma SaaS em `http://127.0.0.1:4174/demo`. O container possui verificação de saúde e reinício automático.

- API viva: `http://127.0.0.1:3001/health/live`
- API pronta para tráfego local: `http://127.0.0.1:3001/health/ready`
- cockpit autenticado em **Operação → Conta**, com dependências e telemetria local dos últimos cinco minutos;
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
- [Proteção contra abuso](docs/security/abuse-protection.md)
- [Segurança HTTP](docs/security/http-security.md)
- [Idempotência das mutações](docs/security/idempotency.md)
- [Ensaio de backup e restauração](docs/operations/backup-restore.md)
- [Saúde e observabilidade](docs/operations/observability.md)
- [Design system](docs/ux/design-system.md)

## Limites desta etapa

O onboarding persiste perfil, hashes dos documentos aceitos e preferências opcionais, mas as minutas `pilot-0.1` exigem aprovação jurídica antes de dados reais.

Esta entrega é uma fundação local, ainda com identidades e dados fictícios. As sessões demonstrativas exercitam expiração, revogação, cookie seguro e autorização, mas não substituem cadastro público, senha forte, confirmação de contato, recuperação de conta ou MFA administrativo. Documentos, fotos de pedidos, imagens das conversas e anexos de atendimento aceitam somente arquivos sintéticos; antivírus, quarentena automatizada, criptografia gerenciada e política final de retenção continuam obrigatórios antes de dados reais. Mensagens e notificações usam sincronização incremental automática, e o canal Web Push opt-in já opera com chaves VAPID exclusivamente locais, preferências por assunto e horário silencioso; WebSocket, e-mail/SMS, alertas externos e escalonamento automático de SLA, pagamentos reais e integrações externas permanecem desativados. A captura pública de indicação registra somente interesse e consentimento: não cria conta, não confirma contato e não dispara comunicação externa. A aprovação operacional coloca o interessado em `approved`, aguardando onboarding; somente uma conversão posterior com conta de prestador pode torná-lo `active`. Conversas, notificações internas, assinaturas push, preferências versionadas de entrega, atendimentos do parceiro, catálogo operacional, regiões, bairros, coberturas profissionais, campanhas e reservas de cupons, rede do parceiro, ciclo do agendamento, cancelamentos, tratamento de chamados, estados da verificação, anexos privados, versões documentais, avaliações e ledger financeiro sandbox são persistentes. As credenciais fixas do `compose.yaml` existem somente para desenvolvimento local; o par VAPID fica no `.env` ignorado pelo Git, e nenhum desses valores pode ser reutilizado em produção.
