targetScope = 'resourceGroup'

param location string = resourceGroup().location
param acrName string = 'acrmaxservicedev2026'
param environmentTag string = 'dev'
param dataClassification string = 'synthetic-only'

@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param registrySku string = 'Basic'

@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Enabled'

var tags = {
  environment: environmentTag
  project: 'max-service'
  'managed-by': 'bicep'
  data: dataClassification
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: registrySku
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: publicNetworkAccess
  }
}

output id string = registry.id
output loginServer string = registry.properties.loginServer
output name string = registry.name
