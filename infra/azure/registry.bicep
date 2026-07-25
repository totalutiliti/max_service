targetScope = 'resourceGroup'

param location string = resourceGroup().location
param acrName string = 'acrmaxservicedev2026'

var tags = {
  environment: 'dev'
  project: 'max-service'
  'managed-by': 'bicep'
  data: 'synthetic-only'
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

output id string = registry.id
output loginServer string = registry.properties.loginServer
output name string = registry.name
