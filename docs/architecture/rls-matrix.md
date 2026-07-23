# Matriz de RLS

Princípio: sem `app.actor_id` válido, dados privados retornam zero linhas. Operações privilegiadas usam papel explícito, escopo mínimo e auditoria.

A captura sem sessão usa o contexto restrito `public_referral`: ele consulta somente links ativos e, depois da validação do código, enxerga e inclui indicações apenas naquele `referral_link_id`. Não recebe acesso a usuários, finanças ou outras redes; a visibilidade pública histórica de perfis de prestador também exige agora um papel autenticado.

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
| eventos de revisão da indicação | nenhum | nenhum | nenhum | leitura e inclusão append-only | auditado |
| categorias de serviço | ativas para novos pedidos; histórico referenciado | ativas e histórico referenciado | ativas para indicar; histórico da rede | leitura completa e alteração justificada | auditado |
| eventos do catálogo | nenhum | nenhum | nenhum | leitura e inclusão append-only | auditado |
| campanhas | somente ativas e vigentes para validar cupom | nenhum | nenhum | leitura, criação e mudança justificada | auditado |
| reservas de campanha | somente as próprias | nenhum | nenhum | visão completa | auditado |
| conversa/mensagem | membro | membro | nenhum | apenas caso autorizado | excepcional e auditado |
| cursor de leitura da conversa | somente o próprio | somente o próprio | nenhum | nenhum no piloto | excepcional e auditado |
| anexo da conversa | membro | membro | nenhum | nenhum no piloto | excepcional e auditado |
| checklist de verificação | nenhum acesso | somente o próprio | nenhum | fila completa e decisão | excepcional e auditado |
| arquivos de verificação | nenhum | somente versões próprias | nenhum | todas as versões para revisão | excepcional e auditado |
| intents financeiros sandbox | próprios | próprios | somente rede atribuída | visão completa | auditado |
| alocações e ledger | cashback próprio | recebível próprio | comissão própria | visão completa e conciliação | auditado |
| auditoria | nenhum | nenhum | nenhum | trilha completa por projeção segura e somente leitura | explícito e somente leitura |

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
- contexto público sem link validado retorna zero indicações; consentimento ausente, código pausado, origem inválida e tentativa de gravar em outra rede são bloqueados;
- cliente não enxerga dados de indicação e prestador vê somente seu vínculo convertido;
- parceiro enxerga zero eventos internos e atualiza zero estados da triagem; somente a operação executa `invited → in_review → approved | rejected`;
- cliente, prestador e parceiro alteram zero categorias e enxergam zero eventos do catálogo; somente a operação ordena ou muda disponibilidade com justificativa;
- cliente valida apenas campanha ativa e vigente, reserva somente no próprio pedido e não ultrapassa os limites; prestador e parceiro recebem zero campanhas/reservas, e somente a operação cria ou muda estado;
- categoria desativada desaparece de novos pedidos, indicação manual e captura pública, sem ocultar pedidos ou indicações históricas;
- desativação repetida, movimento além dos limites da lista e tentativa de desativar a última categoria ativa são bloqueados;
- decisão sem análise, justificativa curta, repetição de estado e nova transição após decisão final são bloqueadas;
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
- somente o membro autenticado avança o próprio cursor de leitura; regressão, alteração do cursor da outra parte, parceiro e operação atualizam zero linhas;
- cliente, profissional e parceiro não enxergam as parcelas financeiras uns dos outros;
- somente a operação processa evento sandbox; alteração direta de intent por outro papel atualiza zero linhas;
- atividade operacional sem sessão recebe `401`; cliente, profissional e parceiro recebem `403` no BFF e zero linhas de auditoria pelo RLS;
- a projeção da atividade não retorna `payload`, UUID interno da entidade, hashes, nomes de objeto ou metadados técnicos dos arquivos;
- evento repetido não duplica transação ou ledger e assinatura inválida é rejeitada;
- sem hash de token, sessões retornam zero linhas; usuário/papel incompatível é rejeitado no insert;
- sessão revogada ou expirada retorna `401`; troca de perfil invalida o token anterior;
- BFF rejeita parâmetro de papel diferente da sessão e API rejeita cabeçalho de ator sem assinatura interna válida;
- query direta pela role de runtime continua sujeita a RLS;
- cada migration preserva policies e grants.
