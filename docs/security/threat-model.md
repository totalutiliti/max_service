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
| upload malicioso | bucket privado, nome do servidor, allowlist MIME/extensão, tamanho, quarentena e antivírus |
| fraude de proposta/booking | máquina de estados, optimistic locking e auditoria |
| webhook falso/repetido | HMAC/assinatura, timestamp, nonce/idempotency key e replay window |
| cobrança/comissão duplicada | constraints únicas, ledger append-only e reconciliação |
| abuso interno | least privilege, justificativa, confirmação, antes/depois e alertas |
| sabotagem do catálogo | RLS exclusivo da operação, justificativa, evento append-only, auditoria e proteção da última categoria ativa |
| acesso cruzado no suporte da rede | sessão vinculada ao perfil, BFF assinado, caso pertencente ao parceiro, RLS nos casos/eventos e teste negativo entre perfis |
| scraping de contatos | minimização de PII e contato somente após regra de negócio |
| assédio no chat | denúncia, bloqueio, retenção definida e acesso de suporte por caso |

## Gates

Pagamento real, garantia, antecedentes, biometria, crédito e categorias reguladas exigem nova revisão de ameaça e aprovação jurídica antes de feature flag de produção.

## Situação do upload no piloto

O piloto implementa bucket privado, chave aleatória gerada pelo servidor, allowlist de tipo/extensão/assinatura, hash de integridade, autorização por sessão/RLS e auditoria. Documentos de verificação são versionados e limitados a 2 MB; imagens de pedidos são append-only, limitadas a três arquivos de 512 KB e expostas somente pelo BFF autenticado. Conversas aceitam uma imagem append-only de 512 KB por mensagem, visível somente aos dois membros, e auditam envio e download sem expor a chave do objeto. Quarentena automatizada e antivírus continuam ausentes; portanto somente arquivos sintéticos são permitidos. Em produção, anexos maiores devem usar upload direto assinado ao object storage, sem atravessar o limite de corpo da borda.

A captura pública de indicação aceita apenas códigos ativos pelo BFF assinado, usa RLS limitado ao link validado, exige consentimento, aplica honeypot, tamanho máximo de corpo, limite temporal e unicidade de e-mail por rede. Chamadas diretas à API sem o canal interno são rejeitadas; o piloto ainda precisa de proteção distribuída de borda antes de exposição em produção.

A atividade administrativa é somente leitura e exclusiva da Operação. O backend transforma cada evento em uma projeção conhecida antes de responder: ação, categoria, referência opaca, responsável e horário. O payload JSON, UUID interno da entidade, hashes e metadados técnicos não são enviados ao navegador. Outros perfis são bloqueados no BFF e pelo RLS do PostgreSQL.

A gestão do catálogo exige sessão operacional no BFF e no RLS. O runtime concede atualização apenas de `active`, `sort_order` e `updated_at`; cada ação registra justificativa em `service_category_events` e projeção em `audit_events`. Uma constraint mantém a ordem positiva e única, e um trigger impede que a última categoria ativa seja desativada. Categorias inativas são excluídas somente de novas contratações e indicações, preservando evidências históricas.

A central de atendimento da rede usa tabelas próprias para não transformar notas internas de cancelamento em comunicação externa. O parceiro pode criar casos apenas para si, vincular somente indicações da própria rede e inserir mensagens em casos não resolvidos. A Operação lê a fila completa, responde e executa somente as transições `open → in_review → resolved`, sempre com justificativa registrada em evento e auditoria. A atribuição aceita somente usuários com papel operacional; a prioridade pode subir de normal para alta, mas não voltar enquanto o caso está ativo. Os prazos de primeira resposta e resolução são persistidos com a versão da política, e o atraso é derivado sem permitir que uma reclassificação apague um vencimento ou estenda um prazo já cumprido. Cada triagem gera evento append-only e auditoria. A identidade nominal da equipe é projetada como “Equipe Max” para o parceiro, evitando ampliar a política de leitura da tabela de usuários.
