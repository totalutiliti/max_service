# Evidência do Azure dev

Registro da implantação inicial concluída em `2026-07-25T17:09:29-03:00`.

## Escopo

- assinatura e resource group isolados para a Max Service;
- resource group `rg-max-service-dev`;
- região `Brazil South`;
- tags `environment=dev`, `project=max-service` e `data=synthetic-only`;
- infraestrutura versionada no commit `d61ed6d714639fafc1681f069e6844a1b51456c7`;
- imagens imutáveis `max-service-api:f6a6e88d7e44` e `max-service-web:f6a6e88d7e44`.

Os commits posteriores à imagem corrigiram somente o fluxo Bicep/PowerShell; não alteraram o código executável da API ou do web.

## Recursos confirmados

- ACR `acrmaxservicedev2026`;
- identidade gerenciada `id-max-service-dev`;
- Log Analytics `log-max-service-dev`;
- Container Apps Environment `cae-max-service-dev`;
- PostgreSQL Flexible Server `psql-max-service-dev-26`;
- Redis Enterprise `redis-max-service-dev-26`;
- Key Vault `kvmaxservicedev2026`;
- storage account `stmaxservicedev26`;
- Container Apps de storage, API e web;
- job manual de migration e job diário de reconciliação do cofre.

## Gates executados

- Bicep compilado para os cinco templates;
- lint, build, testes unitários e scanner de segredos aprovados;
- imagens API e web construídas remotamente no ACR;
- migration `job-max-service-migrate-dev-pwbsjk7` concluída com `Succeeded`;
- camada stateful reaproveitada sem rotação de segredos durante a conclusão;
- `GET /health/ready` da API respondeu HTTP `200`;
- `GET /demo` do web respondeu HTTP `200`.

## Endpoints

- web: <https://ca-max-service-web-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io/demo>;
- API: <https://ca-max-service-api-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io>;
- readiness: <https://ca-max-service-api-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io/health/ready>.

## Limites

O ambiente continua com `productionAuthorized: false`. Ele não recebe dados pessoais, documentos reais, pagamentos reais ou integrações externas. VNet/private endpoints, HA, proteção de borda, alertas externos, orçamento, restauração periódica gerenciada e homologação jurídica/operacional permanecem gates obrigatórios antes de staging ou produção.
