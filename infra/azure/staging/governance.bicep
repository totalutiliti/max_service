targetScope = 'resourceGroup'

param location string = resourceGroup().location
param workspaceId string
param registryName string
param postgresServerName string
param redisName string
param keyVaultName string
param storageAccountName string
param apiAppName string
param runtimeIncluded bool = false
param enableDiagnostics bool = true

@secure()
param externalAlertEmail string = ''

@minValue(0)
param budgetAmount int = 0

@secure()
param budgetContacts object = {}

param budgetStartDate string = '2026-08-01T00:00:00Z'

var alertsEnabled = !empty(externalAlertEmail)
var apiReplicaAlertEnabled = alertsEnabled && runtimeIncluded
var budgetContactEmails = budgetContacts.?emails ?? []
var budgetEnabled = budgetAmount > 0 && length(budgetContactEmails) > 0
var tags = {
  environment: 'staging'
  project: 'max-service'
  'managed-by': 'bicep'
  data: 'synthetic-only'
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource redis 'Microsoft.Cache/redisEnterprise@2025-07-01' existing = {
  name: redisName
}

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: keyVaultName
}

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' existing = {
  name: storageAccountName
}

resource api 'Microsoft.App/containerApps@2025-07-01' existing = {
  name: apiAppName
}

resource registryDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnostics) {
  name: 'send-to-log-analytics'
  scope: registry
  properties: {
    workspaceId: workspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource postgresDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnostics) {
  name: 'send-to-log-analytics'
  scope: postgres
  properties: {
    workspaceId: workspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource redisDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnostics) {
  name: 'send-to-log-analytics'
  scope: redis
  properties: {
    workspaceId: workspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource vaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnostics) {
  name: 'send-to-log-analytics'
  scope: vault
  properties: {
    workspaceId: workspaceId
    logs: [
      {
        categoryGroup: 'audit'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource storageDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnostics) {
  name: 'send-to-log-analytics'
  scope: storage
  properties: {
    workspaceId: workspaceId
    metrics: [
      {
        category: 'Transaction'
        enabled: true
      }
    ]
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (alertsEnabled) {
  name: 'ag-max-service-stg'
  location: 'global'
  tags: tags
  properties: {
    armRoleReceivers: []
    automationRunbookReceivers: []
    azureAppPushReceivers: []
    azureFunctionReceivers: []
    emailReceivers: [
      {
        emailAddress: externalAlertEmail
        name: 'staging-oncall'
        useCommonAlertSchema: true
      }
    ]
    enabled: true
    eventHubReceivers: []
    groupShortName: 'maxsvcstg'
    itsmReceivers: []
    logicAppReceivers: []
    smsReceivers: []
    voiceReceivers: []
    webhookReceivers: []
  }
}

resource apiReplicaAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (apiReplicaAlertEnabled) {
  name: 'alert-max-service-stg-api-replicas'
  location: 'global'
  tags: tags
  properties: {
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          metricName: 'Replicas'
          metricNamespace: 'Microsoft.App/containerApps'
          name: 'api-replica-count'
          operator: 'LessThan'
          threshold: 1
          timeAggregation: 'Average'
        }
      ]
    }
    description: 'API de staging sem réplica disponível.'
    enabled: true
    evaluationFrequency: 'PT1M'
    scopes: [
      api.id
    ]
    severity: 1
    targetResourceRegion: location
    targetResourceType: 'Microsoft.App/containerApps'
    windowSize: 'PT5M'
  }
}

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = if (budgetEnabled) {
  name: 'budget-max-service-stg'
  properties: {
    amount: budgetAmount
    category: 'Cost'
    notifications: {
      actual80: {
        contactEmails: budgetContactEmails
        enabled: true
        locale: 'pt-br'
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
      }
      forecast100: {
        contactEmails: budgetContactEmails
        enabled: true
        locale: 'pt-br'
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Forecasted'
      }
    }
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
  }
}

output actionGroupPlanned bool = alertsEnabled
output apiReplicaAlertPlanned bool = apiReplicaAlertEnabled
output budgetPlanned bool = budgetEnabled
output diagnosticsPlanned bool = enableDiagnostics
