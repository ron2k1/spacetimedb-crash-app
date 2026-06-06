// marketplace-server/src/runtime/inference.ts
//
// An OpenAI-compatible chat client. The provider is chosen at CALL time from the environment
// (late binding -> build-now / configure-later, the same posture as the x402 wallet key):
//
//   1. PRIMARY  Azure OpenAI   -- when endpoint + key + deployment env vars are all present.
//   2. SECOND   GitHub Models  -- when CRASH_GITHUB_MODELS_TOKEN is present. This is Azure-hosted
//                                 model inference surfaced through GitHub (models.github.ai), so it
//                                 needs only a GitHub token -- no Azure subscription / `az login`.
//                                 OpenAI-compatible, so it reuses the exact same chat call shape.
//   3. THIRD    GMI            -- when CRASH_GMI_API_KEY is present (OpenAI-compatible).
//   4. FINAL    offline stub   -- deterministic answer composed from the search hits, so the
//                                 pipeline NEVER hard-fails even with no provider configured.
//
// SECURITY (hard): keys are read fresh from env at call time, never stored, never returned, never
// logged. We NEVER log err.message or any response body -- only synthetic codes / HTTP status.
// `fetchImpl` is an injectable seam so tests run fully offline and deterministic.

export type InferenceProvider = "azure-openai" | "github-models" | "gmi" | "offline";

/** A single OpenAI-compatible chat message. */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Shape of an OpenAI-compatible chat-completions response (only the field we read). */
interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export interface InferArgs {
  system: string;
  user: string;
  /** Test seam: defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const GMI_URL = "https://api.gmi-serving.com/v1/chat/completions";
// Default GMI model; overridable via CRASH_GMI_MODEL. GMI returns HTTP 404 ("no matching target
// server for model") when the id isn't served on the account, so keeping it env-tunable lets the
// fallback be corrected without a code change.
const GMI_DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";
const AZURE_DEFAULT_API_VERSION = "2024-08-01-preview";

// GitHub Models: Azure-hosted inference reached with a GitHub token. Endpoint + model are tunable so
// a different model (e.g. openai/gpt-4o for higher quality) needs only an env change, not a redeploy.
const GITHUB_MODELS_DEFAULT_ENDPOINT = "https://models.github.ai/inference/chat/completions";
const GITHUB_MODELS_DEFAULT_MODEL = "openai/gpt-4o-mini";

/** Read Azure config fresh from env. Returns null unless ALL three required vars are present. */
function azureConfig(): { endpoint: string; key: string; deployment: string; apiVersion: string } | null {
  const endpoint = process.env.CRASH_AZURE_OPENAI_ENDPOINT;
  const key = process.env.CRASH_AZURE_OPENAI_KEY;
  const deployment = process.env.CRASH_AZURE_OPENAI_DEPLOYMENT;
  if (!endpoint || !key || !deployment) return null;
  // Trim a trailing slash so URL composition is stable regardless of how the endpoint was set.
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    key,
    deployment,
    apiVersion: process.env.CRASH_AZURE_OPENAI_API_VERSION || AZURE_DEFAULT_API_VERSION,
  };
}

/** Read GitHub Models config fresh from env. Returns null unless a token is present. */
function githubModelsConfig(): { token: string; endpoint: string; model: string } | null {
  const token = process.env.CRASH_GITHUB_MODELS_TOKEN;
  if (!token) return null;
  return {
    token,
    endpoint: (process.env.CRASH_GITHUB_MODELS_ENDPOINT || GITHUB_MODELS_DEFAULT_ENDPOINT).replace(/\/+$/, ""),
    model: process.env.CRASH_GITHUB_MODELS_MODEL || GITHUB_MODELS_DEFAULT_MODEL,
  };
}

/**
 * Which provider WOULD serve a call right now, based purely on env presence. Pure + side-effect
 * free -> safe to surface from GET /api/config. Reflects the same precedence `infer` uses.
 */
export function describeInference(): InferenceProvider {
  if (azureConfig()) return "azure-openai";
  if (githubModelsConfig()) return "github-models";
  if (process.env.CRASH_GMI_API_KEY) return "gmi";
  return "offline";
}

/** Extract the assistant text from an OpenAI-compatible completion, or "" if absent/malformed. */
function contentFrom(data: unknown): string {
  const choice = (data as ChatCompletion)?.choices?.[0];
  const content = choice?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

/**
 * Deterministic offline answer. Composes a short response from whatever sources the run already
 * gathered, so even with NO LLM provider the pipeline returns something coherent and cited-looking.
 * `user` here is the synthesize prompt (goal + appended sources block); we surface its head so the
 * stub stays grounded in the actual request rather than emitting a fixed string.
 */
function offlineAnswer(system: string, user: string): string {
  const head = user.split("\n").slice(0, 8).join("\n").slice(0, 600);
  return [
    "(offline synthesis -- no LLM provider configured)",
    "Based on the gathered sources:",
    head,
  ].join("\n");
}

async function postChat(
  url: string,
  headers: Record<string, string>,
  messages: ChatMessage[],
  model: string | undefined,
  f: typeof fetch,
): Promise<string> {
  // Azure carries the model in the URL (deployment); GMI/OpenAI carry it in the body.
  const body: Record<string, unknown> = { messages, temperature: 0.2 };
  if (model) body.model = model;
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`inference_http_${res.status}`); // status only, never the body
  return contentFrom(await res.json());
}

/**
 * Log WHICH inference tier failed plus a SHORT classified code -- never err.message text or a body.
 * Our own postChat throws `inference_http_<status>` (status only, by construction); network
 * rejections surface their low-level cause code (ENOTFOUND / ECONNREFUSED / ...). This restores the
 * diagnosability the old empty catch blocks dropped on the floor, while staying inside the security
 * envelope: no secrets, no response bodies. ASCII only.
 */
function logProviderFailure(provider: InferenceProvider, err: unknown): void {
  let code = "network_error";
  if (err instanceof Error && /^inference_http_\d+$/.test(err.message)) {
    code = err.message;
  } else {
    const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
    if (cause && typeof cause.code === "string") code = cause.code;
  }
  console.warn(`[inference] ${provider} tier failed: ${code}`);
}

/**
 * Run one chat completion against the highest-priority configured provider, degrading on any
 * failure to the next tier and ultimately to the offline stub. Always resolves -- never rejects.
 */
export async function infer(args: InferArgs): Promise<string> {
  const { system, user } = args;
  const f = args.fetchImpl ?? fetch;
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  // Tier 1: Azure OpenAI (locked primary; serves when provisioned + env set).
  const azure = azureConfig();
  if (azure) {
    try {
      const url = `${azure.endpoint}/openai/deployments/${azure.deployment}/chat/completions?api-version=${azure.apiVersion}`;
      const text = await postChat(url, { "api-key": azure.key }, messages, undefined, f);
      if (text) return text;
    } catch (err) {
      logProviderFailure("azure-openai", err); // status/code only -> fall through
    }
  }

  // Tier 2: GitHub Models (Azure-hosted, GitHub-authed). OpenAI-compatible -> model in the body.
  const gh = githubModelsConfig();
  if (gh) {
    try {
      const text = await postChat(gh.endpoint, { authorization: `Bearer ${gh.token}` }, messages, gh.model, f);
      if (text) return text;
    } catch (err) {
      logProviderFailure("github-models", err);
    }
  }

  // Tier 3: GMI (OpenAI-compatible). Model is env-tunable (CRASH_GMI_MODEL) to dodge 404s.
  const gmiKey = process.env.CRASH_GMI_API_KEY;
  if (gmiKey) {
    try {
      const model = process.env.CRASH_GMI_MODEL || GMI_DEFAULT_MODEL;
      const text = await postChat(GMI_URL, { authorization: `Bearer ${gmiKey}` }, messages, model, f);
      if (text) return text;
    } catch (err) {
      logProviderFailure("gmi", err);
    }
  }

  // Tier 4: deterministic offline stub -> the pipeline never hard-fails.
  return offlineAnswer(system, user);
}
