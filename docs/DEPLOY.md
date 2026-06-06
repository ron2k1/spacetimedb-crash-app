# Crash -- Azure Deployment Runbook

This document covers two paths:

1. **Primary: Azure (Container Apps + Static Web Apps via azd)**
2. **Fallback: cloudflared tunnel (local demo, not a real deploy)**

---

## Prerequisites

- `azd` (Azure Developer CLI) installed in user scope -- no admin required.
  Install: https://aka.ms/azd-install
  Verify: `azd version`
- `docker` (Docker Desktop or Docker Engine) available and the daemon running.
  azd builds and pushes the container image; Docker must be reachable.
- `pnpm` available (`corepack enable` is sufficient on Node 24+).
- The repo is checked out at `C:\Users\thegr\Desktop\repos\crash\` (or any path;
  all commands below assume the repo root as cwd).

---

## Primary Path: azd up

### Step a -- Authenticate with Azure

```
azd auth login
```

This opens a browser tab. Sign in with the Azure account that has Contributor
access on the target subscription.  A service principal is not required for a
first deploy; azd uses your user credentials.

### Step b -- Create a named environment

```
azd env new crash-hackathon
```

azd will prompt for:
- **Azure subscription** -- select the one you want to deploy to.
- **Azure region** -- pick a region that has Container Apps + Static Web Apps
  (e.g. `eastus`, `westus2`, `eastus2`, `westeurope`).

The environment stores your choices in `.azure/crash-hackathon/` (gitignored
by azd's .gitignore fragment; do not commit it).

### Step c -- Set secret environment variables

Run each `azd env set` command separately.  Supply the REAL values (from
`frontend/r3f-shell/.env` or your secrets manager) only on the command line --
never write them into any file that could be committed.  Each name below maps
1:1 to a Bicep parameter (`infra/main.parameters.json`) that the deployment
injects into the Container App as an env var or secret -- a value set here only
reaches the running server because it is declared in `infra/main.bicep`.

**1) Inference -- set AT LEAST ONE tier, or briefs are canned (offline).**
Precedence at runtime is Azure OpenAI -> GitHub Models -> GMI -> offline; the
server uses the first tier whose required vars are present.

```
# Tier A -- Azure OpenAI (needs ALL THREE together, or this tier is skipped)
azd env set CRASH_AZURE_OPENAI_ENDPOINT   <your-aoai-endpoint>
azd env set CRASH_AZURE_OPENAI_KEY        <your-aoai-key>
azd env set CRASH_AZURE_OPENAI_DEPLOYMENT <your-deployment-name>

# Tier B -- GitHub Models (just a GitHub token; THIS is what Crash runs on locally)
azd env set CRASH_GITHUB_MODELS_TOKEN     <your-github-token>

# Tier C -- GMI / Phinite (just a key)
azd env set CRASH_GMI_API_KEY             <your-gmi-api-key>
```

**2) Real web search -- set ONE, or the brief shows canned "(Source: x402)" placeholder.**

```
azd env set CRASH_TAVILY_API_KEY          <your-tavily-key>   # key-auth search
azd env set CRASH_X402_WALLET             <your-x402-wallet>  # OR paid x402 search (Base Sepolia)
```

`CRASH_X402_WALLET` also enables real onchain payment settlement; without it the
agent-to-agent leg settles as an honest simulation (`txRef = sim:...`).

**3) Optional tuning knobs -- skip unless you need to override a default.**
Each has an in-code default (`marketplace-server/src/runtime/inference.ts`), so
leaving it unset is fine.  Set `CRASH_GMI_MODEL` if GMI returns HTTP 404 for the
default model (it 404s on models not served by your account).

```
azd env set CRASH_AZURE_OPENAI_API_VERSION <api-version>   # default 2024-08-01-preview
azd env set CRASH_GITHUB_MODELS_ENDPOINT   <endpoint-url>  # default models.github.ai/inference/...
azd env set CRASH_GITHUB_MODELS_MODEL      <model-id>      # default openai/gpt-4o-mini
azd env set CRASH_GMI_MODEL                <model-id>      # default meta-llama/Llama-3.3-70B-Instruct
```

Any secret you do not have yet can be set to an empty string, e.g.
`azd env set CRASH_X402_WALLET ""`.  The Container App still starts and serves --
listings, WebSocket streams, and the wallet ledger do not require any of these;
only live inference, real search, and onchain settlement do.  The fastest path
to a fully-live demo is **one inference token (a GitHub token works) + a Tavily
key**.

At this point `VITE_MARKETPLACE_URL` is NOT yet set -- it depends on the ACA
FQDN which does not exist until after `azd provision`.  That is handled in
step (e).

### Step d -- Provision infrastructure and deploy

```
azd up
```

azd will:
1. Run `azd provision` -- creates the Azure resource group + all Bicep resources
   (Log Analytics, Container Registry, Container Apps environment, Container App,
   Static Web App, managed identity, AcrPull role assignment).
2. Build the Docker image from `marketplace-server/Dockerfile` with build context
   at repo root, push to the provisioned ACR, and deploy to the Container App.
3. Build the SPA via the `preBuild` hook in `azure.yaml`
   (`pnpm install --frozen-lockfile && pnpm run build` inside `frontend/r3f-shell`)
   and deploy the `dist/` folder to the Static Web App.

If provision fails with "quota exceeded", try a different region:
`azd env set AZURE_LOCATION eastus2` then re-run `azd up`.

Run `azd provision --preview` before `azd up` to do a dry-run validation of the
Bicep template without touching any resources.

### Step e -- Wire VITE_MARKETPLACE_URL and redeploy the SPA

After `azd up` completes, the output block will include:

```
MARKETPLACE_FQDN = https://<random>.eastus.azurecontainerapps.io
SWA_DEFAULT_HOSTNAME = https://<name>.azurestaticapps.net
```

Copy the `MARKETPLACE_FQDN` value (the `https://` URL) and set it:

```
azd env set VITE_MARKETPLACE_URL https://<random>.eastus.azurecontainerapps.io
```

Then redeploy only the web service to rebuild the SPA with the URL inlined:

```
azd deploy web
```

This triggers the `preBuild` hook again with `VITE_MARKETPLACE_URL` now in the
environment, so `import.meta.env.VITE_MARKETPLACE_URL` resolves to the real
ACA FQDN in the production bundle.  The SPA is then re-uploaded to the SWA.

### Step f -- Verification

**Health check (marketplace):**
```
curl https://<marketplace-fqdn>/api/health
```
Expected: `{"ok":true,"version":"0.1.0","listingCount":<n>}`

**SPA:**
Open the `SWA_DEFAULT_HOSTNAME` URL in a browser.  The marketplace UI should
load and render listings.

**WebSocket (DevTools):**
Open DevTools > Network > WS.  Reload the page.  You should see a connection
to `wss://<marketplace-fqdn>/ws` with status 101.  The server sends a `hello`
frame immediately after handshake.

**Container App logs:**
```
azd monitor
```
or
```
az containerapp logs show --name ca-marketplace-<token> --resource-group <rg> --follow
```

---

## Fallback Path: cloudflared tunnel (local demo only)

Use this path ONLY if Azure login fails, quota is exhausted, or you need an
immediate working URL before `azd up` completes.

A cloudflared tunnel is NOT "deployed on Azure".  It is a temporary public
proxy to your local process.  Label it clearly as a local demo in any
presentation.  The URL changes each run (Trycloudflare assigns a random
subdomain); you must rebuild the SPA every time.

### Fallback step 1 -- Build the marketplace-server if not already built

```
pnpm --filter @crash/marketplace-server run build
```

### Fallback step 2 -- Start marketplace-server locally

```
$env:PORT = "8787"; node marketplace-server/dist/server.js
```

Leave this terminal open.

### Fallback step 3 -- Start a cloudflared tunnel

The cloudflared binary was downloaded to `%TEMP%\cloudflared.exe` during a
prior session.  If it is not present, download it:

```
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$env:TEMP\cloudflared.exe"
```

Then start the tunnel:

```
& "$env:TEMP\cloudflared.exe" tunnel --url http://localhost:8787
```

cloudflared prints a line like:
```
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://<random>.trycloudflare.com
```

Copy that `https://` URL.  It also acts as `wss://` for WebSocket connections
(cloudflared proxies both protocols on the same URL).

### Fallback step 4 -- Rebuild the SPA with the tunnel URL

```
$env:VITE_MARKETPLACE_URL = "https://<random>.trycloudflare.com"
pnpm --filter @crash/r3f-shell run build
```

Then serve the built SPA locally (or open `frontend/r3f-shell/dist/index.html`
directly in a browser with a local static server):

```
npx serve frontend/r3f-shell/dist -p 4173
```

The SPA at `http://localhost:4173` will connect to the cloudflared tunnel URL.

### Fallback verification

```
curl https://<random>.trycloudflare.com/api/health
```

Open `http://localhost:4173`.  DevTools > Network > WS should show a 101
upgrade to `wss://<random>.trycloudflare.com/ws`.

---

## Notes on Bicep validation

The `infra/main.bicep` template has been authored by hand (azd and bicep CLI
were not available to run on this machine during authoring).  Before running
`azd up` for the first time, do a dry-run validation:

```
azd provision --preview
```

This will call ARM's what-if API and surface any Bicep type errors or resource
conflicts without creating resources.  Fix any reported issues before
`azd up`.

Known assumptions to verify:
- `Microsoft.App/containerApps@2023-05-01` and
  `Microsoft.App/managedEnvironments@2023-05-01` API versions must be available
  in the chosen region. If not, bump to the latest GA version reported by
  `az provider show --namespace Microsoft.App --query "resourceTypes[*].apiVersions"`.
- `Microsoft.Web/staticSites@2023-01-01` Free SKU is available globally but
  some regions require a different SKU name. Confirm with
  `az staticwebapp list-supported-regions`.
- The `acrcrash<token>` name is lowercase alphanumeric only (ACR constraint).
  The `resourceToken` is `toLower(uniqueString(...))` which produces lowercase
  hex -- this is safe, but the resulting name must be 5-50 chars total.
  `acrcrash` is 8 chars; `resourceToken` is 13 chars (uniqueString length) ->
  total 21 chars, within range.
