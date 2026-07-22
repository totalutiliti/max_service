# Verificação de prestadores

## Estados implementados no piloto local

`SUBMITTED → IN_REVIEW → APPROVED | CHANGES_REQUESTED`.

Toda mudança registra ator, timestamp, justificativa, estado anterior, estado posterior e versão da política. A decisão corrente fica em `provider_verifications`; o histórico em `provider_verification_events` é append-only. Uma aprovação só é aceita quando todos os itens estão conferidos. Uma solicitação de correção exige que ao menos um item tenha sido marcado para correção.

Os estados ampliados `DRAFT`, `INCOMPLETE`, `APPROVED_RESTRICTED`, `REJECTED`, `SUSPENDED` e `BLOCKED` pertencem à evolução pós-piloto e não devem ser simulados como funcionalidades prontas.

## MVP

- validação sintática de CPF sem persistir valor em log;
- confirmação de e-mail/telefone;
- checklist persistente de metadados documentais fictícios;
- upload de arquivos exclusivamente sintéticos em object storage privado local;
- PDF, JPEG e PNG até 2 MB, com validação conjunta de MIME, extensão e assinatura binária;
- versão append-only, nome normalizado, hash SHA-256 e download somente pelo BFF autenticado;
- revisão humana por pessoa autorizada;
- pendência com solicitação de correção;
- isolamento por RLS entre o profissional e a fila da operação;
- justificativa obrigatória e auditoria por ação.

Validade documental, reavaliação e suspensão separada de rejeição permanecem requisitos do MVP de produção. Antivírus, quarentena automatizada, criptografia gerenciada, retenção e eliminação segura ainda não estão implementados; por isso o piloto proíbe dados e documentos reais.

## Fora do MVP

Consulta criminal/civil, protestos, score financeiro, biometria, reconhecimento facial e aprovação automática. Interfaces futuras devem permanecer atrás de feature flag desligada e adaptadores fake.

## Salvaguardas

Critérios objetivos, possibilidade de contestação, minimização, segregação do revisor, dupla confirmação para bloqueio, monitoramento de viés e revisão jurídica de cada fornecedor. O PostgreSQL guarda apenas metadados, hash, propriedade e auditoria; os bytes ficam no cofre S3 privado. O piloto não deve receber CPF, número de documento, endereço, biometria ou qualquer dado pessoal real.
