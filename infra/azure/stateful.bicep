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

var tags = {
  environment: 'dev'
  project: 'max-service'
  'managed-by': 'bicep'
  data: 'synthetic-only'
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
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorPassword
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    storage: {
      autoGrow: 'Enabled'
      storageSizeGB: 32
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

resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
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
    name: 'Balanced_B0'
  }
  properties: {
    encryption: {}
    highAvailability: 'Disabled'
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
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
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowCrossTenantReplication: false
    allowSharedKeyAccess: true
    defaultToOAuthAuthentication: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
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
    publicNetworkAccess: 'Enabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
    softDeleteRetentionInDays: 7
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
    principalType: 'User'
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
output postgresHost string = postgresHost
output redisHost string = redisHost
output storageAccountName string = storage.name
