targetScope = 'resourceGroup'

param location string = resourceGroup().location
param imageTag string
param acrName string = 'acrmaxservicedev2026'
param identityName string = 'id-max-service-dev'
param environmentName string = 'cae-max-service-dev'
param keyVaultName string = 'kvmaxservicedev2026'
@minLength(2)
@maxLength(32)
param migrationJobName string = 'job-max-service-migrate-dev'

@minLength(2)
@maxLength(32)
param minioAppName string = 'ca-max-service-storage-dev'
param environmentTag string = 'dev'
param dataClassification string = 'synthetic-only'
param storageMinReplicas int = 1
param storageMaxReplicas int = 1

var tags = {
  environment: environmentTag
  project: 'max-service'
  'managed-by': 'bicep'
  data: dataClassification
}

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

resource storageApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: minioAppName
  location: location
  tags: union(tags, {
    purpose: 'private-object-storage'
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
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: false
        targetPort: 9000
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
        transport: 'auto'
      }
      secrets: [
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
    }
    template: {
      containers: [
        {
          name: 'storage'
          image: 'minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e'
          args: [
            'server'
            '/data'
            '--console-address'
            ':9001'
          ]
          env: [
            {
              name: 'MINIO_ROOT_USER'
              secretRef: 'object-storage-access-key'
            }
            {
              name: 'MINIO_ROOT_PASSWORD'
              secretRef: 'object-storage-secret-key'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: [
            {
              mountPath: '/data'
              volumeName: 'objects'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/minio/health/live'
                port: 9000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 20
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/minio/health/ready'
                port: 9000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: storageMinReplicas
        maxReplicas: storageMaxReplicas
      }
      volumes: [
        {
          name: 'objects'
          storageName: 'maxserviceobjects'
          storageType: 'AzureFile'
        }
      ]
    }
  }
}

resource migrationJob 'Microsoft.App/jobs@2025-07-01' = {
  name: migrationJobName
  location: location
  tags: union(tags, {
    purpose: 'database-migration'
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
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          identity: identity.id
          server: registry.properties.loginServer
        }
      ]
      replicaRetryLimit: 0
      replicaTimeout: 1800
      secrets: [
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/admin-database-url'
          name: 'admin-database-url'
        }
        {
          identity: identity.id
          keyVaultUrl: '${vault.properties.vaultUri}secrets/runtime-database-password'
          name: 'runtime-database-password'
        }
      ]
      triggerType: 'Manual'
    }
    template: {
      containers: [
        {
          name: 'migration'
          image: '${registry.properties.loginServer}/max-service-api:${imageTag}'
          command: [
            'node'
          ]
          args: [
            '.api-dist/api/database/migrate.js'
          ]
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'MIGRATION_DATABASE_URL'
              secretRef: 'admin-database-url'
            }
            {
              name: 'RUNTIME_DATABASE_PASSWORD'
              secretRef: 'runtime-database-password'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
    }
  }
}

output migrationJobName string = migrationJob.name
output storageFqdn string = storageApp.properties.configuration.ingress.fqdn
