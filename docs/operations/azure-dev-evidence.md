# Evidência do Azure dev

Registro da implantação inicial concluída em `2026-07-25T17:09:29-03:00`, da validação funcional em `2026-07-25T17:23:57-03:00` e do primeiro deploy OIDC aprovado em `2026-07-25T17:45:56-03:00`.

## Escopo

- assinatura e resource group isolados para a Max Service;
- resource group `rg-max-service-dev`;
- região `Brazil South`;
- tags `environment=dev`, `project=max-service` e `data=synthetic-only`;
- código e infraestrutura implantados no commit `02676fd51cee`;
- imagens imutáveis `max-service-api:02676fd51cee` e `max-service-web:02676fd51cee`.

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
- job manual de migration e job diário de reconciliação do cofre;
- identidade de deploy `id-max-service-github-dev`, separada do runtime.

## Gates executados

- Bicep compilado para os seis templates;
- lint, build, testes unitários e scanner de segredos aprovados;
- imagens API e web construídas remotamente no ACR;
- migration `job-max-service-migrate-dev-molwsdz` concluída com `Succeeded`;
- camada stateful reaproveitada sem rotação de segredos durante a conclusão;
- revisões `ca-max-service-api-dev--02676fd51cee` e `ca-max-service-web-dev--02676fd51cee` confirmadas como `Running`;
- `GET /health/ready` da API respondeu HTTP `200`;
- `GET /demo` do web respondeu HTTP `200`;
- a entrada como Cliente criou uma sessão segura atrás do proxy Azure;
- o painel e a lista persistente **Meus pedidos** foram carregados no navegador;
- o navegador não registrou warnings ou erros após a jornada;
- o workflow [Deploy Azure dev #30173969310](https://github.com/totalutiliti/max_service/actions/runs/30173969310) concluiu checkout, OIDC, build, migration, runtime e smoke tests;
- o environment GitHub `azure-dev` aceita somente `main`, não guarda client secret e executa sem permissão para alterar RBAC.

## Endpoints

- web: <https://ca-max-service-web-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io/demo>;
- API: <https://ca-max-service-api-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io>;
- readiness: <https://ca-max-service-api-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io/health/ready>.

## Limites

O ambiente continua com `productionAuthorized: false`. Ele não recebe dados pessoais, documentos reais, pagamentos reais ou integrações externas. VNet/private endpoints, HA, proteção de borda, alertas externos, orçamento, restauração periódica gerenciada e homologação jurídica/operacional permanecem gates obrigatórios antes de staging ou produção.
