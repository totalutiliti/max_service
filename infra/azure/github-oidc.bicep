targetScope = 'resourceGroup'

param location string = resourceGroup().location
param identityName string = 'id-max-service-github-dev'
param githubSubjectPrefix string = 'repo:totalutiliti@258505084/max_service@1309016061'
param githubEnvironment string = 'azure-dev'
param environmentTag string = 'dev'

var tags = {
  environment: environmentTag
  project: 'max-service'
  'managed-by': 'bicep'
  purpose: 'github-deployment'
}
var contributorRoleDefinitionId = 'b24988ac-6180-42a0-ab88-20f7382dd24c' // gitleaks:allow public Azure role ID

resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource githubCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-environment'
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: '${githubSubjectPrefix}:environment:${githubEnvironment}'
  }
}

resource resourceGroupContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deploymentIdentity.id, contributorRoleDefinitionId)
  properties: {
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      contributorRoleDefinitionId
    )
  }
}

output clientId string = deploymentIdentity.properties.clientId
output identityId string = deploymentIdentity.id
output principalId string = deploymentIdentity.properties.principalId
