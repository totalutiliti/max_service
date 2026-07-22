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
| scraping de contatos | minimização de PII e contato somente após regra de negócio |
| assédio no chat | denúncia, bloqueio, retenção definida e acesso de suporte por caso |

## Gates

Pagamento real, garantia, antecedentes, biometria, crédito e categorias reguladas exigem nova revisão de ameaça e aprovação jurídica antes de feature flag de produção.

## Situação do upload no piloto

O piloto implementa bucket privado, chave aleatória gerada pelo servidor, allowlist de tipo/extensão/assinatura, limite de 2 MB, hash de integridade, versionamento, autorização por sessão/RLS e auditoria. Quarentena automatizada e antivírus continuam ausentes; portanto somente arquivos sintéticos são permitidos.
