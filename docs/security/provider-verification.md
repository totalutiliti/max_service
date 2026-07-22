# Verificação de prestadores

## Estados

`DRAFT → INCOMPLETE → SUBMITTED → IN_REVIEW → PENDING → APPROVED | APPROVED_RESTRICTED | REJECTED → SUSPENDED | BLOCKED`.

Toda mudança registra ator, timestamp, motivo estruturado, observação protegida, evidência, validade e versão da política. Histórico não é sobrescrito.

## MVP

- validação sintática de CPF sem persistir valor em log;
- confirmação de e-mail/telefone;
- upload privado de documentos;
- revisão humana por pessoa autorizada;
- pendência com solicitação de correção;
- validade e reavaliação;
- suspensão separada de rejeição.

## Fora do MVP

Consulta criminal/civil, protestos, score financeiro, biometria, reconhecimento facial e aprovação automática. Interfaces futuras devem permanecer atrás de feature flag desligada e adaptadores fake.

## Salvaguardas

Critérios objetivos, possibilidade de contestação, minimização, segregação do revisor, dupla confirmação para bloqueio, monitoramento de viés e revisão jurídica de cada fornecedor.
