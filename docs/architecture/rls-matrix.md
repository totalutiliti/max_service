# Matriz de RLS

Princípio: sem `app.actor_id` válido, dados privados retornam zero linhas. Operações privilegiadas usam papel explícito, escopo mínimo e auditoria.

| Recurso | Cliente | Prestador | Parceiro | Operação | Admin |
|---|---|---|---|---|---|
| sessão demonstrativa | somente token próprio | somente token próprio | somente token próprio | somente token próprio | nenhum acesso direto |
| perfil do cliente | próprio | nenhum | nenhum | caso autorizado | auditado |
| perfil do prestador | dados públicos; privado só quando necessário ao booking | próprio | afiliados, campos mínimos | moderação | auditado |
| solicitação | própria | oportunidade elegível sem PII excessiva | nenhum | caso autorizado | auditado |
| imagens da solicitação | somente próprias | oportunidade elegível; após aceite, somente contratado | nenhum | caso autorizado | auditado |
| proposta | das próprias solicitações | própria | nenhum | suporte/disputa | auditado |
| booking | próprio | próprio | afiliado sem chat/PII | suporte/disputa | auditado |
| cancelamento | solicita e consulta no booking próprio | solicita e consulta no booking próprio | nenhum | consulta operacional | auditado |
| chamado operacional | consulta estado dos próprios | consulta estado dos próprios | nenhum | fila completa e tratamento | auditado |
| notas/eventos internos | nenhum | nenhum | nenhum | leitura e inclusão append-only | auditado |
| notificações | somente próprias | somente próprias | somente próprias | somente próprias | auditado |
| indicações | nenhum | somente o próprio vínculo | somente a própria rede | visão completa | auditado |
| conversa/mensagem | membro | membro | nenhum | apenas caso autorizado | excepcional e auditado |
| anexo da conversa | membro | membro | nenhum | nenhum no piloto | excepcional e auditado |
| checklist de verificação | nenhum acesso | somente o próprio | nenhum | fila completa e decisão | excepcional e auditado |
| arquivos de verificação | nenhum | somente versões próprias | nenhum | todas as versões para revisão | excepcional e auditado |
| intents financeiros sandbox | próprios | próprios | somente rede atribuída | visão completa | auditado |
| alocações e ledger | cashback próprio | recebível próprio | comissão própria | visão completa e conciliação | auditado |
| auditoria | nenhum | nenhum | nenhum | recorte funcional | explícito e somente leitura |

## Contexto seguro de conexão

1. iniciar transação;
2. validar claims de sessão no backend;
3. `set_config('app.actor_id', ..., true)` e `set_config('app.actor_role', ..., true)`;
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
- parceiro não consulta nem registra convite na rede de outro parceiro;
- cliente não enxerga dados de indicação e prestador vê somente seu vínculo convertido;
- prestador consulta somente a própria verificação e não altera decisões ou itens;
- cliente e parceiro não consultam verificações; apenas a operação revisa itens e muda estados;
- aprovação com item pendente e correção sem item marcado são bloqueadas;
- profissional não associa arquivo à verificação de outro; cliente e parceiro enxergam zero metadados;
- bucket anônimo retorna `403`; downloads do profissional e da operação validam tamanho/hash e geram auditoria;
- cliente anexa somente ao próprio pedido aberto; quarta imagem, assinatura inválida e excesso de 512 KB são bloqueados;
- após o booking, prestador não contratado, parceiro e conexão sem contexto retornam zero imagens do pedido;
- anexo da conversa é listado e baixado pelos dois membros; parceiro, operação, não membro e conexão sem contexto recebem zero linhas;
- arquivo com assinatura adulterada, MIME fora da allowlist ou mais de 512 KB é rejeitado antes da persistência;
- cursor inexistente, malformado ou pertencente a outra conversa é rejeitado sem revelar mensagens e sem alterar a sessão;
- cliente, profissional e parceiro não enxergam as parcelas financeiras uns dos outros;
- somente a operação processa evento sandbox; alteração direta de intent por outro papel atualiza zero linhas;
- evento repetido não duplica transação ou ledger e assinatura inválida é rejeitada;
- sem hash de token, sessões retornam zero linhas; usuário/papel incompatível é rejeitado no insert;
- sessão revogada ou expirada retorna `401`; troca de perfil invalida o token anterior;
- BFF rejeita parâmetro de papel diferente da sessão e API rejeita cabeçalho de ator sem assinatura interna válida;
- query direta pela role de runtime continua sujeita a RLS;
- cada migration preserva policies e grants.
