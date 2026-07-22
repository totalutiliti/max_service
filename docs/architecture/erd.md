# ERD conceitual

```mermaid
erDiagram
  USERS ||--o| CUSTOMER_PROFILES : possui
  USERS ||--o| PROVIDER_PROFILES : possui
  USERS ||--o| PARTNER_PROFILES : possui
  USERS ||--o{ SESSIONS : abre
  USERS ||--o{ TERMS_ACCEPTANCES : aceita
  PROVIDER_PROFILES }o--o{ SERVICE_CATEGORIES : atende
  PROVIDER_PROFILES }o--o{ REGIONS : cobre
  CUSTOMER_PROFILES ||--o{ SERVICE_REQUESTS : cria
  SERVICE_REQUESTS ||--o{ SERVICE_REQUEST_ATTACHMENTS : inclui
  SERVICE_REQUESTS ||--o{ PROPOSALS : recebe
  PROVIDER_PROFILES ||--o{ PROPOSALS : envia
  PROPOSALS ||--o| BOOKINGS : origina
  BOOKINGS ||--o{ BOOKING_STATUS_HISTORY : registra
  BOOKINGS ||--o| BOOKING_CANCELLATIONS : cancela
  BOOKINGS ||--o| SUPPORT_CASES : abre
  USERS ||--o{ BOOKING_CANCELLATIONS : solicita
  USERS ||--o{ SUPPORT_CASES : comunica
  SUPPORT_CASES ||--o{ SUPPORT_CASE_EVENTS : registra
  USERS ||--o{ SUPPORT_CASE_EVENTS : executa
  USERS ||--o{ NOTIFICATIONS : recebe
  BOOKINGS ||--|| CONVERSATIONS : possui
  CONVERSATIONS ||--o{ CONVERSATION_MEMBERS : autoriza
  CONVERSATIONS ||--o{ MESSAGES : contém
  BOOKINGS ||--o{ SERVICE_REVIEWS : avalia
  USERS ||--o{ SERVICE_REVIEWS : escreve
  USERS ||--o| PARTNER_REFERRAL_LINKS : possui
  PARTNER_REFERRAL_LINKS ||--o{ PARTNER_REFERRALS : origina
  USERS o|--o| PARTNER_REFERRALS : converte
  BOOKINGS ||--o| PAYMENT_INTENTS : cobra
  COMMERCIAL_RULES ||--o{ PAYMENT_INTENTS : versiona
  PAYMENT_INTENTS ||--o{ PAYMENT_ALLOCATIONS : divide
  PAYMENT_INTENTS ||--o{ PAYMENT_TRANSACTIONS : movimenta
  PAYMENT_TRANSACTIONS ||--o{ FINANCIAL_LEDGER_ENTRIES : registra
  PAYMENT_ALLOCATIONS ||--o{ FINANCIAL_LEDGER_ENTRIES : reconhece
  USERS ||--o{ PAYMENT_ALLOCATIONS : recebe
  USERS ||--o{ FINANCIAL_LEDGER_ENTRIES : recebe
  USERS ||--o{ NOTIFICATIONS : recebe
  USERS ||--o{ AUDIT_EVENTS : atua
```

O núcleo transacional demonstrável está materializado em migrations versionadas. O financeiro ativo é exclusivamente sandbox; PSP, custódia e movimentação real permanecem ausentes.
