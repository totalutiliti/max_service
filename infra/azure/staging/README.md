# Azure staging — somente plano

Este diretório descreve um staging sintético e isolado. Nenhum arquivo oferece um comando
de deploy. `plan-staging.ps1` chama exclusivamente `az deployment sub what-if`, valida a
assinatura ativa, exige commit imutável e falha quando o worktree não está limpo.

## Arquivos

- `main.bicep`: composição de resource group, rede, ACR, Container Apps, stateful,
  Private Endpoints, jobs e runtime condicional;
- `network.bicep`: VNet, subnets e DNS privado;
- `private-endpoints.bicep`: ACR, Redis, Key Vault e Azure Files;
- `staging.parameters.json`: valores não secretos e flags bloqueadas;
- `plan-staging.ps1`: build e what-if fail-closed.

O runtime completo aparece no what-if apenas com `-IncludeRuntime`. A flag nunca autoriza
deploy. Em uma implantação futura e explicitamente autorizada, o job de migration deve
terminar com sucesso antes de aplicar o módulo runtime separadamente.

## Validação local sem Azure

```powershell
az bicep build --file infra/azure/staging/main.bicep --stdout | Out-Null
```

## What-if futuro

Exige login Azure somente leitura/what-if, assinatura explícita e object ID do principal.
Os segredos usados no cálculo são aleatórios, efêmeros e nunca são gravados.

```powershell
.\infra\azure\staging\plan-staging.ps1 `
  -ImageTag <commit-git> `
  -DeployerObjectId <object-id> `
  -DeployerPrincipalType User `
  -ExpectedSubscriptionId <subscription-id> `
  -IncludeRuntime
```

Não use `-AllowDirtyWorktree` no CI ou em uma evidência formal. A criação da identidade
OIDC é uma etapa administrativa separada; `-IncludeGitHubIdentity` apenas mostra seu diff.

Consulte `docs/operations/azure-staging-readiness.md` para custos, alternativas,
destruição, restore, RPO/RTO, HA, rollback, incidentes e decisões bloqueadas.
