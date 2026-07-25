targetScope = 'resourceGroup'

param location string = resourceGroup().location
param imageTag string
param acrName string = 'acrmaxservicedev2026'
param identityName string = 'id-max-service-dev'
param environmentName string = 'cae-max-service-dev'
param keyVaultName string = 'kvmaxservicedev2026'
@minLength(2)
@maxLength(32)
param webAppName string = 'ca-max-service-web-dev'

@minLength(2)
@maxLength(32)
param apiAppName string = 'ca-max-service-api-dev'

@minLength(2)
@maxLength(32)
param minioAppName string = 'ca-max-service-storage-dev'

@minLength(2)
@maxLength(32)
param maintenanceJobName string = 'job-max-service-storage-dev'

var tags = {
  environment: 'dev'
  project: 'max-service'
  'managed-by': 'bicep'
  data: 'synthetic-only'
}
var webFqdn = '${webAppName}.${environment.properties.defaultDomain}'
var apiFqdn = '${apiAppName}.${environment.properties.defaultDomain}'
var revisionSuffix = take(imageTag, 12)

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource environment 'Microsoft.App/managedEnvironments@2025-07-01' existing = {
  name: environmentName
}

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: keyVaultName
}

resource storageApp 'Microsoft.App/containerApps@2025-07-01' existing = {
  name: minioAppName
}

resource apiApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: apiAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3001
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
        transport: 'auto'
      }
      registries: [
        {
          identity: identity.id
          server: registry.properties.loginServer
        }
      ]
      secrets: [
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/app-database-url'
          name: 'database-url'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/redis-url'
          name: 'redis-url'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/bff-internal-secret'
          name: 'bff-internal-secret'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/rate-limit-key-secret'
          name: 'rate-limit-key-secret'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/financial-sandbox-secret'
          name: 'financial-sandbox-secret'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/object-storage-access-key'
          name: 'object-storage-access-key'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/object-storage-secret-key'
          name: 'object-storage-secret-key'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/metrics-bearer-token'
          name: 'metrics-bearer-token'
        }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'api'
          image: '${registry.properties.loginServer}/max-service-api:${imageTag}'
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'API_PORT'
              value: '3001'
            }
            {
              name: 'DEMO_MODE'
              value: 'true'
            }
            {
              name: 'CORS_ORIGIN'
              value: 'https://${webFqdn}'
            }
            {
              name: 'TRANSPORT_SECURITY_CONFIGURED'
              value: 'true'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'RUN_MIGRATIONS_ON_STARTUP'
              value: 'false'
            }
            {
              name: 'BFF_INTERNAL_SECRET'
              secretRef: 'bff-internal-secret'
            }
            {
              name: 'METRICS_ENABLED'
              value: 'true'
            }
            {
              name: 'METRICS_BEARER_TOKEN'
              secretRef: 'metrics-bearer-token'
            }
            {
              name: 'RATE_LIMIT_STORE_MODE'
              value: 'redis'
            }
            {
              name: 'RATE_LIMIT_KEY_SECRET'
              secretRef: 'rate-limit-key-secret'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'FINANCIAL_SANDBOX_SECRET'
              secretRef: 'financial-sandbox-secret'
            }
            {
              name: 'OBJECT_STORAGE_ENDPOINT'
              value: 'https://${storageApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'OBJECT_STORAGE_REGION'
              value: 'us-east-1'
            }
            {
              name: 'OBJECT_STORAGE_BUCKET'
              value: 'max-service-private'
            }
            {
              name: 'OBJECT_STORAGE_ACCESS_KEY'
              secretRef: 'object-storage-access-key'
            }
            {
              name: 'OBJECT_STORAGE_SECRET_KEY'
              secretRef: 'object-storage-secret-key'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/health/live'
                port: 3001
                scheme: 'HTTP'
              }
              initialDelaySeconds: 1
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health/ready'
                port: 3001
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health/live'
                port: 3001
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '25'
              }
            }
          }
        ]
      }
    }
  }
}

resource webApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: webAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 4174
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
        transport: 'auto'
      }
      registries: [
        {
          identity: identity.id
          server: registry.properties.loginServer
        }
      ]
      secrets: [
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/bff-internal-secret'
          name: 'bff-internal-secret'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/financial-sandbox-secret'
          name: 'financial-sandbox-secret'
        }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'web'
          image: '${registry.properties.loginServer}/max-service-web:${imageTag}'
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'PORT'
              value: '4174'
            }
            {
              name: 'API_INTERNAL_URL'
              value: 'https://${apiFqdn}'
            }
            {
              name: 'APP_ORIGIN'
              value: 'https://${webFqdn}'
            }
            {
              name: 'BFF_INTERNAL_SECRET'
              secretRef: 'bff-internal-secret'
            }
            {
              name: 'COOKIE_SECURE'
              value: 'true'
            }
            {
              name: 'FINANCIAL_SANDBOX_SECRET'
              secretRef: 'financial-sandbox-secret'
            }
            {
              name: 'NEXT_PUBLIC_SITE_URL'
              value: 'https://${webFqdn}'
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/'
                port: 4174
                scheme: 'HTTP'
              }
              initialDelaySeconds: 1
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 12
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 4174
                scheme: 'HTTP'
              }
              initialDelaySeconds: 20
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

resource maintenanceJob 'Microsoft.App/jobs@2025-07-01' = {
  name: maintenanceJobName
  location: location
  tags: union(tags, {
    purpose: 'private-storage-reconciliation'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      registries: [
        {
          identity: identity.id
          server: registry.properties.loginServer
        }
      ]
      replicaRetryLimit: 1
      replicaTimeout: 1800
      scheduleTriggerConfig: {
        cronExpression: '0 3 * * *'
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/admin-database-url'
          name: 'admin-database-url'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/object-storage-access-key'
          name: 'object-storage-access-key'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/object-storage-secret-key'
          name: 'object-storage-secret-key'
        }
      ]
      triggerType: 'Schedule'
    }
    template: {
      containers: [
        {
          name: 'maintenance'
          image: '${registry.properties.loginServer}/max-service-api:${imageTag}'
          command: [
            'node'
          ]
          args: [
            'scripts/private-storage-reconciliation.mjs'
            '--apply'
            '--minimum-age-hours'
            '24'
            '--max-deletes'
            '100'
          ]
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PRIVATE_STORAGE_RECONCILIATION_DATABASE_URL'
              secretRef: 'admin-database-url'
            }
            {
              name: 'OBJECT_STORAGE_ENDPOINT'
              value: 'https://${storageApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'OBJECT_STORAGE_REGION'
              value: 'us-east-1'
            }
            {
              name: 'OBJECT_STORAGE_BUCKET'
              value: 'max-service-private'
            }
            {
              name: 'OBJECT_STORAGE_ACCESS_KEY'
              secretRef: 'object-storage-access-key'
            }
            {
              name: 'OBJECT_STORAGE_SECRET_KEY'
              secretRef: 'object-storage-secret-key'
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

output apiUrl string = 'https://${apiFqdn}'
output maintenanceJobName string = maintenanceJob.name
output webUrl string = 'https://${webFqdn}'
