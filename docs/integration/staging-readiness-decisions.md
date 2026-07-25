# Solicitações de integração — staging

Origem: Trilha C
Baseline: `ba87426710b2c001b6931be04816c02a783a1dab`
Status: nenhuma solicitação abaixo está aprovada por este documento.

| ID | Decisão/entrada necessária | Responsável | Dependência técnica | Default seguro enquanto bloqueada |
|---|---|---|---|---|
| STG-001 | teto mensal e thresholds de budget | Financeiro/Produto | budget e alertas de custo | budget não criado |
| STG-002 | e-mails/webhooks, escala e SLA | Operação | Action Group e alertas externos | nenhum destinatário inventado |
| STG-003 | domínio, DNS, certificado e HSTS | Marca/Segurança | Front Door/WAF, `APP_ORIGIN`, CORS e cookies | domínio HTTPS gerenciado, dados sintéticos |
| STG-004 | Front Door Premium/WAF ou alternativa | Segurança/Financeiro | origem privada e proteção de borda | edge não criado |
| STG-005 | CIDRs e conectividade corporativa | Infraestrutura/Segurança | VNet/subnets/peering/VPN | CIDR isolado `10.40.0.0/16`, sem peering |
| STG-006 | RPO/RTO e retenções | Negócio/Jurídico/Infraestrutura | backup, PITR e alertas | metas apenas propostas |
| STG-007 | HA e desastre regional | Negócio/Financeiro | SKUs zonais e região secundária | HA zonal aparece no plano; sem região secundária |
| STG-008 | aprovadores e variáveis do environment `azure-staging` | Engenharia/Operação | workflow OIDC de what-if | workflow falha fechado |
| STG-009 | secrets/jobs/volumes da quarentena | Trilha B | módulo stateful/runtime | nenhuma alteração de upload |
| STG-010 | sequência final de migrations | Trilha A | job de migration antes do runtime | runtime condicional e plan-only |
| STG-011 | coletor OpenMetrics/traces gerenciado | Observabilidade/Segurança | rede privada, token e retenção | Log Analytics; coletor externo pendente |
| STG-012 | estratégia do object storage para produção | Arquitetura/Segurança | MinIO/Azure Files versus serviço S3 compatível | padrão existente preservado; sem troca silenciosa |

## Entregas esperadas das outras trilhas

### Trilha A

- informar o commit integrado em `dev`;
- confirmar última migration, checksums e comando de dry-run;
- fornecer critérios de MFA/sessão que gerem secrets ou callbacks de infraestrutura;
- não solicitar deploy antes da prova de upgrade e criação limpa.

### Trilha B

- registrar interfaces de scanner, portas, probes, filas, secrets e volumes necessários;
- informar retenção por estado e carga estimada;
- manter schema apenas como proposta até a integração da Trilha A;
- não pressupor storage público ou fallback quando o scanner estiver indisponível.

### Trilha D

- validar que o what-if não abre endpoints stateful;
- confirmar que API permanece interna e que logs/metrics não contêm PII;
- revisar RBAC, bypass de RLS, backup versus PITR e evidência de alertas;
- registrar gate como parcial até restore e notificação externa serem observados.

## Critério para desbloquear o primeiro what-if remoto

- environment `azure-staging` criado e protegido;
- identidade federada exclusiva criada por administrador;
- `AZURE_PRINCIPAL_OBJECT_ID` preenchido;
- permissão mínima para build/what-if revisada;
- branch/commit aprovados e worktree limpo;
- nenhum domínio, contato ou budget fictício;
- confirmação explícita de que what-if não autoriza criação.
