# Segurança de pagamentos

## Modelo

PSP autorizado processa e mantém os recursos. A Max Service armazena referências, estados, valores, regra aplicada e ledger de obrigações; não oferece conta ou saldo sacável.

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

## Regra de demonstração

Plataforma 12%, parceiro 2% e cashback 2%, total 16%. É hipótese comercial versionada e pendente; taxa PSP, impostos e arredondamento permanecem explícitos.

## Proibições

Conta bancária da empresa como carteira, PIX direto da Max Service, custódia, investimento do cashback, empréstimos e antecipação sem parceiro e aprovação regulatória.
