# LGPD por padrão

## Princípios

Finalidade explícita, minimização, transparência, acesso restrito, retenção definida, segurança, responsabilização e atendimento dos direitos do titular.

## Inventário inicial

| Dado | Finalidade | Acesso | Direção de retenção |
|---|---|---|---|
| conta e contato | autenticação e comunicação | titular/suporte mínimo | enquanto ativo + prazo de defesa |
| localização | combinar oferta e demanda | partes no momento necessário | granularidade reduzida após encerramento |
| documentos | verificação manual | moderação autorizada | prazo legal/operacional definido |
| chat | execução e disputa | membros; suporte por caso | janela contratual aprovada |
| atendimento do parceiro | suporte da rede e esclarecimento de indicações | parceiro titular; Operação autorizada | janela contratual e de defesa aprovada |
| pagamento | cobrança/reconciliação | financeiro mínimo | obrigação fiscal/contratual |
| auditoria | segurança e responsabilização | segurança/admin restrito | append-only com política específica |

## Direitos e ciclo de vida

- exportação estruturada;
- correção de dados de perfil;
- congelamento de conta;
- solicitação de exclusão com workflow;
- anonimização quando a retenção legal impedir exclusão física;
- revogação de consentimento sem apagar bases legais independentes;
- registro de cada solicitação e decisão.

No piloto, a captura pública de indicação guarda `consent_at` e `privacy_notice_version` junto ao interesse. O formulário informa a finalidade de contato, não cria conta definitiva, não coleta IP para atribuição e não autoriza score, crédito ou consulta automatizada de antecedentes.

O onboarding guarda cada aceite com usuário, versão, horário e SHA-256 do conteúdo vigente. Comunicação promocional e pesquisa de produto são finalidades opcionais e independentes: a recusa também gera evidência, e mudanças posteriores entram em histórico append-only sem reescrever o evento anterior. Os documentos `pilot-0.1` são minutas e não autorizam coleta de dados reais antes da aprovação jurídica.

Preferências de Web Push são controles de canal para comunicações transacionais e não ampliam consentimento promocional. O titular pode desativar assuntos, revogar cada aparelho ou configurar horário silencioso; a central interna preserva o histórico necessário à execução e ao suporte. Mudanças geram versão e evento append-only sem copiar endpoint ou chaves para a auditoria. E-mail e SMS continuam indisponíveis até que finalidade, provedor, confirmação de contato e retenção sejam aprovados.

A central do parceiro expõe à Operação apenas o contexto necessário ao atendimento. O vínculo com indicação é opcional e limitado à rede do próprio parceiro por RLS; mensagens, anexos, triagens e mudanças de estado são append-only. Os bytes dos anexos ficam no cofre privado e o banco guarda apenas nome normalizado, tipo, tamanho, hash, autoria e vínculo com o evento. Prioridade, responsável e prazos de SLA são metadados operacionais do atendimento, não produzem perfil de risco nem decisão automatizada sobre o titular. Antes de produção, a retenção do conteúdo e dos arquivos, o processo de exportação e a anonimização após o prazo de defesa precisam ser aprovados.

## Restrições

Não registrar senhas, tokens, documentos ou conteúdo sensível em logs. Não usar anexos reais como seed. Decisões automatizadas de risco ficam desativadas.
