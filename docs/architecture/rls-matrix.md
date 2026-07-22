# Matriz de RLS

Princípio: sem `app.user_id` válido, dados privados retornam zero linhas. Operações privilegiadas usam papel explícito, escopo mínimo e auditoria.

| Recurso | Cliente | Prestador | Parceiro | Operação | Admin |
|---|---|---|---|---|---|
| perfil do cliente | próprio | nenhum | nenhum | caso autorizado | auditado |
| perfil do prestador | dados públicos; privado só quando necessário ao booking | próprio | afiliados, campos mínimos | moderação | auditado |
| solicitação | própria | oportunidade elegível sem PII excessiva | nenhum | caso autorizado | auditado |
| proposta | das próprias solicitações | própria | nenhum | suporte/disputa | auditado |
| booking | próprio | próprio | afiliado sem chat/PII | suporte/disputa | auditado |
| cancelamento | solicita e consulta no booking próprio | solicita e consulta no booking próprio | nenhum | consulta operacional | auditado |
| chamado operacional | consulta estado dos próprios | consulta estado dos próprios | nenhum | fila completa e tratamento | auditado |
| notas/eventos internos | nenhum | nenhum | nenhum | leitura e inclusão append-only | auditado |
| notificações | somente próprias | somente próprias | somente próprias | somente próprias | auditado |
| conversa/mensagem | membro | membro | nenhum | apenas caso autorizado | excepcional e auditado |
| documentos | nenhum acesso direto | próprios | nenhum | fila de moderação | excepcional |
| afiliados/comissões | nenhum | própria atribuição | somente atribuídos | financeiro | auditado |
| pagamentos/cashback | próprios | recebíveis próprios | comissões próprias | financeiro | auditado |
| auditoria | nenhum | nenhum | nenhum | recorte funcional | explícito e somente leitura |

## Contexto seguro de conexão

1. iniciar transação;
2. validar claims de sessão no backend;
3. `set_config('app.user_id', ..., true)` e papéis normalizados;
4. executar todas as queries dentro da mesma transação;
5. encerrar; `SET LOCAL` impede vazamento no pool.

## Testes obrigatórios

- cliente A não lê/altera cliente B;
- prestador A não vê proposta/documento de B;
- parceiro não vê prestador não afiliado;
- troca de UUID não produz IDOR;
- conexão reaproveitada sem contexto retorna zero linhas;
- transação sem contexto falha fechada;
- endpoint administrativo sem papel é bloqueado;
- cancelamento duplicado ou posterior à conclusão é bloqueado;
- parceiro não abre chamado e a operação enxerga a fila sem obter acesso de escrita transacional;
- notas internas de chamados retornam zero linhas para cliente, prestador e parceiro;
- chamado resolvido bloqueia novas notas e transições duplicadas;
- destinatário não lê nem marca notificação de outro usuário;
- emissão transacional exige vínculo comprovado com a entidade de origem;
- query direta pela role de runtime continua sujeita a RLS;
- cada migration preserva policies e grants.
