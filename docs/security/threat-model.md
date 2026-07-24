# Threat model

## Ativos

Contas, contatos, localização, documentos, conversas, solicitações, propostas, agenda, decisões de moderação, transações, comissões, cashback e trilha de auditoria.

## Fronteiras de confiança

Browser/PWA, BFF, API, PostgreSQL, Redis/worker, object storage, PSP, e-mail/SMS e ferramentas administrativas.

## Ameaças prioritárias e controles

| Ameaça | Controle mínimo |
|---|---|
| tomada de conta | Argon2id+pepper, MFA administrativo, rate limit, lockout, sessão revogável e detecção de reuso |
| enumeração | mensagens e tempo de resposta equivalentes; rate limit por IP/conta |
| IDOR/acesso cruzado | autorização por recurso + RLS + testes negativos |
| vazamento no pool | contexto somente com `SET LOCAL` em transação; teste de reutilização |
| CSRF/XSS | SameSite, token CSRF quando aplicável, CSP sem scripts arbitrários e encoding |
| cache indevido na PWA | service worker com allowlist pública, navegação network-first e exclusão total de `/api/` |
| sequestro ou vazamento de assinatura push | opt-in explícito, endpoint validado em HTTPS, RLS por destinatário, chave VAPID privada apenas na API e revogação por aparelho |
| exposição na tela bloqueada | aviso antes do opt-in, payload transacional mínimo e preferência revogável pelo usuário |
| entrega contra preferência do titular | assuntos versionados, janela silenciosa com fuso validado, filtro no enqueue e nova verificação no claim, reconciliação de pendências e auditoria sem endpoint |
| upload malicioso | bucket privado, nome do servidor, allowlist MIME/extensão, tamanho, quarentena e antivírus |
| fraude de proposta/booking | máquina de estados, optimistic locking e auditoria |
| enumeração ou abuso de cupom | resposta controlada, janela e limites no servidor, lock transacional, reserva por cliente e auditoria |
| webhook falso/repetido | HMAC/assinatura, timestamp, nonce/idempotency key e replay window |
| cobrança/comissão duplicada | constraints únicas, ledger append-only e reconciliação |
| abuso interno | least privilege, justificativa, confirmação, antes/depois e alertas |
| exportação excessiva | endpoint exclusivo da Operação, projeção agregada, períodos fechados e CSV sem PII ou identificadores internos |
| aceite ou consentimento forjado | sessão vinculada ao titular, documento limitado à audiência, hash congelado, finalidade separada, RLS e evento append-only |
| sabotagem do catálogo | RLS exclusivo da operação, justificativa, evento append-only, auditoria e proteção da última categoria ativa |
| acesso cruzado no suporte da rede | sessão vinculada ao perfil, BFF assinado, caso pertencente ao parceiro, RLS nos casos/eventos e teste negativo entre perfis |
| scraping de contatos | minimização de PII e contato somente após regra de negócio |
| assédio no chat | denúncia, bloqueio, retenção definida e acesso de suporte por caso |

## Gates

Pagamento real, garantia, antecedentes, biometria, crédito e categorias reguladas exigem nova revisão de ameaça e aprovação jurídica antes de feature flag de produção.

## Situação do upload no piloto

O piloto implementa bucket privado, chave aleatória gerada pelo servidor, allowlist de tipo/extensão/assinatura, hash de integridade, autorização por sessão/RLS e auditoria. Documentos de verificação são versionados e limitados a 2 MB; imagens de pedidos são append-only, limitadas a três arquivos de 512 KB e expostas somente pelo BFF autenticado. Conversas aceitam uma imagem append-only de 512 KB por mensagem, visível somente aos dois membros. A central parceiro–Operação aceita um PDF, JPEG ou PNG append-only de até 2 MB por mensagem, visível apenas ao parceiro titular e à Operação. Envio e download são auditados sem expor a chave do objeto. Quarentena automatizada e antivírus continuam ausentes; portanto somente arquivos sintéticos são permitidos. Em produção, anexos maiores devem usar upload direto assinado ao object storage, sem atravessar o limite de corpo da borda.

A captura pública de indicação aceita apenas códigos ativos pelo BFF assinado, usa RLS limitado ao link validado, exige consentimento, aplica honeypot, tamanho máximo de corpo, limite temporal e unicidade de e-mail por rede. Chamadas diretas à API sem o canal interno são rejeitadas; o piloto ainda precisa de proteção distribuída de borda antes de exposição em produção.

A atividade administrativa é somente leitura e exclusiva da Operação. O backend transforma cada evento em uma projeção conhecida antes de responder: ação, categoria, referência opaca, responsável e horário. O payload JSON, UUID interno da entidade, hashes e metadados técnicos não são enviados ao navegador. Outros perfis são bloqueados no BFF e pelo RLS do PostgreSQL.

O relatório administrativo aceita somente períodos fechados de 7, 30 ou 90 dias e agrega os módulos dentro de uma transação com contexto operacional. A resposta não inclui nomes, contatos, descrições, endereços ou payloads de auditoria. A exportação CSV é derivada exclusivamente da tabela agregada por categoria e não contém UUIDs; perfis não operacionais são bloqueados pelo cookie de sessão no BFF, pela assinatura interna e pelo RLS.

Metas de relatório são globais por período, persistidas em pontos-base ou inteiros e protegidas por constraints. O runtime não pode criar ou excluir períodos: atualiza apenas os campos permitidos, incrementa a versão e registra valores anterior/posterior em evento append-only com justificativa. Alertas são derivados no servidor a cada consulta, sem perfilamento individual ou envio externo automático.

O onboarding não confia em IDs enviados pelo navegador: o servidor exige o conjunto exato de documentos ativos da audiência do ator, copia o hash persistido para o aceite e valida campos conforme o papel. Preferências opcionais usam registros e eventos separados por finalidade. Parceiro e Operação não podem executar a jornada pelo BFF; a Operação conserva somente leitura por RLS para suporte e auditoria.

A gestão do catálogo exige sessão operacional no BFF e no RLS. O runtime concede atualização apenas de `active`, `sort_order` e `updated_at`; cada ação registra justificativa em `service_category_events` e projeção em `audit_events`. Uma constraint mantém a ordem positiva e única, e um trigger impede que a última categoria ativa seja desativada. Categorias inativas são excluídas somente de novas contratações e indicações, preservando evidências históricas.

Campanhas exigem sessão operacional para criação ou mudança de estado. O navegador do cliente apenas apresenta o código: validade, limites e valor são revalidados dentro da transação do pedido, com lock por cupom para impedir ultrapassar orçamento sob concorrência. Uma função `SECURITY DEFINER` de escopo mínimo retorna somente duas contagens e exige que o cliente consultado seja o ator atual; assim o limite global é exato sem expor reservas alheias sob RLS. A reserva congela a regra; o trigger do booking calcula o desconto novamente, grava o snapshot financeiro e impede que valores enviados pelo navegador alterem lista, desconto ou total. Antes de exposição pública, a validação de códigos ainda precisa de rate limit distribuído e telemetria de abuso.

A central de atendimento da rede usa tabelas próprias para não transformar notas internas de cancelamento em comunicação externa. O parceiro pode criar casos apenas para si, vincular somente indicações da própria rede e inserir mensagens e anexos em casos não resolvidos. Cada anexo referencia por chave estrangeira o evento, o caso e o mesmo ator que o enviou; o RLS repete a prova de titularidade no acesso. A Operação lê a fila completa, responde e executa somente as transições `open → in_review → resolved`, sempre com justificativa registrada em evento e auditoria. A atribuição aceita somente usuários com papel operacional; a prioridade pode subir de normal para alta, mas não voltar enquanto o caso está ativo. Os prazos de primeira resposta e resolução são persistidos com a versão da política, e o atraso é derivado sem permitir que uma reclassificação apague um vencimento ou estenda um prazo já cumprido. Cada triagem gera evento append-only e auditoria. A identidade nominal da equipe é projetada como “Equipe Max” para o parceiro, evitando ampliar a política de leitura da tabela de usuários.

O service worker da PWA guarda apenas landing, tela offline, manifest e imagens públicas enumeradas. Navegações tentam primeiro a rede e superfícies autenticadas nunca são persistidas para uso offline. Requisições para `/api/`, mutações e origens externas não entram no fluxo de cache; sem conexão, os painéis mostram uma página neutra em vez de conteúdo potencialmente desatualizado ou pertencente a outra sessão.

O Web Push é um canal opt-in separado do cache. A chave pública VAPID chega ao navegador, mas a chave privada permanece somente na API. Endpoint, `p256dh` e `auth` passam por validação estrutural antes de serem vinculados ao usuário por sessão e RLS. A inserção da notificação e da entrega ocorre na mesma transação; um worker interno reivindica lotes com lock, limita retentativas, não concede leitura direta da fila ao papel da aplicação e revoga automaticamente assinaturas recusadas pelo provedor. O payload contém somente título, resumo e referência opaca, mas ainda pode aparecer na tela bloqueada — risco informado antes da ativação.

Os probes públicos retornam somente estado, latência e identificadores fechados. O diagnóstico ampliado exige sessão da Operação e canal BFF→API assinado; URLs, credenciais, nomes de objetos, migrations e payloads não são projetados. O resultado diferencia dependências que bloqueiam tráfego local de pendências de produção e nunca concede autorização automática.

As preferências de Web Push não apagam a notificação da central: elas controlam somente a entrega ao aparelho. O destinatário escolhe marketplace, mensagens, atendimento e plataforma em registro próprio protegido por RLS. A janela silenciosa usa uma lista fechada de fusos brasileiros e suporta períodos que cruzam a meia-noite. O enqueue não cria entrega para assunto desativado, o claim repete a verificação para evitar corrida com mudanças recentes e a reconciliação finaliza como `suppressed` qualquer pendência incompatível. Eventos guardam somente flags, fuso e versão; endpoints e chaves nunca entram no payload de auditoria.
