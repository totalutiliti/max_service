[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-f0-9]{7,40}$')]
  [string]$ImageTag,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F-]{36}$')]
  [string]$DeployerObjectId,

  [Parameter(Mandatory = $true)]
  [ValidateSet('User', 'ServicePrincipal')]
  [string]$DeployerPrincipalType,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F-]{36}$')]
  [string]$ExpectedSubscriptionId,

  [string]$Location = 'brazilsouth',
  [string]$TemplateFile = '',
  [string]$ParametersFile = '',
  [switch]$IncludeRuntime,
  [switch]$IncludeGitHubIdentity,
  [switch]$AllowDirtyWorktree
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($TemplateFile)) {
  $TemplateFile = Join-Path $PSScriptRoot 'main.bicep'
}
if ([string]::IsNullOrWhiteSpace($ParametersFile)) {
  $ParametersFile = Join-Path $PSScriptRoot 'staging.parameters.json'
}

function Assert-LastExitCode {
  param([string]$Message)

  if ($LASTEXITCODE -ne 0) {
    throw $Message
  }
}

function New-EphemeralSecret {
  param([int]$Bytes = 48)

  $buffer = New-Object byte[] $Bytes
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($buffer)
  }
  finally {
    $generator.Dispose()
  }

  return [Convert]::ToBase64String($buffer).Replace('+', 'A').Replace('/', 'B').TrimEnd('=')
}

if (-not (Test-Path -LiteralPath $TemplateFile -PathType Leaf)) {
  throw "Template Bicep ausente: $TemplateFile"
}
if (-not (Test-Path -LiteralPath $ParametersFile -PathType Leaf)) {
  throw "Arquivo de parâmetros ausente: $ParametersFile"
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if (-not $AllowDirtyWorktree) {
  git -C $repositoryRoot diff --quiet
  Assert-LastExitCode 'O worktree possui alterações não commitadas. O plano falhou fechado.'
  git -C $repositoryRoot diff --cached --quiet
  Assert-LastExitCode 'O índice possui alterações staged. O plano falhou fechado.'
}

git -C $repositoryRoot cat-file -e "${ImageTag}^{commit}"
Assert-LastExitCode "ImageTag não identifica um commit local: $ImageTag"

$parameters = Get-Content -LiteralPath $ParametersFile -Raw | ConvertFrom-Json
if ($parameters.parameters.includeRuntimeInPlan.value -ne $false) {
  throw 'staging.parameters.json deve manter includeRuntimeInPlan=false.'
}
if ($parameters.parameters.includeGitHubIdentityInPlan.value -ne $false) {
  throw 'staging.parameters.json deve manter includeGitHubIdentityInPlan=false.'
}

az bicep build --file $TemplateFile --stdout | Out-Null
Assert-LastExitCode 'A compilação do Bicep falhou; nenhum what-if foi executado.'

$accountJson = az account show --output json
Assert-LastExitCode 'Não foi possível consultar a sessão Azure.'
$account = $accountJson | ConvertFrom-Json
if ($account.id -ne $ExpectedSubscriptionId) {
  throw "Assinatura ativa inesperada. Esperada: $ExpectedSubscriptionId. Atual: $($account.id)."
}
if ($account.state -ne 'Enabled') {
  throw "A assinatura esperada não está habilitada: $($account.state)."
}

$postgresAdministratorPassword = New-EphemeralSecret
$runtimeDatabasePassword = New-EphemeralSecret
$bffInternalSecret = New-EphemeralSecret
$rateLimitKeySecret = New-EphemeralSecret
$financialSandboxSecret = New-EphemeralSecret
$objectStorageAccessKey = New-EphemeralSecret 24
$objectStorageSecretKey = New-EphemeralSecret
$metricsBearerToken = New-EphemeralSecret

$whatIfArguments = @(
  'deployment'
  'sub'
  'what-if'
  '--location'
  $Location
  '--name'
  "max-service-staging-plan-$($ImageTag.Substring(0, [Math]::Min(12, $ImageTag.Length)))"
  '--template-file'
  $TemplateFile
  '--parameters'
  "@$ParametersFile"
  "imageTag=$ImageTag"
  "deployerObjectId=$DeployerObjectId"
  "deployerPrincipalType=$DeployerPrincipalType"
  "postgresAdministratorPassword=$postgresAdministratorPassword"
  "runtimeDatabasePassword=$runtimeDatabasePassword"
  "bffInternalSecret=$bffInternalSecret"
  "rateLimitKeySecret=$rateLimitKeySecret"
  "financialSandboxSecret=$financialSandboxSecret"
  "objectStorageAccessKey=$objectStorageAccessKey"
  "objectStorageSecretKey=$objectStorageSecretKey"
  "metricsBearerToken=$metricsBearerToken"
  "includeRuntimeInPlan=$($IncludeRuntime.IsPresent.ToString().ToLowerInvariant())"
  "includeGitHubIdentityInPlan=$($IncludeGitHubIdentity.IsPresent.ToString().ToLowerInvariant())"
  '--result-format'
  'FullResourcePayloads'
)

Write-Host 'Executando somente Azure what-if. Nenhum recurso será criado ou alterado.'
& az @whatIfArguments
Assert-LastExitCode 'Azure what-if falhou. Nenhum deploy foi autorizado.'

Write-Host 'Plano concluído. Domínio, edge, contatos, orçamento e deploy continuam bloqueados.'
