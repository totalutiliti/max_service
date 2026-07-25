targetScope = 'resourceGroup'

param location string = resourceGroup().location
param deployerObjectId string

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

param postgresServerName string = 'psql-max-service-dev-26'
param postgresAdministratorLogin string = 'maxsvcadmin'
param databaseName string = 'max_service'
param redisName string = 'redis-max-service-dev-26'
param keyVaultName string = 'kvmaxservicedev2026'
param storageAccountName string = 'stmaxservicedev26'
param storageShareName string = 'max-service-objects'
param identityName string = 'id-max-service-dev'
param environmentName string = 'cae-max-service-dev'
param environmentTag string = 'dev'
param dataClassification string = 'synthetic-only'
param deployerPrincipalType string = 'User'

@allowed([
  'Standard_B1ms'
  'Standard_B2ms'
  'Standard_D2ds_v5'
])
param postgresSkuName string = 'Standard_B1ms'

@allowed([
  'Burstable'
  'GeneralPurpose'
])
param postgresSkuTier string = 'Burstable'

@minValue(7)
@maxValue(35)
param postgresBackupRetentionDays int = 7

@allowed([
  'Enabled'
  'Disabled'
])
param postgresGeoRedundantBackup string = 'Disabled'

@allowed([
  'Disabled'
  'SameZone'
  'ZoneRedundant'
])
param postgresHighAvailabilityMode string = 'Disabled'

@allowed([
  'Enabled'
  'Disabled'
])
param postgresPublicNetworkAccess string = 'Enabled'

param postgresDelegatedSubnetId string = ''
param postgresPrivateDnsZoneId string = ''

@minValue(32)
param postgresStorageSizeGB int = 32

@allowed([
  'Balanced_B0'
])
param redisSkuName string = 'Balanced_B0'

@allowed([
  'Enabled'
  'Disabled'
])
param redisHighAvailability string = 'Disabled'

@allowed([
  'Enabled'
  'Disabled'
])
param redisPublicNetworkAccess string = 'Enabled'

@allowed([
  'Standard_LRS'
  'Standard_ZRS'
])
param storageSkuName string = 'Standard_LRS'

@allowed([
  'Enabled'
  'Disabled'
])
param storagePublicNetworkAccess string = 'Enabled'

@allowed([
  'Enabled'
  'Disabled'
])
param keyVaultPublicNetworkAccess string = 'Enabled'

@minValue(7)
@maxValue(90)
param keyVaultSoftDeleteRetentionInDays int = 7

var tags = {
  environment: environmentTag
  project: 'max-service'
  'managed-by': 'bicep'
  data: dataClassification
}
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6' // gitleaks:allow public Azure role ID
var keyVaultSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7' // gitleaks:allow public Azure role ID
var postgresHost = '${postgresServerName}.postgres.database.azure.com'
var redisHost = '${redisName}.${toLower(replace(location, ' ', ''))}.redis.azure.net'
var adminDatabaseUrl = 'postgresql://${postgresAdministratorLogin}:${uriComponent(postgresAdministratorPassword)}@${postgresHost}:5432/${databaseName}?sslmode=require'
var appDatabaseUrl = 'postgresql://max_service_app:${uriComponent(runtimeDatabasePassword)}@${postgresHost}:5432/${databaseName}?sslmode=require'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource environment 'Microsoft.App/managedEnvironments@2025-07-01' existing = {
  name: environmentName
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2025-08-01' = {
  name: postgresServerName
  location: location
  tags: tags
  sku: {
    name: postgresSkuName
    tier: postgresSkuTier
  }
  properties: {
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorPassword
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    backup: {
      backupRetentionDays: postgresBackupRetentionDays
      geoRedundantBackup: postgresGeoRedundantBackup
    }
    highAvailability: {
      mode: postgresHighAvailabilityMode
    }
    network: empty(postgresDelegatedSubnetId)
      ? {
          publicNetworkAccess: postgresPublicNetworkAccess
        }
      : {
          delegatedSubnetResourceId: postgresDelegatedSubnetId
          privateDnsZoneArmResourceId: postgresPrivateDnsZoneId
          publicNetworkAccess: 'Disabled'
        }
    storage: {
      autoGrow: 'Enabled'
      storageSizeGB: postgresStorageSizeGB
    }
    version: '16'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    source: 'user-override'
    value: 'BTREE_GIST,PGCRYPTO'
  }
}

resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = if (empty(postgresDelegatedSubnetId) && postgresPublicNetworkAccess == 'Enabled') {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource redis 'Microsoft.Cache/redisEnterprise@2025-07-01' = {
  name: redisName
  location: location
  tags: tags
  sku: {
    name: redisSkuName
  }
  properties: {
    encryption: {}
    highAvailability: redisHighAvailability
    minimumTlsVersion: '1.2'
    publicNetworkAccess: redisPublicNetworkAccess
  }
}

resource redisDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' = {
  parent: redis
  name: 'default'
  properties: {
    accessKeysAuthentication: 'Enabled'
    clientProtocol: 'Encrypted'
    clusteringPolicy: 'NoCluster'
    evictionPolicy: 'NoEviction'
    modules: []
    port: 10000
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: storageSkuName
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: storagePublicNetworkAccess
    supportsHttpsTrafficOnly: true
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2025-06-01' = {
  parent: storage
  name: 'default'
}

resource objectShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2025-06-01' = {
  parent: fileService
  name: storageShareName
  properties: {
    accessTier: 'TransactionOptimized'
    enabledProtocols: 'SMB'
    shareQuota: 5
  }
}

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    enablePurgeProtection: true
    enableRbacAuthorization: true
    enableSoftDelete: true
    publicNetworkAccess: keyVaultPublicNetworkAccess
    sku: {
      family: 'A'
      name: 'standard'
    }
    softDeleteRetentionInDays: keyVaultSoftDeleteRetentionInDays
    tenantId: subscription().tenantId
  }
}

resource identitySecretReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, identity.id, keyVaultSecretsUserRoleId)
  scope: vault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsUserRoleId
    )
  }
}

resource deployerSecretOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, deployerObjectId, keyVaultSecretsOfficerRoleId)
  scope: vault
  properties: {
    principalId: deployerObjectId
    principalType: deployerPrincipalType
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsOfficerRoleId
    )
  }
}

resource adminDatabaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'admin-database-url'
  properties: {
    value: adminDatabaseUrl
  }
}

resource appDatabaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'app-database-url'
  properties: {
    value: appDatabaseUrl
  }
}

resource runtimeDatabasePasswordSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'runtime-database-password'
  properties: {
    value: runtimeDatabasePassword
  }
}

resource redisUrlSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'redis-url'
  properties: {
    value: 'rediss://:${uriComponent(redisDatabase.listKeys().primaryKey)}@${redisHost}:10000/0'
  }
}

resource bffInternalSecretResource 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'bff-internal-secret'
  properties: {
    value: bffInternalSecret
  }
}

resource rateLimitKeySecretResource 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'rate-limit-key-secret'
  properties: {
    value: rateLimitKeySecret
  }
}

resource financialSandboxSecretResource 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'financial-sandbox-secret'
  properties: {
    value: financialSandboxSecret
  }
}

resource objectStorageAccessKeyResource 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'object-storage-access-key'
  properties: {
    value: objectStorageAccessKey
  }
}

resource objectStorageSecretKeyResource 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'object-storage-secret-key'
  properties: {
    value: objectStorageSecretKey
  }
}

resource metricsBearerTokenResource 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: 'metrics-bearer-token'
  properties: {
    value: metricsBearerToken
  }
}

resource environmentStorage 'Microsoft.App/managedEnvironments/storages@2025-07-01' = {
  parent: environment
  name: 'maxserviceobjects'
  properties: {
    azureFile: {
      accessMode: 'ReadWrite'
      accountKey: storage.listKeys().keys[0].value
      accountName: storage.name
      shareName: objectShare.name
    }
  }
}

output environmentStorageName string = environmentStorage.name
output keyVaultName string = vault.name
output keyVaultId string = vault.id
output postgresId string = postgres.id
output postgresHost string = postgresHost
output redisId string = redis.id
output redisHost string = redisHost
output storageAccountName string = storage.name
output storageAccountId string = storage.id
