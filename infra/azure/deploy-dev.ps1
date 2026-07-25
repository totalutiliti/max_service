[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-max-service-dev',
  [string]$Location = 'brazilsouth',
  [string]$AcrName = 'acrmaxservicedev2026',
  [string]$ImageTag = '',
  [switch]$SkipBuild,
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Resolve-Path (Join-Path $scriptRoot '..\..')
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$sourceDirectory = Join-Path $temporaryRoot ("max-service-acr-source-" + [guid]::NewGuid().ToString('N'))
$sourceArchive = "$sourceDirectory.tar"

function Assert-LastExitCode([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw $Message }
}

function New-StrongSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  $hex = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
  return "Aa1!$hex"
}

function Invoke-AcrImageBuild([string]$ImageName, [string]$Dockerfile) {
  $previousErrorActionPreference = $ErrorActionPreference
  $queueExitCode = 1
  try {
    $ErrorActionPreference = 'Continue'
    $queueOutput = @(& az acr build `
        --registry $AcrName `
        --image $ImageName `
        --file $Dockerfile `
        --no-logs `
        --no-wait `
        $sourceDirectory 2>&1)
    $queueExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($queueExitCode -ne 0) { throw "Não foi possível enfileirar o build $ImageName." }
  $queueText = ($queueOutput | ForEach-Object { [string]$_ }) -join "`n"
  $runIdMatch = [regex]::Match($queueText, 'Queued a build with ID:\s*([A-Za-z0-9]+)')
  if (-not $runIdMatch.Success) { throw "O ACR não retornou o ID do build $ImageName." }
  $runId = $runIdMatch.Groups[1].Value
  $deadline = (Get-Date).AddMinutes(30)
  do {
    Start-Sleep -Seconds 10
    $status = [string](az acr task list-runs `
        --registry $AcrName `
        --top 20 `
        --query "[?runId=='$runId'].status | [0]" `
        --output tsv)
    Assert-LastExitCode "Não foi possível consultar o build $runId."
    $status = $status.Trim()
    Write-Host "ACR $ImageName ($runId): $status"
    if ($status -in @('Failed', 'Canceled', 'Error', 'Timeout')) {
      throw "O build $runId terminou com status $status."
    }
    if ((Get-Date) -gt $deadline) { throw "O build $runId excedeu 30 minutos." }
  } until ($status -eq 'Succeeded')
}

function Invoke-AzureDeploymentWithIdentityRetry(
  [string]$Name,
  [scriptblock]$Action
) {
  for ($attempt = 1; $attempt -le 3; $attempt += 1) {
    $previousErrorActionPreference = $ErrorActionPreference
    $exitCode = 1
    try {
      $ErrorActionPreference = 'Continue'
      $deploymentOutput = @(& $Action 2>&1)
      $exitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    $deploymentText = ($deploymentOutput | ForEach-Object { [string]$_ }) -join "`n"
    if ($exitCode -eq 0) { return $deploymentText }
    if ($deploymentText -notmatch 'IdentityDoesNotExist' -or $attempt -eq 3) {
      Write-Host $deploymentText
      throw "Falha no deployment Azure $Name."
    }
    Write-Host "Azure ainda propagando a identidade de $Name; nova tentativa $($attempt + 1)/3 em 30 segundos."
    Start-Sleep -Seconds 30
  }
}

function Test-StatefulEnvironment {
  $required = @(
    @{ Type = 'Microsoft.DBforPostgreSQL/flexibleServers'; Name = 'psql-max-service-dev-26' },
    @{ Type = 'Microsoft.Cache/redisEnterprise'; Name = 'redis-max-service-dev-26' },
    @{ Type = 'Microsoft.Storage/storageAccounts'; Name = 'stmaxservicedev26' },
    @{ Type = 'Microsoft.KeyVault/vaults'; Name = 'kvmaxservicedev2026' }
  )
  $inventoryJson = az resource list `
    --resource-group $ResourceGroup `
    --query '[].{type:type,name:name}' `
    --output json
  Assert-LastExitCode 'Não foi possível consultar os recursos stateful.'
  $inventory = @($inventoryJson | ConvertFrom-Json)
  $existingCount = 0
  foreach ($resource in $required) {
    $exists = $inventory | Where-Object {
      $_.type -ieq $resource.Type -and $_.name -ieq $resource.Name
    }
    if ($null -ne $exists) {
      $existingCount += 1
    }
  }
  if ($existingCount -eq 0) { return 'absent' }
  if ($existingCount -eq $required.Count) { return 'complete' }
  return 'partial'
}

Push-Location $repositoryRoot
try {
  az account show --output none
  Assert-LastExitCode 'Autenticação Azure CLI obrigatória.'
  if (-not [string]::IsNullOrWhiteSpace((git status --porcelain))) {
    throw 'O deploy exige um worktree limpo e já versionado.'
  }
  if ([string]::IsNullOrWhiteSpace($ImageTag)) {
    $ImageTag = (git rev-parse --short=12 HEAD).Trim()
    Assert-LastExitCode 'Não foi possível resolver o commit para a tag da imagem.'
  }
  if ($ImageTag -notmatch '^[a-f0-9]{7,40}$') {
    throw 'ImageTag deve ser um hash Git hexadecimal imutável.'
  }

  az group create `
    --name $ResourceGroup `
    --location $Location `
    --tags environment=dev project=max-service managed-by=bicep data=synthetic-only `
    --output none
  Assert-LastExitCode 'Falha ao criar ou atualizar o resource group.'

  if ($WhatIf) {
    $deploymentMode = 'what-if'
  }
  else {
    $deploymentMode = 'create'
  }
  az deployment group $deploymentMode `
    --resource-group $ResourceGroup `
    --name "registry-$ImageTag" `
    --template-file (Join-Path $scriptRoot 'registry.bicep') `
    --parameters location=$Location acrName=$AcrName `
    --output none
  Assert-LastExitCode 'Falha na definição do ACR.'

  az deployment group $deploymentMode `
    --resource-group $ResourceGroup `
    --name "foundation-$ImageTag" `
    --template-file (Join-Path $scriptRoot 'foundation.bicep') `
    --parameters location=$Location acrName=$AcrName `
    --output none
  Assert-LastExitCode 'Falha na fundação do Container Apps.'

  if ($WhatIf) {
    Write-Host 'WHAT-IF concluído para ACR e fundação. Recursos stateful exigem segredos efêmeros e são validados pelo Bicep/CI.'
    return
  }

  $statefulEnvironment = Test-StatefulEnvironment
  if ($statefulEnvironment -eq 'partial') {
    throw 'O conjunto stateful está incompleto. Corrija os recursos antes de continuar para evitar rotação parcial de segredos.'
  }
  if ($statefulEnvironment -eq 'absent') {
    $deployerObjectId = (az ad signed-in-user show --query id --output tsv).Trim()
    Assert-LastExitCode 'Não foi possível resolver o usuário implantador.'
    $postgresAdministratorPassword = New-StrongSecret
    $runtimeDatabasePassword = New-StrongSecret
    $bffInternalSecret = New-StrongSecret
    $rateLimitKeySecret = New-StrongSecret
    $financialSandboxSecret = New-StrongSecret
    $objectStorageAccessKey = 'maxsvc' + [guid]::NewGuid().ToString('N').Substring(0, 16)
    $objectStorageSecretKey = New-StrongSecret
    $metricsBearerToken = New-StrongSecret
    az deployment group create `
      --resource-group $ResourceGroup `
      --name "stateful-$ImageTag" `
      --template-file (Join-Path $scriptRoot 'stateful.bicep') `
      --parameters `
        location=$Location `
        deployerObjectId=$deployerObjectId `
        postgresAdministratorPassword=$postgresAdministratorPassword `
        runtimeDatabasePassword=$runtimeDatabasePassword `
        bffInternalSecret=$bffInternalSecret `
        rateLimitKeySecret=$rateLimitKeySecret `
        financialSandboxSecret=$financialSandboxSecret `
        objectStorageAccessKey=$objectStorageAccessKey `
        objectStorageSecretKey=$objectStorageSecretKey `
        metricsBearerToken=$metricsBearerToken `
      --output none
    Assert-LastExitCode 'Falha ao provisionar PostgreSQL, Redis, Key Vault ou storage.'
  }
  elseif ($statefulEnvironment -eq 'complete') {
    Write-Host 'Recursos stateful existentes preservados; nenhum segredo foi rotacionado.'
  }

  if (-not $SkipBuild) {
    New-Item -ItemType Directory -Path $sourceDirectory | Out-Null
    git archive --format=tar --output=$sourceArchive HEAD
    Assert-LastExitCode 'Não foi possível criar o arquivo da origem versionada.'
    tar -xf $sourceArchive -C $sourceDirectory
    Assert-LastExitCode 'Não foi possível extrair a origem versionada.'
    Invoke-AcrImageBuild -ImageName "max-service-api:$ImageTag" -Dockerfile 'api/Dockerfile'
    Invoke-AcrImageBuild -ImageName "max-service-web:$ImageTag" -Dockerfile 'Dockerfile'
  }

  Invoke-AzureDeploymentWithIdentityRetry -Name 'bootstrap' -Action {
    az deployment group create `
      --resource-group $ResourceGroup `
      --name "bootstrap-$ImageTag" `
      --template-file (Join-Path $scriptRoot 'bootstrap.bicep') `
      --parameters location=$Location imageTag=$ImageTag acrName=$AcrName `
      --only-show-errors `
      --output none
  } | Out-Null

  $executionName = (az containerapp job start `
      --resource-group $ResourceGroup `
      --name job-max-service-migrate-dev `
      --query name `
      --output tsv).Trim()
  Assert-LastExitCode 'Não foi possível iniciar o job de migration.'
  if ([string]::IsNullOrWhiteSpace($executionName)) {
    throw 'O job de migration não retornou um identificador de execução.'
  }
  $migrationDeadline = (Get-Date).AddMinutes(30)
  do {
    Start-Sleep -Seconds 10
    $migrationStatus = (az containerapp job execution show `
        --resource-group $ResourceGroup `
        --name job-max-service-migrate-dev `
        --job-execution-name $executionName `
        --query properties.status `
        --output tsv).Trim()
    Assert-LastExitCode 'Não foi possível consultar o job de migration.'
    Write-Host "Migration ${executionName}: $migrationStatus"
    if ($migrationStatus -in @('Failed', 'Stopped', 'Degraded')) {
      throw "Migration interrompida com status $migrationStatus; o runtime não foi alterado."
    }
    if ((Get-Date) -gt $migrationDeadline) { throw 'Migration excedeu 30 minutos.' }
  } until ($migrationStatus -eq 'Succeeded')

  $runtimeOutput = Invoke-AzureDeploymentWithIdentityRetry -Name 'runtime' -Action {
    az deployment group create `
      --resource-group $ResourceGroup `
      --name "runtime-$ImageTag" `
      --template-file (Join-Path $scriptRoot 'runtime.bicep') `
      --parameters location=$Location imageTag=$ImageTag acrName=$AcrName `
      --query properties.outputs `
      --only-show-errors `
      --output json
  }
  $outputs = $runtimeOutput | ConvertFrom-Json
  $apiUrl = $outputs.apiUrl.value
  $webUrl = $outputs.webUrl.value

  $apiHealth = Invoke-WebRequest -UseBasicParsing -Uri "$apiUrl/health/ready" -TimeoutSec 60
  if ($apiHealth.StatusCode -ne 200) { throw 'Readiness da API Azure falhou.' }
  $webHealth = Invoke-WebRequest -UseBasicParsing -Uri "$webUrl/demo" -TimeoutSec 60
  if ($webHealth.StatusCode -ne 200) { throw 'Smoke do web Azure falhou.' }
  Write-Host "AZURE_API_URL=$apiUrl"
  Write-Host "AZURE_WEB_URL=$webUrl"
  Write-Host "AZURE_IMAGE_TAG=$ImageTag"
}
finally {
  Pop-Location
  $resolvedSourceDirectory = [System.IO.Path]::GetFullPath($sourceDirectory)
  $resolvedSourceArchive = [System.IO.Path]::GetFullPath($sourceArchive)
  if ($resolvedSourceDirectory.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedSourceDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($resolvedSourceArchive.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $resolvedSourceArchive -Force -ErrorAction SilentlyContinue
  }
}
