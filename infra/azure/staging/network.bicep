targetScope = 'resourceGroup'

param location string = resourceGroup().location
param namePrefix string = 'max-service-stg'
param vnetAddressPrefix string = '10.40.0.0/16'
param containerAppsSubnetPrefix string = '10.40.0.0/23'
param postgresSubnetPrefix string = '10.40.2.0/24'
param privateEndpointsSubnetPrefix string = '10.40.3.0/24'

var tags = {
  environment: 'staging'
  project: 'max-service'
  'managed-by': 'bicep'
  data: 'synthetic-only'
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'vnet-${namePrefix}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetAddressPrefix
      ]
    }
  }
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'snet-container-apps'
  properties: {
    addressPrefix: containerAppsSubnetPrefix
    delegations: [
      {
        name: 'container-apps'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
  }
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'snet-postgres'
  properties: {
    addressPrefix: postgresSubnetPrefix
    delegations: [
      {
        name: 'postgres-flexible-server'
        properties: {
          serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
        }
      }
    ]
  }
}

resource privateEndpointsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: vnet
  name: 'snet-private-endpoints'
  properties: {
    addressPrefix: privateEndpointsSubnetPrefix
    privateEndpointNetworkPolicies: 'Disabled'
  }
}

var privateDnsZoneNames = [
  'privatelink.postgres.database.azure.com'
  'privatelink.redis.azure.net'
  'privatelink.vaultcore.azure.net'
  'privatelink.file.${environment().suffixes.storage}'
  'privatelink.azurecr.io'
]

resource privateDnsZones 'Microsoft.Network/privateDnsZones@2024-06-01' = [
  for zoneName in privateDnsZoneNames: {
    name: zoneName
    location: 'global'
    tags: tags
  }
]

resource privateDnsZoneLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [
  for (zoneName, index) in privateDnsZoneNames: {
    parent: privateDnsZones[index]
    name: 'link-${namePrefix}'
    location: 'global'
    properties: {
      registrationEnabled: false
      virtualNetwork: {
        id: vnet.id
      }
    }
  }
]

output containerAppsSubnetId string = containerAppsSubnet.id
output postgresPrivateDnsZoneId string = privateDnsZones[0].id
output postgresSubnetId string = postgresSubnet.id
output privateDnsZoneIds array = [for index in range(0, length(privateDnsZoneNames)): privateDnsZones[index].id]
output privateEndpointsSubnetId string = privateEndpointsSubnet.id
output vnetId string = vnet.id
