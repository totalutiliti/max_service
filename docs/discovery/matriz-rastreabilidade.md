# Matriz de rastreabilidade

Status: **hipótese** precisa de validação; **aprovado para protótipo** orienta somente a demonstração; **gate** impede ativação.

| ID | Origem | Requisito | Ator | Criticidade | Dependências | Riscos | Status | Decisão proposta | Fase | Critério de aceite |
|---|---|---|---|---|---|---|---|---|---|---|
| R01 | F01/F03/F09 | cadastro e confirmação de contato | cliente/prestador | alta | provedor substituível | fraude, enumeração | aprovado para protótipo | e-mail/telefone abstraído | 1-2 | confirmação expira e não revela contas |
| R02 | F01/F09 | aceite versionado | todos | alta | termos aprovados | consentimento inválido | hipótese | registrar versão, finalidade e data | 1 | histórico reproduzível |
| R03 | F01/F03/F09 | catálogo e busca regional | cliente | alta | categorias/regiões | excesso de escopo | aprovado para protótipo | seis categorias piloto | 2-3 | filtra por categoria e região |
| R04 | F03/F09 | solicitação com fotos e disponibilidade | cliente | alta | storage privado | malware, exposição | hipótese | upload privado, MIME/tamanho e AV futuro | 3 | arquivo não é público por padrão |
| R05 | F03/F09 | propostas comparáveis | cliente/prestador | alta | solicitação elegível | vazamento/IDOR | aprovado para protótipo | ownership no backend | 3 | usuário alheio recebe 404/403 |
| R06 | F03/F09 | chat vinculado à solicitação | cliente/prestador | alta | autorização, moderação | assédio, PII | hipótese | conversa somente entre membros | 3 | mensagem auditável e isolada |
| R07 | F01/F09 | agendamento e estados | ambos | alta | máquina de estados | disputa de status | hipótese | transições explícitas e históricas | 3 | transição inválida é rejeitada |
| R08 | F01/F03 | verificação de prestador | operação | crítica | documentos, política | discriminação, LGPD | gate | manual no MVP | 3-4 | decisão tem motivo e revisor |
| R09 | F02/F03/F09 | comissão configurável | financeiro | crítica | regra vigente | cobrança errada | hipótese | 12/2/2 como seed não aprovado | 5 | cálculo usa versão da regra |
| R10 | F03/F09 | PSP marketplace e split | financeiro | crítica | contrato PSP | regulação, duplicidade | gate | adaptador sandbox primeiro | 5 | webhook assinado e idempotente |
| R11 | F02/F03/F09 | cashback | cliente | alta | ledger e regra | parecer carteira | gate | obrigação promocional não sacável | 5 | sem saldo bancário fictício |
| R12 | F03/F09 | indicação por QR/link | parceiro | média | atribuição antifraude | autoindicação | aprovado para protótipo | primeira atribuição auditável | 4 | origem e vigência registradas |
| R13 | F01/F09 | painel parceiro | parceiro | média | afiliados/comissões | acesso cruzado | hipótese | visão somente dos atribuídos | 4 | RLS bloqueia não afiliados |
| R14 | F01/F09 | administração | operação/admin | alta | RBAC/auditoria | abuso interno | hipótese | permissão, justificativa e confirmação | 4 | antes/depois registrados |
| R15 | F01/F03 | anúncios segmentados | anunciante | baixa no MVP | política/consentimento | rastreamento indevido | P1 | sem publicidade comportamental no P0 | 4+ | segmentação aprovada e transparente |
| R16 | F03 | apps Android/iOS | todos | média | API/PWA | custo/dispersão | P1/P2 | PWA antes de lojas | 6+ | jornada web validada no piloto |
| R17 | F01/F03/F09 | biometria, antecedentes e crédito | prestador | crítica | gates jurídicos | dano, discriminação, regulação | fora do MVP | interfaces desativadas | futuro | feature flag inacessível em produção |
