targetScope = 'subscription'

param location string = 'brazilsouth'
param resourceGroupName string = 'rg-max-service-stg'
param nameSuffix string = '26'
param imageTag string
param deployerObjectId string

@allowed([
  'User'
  'ServicePrincipal'
])
param deployerPrincipalType string

@secure()
param postgresAdministratorPassword string

@secure()
param runtimeDatabasePassword string

@secure()
param bffInternalSecret string

@secure()
param rateLimitKeySecret string

@secure()
param financialSandboxSecret string

@secure()
param objectStorageAccessKey string

@secure()
param objectStorageSecretKey string

@secure()
param metricsBearerToken string

param includeRuntimeInPlan bool = false
param includeGitHubIdentityInPlan bool = false
param enableDiagnostics bool = true

@secure()
param externalAlertEmail string = ''

@minValue(0)
param budgetAmount int = 0

@secure()
param budgetContacts object = {}

param budgetStartDate string = '2026-08-01T00:00:00Z'
param githubSubjectPrefix string = 'repo:totalutiliti@258505084/max_service@1309016061'
param githubEnvironment string = 'azure-staging'
param vnetAddressPrefix string = '10.40.0.0/16'
param containerAppsSubnetPrefix string = '10.40.0.0/23'
param postgresSubnetPrefix string = '10.40.2.0/24'
param privateEndpointsSubnetPrefix string = '10.40.3.0/24'

var namePrefix = 'max-service-stg'
var acrName = 'acrmaxservicestg${nameSuffix}'
var workspaceName = 'log-max-service-stg'
var environmentName = 'cae-max-service-stg'
var runtimeIdentityName = 'id-max-service-stg'
var keyVaultName = 'kvmaxservicestg${nameSuffix}'
var postgresServerName = 'psql-max-service-stg-${nameSuffix}'
var redisName = 'redis-max-service-stg-${nameSuffix}'
var storageAccountName = 'stmaxservicestg${nameSuffix}'
var minioAppName = 'ca-max-service-storage-stg'
var migrationJobName = 'job-max-service-migrate-stg'
var apiAppName = 'ca-max-service-api-stg'
var webAppName = 'ca-max-service-web-stg'
var maintenanceJobName = 'job-max-service-storage-stg'
var tags = {
  environment: 'staging'
  project: 'max-service'
  'managed-by': 'bicep'
  data: 'synthetic-only'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module network 'network.bicep' = {
  name: 'staging-network'
  scope: resourceGroup
  params: {
    location: location
    namePrefix: namePrefix
    vnetAddressPrefix: vnetAddressPrefix
    containerAppsSubnetPrefix: containerAppsSubnetPrefix
    postgresSubnetPrefix: postgresSubnetPrefix
    privateEndpointsSubnetPrefix: privateEndpointsSubnetPrefix
  }
}

module registry '../registry.bicep' = {
  name: 'staging-registry'
  scope: resourceGroup
  params: {
    location: location
    acrName: acrName
    environmentTag: 'staging'
    dataClassification: 'synthetic-only'
    registrySku: 'Premium'
    publicNetworkAccess: 'Disabled'
  }
}

module foundation '../foundation.bicep' = {
  name: 'staging-foundation'
  scope: resourceGroup
  params: {
    location: location
    acrName: registry.outputs.name
    deployRoleAssignments: true
    workspaceName: workspaceName
    environmentName: environmentName
    identityName: runtimeIdentityName
    environmentTag: 'staging'
    dataClassification: 'synthetic-only'
    logRetentionInDays: 30
    logPublicNetworkAccess: 'Enabled'
    infrastructureSubnetId: network.outputs.containerAppsSubnetId
    internalLoadBalancerEnabled: false
    zoneRedundant: true
  }
}

module stateful '../stateful.bicep' = {
  name: 'staging-stateful'
  scope: resourceGroup
  params: {
    location: location
    deployerObjectId: deployerObjectId
    deployerPrincipalType: deployerPrincipalType
    postgresAdministratorPassword: postgresAdministratorPassword
    runtimeDatabasePassword: runtimeDatabasePassword
    bffInternalSecret: bffInternalSecret
    rateLimitKeySecret: rateLimitKeySecret
    financialSandboxSecret: financialSandboxSecret
    objectStorageAccessKey: objectStorageAccessKey
    objectStorageSecretKey: objectStorageSecretKey
    metricsBearerToken: metricsBearerToken
    postgresServerName: postgresServerName
    redisName: redisName
    keyVaultName: keyVaultName
    storageAccountName: storageAccountName
    identityName: runtimeIdentityName
    environmentName: environmentName
    environmentTag: 'staging'
    dataClassification: 'synthetic-only'
    postgresSkuName: 'Standard_D2ds_v5'
    postgresSkuTier: 'GeneralPurpose'
    postgresBackupRetentionDays: 14
    postgresGeoRedundantBackup: 'Disabled'
    postgresHighAvailabilityMode: 'ZoneRedundant'
    postgresPublicNetworkAccess: 'Disabled'
    postgresDelegatedSubnetId: network.outputs.postgresSubnetId
    postgresPrivateDnsZoneId: network.outputs.postgresPrivateDnsZoneId
    postgresStorageSizeGB: 64
    redisSkuName: 'Balanced_B0'
    redisHighAvailability: 'Enabled'
    redisPublicNetworkAccess: 'Disabled'
    storageSkuName: 'Standard_ZRS'
    storagePublicNetworkAccess: 'Disabled'
    keyVaultPublicNetworkAccess: 'Disabled'
    keyVaultSoftDeleteRetentionInDays: 90
  }
  dependsOn: [
    foundation
  ]
}

module privateEndpoints 'private-endpoints.bicep' = {
  name: 'staging-private-endpoints'
  scope: resourceGroup
  params: {
    location: location
    namePrefix: namePrefix
    privateEndpointsSubnetId: network.outputs.privateEndpointsSubnetId
    privateDnsZoneIds: network.outputs.privateDnsZoneIds
    registryId: registry.outputs.id
    redisId: stateful.outputs.redisId
    keyVaultId: stateful.outputs.keyVaultId
    storageAccountId: stateful.outputs.storageAccountId
  }
}

module bootstrap '../bootstrap.bicep' = {
  name: 'staging-bootstrap'
  scope: resourceGroup
  params: {
    location: location
    imageTag: imageTag
    acrName: acrName
    identityName: runtimeIdentityName
    environmentName: environmentName
    keyVaultName: keyVaultName
    migrationJobName: migrationJobName
    minioAppName: minioAppName
    environmentTag: 'staging'
    dataClassification: 'synthetic-only'
    storageMinReplicas: 1
    storageMaxReplicas: 1
  }
  dependsOn: [
    privateEndpoints
  ]
}

// This module is for a complete what-if only. A future authorized deployment must run
// the migration job successfully before deploying runtime.bicep as a separate phase.
module runtime '../runtime.bicep' = if (includeRuntimeInPlan) {
  name: 'staging-runtime-plan-only'
  scope: resourceGroup
  params: {
    location: location
    imageTag: imageTag
    acrName: acrName
    identityName: runtimeIdentityName
    environmentName: environmentName
    keyVaultName: keyVaultName
    webAppName: webAppName
    apiAppName: apiAppName
    minioAppName: minioAppName
    maintenanceJobName: maintenanceJobName
    environmentTag: 'staging'
    dataClassification: 'synthetic-only'
    demoMode: true
    apiExternalIngress: false
    apiMinReplicas: 2
    apiMaxReplicas: 3
    webMinReplicas: 1
    webMaxReplicas: 2
    appOrigin: ''
  }
  dependsOn: [
    bootstrap
  ]
}

module githubIdentity '../github-oidc.bicep' = if (includeGitHubIdentityInPlan) {
  name: 'staging-github-identity-plan-only'
  scope: resourceGroup
  params: {
    location: location
    identityName: 'id-max-service-github-stg'
    githubSubjectPrefix: githubSubjectPrefix
    githubEnvironment: githubEnvironment
    environmentTag: 'staging'
  }
}

module governance 'governance.bicep' = {
  name: 'staging-governance'
  scope: resourceGroup
  params: {
    location: location
    workspaceId: foundation.outputs.workspaceId
    registryName: acrName
    postgresServerName: postgresServerName
    redisName: redisName
    keyVaultName: keyVaultName
    storageAccountName: storageAccountName
    apiAppName: apiAppName
    enableDiagnostics: enableDiagnostics
    externalAlertEmail: externalAlertEmail
    budgetAmount: budgetAmount
    budgetContacts: budgetContacts
    budgetStartDate: budgetStartDate
  }
  dependsOn: [
    privateEndpoints
    runtime
  ]
}

output apiIngressMode string = includeRuntimeInPlan ? 'internal' : 'not-included'
output alertDestinationConfigured bool = governance.outputs.actionGroupPlanned
output budgetConfigured bool = governance.outputs.budgetPlanned
output environmentName string = environmentName
output keyVaultName string = keyVaultName
output resourceGroupName string = resourceGroup.name
output runtimeIncluded bool = includeRuntimeInPlan
output syntheticOnly bool = true
output webUrl string = includeRuntimeInPlan ? runtime!.outputs.webUrl : ''
