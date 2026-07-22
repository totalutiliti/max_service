# ADR 0002 - Pagamentos por PSP

**Status:** aceito como direção; fornecedor pendente.

## Decisão

Processar pagamentos por instituição autorizada com recursos de marketplace/split. A Max Service mantém somente intents, transações, reconciliação e um ledger de obrigações.

## Consequências

Sem custódia, PIX próprio, conta de pagamento ou saldo bancário fictício. Todo webhook exige assinatura, timestamp, prevenção de replay, idempotência e reconciliação.
