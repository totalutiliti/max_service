targetScope = 'resourceGroup'

param location string = resourceGroup().location
param namePrefix string = 'max-service-stg'
param privateEndpointsSubnetId string
param privateDnsZoneIds array
param registryId string
param redisId string
param keyVaultId string
param storageAccountId string

var tags = {
  environment: 'staging'
  project: 'max-service'
  'managed-by': 'bicep'
  data: 'synthetic-only'
}

var endpoints = [
  {
    name: 'pe-${namePrefix}-redis'
    groupId: 'redisEnterprise'
    serviceId: redisId
    zoneId: privateDnsZoneIds[1]
  }
  {
    name: 'pe-${namePrefix}-vault'
    groupId: 'vault'
    serviceId: keyVaultId
    zoneId: privateDnsZoneIds[2]
  }
  {
    name: 'pe-${namePrefix}-files'
    groupId: 'file'
    serviceId: storageAccountId
    zoneId: privateDnsZoneIds[3]
  }
  {
    name: 'pe-${namePrefix}-registry'
    groupId: 'registry'
    serviceId: registryId
    zoneId: privateDnsZoneIds[4]
  }
]

resource privateEndpoints 'Microsoft.Network/privateEndpoints@2024-05-01' = [
  for endpoint in endpoints: {
    name: endpoint.name
    location: location
    tags: tags
    properties: {
      privateLinkServiceConnections: [
        {
          name: '${endpoint.name}-connection'
          properties: {
            groupIds: [
              endpoint.groupId
            ]
            privateLinkServiceId: endpoint.serviceId
            requestMessage: 'Max Service staging synthetic-only'
          }
        }
      ]
      subnet: {
        id: privateEndpointsSubnetId
      }
    }
  }
]

resource privateDnsZoneGroups 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = [
  for (endpoint, index) in endpoints: {
    parent: privateEndpoints[index]
    name: 'default'
    properties: {
      privateDnsZoneConfigs: [
        {
          name: 'zone'
          properties: {
            privateDnsZoneId: endpoint.zoneId
          }
        }
      ]
    }
  }
]

output privateEndpointIds array = [for index in range(0, length(endpoints)): privateEndpoints[index].id]
