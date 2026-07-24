# Plano do projeto

## Objetivo

Entregar um MVP regional, seguro e demonstrável, capaz de validar a aquisição de clientes e prestadores antes de ativar integrações reguladas ou expansão nacional.

## Fases e gates

| Fase | Entrega | Gate de saída |
|---|---|---|
| 0 - Descoberta | requisitos, contradições, auditoria da referência e arquitetura | decisões críticas classificadas; sem pendência silenciosa |
| 1 - Fundação | monorepo, API, PostgreSQL, migrations, autenticação, sessões, RLS, auditoria e testes | banco recriado do zero; testes negativos de autorização verdes |
| 2 - Experiência | design system, landing, cadastro, login, onboarding e layouts por perfil | WCAG 2.2 AA; 360, 390, 768 e 1440 px validados |
| 3 - Marketplace | solicitações, propostas, chat, agenda, estados e avaliações | jornada cliente-prestador executada ponta a ponta |
| 4 - Operação | parceiros, QR Code, moderação e administração | ações críticas justificadas e auditadas |
| 5 - Financeiro sandbox | interface PSP, webhook assinado fake, split e ledger | idempotência e reconciliação testadas; nenhum dinheiro real |
| 6 - Prontidão | segurança, desempenho, acessibilidade e documentação | checklist de produção aprovado por responsáveis técnico, jurídico e financeiro |

## Hipóteses de trabalho

- marca provisória: Max Service;
- piloto: uma região limitada do interior de São Paulo;
- catálogo piloto: eletricista, encanador, pedreiro, pintor, diarista e montagem/reparos;
- comissão de demonstração: plataforma 12%, parceiro 2% e cashback 2%;
- PSP sandbox com split; sem custódia pela Max Service;
- aprovação manual de prestador após validações sintáticas e documentais.

## Progresso implementado

- Fases 1 e 3 possuem jornadas persistentes demonstráveis no Docker local; o navegador executa automaticamente no CI tanto a jornada cliente–profissional da criação do pedido à avaliação quanto o cancelamento com tratamento e resolução pela Operação.
- A Fase 4 já inclui rede do parceiro, captura pública por link/QR com consentimento, triagem operacional de indicações, central compartilhada de atendimento parceiro–Operação, fila interna de ocorrências, moderação manual de profissionais, atividade auditável pesquisável e gestão versionada do catálogo para a Operação.
- A central da rede separa comunicação externa de notas internas, vincula opcionalmente cada caso a uma indicação do próprio parceiro, bloqueia mensagens após a resolução e restringe transições justificadas à Operação.
- A triagem da central distribui casos entre múltiplos operadores, permite elevar a prioridade e acompanha SLA versionado de primeira resposta e resolução, com atrasos preservados e visíveis para parceiro e Operação.
- Mensagens da central aceitam um anexo privado sintético PDF/JPEG/PNG de até 2 MB, guardado no object storage com metadados relacionais, hash de integridade, RLS e auditoria de cada acesso.
- O catálogo piloto é persistente e único para cliente, parceiro e captura pública; a Operação pode ordenar, ativar ou desativar categorias com justificativa, RLS, evento append-only e proteção contra catálogo vazio.
- Campanhas e cupons do P1 já são persistentes: a Operação controla janela, tipo de desconto, pedido mínimo e limites de uso; a reserva ocorre no pedido e o desconto é congelado no aceite.
- Relatórios operacionais do P1 já consolidam coortes de 7, 30 e 90 dias, funil do marketplace, categorias, crescimento, suporte e saúde financeira em projeção exclusiva da Operação e exportação agregada; metas versionadas, comparação com a janela anterior e alertas de desvio já estão materializados.
- A Fase 5 possui a fundação sandbox: regra 12/2/2 versionada, snapshot por booking, eventos assinados, idempotência, split, ledger e reconciliação sem PSP real.
- A Fase 6 possui um cockpit persistente com oito gates de prontidão, responsável, evidência, versão e eventos append-only; o sistema mantém a autorização de produção explicitamente falsa até aprovações externas.
- O CI executa lint, builds, testes funcionais, auditoria de dependências e scanner de segredos; em ambiente Docker limpo, também aplica todas as migrations e prova RLS e proteção contra conflitos de agenda.
- O pipeline também ensaia backup e restauração em banco temporário, comparando migrations, dados críticos, grants, policies, RLS e constraints; backup gerenciado, PITR, RPO e RTO continuam como gate de infraestrutura.
- Liveness e readiness são separados; o readiness valida banco, migrations e cofre, enquanto o cockpit exclusivo da Operação expõe somente diagnósticos seguros e preserva a proibição de produção.
- A API gera correlação própria por requisição, registra eventos JSON sem query, payload ou identidade individual e agrega uma janela móvel limitada de tráfego por réplica no cockpit da Operação.
- Sessão demonstrativa, indicação pública e validação de cupom possuem limites locais com chaves opacas, buffers limitados, contrato `429` e bloqueios agregados no cockpit; produção ainda exige coordenação distribuída.
- Frontend e API possuem CSP, proteção contra framing/sniffing, Permissions Policy, cache privado, CORS fechado e limites explícitos de corpo; HTTPS/HSTS e CSP sem `unsafe-inline` permanecem gates externos.
- Smoke tests em Docker comprovam probes, visão operacional, bloqueio do cliente e assinatura obrigatória do canal BFF→API.
- A prontidão de identidade já possui sessão demonstrativa opaca, expiração de quatro horas, revogação persistente, cookie `HttpOnly`/`SameSite=Strict`, bloqueio entre perfis e contexto BFF→API assinado.
- Cliente e profissional já possuem onboarding transacional com perfil específico, documentos `pilot-0.1` versionados, aceite ligado ao SHA-256 do conteúdo, consentimentos opcionais revogáveis e histórico append-only.
- Sorocaba e seus bairros piloto já possuem catálogo regional persistente; a Operação controla ativações com justificativa, e RLS limita oportunidades à cobertura ativa do profissional.
- O matching profissional já combina categoria principal, cobertura, verificação, disponibilidade e capacidade; preferências e limites são versionados, o ranking apresenta motivos objetivos e a Operação acompanha bloqueios agregados.
- A inclusão de propostas é protegida no serviço, na policy de RLS e em gatilho transacional, evitando que chamadas diretas contornem elegibilidade ou capacidade.
- A agenda profissional possui jornada semanal versionada, bloqueios pontuais, slots de 30 minutos e escolha obrigatória do horário no aceite; exclusion constraints e advisory locks impedem sobreposição mesmo sob concorrência.
- Cliente e profissional enxergam somente os participantes do próprio booking; a projeção de agenda preserva o isolamento por RLS sem ocultar o compromisso contratado.
- A verificação possui cofre S3 local para documentos sintéticos, versões append-only, validação de assinatura/MIME/tamanho, hash SHA-256, download privado e auditoria por ator.
- A solicitação de serviço aceita até três imagens sintéticas privadas, com limite compatível com a borda local, hash, RLS, auditoria e visualização pelo profissional autorizado.
- A conversa transacional aceita uma imagem sintética privada por mensagem, com legenda opcional, validação de conteúdo, hash, isolamento entre membros e auditoria de envio/download.
- Mensagens, lista de conversas e contadores possuem sincronização adaptativa; o backend entrega apenas mensagens posteriores ao cursor validado na própria conversa e mantém um cursor de leitura monotônico por membro para calcular não lidas.
- A experiência web já é instalável como PWA, com identidade visual própria e fallback offline seguro; o cache usa allowlist pública e exclui integralmente APIs, sessões e superfícies autenticadas.
- As notificações transacionais podem chegar por Web Push mediante consentimento por aparelho, com assinatura persistente isolada por RLS, fila no mesmo commit da notificação, retentativa limitada e revogação de endpoints inválidos.
- Os quatro perfis controlam assuntos de Web Push e horário silencioso por fuso brasileiro na Conta; cada mudança incrementa versão, preserva evento append-only, gera auditoria segura e suprime ou adia entregas ainda pendentes.
- Autenticação real, confirmação de contato, processamento antimalware e integrações reguladas continuam condicionados aos gates das fases seguintes.

## Não objetivos do MVP

Carteira, conta de pagamento, PIX operado pela empresa, custódia, crédito, investimento de cashback, biometria facial, antecedentes automatizados, orçamento por IA, categorias reguladas, iOS nativo e expansão nacional.

## Critérios de qualidade permanentes

- sem segredos versionados;
- dados sintéticos;
- valores monetários em decimal e horários em UTC;
- autorização no backend e isolamento testado;
- uploads privados e URLs temporárias;
- feature flags para integrações de risco;
- lint, typecheck, build, testes e scanner de segredos no CI.
- evidência técnica concluída não substitui aprovação formal técnica, jurídica, financeira e operacional para produção.
