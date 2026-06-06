// Crash -- Azure infrastructure (minimal: Container App + Static Web App)
// Scope: resource group (azd provisions/selects the RG before deploying).
targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Parameters -- azd injects environmentName + location; resourceToken is
// derived here via uniqueString so every resource name is globally unique.
// ---------------------------------------------------------------------------

@description('Azure Developer CLI environment name (e.g. crash-hackathon).')
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

// --- Secrets: sourced from `azd env set` before `azd up`.
// NEVER hardcode values.  azd passes these as deployment parameters.

@secure()
@description('GMI / Phinite inference API key.')
param crashGmiApiKey string = ''

@secure()
@description('Azure OpenAI endpoint URL.')
param crashAzureOpenAiEndpoint string = ''

@secure()
@description('Azure OpenAI API key.')
param crashAzureOpenAiKey string = ''

@description('Azure OpenAI deployment name (not a secret -- no @secure).')
param crashAzureOpenAiDeployment string = ''

@secure()
@description('x402 / Coinbase wallet address or private key reference.')
param crashX402Wallet string = ''

// --- Inference tier: GitHub Models (Azure-hosted, reached with a GitHub token).
// This is the tier Crash runs on locally, so it MUST reach the container or an
// Azure deploy with no Azure OpenAI provisioned would silently fall to offline.
@secure()
@description('GitHub token for GitHub Models inference (models.github.ai).')
param crashGithubModelsToken string = ''

// --- Real web search: Tavily key. Without it the brief falls back to canned
// "(Source: x402)" placeholder text -- a demo-day misconfiguration.
@secure()
@description('Tavily API key for real web search.')
param crashTavilyApiKey string = ''

// --- Non-secret tuning knobs. Each has an in-code default (inference.ts), so an
// empty value is safe -- the server applies its default via `|| DEFAULT`. Wired
// anyway so a model/endpoint/version can be corrected WITHOUT a redeploy (GMI in
// particular 404s on models not served by the account; see inference.ts:40-42).
@description('Azure OpenAI API version (default applied in code if empty).')
param crashAzureOpenAiApiVersion string = ''

@description('GitHub Models endpoint URL (default applied in code if empty).')
param crashGithubModelsEndpoint string = ''

@description('GitHub Models model id, e.g. openai/gpt-4o-mini (default in code if empty).')
param crashGithubModelsModel string = ''

@description('GMI fallback model id (default applied in code if empty).')
param crashGmiModel string = ''

// ---------------------------------------------------------------------------
// Locals
// ---------------------------------------------------------------------------

// resourceToken: 13-char lowercase suffix unique to (subscription + RG + env).
// Append to names to avoid Azure global-uniqueness collisions.
var resourceToken = toLower(uniqueString(subscription().id, resourceGroup().id, environmentName))

var tags = {
  'azd-env-name': environmentName
  project: 'crash'
}

// ---------------------------------------------------------------------------
// Log Analytics workspace (required by Container Apps environment)
// ---------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-crash-${resourceToken}'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

// ---------------------------------------------------------------------------
// User-assigned managed identity (ACA pulls images from ACR via this identity)
// ---------------------------------------------------------------------------

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-crash-${resourceToken}'
  location: location
  tags: tags
}

// ---------------------------------------------------------------------------
// Azure Container Registry (Basic SKU; azd pushes the built image here)
// ---------------------------------------------------------------------------

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acrcrash${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

// AcrPull role assignment: the managed identity can pull images from ACR.
// Built-in role ID for AcrPull: 7f951dda-4ed3-4680-a7ca-43fe172d538d
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, 'AcrPull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Container Apps managed environment
// ---------------------------------------------------------------------------

resource caEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'cae-crash-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Container App -- marketplace-server
// ---------------------------------------------------------------------------

resource marketplaceApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'ca-marketplace-${resourceToken}'
  location: location
  tags: union(tags, {
    'azd-service-name': 'marketplace'
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      // External ingress: ACA terminates TLS and proxies HTTP + WebSocket
      // traffic to the container on port 8787.
      ingress: {
        external: true
        targetPort: 8787
        transport: 'auto'
        allowInsecure: false
      }
      // ACR pull uses the user-assigned identity -- no admin credentials needed.
      registries: [
        {
          server: acr.properties.loginServer
          identity: identity.id
        }
      ]
      // Secrets declared here; referenced by name in env vars below.
      secrets: [
        {
          name: 'crash-gmi-api-key'
          value: crashGmiApiKey
        }
        {
          name: 'crash-azure-openai-endpoint'
          value: crashAzureOpenAiEndpoint
        }
        {
          name: 'crash-azure-openai-key'
          value: crashAzureOpenAiKey
        }
        {
          name: 'crash-x402-wallet'
          value: crashX402Wallet
        }
        {
          name: 'crash-github-models-token'
          value: crashGithubModelsToken
        }
        {
          name: 'crash-tavily-api-key'
          value: crashTavilyApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'marketplace'
          // azd replaces this placeholder with the pushed image reference.
          // Format: <acr-login-server>/marketplace:<image-tag>
          image: '${acr.properties.loginServer}/marketplace:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'PORT'
              value: '8787'
            }
            {
              name: 'CRASH_GMI_API_KEY'
              secretRef: 'crash-gmi-api-key'
            }
            {
              name: 'CRASH_AZURE_OPENAI_ENDPOINT'
              secretRef: 'crash-azure-openai-endpoint'
            }
            {
              name: 'CRASH_AZURE_OPENAI_KEY'
              secretRef: 'crash-azure-openai-key'
            }
            {
              name: 'CRASH_AZURE_OPENAI_DEPLOYMENT'
              value: crashAzureOpenAiDeployment
            }
            {
              name: 'CRASH_X402_WALLET'
              secretRef: 'crash-x402-wallet'
            }
            {
              name: 'CRASH_GITHUB_MODELS_TOKEN'
              secretRef: 'crash-github-models-token'
            }
            {
              name: 'CRASH_TAVILY_API_KEY'
              secretRef: 'crash-tavily-api-key'
            }
            {
              name: 'CRASH_AZURE_OPENAI_API_VERSION'
              value: crashAzureOpenAiApiVersion
            }
            {
              name: 'CRASH_GITHUB_MODELS_ENDPOINT'
              value: crashGithubModelsEndpoint
            }
            {
              name: 'CRASH_GITHUB_MODELS_MODEL'
              value: crashGithubModelsModel
            }
            {
              name: 'CRASH_GMI_MODEL'
              value: crashGmiModel
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Static Web App -- frontend/r3f-shell (Free SKU)
// ---------------------------------------------------------------------------

resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: 'swa-crash-${resourceToken}'
  location: location
  tags: union(tags, {
    'azd-service-name': 'web'
  })
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // azd deploys the pre-built dist/ folder directly; no GitHub Actions pipeline needed.
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// ---------------------------------------------------------------------------
// Outputs consumed by azd and by docs/DEPLOY.md
// ---------------------------------------------------------------------------

output MARKETPLACE_FQDN string = 'https://${marketplaceApp.properties.configuration.ingress.fqdn}'
output SWA_DEFAULT_HOSTNAME string = 'https://${swa.properties.defaultHostname}'
output ACR_LOGIN_SERVER string = acr.properties.loginServer
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.properties.loginServer
