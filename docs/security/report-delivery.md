# Entregas consentidas de relatórios

## Escopo atual

A Operação pode criar recorrências semanais ou mensais para relatórios agregados de 7, 30 ou 90 dias. Cada registro exige nome e endereço sintéticos do destinatário, finalidade, primeira execução e confirmação explícita de consentimento. Pausar funciona como revogação operacional; reativar cria nova versão e evento justificado.

O ambiente atual não envia e-mail. `provider_mode` é limitado por constraint a `disabled_local`, e a interface identifica toda execução como simulação. Não existe cliente SMTP, webhook de entrega nem credencial de provedor no fluxo.

## Minimização e integridade

Uma simulação consulta o relatório operacional já autorizado e grava uma fotografia com:

- período e versão das metas;
- totais do funil, financeiro, crescimento, suporte e alertas;
- categorias por `slug` e série temporal agregada;
- SHA-256 canônico do snapshot.

UUIDs internos de categorias, nomes de usuários, contatos, descrições de pedidos e payloads de auditoria não entram na fotografia. O histórico de entrega recebe apenas máscara e SHA-256 do e-mail normalizado; o contato completo permanece somente no agendamento protegido pela Operação.

Criação, mudança de estado e simulação usam `Idempotency-Key`. A entrega, avanço da próxima execução, incremento da versão, evento append-only e auditoria são confirmados na mesma transação. Reenvio da mesma chave devolve a resposta persistida; conteúdo divergente retorna conflito.

## Autorização

`operation_report_delivery_schedules`, `operation_report_deliveries` e `operation_report_delivery_events` usam RLS forçado. Somente `app.actor_role = operation` lê as tabelas. Inclusões e atualizações também exigem que o ator gravado corresponda a `app.actor_id`. Cliente, prestador, parceiro, anunciante e conexão sem contexto recebem zero linhas.

## Gate para entrega externa

Antes de alterar `disabled_local`, são obrigatórios:

1. provedor contratado e homologado com segredos fora do banco e do repositório;
2. confirmação de posse do contato e política jurídica da finalidade;
3. cancelamento/opt-out efetivo e reconciliação de consentimento antes de cada claim;
4. tratamento de bounce, complaint, retentativa e supressão;
5. retenção, observabilidade e resposta a incidentes aprovadas;
6. testes de isolamento, duplicidade, indisponibilidade e recuperação;
7. nova migration e revisão formal do modelo de ameaça.
