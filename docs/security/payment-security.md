# Segurança de pagamentos

## Modelo

PSP autorizado processa e mantém os recursos. A Max Service armazena referências, estados, valores, regra aplicada e ledger de obrigações; não oferece conta ou saldo sacável.

No piloto local não existe PSP. O adaptador sandbox recebe somente `settlement` e `refund`, com assinatura HMAC, janela de cinco minutos e chave idempotente. O valor é sempre comparado ao snapshot criado no aceite da proposta.

## Controles

- menor escopo possível de PCI; nenhum dado completo de cartão;
- intent criada no servidor e ligada ao booking;
- moeda e valor recalculados no backend;
- idempotency key única por operação;
- webhook com assinatura, timestamp e proteção contra replay;
- evento bruto preservado com acesso restrito e redaction;
- transição de pagamento monotônica;
- constraints contra comissão/cashback duplicados;
- estorno gera novos lançamentos, nunca edição retroativa;
- reconciliação periódica com o PSP;
- divergência abre caso operacional, não é corrigida silenciosamente.

## Implementado no sandbox local

- `commercial_rules` mantém a versão aplicada e percentuais em basis points;
- cada booking cria um `payment_intent` e quatro `payment_allocations` quando existe parceiro atribuído;
- autorização, liquidação e estorno são eventos append-only em `payment_transactions`;
- liquidação gera créditos e estorno posterior gera débitos em `financial_ledger_entries`;
- a soma das alocações deve fechar o valor bruto; diferenças cancelam a transação;
- RLS limita cliente ao cashback, profissional ao recebível, parceiro à comissão atribuída e operação à visão de conciliação;
- a chave HMAC do Docker é local e não representa credencial de produção.

Payload bruto de PSP, rotação de chaves, reconciliação externa, chargeback, disputa e retenção fiscal permanecem fora do piloto até a escolha de um provedor autorizado.

## Regra de demonstração

Plataforma 12%, parceiro 2% e cashback 2%, total 16%. É hipótese comercial versionada e pendente; taxa PSP, impostos e arredondamento permanecem explícitos.

## Proibições

Conta bancária da empresa como carteira, PIX direto da Max Service, custódia, investimento do cashback, empréstimos e antecipação sem parceiro e aprovação regulatória.
