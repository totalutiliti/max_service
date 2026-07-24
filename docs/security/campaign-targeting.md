# Campanhas consentidas e monitoramento

## Escopo materializado

Campanhas podem ser gerais ou limitadas a uma categoria e/ou região ativas. O modo `contextual` compara somente os campos do pedido atual e não usa histórico comportamental. O modo `consented` aplica os mesmos critérios e também exige a preferência vigente `marketing_communications`.

A validação prévia recebe categoria e região selecionadas. A reserva revalida esses critérios no servidor usando a solicitação já persistida, sob o mesmo commit, e grava um snapshot de elegibilidade junto à regra financeira congelada.

## Minimização e contenção

`campaign_validation_attempts` guarda:

- identificador interno do cliente e da campanha, quando encontrada;
- SHA-256 normalizado do código, nunca o código digitado;
- categoria e região usadas na validação;
- resultado em vocabulário fechado e instante.

O cliente não lê eventos brutos. Uma função `SECURITY DEFINER` de escopo mínimo retorna somente suas contagens recentes depois de conferir `app.actor_id` e `app.actor_role`. Dez recusas em quinze minutos provocam contenção temporária `429`; o middleware geral continua aplicando o limite de 30 validações por minuto por cliente.

## Relatório operacional

A Operação recebe contagens das últimas 24 horas: tentativas, recusas, contenções e contas que atingiram critérios de revisão. Cada campanha informa conversão, recusas por consentimento, incompatibilidade de público e nível `low`, `attention` ou `high`.

Esses níveis priorizam revisão e não pausam campanha, suspendem conta, negam serviço ou produzem decisão individual automática. Códigos, contatos e identificadores de cliente não são devolvidos pela API nem exibidos no painel.

## Limites antes de produção

Os limiares atuais são conservadores e baseados apenas no piloto sintético. Produção exige evidência real para calibrar janelas, retenção aprovada, alertas, runbook, contestação e revisão jurídica da finalidade promocional. Publicidade comportamental continua fora do escopo.
