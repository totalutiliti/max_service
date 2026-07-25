# Azure dev da Max Service

Este diretório materializa somente o ambiente compartilhado de desenvolvimento, em `Brazil South`, com dados sintéticos e `productionAuthorized: false`.

## Recursos

- resource group `rg-max-service-dev`;
- ACR Basic com imagens imutáveis por commit;
- identidade gerenciada para ACR e Key Vault;
- Log Analytics e Azure Container Apps;
- PostgreSQL Flexible Server 16 Burstable, backup de sete dias e sem HA;
- Azure Managed Redis B0, TLS e sem HA;
- Key Vault com RBAC, soft delete e purge protection;
- Azure Files e MinIO interno para o contrato S3 privado;
- job manual de migrations e rotação da role RLS;
- API com uma réplica, web com scale-to-zero e reconciliação diária do cofre.

PostgreSQL e Redis usam endpoints públicos gerenciados com TLS e aceitam conexões originadas por serviços Azure. Isso é um compromisso explícito de `dev`; staging e produção exigem VNet, private endpoints, HA, capacidade, retenção e custos homologados.

## Segurança do fluxo

`deploy-dev.ps1` exige worktree limpo, usa a tag imutável do commit, cria segredos aleatórios diretamente nos parâmetros seguros do Azure e nunca grava seus valores no repositório. Se os recursos stateful já existirem, o script os preserva e não rotaciona credenciais silenciosamente.

A API pública recebe apenas a URL da role `max_service_app`, sem `BYPASSRLS`. O job de migration recebe temporariamente a conexão administrativa e prepara a role antes de aplicar as migrations sob advisory lock. O runtime só muda depois que o job termina com sucesso.

## Validação

```powershell
az bicep build --file infra/azure/registry.bicep
az bicep build --file infra/azure/foundation.bicep
az bicep build --file infra/azure/stateful.bicep
az bicep build --file infra/azure/bootstrap.bicep
az bicep build --file infra/azure/runtime.bicep
```

Prévia sem criar runtime/stateful:

```powershell
.\infra\azure\deploy-dev.ps1 -WhatIf
```

Implantação do commit atual:

```powershell
.\infra\azure\deploy-dev.ps1
```

`-SkipBuild -ImageTag <commit>` só deve ser usado quando as duas imagens imutáveis já existirem no ACR.

Endpoints estáveis do ambiente:

- web: <https://ca-max-service-web-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io/demo>;
- readiness da API: <https://ca-max-service-api-dev.braveforest-c1671597.brazilsouth.azurecontainerapps.io/health/ready>.

O script tolera a propagação transitória da identidade do Container Apps, mas repete somente deployments que falham explicitamente com `IdentityDoesNotExist`. Outros erros continuam fail-closed.

## Limites

Este ambiente não autoriza dados pessoais ou documentos reais, pagamentos reais, e-mail/SMS, integrações externas, domínio final ou produção. Alertmanager/plantão, observabilidade gerenciada, restore periódico, orçamento e alertas de custo permanecem requisitos de operação.
