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

## Restrições

Não registrar senhas, tokens, documentos ou conteúdo sensível em logs. Não usar anexos reais como seed. Decisões automatizadas de risco ficam desativadas.
