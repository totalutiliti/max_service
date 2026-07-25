# Pedido de integração — identidade de produção

**Destino:** trilha de integração/infraestrutura.

**Estado:** aguardando decisão do ADR 0005. Não aplicar valores reais ou habilitar a
feature antes da homologação.

## Configuração e segredos

Provisionar por ambiente, em cofre e sem valores no repositório:

- `PRODUCTION_IDENTITY_ENABLED`;
- `IDENTITY_PROVIDER_MODE`;
- `IDENTITY_SESSION_ABSOLUTE_MINUTES`;
- `IDENTITY_SESSION_IDLE_MINUTES`;
- `IDENTITY_SESSION_ROTATION_MINUTES`;
- `IDENTITY_SUBJECT_DIGEST_SECRET`, aleatório, rotacionável e com pelo menos 256 bits;
- parâmetros e segredos específicos do adaptador escolhido;
- pepper de credencial somente se a decisão for credencial local.

Staging deve começar com `DEMO_MODE=false` e
`PRODUCTION_IDENTITY_ENABLED=false`. Produção deve falhar fechado se o cofre, o
adaptador ou sua configuração não estiverem disponíveis.

## Trabalho solicitado à integração

- distribuir os valores via Key Vault/identidade gerenciada, nunca como conteúdo de
  workflow ou artefato;
- separar credenciais de migration e runtime, mantendo a role runtime sem
  `BYPASSRLS`;
- executar a migration `0057` pelo executor já existente e validar checksum;
- incluir os testes de identidade com PostgreSQL real no gate de staging;
- validar cookie `__Host-` atrás do proxy HTTPS real;
- implementar proteção distribuída por IP/conta na borda, sem depender de memória
  local;
- expor prontidão do adaptador por verificação real, não somente pela presença de
  flags;
- manter um kill switch que desabilite emissão, sem impedir revogação e investigação;
- documentar rotação de secrets, indisponibilidade do IdP e revogação emergencial.

## Observabilidade solicitada

Atualizar a observabilidade central, fora desta trilha, com métricas agregadas para:

- sucessos, falhas e bloqueios de autenticação;
- latência e indisponibilidade do adaptador;
- desafios criados, concluídos e expirados;
- MFA exigido, concluído e rejeitado;
- sessões emitidas, rotacionadas e revogadas;
- detecção de reuso e revogação de família;
- crescimento anormal de lockouts.

Não incluir e-mail, telefone, subject, token, cookie, `Authorization`, IP bruto ou
user-agent bruto em logs, métricas ou traces. Alertas devem apontar para runbooks e
usar identificadores técnicos pseudonimizados.

## Critérios de aceite da integração

- configuração inválida mantém a emissão indisponível;
- segredos não aparecem em repositório, logs, histórico do deployment ou saída de CI;
- staging comprova migration, RLS, rotação/reuso, MFA de Operação e revogação global;
- rollback/kill switch e resposta a incidente são ensaiados;
- Segurança e Operação aprovam as evidências antes de ativar a feature.
